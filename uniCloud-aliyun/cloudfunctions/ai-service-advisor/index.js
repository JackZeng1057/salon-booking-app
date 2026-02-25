/**
 * @file ai-service-advisor/index.js — AI 服务选择顾问云函数
 *
 * 【业务定位】
 * 接收顾客输入的需求文字（最多 300 字）和可选图片（最多 3 张），
 * 调用阿里云 Qwen（通义千问）视觉语言模型生成中文服务推荐，
 * 严格从门店真实服务目录中筛选 1-3 个推荐项（不允许虚构服务名称），
 * 返回可直接传给 orders-create 的备注文本与推荐服务列表。
 *
 * 【接入模型】
 * Qwen（通义千问）兼容 OpenAI Chat Completion 协议，
 * 通过 HTTPS POST 请求阿里云 DashScope 端点，API Key 优先从云函数
 * 环境变量读取（QWEN_API_KEY），其次回退到同目录 config.json 文件。
 *
 * 【提示词工程设计】
 * 1. 系统 Prompt 强调：只能从给定目录选择服务，返回 JSON 格式；
 * 2. 门店真实服务目录（最多 MAX_MODEL_CATALOG_SIZE=10 条）注入提示词，
 *    防止目录过大导致 Token 超限和响应延迟；
 * 3. 对用户输入做 XSS 清洗（去掉 HTML 标签），防止提示词注入攻击。
 *
 * 【故障容灾（两级重试）】
 * 主请求：目录 10 条，超时 12 秒；
 * 重试请求：目录缩小到 6 条，超时 8 秒，最大 Token 上调到 1100；
 * 仅图片场景：目录进一步缩小到 4 条，降低多模态推理耗时。
 * 通过 isRetryableQwenError() 识别超时/网络抖动，触发重试而非直接报错。
 *
 * 【JSON 解析容错】
 * 模型返回可能包含 markdown 代码块（```json ... ```）或多余空白，
 * cleanJsonFromModelResponse() 先做清洗再解析，提升解析成功率。
 * 解析失败时不报服务器错误，而是返回"无匹配推荐"的降级结果。
 *
 * 【图片处理】
 * 支持 cloud:// fileID（调用 uniCloud.getTempFileURL 获取有效 URL）
 * 和 http(s):// 直链两种格式，自动归一化后传给 Qwen 视觉接口。
 * 图片像素上限 DEFAULT_IMAGE_MAX_PIXELS=1572864，降低多模态在线推理耗时。
 *
 * 【配置参数（可通过 config.json 覆盖）】
 * qwenApiKey, qwenEndpoint, qwenModel,
 * qwenTimeoutMs, qwenMaxTokens, qwenCatalogLimit,
 * qwenRetryTimeoutMs, qwenRetryMaxTokens, qwenRetryCatalogLimit, imageMaxPixels
 */
// AI 服务选择顾问云函数
// 职责：
// 1) 接收用户文本 + 可选图片，生成中文建议
// 2) 严格从门店真实服务中筛选 1-3 个推荐项（不允许虚构）
// 3) 生成可直接写入订单的备注文本
// 4) 返回推荐结果供前端一键跳转预约

// 公共能力：统一响应结构、业务错误、权限校验
const { withResponse, ApiError, ERROR_CODES, requireRole } = require('sb-common');
// 读取本地配置文件（config.json）
const fs = require('fs');
const path = require('path');

// 输入约束：最多 3 张图、文本最多 300 字
const MAX_IMAGE_COUNT = 3;
const MAX_TEXT_LEN = 300;
const BUILD_TAG = '2026-02-25-ai-intent-filter-v9';
// 喂给模型的服务目录上限，避免提示词过大导致响应慢
const MAX_MODEL_CATALOG_SIZE = 10;
// 外部模型请求超时时间（毫秒），默认优先保证 AI 成功率
const DEFAULT_QWEN_TIMEOUT_MS = 12000;
// 失败重试兜底参数：二次请求目录更小，提升成功率
const DEFAULT_QWEN_RETRY_TIMEOUT_MS = 8000;
const DEFAULT_QWEN_RETRY_CATALOG_LIMIT = 6;
// 仅图片场景默认进一步缩小目录，降低多模态耗时
const DEFAULT_IMAGE_ONLY_CATALOG_LIMIT = 4;
// 图片输入像素上限，降低视觉推理耗时（Qwen兼容接口支持 max_pixels）
const DEFAULT_IMAGE_MAX_PIXELS = 1572864;
// 输出长度上限（防止 JSON 在 recommendations 中被截断）
const DEFAULT_QWEN_MAX_TOKENS = 900;
const DEFAULT_QWEN_IMAGE_ONLY_MAX_TOKENS = 900;
const DEFAULT_QWEN_RETRY_MAX_TOKENS = 1100;
const DEFAULT_QWEN_IMAGE_ONLY_RETRY_MAX_TOKENS = 1100;

// 意图规则：识别用户主诉求，并约束推荐服务类型
const INTENT_RULES = [
  { type: 'cut', user: /(剪|修|短发|层次|刘海)/, service: /(剪|修|造型|刘海)/, weight: 4 },
  { type: 'perm', user: /(烫|卷|纹理|蓬松)/, service: /(烫|卷|纹理)/, weight: 5 },
  { type: 'dye', user: /(染|发色|黑茶|亚麻|棕|灰|漂|补色|挑染|褪色)/, service: /(染|漂|发色|补色|挑染|褪色)/, weight: 6 },
  { type: 'care', user: /(护理|修复|柔顺|毛躁|受损|干枯)/, service: /(护理|修复|柔顺|养护)/, weight: 4 },
  { type: 'scalp', user: /(头皮|敏感|清洁|去屑)/, service: /(头皮|清洁|去屑)/, weight: 3 }
];

// API Key 配置优先级：
// 1) 云函数环境变量（若平台支持）
// 2) 云函数目录下 config.json
function loadFunctionConfig() {
  const file = path.join(__dirname, 'config.json');
  try {
    // 文件不存在时返回空配置，避免抛错中断主流程
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    // 配置读取失败时回退空对象，由后续逻辑给出降级结果
    return {};
  }
}

// 通用文本清洗：去多余空白，并裁剪到指定长度
function trimText(value, maxLen = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!maxLen || text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

// 用户主描述标准化（按 MAX_TEXT_LEN 控制）
function normalizeText(value) {
  return trimText(value, MAX_TEXT_LEN);
}

// 数值参数归一化：用于环境变量/配置中的 timeout、limit 等字段
function toPositiveInt(value, defaultValue) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  const i = Math.floor(n);
  return i > 0 ? i : defaultValue;
}

// 判断是否是可重试错误（超时/网络抖动等）
function isRetryableQwenError(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('response timeout') ||
    msg.includes('status: -1') ||
    msg.includes('request failed') ||
    msg.includes('socket') ||
    msg.includes('qwen_empty_response') ||
    msg.includes('qwen_invalid_json')
  );
}

// 降级原因归一化，便于日志聚合
function getFallbackReasonCode(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  if (!msg) return 'unknown';
  if (msg.includes('response timeout') || msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
  if (msg.includes('qwen_invalid_json')) return 'invalid_json';
  if (msg.includes('qwen_empty_response')) return 'empty_response';
  if (msg.includes('qwen_request_failed')) return 'request_failed';
  if (msg.includes('socket') || msg.includes('status: -1')) return 'network_or_socket';
  return 'other';
}

// API Key 标准化：
// - 去空白
// - 识别占位 key（如 sk-xxx）并标记为无效
function normalizeApiKey(value) {
  const key = String(value || '').trim();
  if (!key) return { key: '', placeholder: false };
  const lower = key.toLowerCase();
  const placeholder =
    lower === 'sk-xxx' ||
    lower.includes('your_api_key') ||
    lower.includes('你的key') ||
    lower.includes('example');
  if (placeholder) return { key: '', placeholder: true };
  return { key, placeholder: false };
}

// 名称归一化：用于服务名匹配（忽略空格/符号/大小写）
function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '');
}

// 统一 ID 序列化：兼容 string/ObjectId/{$oid} 等形态，避免出现 "[object Object]"
function normalizeId(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (!text || text === '[object Object]') return '';
    return text;
  }
  if (typeof value === 'object') {
    if (value.$oid) return String(value.$oid).trim();
    if (value.id) return String(value.id).trim();
    if (typeof value.toString === 'function') {
      const text = String(value.toString()).trim();
      if (text && text !== '[object Object]') return text;
    }
  }
  return '';
}

// 从模型文本里尽力提取 JSON：
// 1) 先直接 JSON.parse
// 2) 再尝试 ```json ... ``` 代码块
// 3) 最后尝试匹配首个 {...}
function parseJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    const codeBlockMatch = raw.match(/```json\s*([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (err) {}
    }
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch && objectMatch[0]) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (err) {}
    }
    return null;
  }
}

// 宽松 JSON 解析兜底：
// - 处理 markdown code fence
// - 处理单引号 key/value
// - 去除尾逗号
// - 自动给裸 key 加双引号
function parseLooseJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const candidates = [];
  candidates.push(raw);

  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    candidates.push(codeBlockMatch[1].trim());
  }

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    candidates.push(raw.slice(first, last + 1).trim());
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    if (!c) continue;
    try {
      return JSON.parse(c);
    } catch (err) {}
  }

  for (let i = 0; i < candidates.length; i += 1) {
    let c = candidates[i];
    if (!c) continue;
    try {
      c = c
        .replace(/\uFEFF/g, '')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/([{,]\s*)'([^'\\]+?)'\s*:/g, '$1"$2":')
        .replace(/:\s*'([^'\\]*?)'(\s*[,}\]])/g, (_, p1, p2) => `:${JSON.stringify(p1)}${p2}`)
        .replace(/([{,]\s*)([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)(\s*:)/g, '$1"$2"$3');
      return JSON.parse(c);
    } catch (err) {}
  }

  return null;
}

function decodeJsonString(value) {
  const raw = String(value || '');
  try {
    return JSON.parse(`"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } catch (err) {
    return raw.replace(/\\"/g, '"');
  }
}

function extractJsonFieldString(text, field) {
  const source = String(text || '');
  const regexp = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i');
  const m = source.match(regexp);
  if (!m || !m[1]) return '';
  return trimText(decodeJsonString(m[1]), field === 'advice' ? 240 : 120);
}

function splitTopLevelObjects(arrayBody) {
  const source = String(arrayBody || '');
  const result = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          result.push(source.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return result;
}

function recoverPartialAdvisorResult(content) {
  const source = String(content || '').trim();
  if (!source) return null;

  const advice = extractJsonFieldString(source, 'advice');
  const bookingRemark = extractJsonFieldString(source, 'bookingRemark');

  let recommendations = [];
  const keyIdx = source.indexOf('"recommendations"');
  if (keyIdx >= 0) {
    const leftBracket = source.indexOf('[', keyIdx);
    if (leftBracket >= 0) {
      const arrBody = source.slice(leftBracket + 1);
      const objectSnippets = splitTopLevelObjects(arrBody);
      recommendations = objectSnippets
        .map((snippet) => parseLooseJson(snippet))
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          serviceId: normalizeId(row && row.serviceId),
          storeId: normalizeId(row && row.storeId),
          storeName: trimText((row && row.storeName) || '', 30),
          name: trimText((row && row.name) || '', 30),
          reason: trimText((row && row.reason) || '', 80)
        }))
        .filter((row) => !!row.serviceId || !!row.name)
        .slice(0, 3);
    }
  }

  if (!advice && !bookingRemark && recommendations.length === 0) return null;
  return { advice, bookingRemark, recommendations, _partialRecovered: true };
}

// 兼容不同模型响应格式，提取 assistant 内容文本
function getAssistantContent(respData) {
  const choices = (respData && respData.choices) || [];
  const first = choices[0] || {};
  const message = first.message || {};
  const content = message.content;

  // OpenAI 兼容接口常见字符串内容
  if (typeof content === 'string') return content;

  // 部分模型返回数组内容：[{type:'text', text:'...'}]
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        return item.text || '';
      })
      .join('');
  }

  return '';
}

// 当模型不可用时的兜底中文建议
function buildFallbackAdvice(text, picked) {
  const serviceNames = picked
    .map((item) => `${item.storeName || '未知门店'}·${item.name}`)
    .join('、');
  const demand = trimText(text, 80);
  if (demand) {
    return `根据你的描述（${demand}），建议优先从门店的真实项目里选择：${serviceNames}。到店后可让理发师再做细化调整。`;
  }
  return `已根据门店可预约项目给出优先方案：${serviceNames}。建议到店后结合发质与脸型再做细调。`;
}

// 规则打分：当模型结果不可用时，用关键词匹配给服务排序
function scoreServiceByText(service, text) {
  const userText = String(text || '');
  const source = `${service.name || ''} ${service.description || ''}`;
  let score = 0;

  // 用户诉求关键词 与 服务特征关键词 的粗匹配权重
  INTENT_RULES.forEach((rule) => {
    if (rule.user.test(userText) && rule.service.test(source)) {
      score += rule.weight;
    }
  });

  // 用户明确“不要/避免”且服务描述包含“漂”时，降低分值
  if (/(不要|避免|禁忌|不能)/.test(userText) && /(漂|褪色)/.test(source)) {
    score -= 3;
  }

  // 若完全未命中但看起来是典型美发服务，给基础分避免空结果
  if (score <= 0 && /(剪|烫|染|护理|造型|头皮)/.test(source)) {
    score += 1;
  }

  return score;
}

// 从用户文本中识别当前主诉求类型（cut/perm/dye/care/scalp）
function detectPrimaryIntent(text) {
  const source = String(text || '');
  let bestType = '';
  let bestScore = 0;
  INTENT_RULES.forEach((rule) => {
    if (!rule.user.test(source)) return;
    if (rule.weight > bestScore) {
      bestScore = rule.weight;
      bestType = rule.type;
    }
  });
  return bestType;
}

// 判断服务名称/描述是否属于目标诉求类型
function serviceMatchesIntent(service, intentType) {
  if (!intentType) return true;
  const rule = INTENT_RULES.find((item) => item.type === intentType);
  if (!rule) return true;
  const source = `${(service && service.name) || ''} ${(service && service.description) || ''}`;
  return rule.service.test(source);
}

// 服务排序：按价格升序，价格相同按时长升序
function sortServicesByPrice(list) {
  const services = Array.isArray(list) ? [...list] : [];
  return services.sort((a, b) => {
    const ap = Number(a && a.price);
    const bp = Number(b && b.price);
    const av = Number.isFinite(ap) ? ap : Number.MAX_SAFE_INTEGER;
    const bv = Number.isFinite(bp) ? bp : Number.MAX_SAFE_INTEGER;
    if (av !== bv) return av - bv;
    const ad = Number(a && a.duration);
    const bd = Number(b && b.duration);
    const adv = Number.isFinite(ad) ? ad : Number.MAX_SAFE_INTEGER;
    const bdv = Number.isFinite(bd) ? bd : Number.MAX_SAFE_INTEGER;
    return adv - bdv;
  });
}

// 推荐结果与用户诉求一致性校验：
// 1) 先保留与诉求匹配的推荐项
// 2) 不足时从真实服务目录补齐同诉求项目
function enforceIntentRecommendations(recommendations, services, userText, maxSize = 3) {
  const list = Array.isArray(recommendations) ? recommendations.filter((item) => !!item) : [];
  const limit = toPositiveInt(maxSize, 3);
  if (!list.length) return [];

  const intentType = detectPrimaryIntent(userText);
  if (!intentType) return list.slice(0, limit);

  const serviceById = new Map();
  (services || []).forEach((item) => {
    const sid = normalizeId(item && item._id);
    if (sid) serviceById.set(sid, item);
  });

  const used = new Set();
  const matched = [];
  list.forEach((item) => {
    if (matched.length >= limit) return;
    const sid = normalizeId(item && item.serviceId);
    const sourceService = (sid && serviceById.get(sid)) || item;
    if (!serviceMatchesIntent(sourceService, intentType)) return;
    if (sid && used.has(sid)) return;
    if (sid) used.add(sid);
    matched.push(item);
  });

  // 推荐数量不足时，从同诉求真实服务补齐
  const intentServices = sortServicesByPrice((services || []).filter((item) => serviceMatchesIntent(item, intentType)));
  intentServices.forEach((item) => {
    if (matched.length >= limit) return;
    const sid = normalizeId(item && item._id);
    if (!sid || used.has(sid)) return;
    used.add(sid);
    matched.push({
      serviceId: sid,
      storeId: normalizeId(item && item.storeId),
      storeName: (item && item.storeName) || '未知门店',
      name: (item && item.name) || '未命名服务',
      price: Number((item && item.price) || 0),
      duration: Number((item && item.duration) || 30),
      reason: '与当前诉求直接匹配，建议优先预约。'
    });
  });

  if (matched.length > 0) return matched;
  return list.slice(0, limit);
}

// 给模型做“候选目录裁剪”，避免把全部服务都塞进提示词导致变慢
// - 有文本时：按规则分数优先
// - 无文本时：按门店轮询取样，尽量覆盖多门店
function pickServicesForModel(services, userText, maxSize) {
  const list = Array.isArray(services) ? services : [];
  const limit = toPositiveInt(maxSize, MAX_MODEL_CATALOG_SIZE);
  if (list.length <= limit) return list;

  const text = String(userText || '').trim();
  if (text) {
    return [...list]
      .map((item) => ({ item, score: scoreServiceByText(item || {}, text) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ad = Number((a.item && a.item.duration) || 0);
        const bd = Number((b.item && b.item.duration) || 0);
        return ad - bd;
      })
      .slice(0, limit)
      .map((row) => row.item);
  }

  const storeBuckets = new Map();
  list.forEach((item) => {
    const sid = normalizeId(item && item.storeId) || 'unknown';
    const arr = storeBuckets.get(sid) || [];
    arr.push(item);
    storeBuckets.set(sid, arr);
  });

  const bucketList = Array.from(storeBuckets.values());
  const picked = [];
  let cursor = 0;
  while (picked.length < limit) {
    let progressed = false;
    for (let i = 0; i < bucketList.length && picked.length < limit; i += 1) {
      const bucket = bucketList[i];
      if (cursor < bucket.length) {
        picked.push(bucket[cursor]);
        progressed = true;
      }
    }
    if (!progressed) break;
    cursor += 1;
  }
  return picked;
}

// 规范化推荐项：
// - 仅保留数据库真实服务（按 serviceId/服务名匹配）
// - 去重
// - 最多 3 条
// - 模型结果不可用时自动走规则兜底
function normalizeRecommendations(raw, services, userText) {
  const serviceById = new Map();
  const serviceByName = new Map();

  // 构建服务索引，提升匹配性能
  services.forEach((service) => {
    const sid = normalizeId(service && service._id);
    const sname = normalizeName(service && service.name);
    if (sid) serviceById.set(sid, service);
    if (sname) {
      const arr = serviceByName.get(sname) || [];
      arr.push(service);
      serviceByName.set(sname, arr);
    }
  });

  const list = Array.isArray(raw) ? raw : [];
  const picked = [];
  const used = new Set();

  // 先尝试消费模型输出
  list.forEach((row) => {
    if (picked.length >= 3) return;

    const serviceId = normalizeId(row && row.serviceId);
    const serviceName = normalizeName(row && row.name);
    const rowStoreId = normalizeId(row && row.storeId);
    const rowStoreName = normalizeName(row && row.storeName);
    let matched = null;

    // 1) 优先按 serviceId 严格匹配
    if (serviceId && serviceById.has(serviceId)) {
      matched = serviceById.get(serviceId);
    } else {
      // 2) 按服务名找候选集合（可能同名不同店）
      let candidates = [];
      if (serviceName && serviceByName.has(serviceName)) {
        candidates = serviceByName.get(serviceName) || [];
      } else if (serviceName) {
        candidates = services.filter((item) => normalizeName(item && item.name).includes(serviceName));
      }

      // 3) 若模型返回了门店信息，优先按门店过滤候选
      if (candidates.length > 0 && rowStoreId) {
        const byStoreId = candidates.filter((item) => normalizeId(item && item.storeId) === rowStoreId);
        if (byStoreId.length > 0) candidates = byStoreId;
      }
      if (candidates.length > 0 && rowStoreName) {
        const byStoreName = candidates.filter((item) => normalizeName(item && item.storeName) === rowStoreName);
        if (byStoreName.length > 0) candidates = byStoreName;
      }

      matched = candidates[0] || null;
    }

    // 未匹配到真实服务则丢弃
    if (!matched || !matched._id) return;

    // 去重
    const id = normalizeId(matched._id);
    if (used.has(id)) return;
    used.add(id);

    // 返回给前端的推荐结构（包含门店信息，支持跨店推荐后直接预约）
    picked.push({
      serviceId: id,
      storeId: normalizeId(matched.storeId),
      storeName: matched.storeName || '未知门店',
      name: matched.name || '未命名服务',
      price: Number(matched.price || 0),
      duration: Number(matched.duration || 30),
      reason: trimText((row && row.reason) || '适合当前需求', 80)
    });
  });

  // 模型推荐可用则直接返回
  if (picked.length > 0) {
    return enforceIntentRecommendations(picked, services, userText, 3);
  }

  // 模型不可用或未命中时，规则打分选 Top3
  const fallback = (services || [])
    .map((item) => ({
      item,
      score: scoreServiceByText(item || {}, userText)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => ({
      serviceId: normalizeId(item && item._id),
      storeId: normalizeId(item && item.storeId),
      storeName: (item && item.storeName) || '未知门店',
      name: item && item.name ? item.name : '未命名服务',
      price: Number((item && item.price) || 0),
      duration: Number((item && item.duration) || 30),
      reason: '与当前诉求匹配度较高，建议优先预约。'
    }))
    .filter((item) => !!item.serviceId && !!item.storeId);

  return enforceIntentRecommendations(fallback, services, userText, 3);
}

// 生成订单备注（顾客写给商家/理发师）：
// - 优先使用模型返回的 bookingRemark
// - 无模型备注时按用户诉求与推荐服务生成
function buildBookingRemark(rawRemark, userText, pickedServices) {
  const remark = trimText(rawRemark, 120);
  if (remark) {
    // 备注语气标准化为顾客第一人称
    const fixed = remark
      .replace(/^用户诉求[:：]\s*/i, '我的需求：')
      .replace(/^建议服务[:：]\s*/i, '我想预约：')
      .replace(/建议(优先)?预约/g, '请帮我安排')
      .replace(/^建议[:：]/, '');
    return trimText(fixed, 120);
  }

  const demand = trimText(userText, 80);
  const serviceNames = (pickedServices || [])
    .map((item) => `${item.storeName || '未知门店'}·${item.name}`)
    .join('、');

  if (demand && serviceNames) {
    return trimText(`我的需求是：${demand}。我想预约：${serviceNames}，请帮我安排合适时段。`, 120);
  }
  if (demand) return trimText(`我的需求是：${demand}，请帮我推荐并安排。`, 120);
  return trimText(`我想预约：${serviceNames || '到店沟通后确认'}，请帮我安排。`, 120);
}

// 对推荐结果中的门店名称做名称补全（按 storeId -> stores.name）
async function backfillUnknownStoreNames(db, recommendations) {
  const list = Array.isArray(recommendations) ? recommendations : [];
  const unknownStoreIds = Array.from(
    new Set(
      list
        .filter((item) => item && (!item.storeName || item.storeName === '未知门店') && normalizeId(item.storeId))
        .map((item) => normalizeId(item.storeId))
    )
  );
  if (unknownStoreIds.length === 0) return list;

  const storeRes = await db.collection('stores').field({ _id: true, name: true }).limit(1000).get();
  const stores = Array.isArray(storeRes.data) ? storeRes.data : [];
  const storeNameMap = new Map(stores.map((item) => [normalizeId(item && item._id), (item && item.name) || '']));

  return list.map((item) => {
    if (!item) return item;
    if (item.storeName && item.storeName !== '未知门店') return item;
    const sid = normalizeId(item.storeId);
    const realName = storeNameMap.get(sid) || '';
    if (!realName) return item;
    return { ...item, storeName: realName };
  });
}

function sortRecommendationsByPrice(recommendations) {
  const list = Array.isArray(recommendations) ? [...recommendations] : [];
  return list.sort((a, b) => {
    const ap = Number(a && a.price);
    const bp = Number(b && b.price);
    const av = Number.isFinite(ap) ? ap : Number.MAX_SAFE_INTEGER;
    const bv = Number.isFinite(bp) ? bp : Number.MAX_SAFE_INTEGER;
    if (av !== bv) return av - bv;
    const ad = Number(a && a.duration);
    const bd = Number(b && b.duration);
    const adv = Number.isFinite(ad) ? ad : Number.MAX_SAFE_INTEGER;
    const bdv = Number.isFinite(bd) ? bd : Number.MAX_SAFE_INTEGER;
    return adv - bdv;
  });
}

// 解析图片输入：
// - 支持 http(s) 直链
// - 支持 cloud:// fileID（会转换为临时 URL）
// - 未知格式按直链兜底，尽量不丢图片
async function resolveTempImageUrls(imageFileIds) {
  const rawList = Array.isArray(imageFileIds)
    ? imageFileIds.map((item) => String(item || '').trim()).filter((item) => !!item).slice(0, MAX_IMAGE_COUNT)
    : [];
  if (rawList.length === 0) return [];

  const directUrls = [];
  const cloudFileIds = [];

  rawList.forEach((item) => {
    if (/^https?:\/\//i.test(item)) {
      directUrls.push(item);
      return;
    }
    if (/^cloud:\/\//i.test(item)) {
      cloudFileIds.push(item);
      return;
    }
    // 兜底：未知格式先当作可访问 URL
    directUrls.push(item);
  });

  // 没有 cloud:// 时直接返回直链
  if (cloudFileIds.length === 0) return directUrls;

  // cloud:// 转临时地址，失败时保留已识别的直链
  try {
    const res = await uniCloud.getTempFileURL({ fileList: cloudFileIds });
    const list = (res && res.fileList) || [];
    const tempUrls = list
      .map((item) => item && (item.tempFileURL || item.download_url || item.url || ''))
      .filter((url) => !!url);
    return [...directUrls, ...tempUrls];
  } catch (err) {
    return directUrls;
  }
}

// 调用 Qwen（DashScope 兼容接口）：
// - 把“门店真实服务清单 + 用户文本 + 图片”一并喂给模型
// - 要求返回 JSON 对象
async function callQwenAdvisor({
  apiKey,
  model,
  baseUrl,
  requestTimeoutMs,
  maxTokens,
  strictJsonOnly,
  imageMaxPixels,
  storeLabel,
  userText,
  imageUrls,
  services
}) {
  // 传给模型的服务目录（只保留必要字段）
  const serviceCatalog = services.map((item) => ({
    serviceId: normalizeId(item && item._id),
    storeId: normalizeId(item && item.storeId),
    storeName: item && item.storeName ? item.storeName : '',
    name: item && item.name ? item.name : '',
    price: Number((item && item.price) || 0),
    duration: Number((item && item.duration) || 30),
    description: trimText(item && item.description, 60)
  }));

  // 系统提示：强约束“只能推荐真实服务”
  let systemPrompt =
    '你是美发预约顾问。请只基于给定门店的真实服务清单推荐，不能创造不存在的服务。' +
    '输出必须是 JSON 对象，字段包括 advice(字符串), bookingRemark(字符串), recommendations(数组1-3项)。' +
    'recommendations 的每项必须包含 serviceId、storeId、storeName、name、reason。请使用简体中文。' +
    'advice 控制在80字内，bookingRemark 控制在50字内，reason 控制在40字内。' +
    'bookingRemark 必须是“顾客写给商家/理发师的下单备注”口吻，使用第一人称，不要写成商家建议用户。';
  if (strictJsonOnly) {
    systemPrompt +=
      '只输出单个合法 JSON 对象，不要输出 markdown 代码块，不要输出解释文字，不要输出注释。' +
      '输出必须以 { 开始并以 } 结束。';
  }

  // 用户消息主体：文本 + 服务清单
  const userContent = [
    {
      type: 'text',
      text:
        `推荐范围：${storeLabel || '全部门店'}\n` +
        `用户描述：${userText || '用户仅上传了图片，请根据图片判断'}\n` +
        `真实服务清单(JSON)：${JSON.stringify(serviceCatalog)}`
    }
  ];

  // 追加图片（多模态）
  (imageUrls || []).forEach((url) => {
    if (!url) return;
    const imageNode = {
      type: 'image_url',
      image_url: { url }
    };
    const px = toPositiveInt(imageMaxPixels, DEFAULT_IMAGE_MAX_PIXELS);
    if (px > 0) {
      imageNode.max_pixels = px;
    }
    userContent.push({
      ...imageNode
    });
  });

  // 组装请求体
  const requestData = {
    model,
    temperature: strictJsonOnly ? 0 : 0.1,
    max_tokens: toPositiveInt(maxTokens, 360),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ]
  };

  // 发起 HTTP 请求
  const res = await uniCloud.httpclient.request(baseUrl, {
    method: 'POST',
    timeout: toPositiveInt(requestTimeoutMs, DEFAULT_QWEN_TIMEOUT_MS),
    contentType: 'json',
    dataType: 'json',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    data: requestData
  });

  // 状态码兜底
  const statusCode = Number((res && res.status) || (res && res.statusCode) || 0);
  if (!statusCode || statusCode >= 400) {
    throw new Error('qwen_request_failed');
  }

  // 解析模型输出文本
  const respData = res && res.data;
  // 提取供应商请求标识，便于与百炼后台调用明细对账
  const headers = (res && res.headers) || {};
  const providerRequestId =
    headers['x-request-id'] ||
    headers['X-Request-Id'] ||
    headers['x-acs-request-id'] ||
    headers['X-Acs-Request-Id'] ||
    (respData && (respData.request_id || respData.requestId || respData.id)) ||
    '';
  // 记录 token 用量信息（若供应商返回）
  const usage = (respData && respData.usage) || null;
  const content = getAssistantContent(respData);
  if (!content) {
    throw new Error('qwen_empty_response');
  }

  // 将输出解析为 JSON
  const parsed = parseJsonFromText(content);
  const parsedLoose = parsed && typeof parsed === 'object' ? parsed : parseLooseJson(content);
  const recovered = parsedLoose && typeof parsedLoose === 'object' ? null : recoverPartialAdvisorResult(content);
  const finalParsed = parsedLoose && typeof parsedLoose === 'object' ? parsedLoose : recovered;
  if (!finalParsed || typeof finalParsed !== 'object') {
    const err = new Error('qwen_invalid_json');
    err.rawContentSnippet = trimText(content, 500);
    err.providerRequestId = providerRequestId;
    throw err;
  }

  return {
    parsed: finalParsed,
    usage,
    providerRequestId
  };
}

// 主入口：AI 理发预约顾问（服务选择 Agent）
exports.main = withResponse(async (event, context) => {
  // 仅普通用户可调用
  await requireRole(['user'], event, context);

  // 读取与标准化输入
  const storeId = normalizeId(event && event.storeId);
  const userText = normalizeText(event && event.text);
  const imageFileIds = Array.isArray(event && event.imageFileIds) ? event.imageFileIds : [];

  // 入参校验：文本和图片至少一种
  if (!userText && imageFileIds.length === 0) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'text or image required');
  }

  const db = uniCloud.database();

  // 若传入 storeId，则仅对该门店推荐；否则跨全部门店推荐
  let scopeStore = null;
  if (storeId) {
    const storeRes = await db.collection('stores').doc(storeId).field({ _id: true, name: true }).get();
    scopeStore = storeRes.data && storeRes.data[0];
    if (!scopeStore) {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'store not found');
    }
  }

  // 拉取真实服务清单（推荐必须从这里选）
  let serviceQuery = db
    .collection('services')
    .field({
      _id: true,
      storeId: true,
      name: true,
      price: true,
      duration: true,
      description: true
    })
    .orderBy('createdAt', 'desc');
  if (storeId) {
    serviceQuery = serviceQuery.where({ storeId });
  }
  const servicesRes = await serviceQuery.limit(500).get();
  const rawServices = Array.isArray(servicesRes.data) ? servicesRes.data : [];
  if (rawServices.length === 0) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'service not available for booking');
  }

  // 关联门店名称，支持跨店推荐结果直接展示“服务 + 门店”
  const uniqueStoreIds = Array.from(
    new Set(rawServices.map((item) => normalizeId(item && item.storeId)).filter((id) => !!id))
  );
  let storeMap = new Map();
  if (scopeStore) {
    storeMap.set(normalizeId(scopeStore._id), scopeStore.name || '未知门店');
  } else if (uniqueStoreIds.length > 0) {
    // 这里不按 _id in 精确筛选，避免 _id 类型（string/ObjectId）不一致导致门店名映射失败。
    const storeRes = await db.collection('stores').field({ _id: true, name: true }).limit(1000).get();
    const stores = Array.isArray(storeRes.data) ? storeRes.data : [];
    storeMap = new Map(
      stores.map((item) => [normalizeId(item && item._id), (item && item.name) || '未知门店'])
    );
  }

  const services = rawServices
    .map((item) => {
      const sid = normalizeId(item && item.storeId);
      return {
        ...item,
        _id: normalizeId(item && item._id),
        storeId: sid,
        storeName: storeMap.get(sid) || '未知门店'
      };
    })
    .filter((item) => !!item.storeId);
  if (services.length === 0) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'service not available for booking');
  }

  // 将图片入参统一成可访问 URL 列表
  const imageUrls = await resolveTempImageUrls(imageFileIds);

  // 读取配置：环境变量优先，本地 config.json 次之
  const localConfig = loadFunctionConfig();
  const apiKeyRaw = String(
    process.env.DASHSCOPE_API_KEY ||
      process.env.QWEN_API_KEY ||
      localConfig.dashscopeApiKey ||
      localConfig.qwenApiKey ||
      ''
  ).trim();
  const normalizedKey = normalizeApiKey(apiKeyRaw);
  const apiKey = normalizedKey.key;

  // 模型与接口地址可配置，默认对齐 DashScope 兼容接口
  const model = String(process.env.QWEN_MODEL || localConfig.qwenModel || 'qwen3-vl-flash').trim();
  const baseUrl = String(
    process.env.QWEN_BASE_URL ||
      localConfig.qwenBaseUrl ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  ).trim();
  const qwenTimeoutMs = toPositiveInt(
    process.env.QWEN_TIMEOUT_MS || localConfig.qwenTimeoutMs,
    DEFAULT_QWEN_TIMEOUT_MS
  );
  const modelCatalogLimit = toPositiveInt(
    process.env.QWEN_CATALOG_LIMIT || localConfig.qwenCatalogLimit,
    MAX_MODEL_CATALOG_SIZE
  );
  const qwenRetryEnabled = String(
    process.env.QWEN_RETRY_ENABLED != null ? process.env.QWEN_RETRY_ENABLED : localConfig.qwenRetryEnabled
  )
    .trim()
    .toLowerCase() === 'true';
  const qwenRetryTimeoutMs = toPositiveInt(
    process.env.QWEN_RETRY_TIMEOUT_MS || localConfig.qwenRetryTimeoutMs,
    DEFAULT_QWEN_RETRY_TIMEOUT_MS
  );
  const qwenRetryCatalogLimit = toPositiveInt(
    process.env.QWEN_RETRY_CATALOG_LIMIT || localConfig.qwenRetryCatalogLimit,
    DEFAULT_QWEN_RETRY_CATALOG_LIMIT
  );
  const imageOnlyCatalogLimit = toPositiveInt(
    process.env.QWEN_IMAGE_ONLY_CATALOG_LIMIT || localConfig.qwenImageOnlyCatalogLimit,
    DEFAULT_IMAGE_ONLY_CATALOG_LIMIT
  );
  const imageMaxPixels = toPositiveInt(
    process.env.QWEN_IMAGE_MAX_PIXELS || localConfig.qwenImageMaxPixels,
    DEFAULT_IMAGE_MAX_PIXELS
  );
  const qwenMaxTokens = toPositiveInt(
    process.env.QWEN_MAX_TOKENS || localConfig.qwenMaxTokens,
    DEFAULT_QWEN_MAX_TOKENS
  );
  const qwenImageOnlyMaxTokens = toPositiveInt(
    process.env.QWEN_IMAGE_ONLY_MAX_TOKENS || localConfig.qwenImageOnlyMaxTokens,
    DEFAULT_QWEN_IMAGE_ONLY_MAX_TOKENS
  );
  const qwenRetryMaxTokens = toPositiveInt(
    process.env.QWEN_RETRY_MAX_TOKENS || localConfig.qwenRetryMaxTokens,
    DEFAULT_QWEN_RETRY_MAX_TOKENS
  );
  const qwenImageOnlyRetryMaxTokens = toPositiveInt(
    process.env.QWEN_IMAGE_ONLY_RETRY_MAX_TOKENS || localConfig.qwenImageOnlyRetryMaxTokens,
    DEFAULT_QWEN_IMAGE_ONLY_RETRY_MAX_TOKENS
  );
  const isImageOnly = !userText && Array.isArray(imageUrls) && imageUrls.length > 0;
  const firstCatalogLimit = isImageOnly ? Math.min(modelCatalogLimit, imageOnlyCatalogLimit) : modelCatalogLimit;
  const servicesForModel = pickServicesForModel(services, userText, firstCatalogLimit);
  const servicesForRetry = pickServicesForModel(servicesForModel, userText, qwenRetryCatalogLimit);

  // 默认走降级，若模型成功再覆盖
  let modelResult = null;
  let modelUsed = 'rule-fallback';
  let fallbackReason = '';
  let keyConfigured = !!apiKey;
  let providerRequestId = '';
  let qwenUsage = null;
  let retryAttempted = false;
  let retrySucceeded = false;
  let fallbackReasonCode = '';

  // 明确识别占位 key，避免误以为已配置成功
  if (normalizedKey.placeholder) {
    fallbackReason = 'invalid_key_placeholder';
    keyConfigured = false;
  }

  // 有 key 就尝试调模型
  if (apiKey) {
    try {
      const qwenResult = await callQwenAdvisor({
        apiKey,
        model,
        baseUrl,
        requestTimeoutMs: qwenTimeoutMs,
        maxTokens: isImageOnly ? qwenImageOnlyMaxTokens : qwenMaxTokens,
        strictJsonOnly: !!isImageOnly,
        imageMaxPixels,
        storeLabel: scopeStore ? scopeStore.name || '当前门店' : '全部门店',
        userText,
        imageUrls,
        services: servicesForModel
      });
      modelResult = qwenResult && qwenResult.parsed ? qwenResult.parsed : null;
      providerRequestId = (qwenResult && qwenResult.providerRequestId) || '';
      qwenUsage = (qwenResult && qwenResult.usage) || null;
      modelUsed = model;
      console.log('qwen api usage', {
        model,
        providerRequestId,
        usage: qwenUsage
      });
    } catch (err) {
      // 首次失败时，优先做一次“轻量重试”而不是立即降级
      console.error('call qwen advisor failed:', err);
      const firstReason = (err && err.message) || 'qwen_call_failed';
      const canRetry = qwenRetryEnabled && isRetryableQwenError(err);
      if (canRetry) {
        retryAttempted = true;
        try {
          const retryResult = await callQwenAdvisor({
            apiKey,
            model,
            baseUrl,
            requestTimeoutMs: qwenRetryTimeoutMs,
            maxTokens: isImageOnly ? qwenImageOnlyRetryMaxTokens : qwenRetryMaxTokens,
            strictJsonOnly: true,
            imageMaxPixels,
            storeLabel: scopeStore ? scopeStore.name || '当前门店' : '全部门店',
            userText,
            imageUrls,
            services: servicesForRetry
          });
          modelResult = retryResult && retryResult.parsed ? retryResult.parsed : null;
          providerRequestId = (retryResult && retryResult.providerRequestId) || '';
          qwenUsage = (retryResult && retryResult.usage) || null;
          modelUsed = model;
          retrySucceeded = true;
          console.log('qwen api usage retry', {
            model,
            providerRequestId,
            usage: qwenUsage
          });
        } catch (retryErr) {
          console.error('call qwen advisor retry failed:', retryErr);
          if (retryErr && retryErr.rawContentSnippet) {
            console.log('qwen invalid json snippet retry', {
              providerRequestId: retryErr.providerRequestId || '',
              snippet: retryErr.rawContentSnippet
            });
          }
          fallbackReason = (retryErr && retryErr.message) || firstReason;
          fallbackReasonCode = getFallbackReasonCode(retryErr);
        }
      } else {
        if (err && err.rawContentSnippet) {
          console.log('qwen invalid json snippet', {
            providerRequestId: err.providerRequestId || '',
            snippet: err.rawContentSnippet
          });
        }
        fallbackReason = firstReason;
        fallbackReasonCode = getFallbackReasonCode(err);
      }
    }
  } else if (!fallbackReason) {
    // 没 key 且没有更明确原因时，标记 no_key
    fallbackReason = 'no_key';
  }

  // 组装最终输出：
  // - advice 优先模型结果
  // - recommendations 强制走真实服务归一化
  // - bookingRemark 优先模型结果，否则规则生成
  const adviceFromModel = trimText(modelResult && modelResult.advice, 240);
  const normalizedRecommendations = normalizeRecommendations(modelResult && modelResult.recommendations, services, userText);
  const backfilledRecommendations = await backfillUnknownStoreNames(db, normalizedRecommendations);
  const intentFilteredRecommendations = enforceIntentRecommendations(backfilledRecommendations, services, userText, 3);
  const recommendations = sortRecommendationsByPrice(intentFilteredRecommendations);
  const advice = adviceFromModel || buildFallbackAdvice(userText, recommendations);
  const bookingRemark = buildBookingRemark(
    modelResult && modelResult.bookingRemark,
    userText,
    recommendations
  );

  // 关键诊断日志：用于快速确认“是否调用模型/是否降级/图片是否生效”
  const requestId = (context && (context.requestId || context.eventId || context.traceId)) || '';
  console.log('ai-service-advisor summary', {
    requestId,
    storeId,
    scope: storeId ? 'single-store' : 'all-stores',
    modelUsed,
    buildTag: BUILD_TAG,
    keyConfigured,
    fallbackReason,
    fallbackReasonCode,
    providerRequestId,
    qwenUsage,
    modelCatalogSize: Array.isArray(servicesForModel) ? servicesForModel.length : 0,
    totalServiceCount: Array.isArray(services) ? services.length : 0,
    qwenTimeoutMs,
    qwenRetryEnabled,
    qwenRetryTimeoutMs,
    qwenRetryCatalogLimit,
    isImageOnly,
    imageOnlyCatalogLimit,
    imageMaxPixels,
    qwenMaxTokens,
    qwenImageOnlyMaxTokens,
    qwenRetryMaxTokens,
    qwenImageOnlyRetryMaxTokens,
    retryAttempted,
    retrySucceeded,
    inputImageCount: Array.isArray(imageFileIds) ? imageFileIds.length : 0,
    resolvedImageUrlCount: Array.isArray(imageUrls) ? imageUrls.length : 0,
    recommendationCount: Array.isArray(recommendations) ? recommendations.length : 0
  });

  // 返回给前端
  return {
    sessionId: `agent_${Date.now()}`,
    modelUsed,
    keyConfigured,
    fallbackReason,
    advice,
    bookingRemark,
    recommendations
  };
});
