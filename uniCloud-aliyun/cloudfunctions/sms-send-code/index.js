/**
 * sms-send-code 云函数 —— 发送短信验证码
 *
 * 【功能说明】
 * 用于"手机号绑定"、"密码重置"等需要短信验证的场景。
 * 支持两种运行模式，通过配置文件或环境变量切换：
 *   demo   : 演示模式，不实际发送短信，直接返回验证码给前端，供开发/论文演示使用
 *   market : 阿里云短信市场 API（AppCode 方式），在生产环境实际发送短信
 *   auto   : 优先使用 market，若未配置 AppCode 则退化为 demo 模式
 *
 * 【防刷设计】
 * 同手机号+同业务类型（type）重发间隔 60 秒（RESEND_GAP_MS），
 * 通过查询 sms_codes 集合最近记录实现，不依赖外部 Redis。
 *
 * 【验证码有效期】
 * 默认 5 分钟（CODE_EXPIRE_MS），写入 sms_codes.expiresAt 字段，
 * 校验时用 db.command.gt(now) 判断是否过期。
 *
 * 【配置优先级】
 * 环境变量 > 云函数目录下 config.json
 * 线上部署后通常通过 uniCloud 环境变量配置供应商参数，
 * 本地开发可在 config.json 中覆盖以避免修改环境变量。
 */
// 短信验证码发送：支持阿里云市场 API（AppCode）与演示模式
const fs = require('fs');
const path = require('path');
const { withResponse, ApiError } = require('sb-common');

// 版本标记：便于线上日志快速定位当前云函数发布批次。
const BUILD_TAG = '2026-02-20-sms-market-v1';
// 验证码有效期：默认 5 分钟。
const CODE_EXPIRE_MS = 5 * 60 * 1000;
// 同手机号+同业务类型重发间隔：默认 60 秒，防止高频刷短信。
const RESEND_GAP_MS = 60 * 1000;

// 安全读取 JSON 文件：文件不存在、内容为空或解析失败都返回空对象，避免影响主流程。
function readJsonFile(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    return {};
  }
}

// 配置优先级：环境变量 > config.json
// 说明：云函数发布后通常通过环境变量配置供应商参数，本地开发可用 config.json 覆盖。
function loadConfig() {
  const local = readJsonFile(path.join(__dirname, 'config.json'));

  const modeRaw = String(process.env.SMS_MODE || local.mode || 'auto').trim().toLowerCase();
  const mode = ['demo', 'market', 'auto'].includes(modeRaw) ? modeRaw : 'auto';

  return {
    mode,
    appCode: String(process.env.SMS_MARKET_APPCODE || local.appCode || '').trim(),
    endpoint: String(
      process.env.SMS_MARKET_ENDPOINT ||
        local.endpoint ||
        'https://gyytz.market.alicloudapi.com/sms/smsSend'
    ).trim(),
    method: String(process.env.SMS_MARKET_METHOD || local.method || 'POST').trim().toUpperCase(),
    timeoutMs: Number(process.env.SMS_MARKET_TIMEOUT_MS || local.timeoutMs || 8000),
    smsSignId: String(process.env.SMS_MARKET_SIGN_ID || local.smsSignId || '').trim(),
    templateId: String(process.env.SMS_MARKET_TEMPLATE_ID || local.templateId || '').trim(),
    paramTemplate: String(
      process.env.SMS_MARKET_PARAM_TEMPLATE || local.paramTemplate || '**code**:{code},**minute**:{minute}'
    ).trim(),
    contentTemplate: String(
      process.env.SMS_MARKET_CONTENT_TEMPLATE || local.contentTemplate || '【验证码】您的验证码是{code}，{minute}分钟内有效。'
    ).trim(),
    requireTemplateIds:
      String(
        process.env.SMS_MARKET_REQUIRE_TEMPLATE_IDS != null
          ? process.env.SMS_MARKET_REQUIRE_TEMPLATE_IDS
          : local.requireTemplateIds != null
            ? local.requireTemplateIds
            : true
      )
        .trim()
        .toLowerCase() !== 'false',
    fallbackToDemoOnProviderError:
      String(
        process.env.SMS_MARKET_FALLBACK_TO_DEMO != null
          ? process.env.SMS_MARKET_FALLBACK_TO_DEMO
          : local.fallbackToDemoOnProviderError != null
            ? local.fallbackToDemoOnProviderError
            : true
      )
        .trim()
        .toLowerCase() !== 'false'
  };
}

// 校验中国大陆手机号（11 位，以 1 开头，第二位 3-9）。
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(String(phone || ''));
}

// 生成 6 位数字验证码。
function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 归一化验证码业务类型，未知类型统一按找回密码处理，避免写入脏数据。
function pickType(rawType) {
  const t = String(rawType || '').trim();
  if (t === 'register' || t === 'login' || t === 'reset_password') return t;
  return 'reset_password';
}

// 规范化超时参数：必须是 >=1000ms 的整数，否则使用兜底值。
function normalizeTimeout(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  if (v < 1000) return fallback;
  return v;
}

// 简单模板变量替换：把 {code}/{minute} 这类占位符渲染为真实值。
function formatWithVars(template, vars) {
  let out = String(template || '');
  Object.keys(vars || {}).forEach((key) => {
    const val = vars[key];
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
  });
  return out;
}

// 构造短信供应商请求体：
// 1) 有模板配置时走模板参数（smsSignId/templateId/param）；
// 2) 无模板配置时回退为 content 文本直发。
function buildProviderPayload({ phone, code, expireMinutes, config }) {
  // 该市场商品常见入参：mobile / param / smsSignId / templateId
  // 若配置了模板ID和签名ID，则优先走模板发送（推荐）
  const params = new URLSearchParams();
  params.set('mobile', phone);

  const hasTemplate = !!(config.templateId && config.smsSignId);
  const vars = { code, minute: expireMinutes };

  if (hasTemplate) {
    params.set('smsSignId', config.smsSignId);
    params.set('templateId', config.templateId);
    params.set('param', formatWithVars(config.paramTemplate, vars));
  } else {
    params.set('content', formatWithVars(config.contentTemplate, vars));
  }
  return params.toString();
}

// 尽力把供应商响应解析成 JSON；解析失败返回 null，后续仍可按文本兜底判断。
function tryParseJson(payload) {
  if (!payload) return null;
  if (typeof payload === 'object') return payload;
  const raw = String(payload).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

// 统一判断短信供应商是否发送成功：
// 同时兼容 HTTP 状态码、JSON code 字段以及文本提示，降低供应商字段差异带来的误判。
function isProviderSuccess(statusCode, bodyObj, bodyText) {
  if (statusCode >= 400 || statusCode <= 0) return false;
  if (bodyObj) {
    if (bodyObj.success === true) return true;
    const code = String(bodyObj.code || bodyObj.status || bodyObj.return_code || '').toUpperCase();
    if (code === '0' || code === '200' || code === 'OK' || code === 'SUCCESS' || code === '00000') return true;
    const msg = String(bodyObj.msg || bodyObj.message || bodyObj.info || '');
    if (/成功|已发送|提交成功/.test(msg)) return true;
  }
  return /成功|已发送|提交成功/.test(String(bodyText || ''));
}

// 调用阿里云市场短信接口发送验证码。
// 这里会抛出可识别的错误码（如 appcode 缺失、模板配置缺失、供应商返回失败）供上层决定是否降级。
async function sendByAliMarket({ phone, code, config }) {
  if (!config.appCode) {
    throw new Error('sms_market_appcode_missing');
  }
  if (!config.endpoint) {
    throw new Error('sms_market_endpoint_missing');
  }
  if (config.requireTemplateIds && (!config.smsSignId || !config.templateId)) {
    throw new Error('sms_market_template_config_missing');
  }

  const timeoutMs = normalizeTimeout(config.timeoutMs, 8000);
  const payload = buildProviderPayload({
    phone,
    code,
    expireMinutes: 5,
    config
  });
  const method = config.method === 'GET' ? 'GET' : 'POST';
  const requestUrl = method === 'GET' ? `${config.endpoint}${config.endpoint.includes('?') ? '&' : '?'}${payload}` : config.endpoint;

  const res = await uniCloud.httpclient.request(requestUrl, {
    method,
    timeout: timeoutMs,
    dataType: 'text',
    headers: {
      Authorization: `APPCODE ${config.appCode}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    data: method === 'GET' ? undefined : payload
  });

  const statusCode = Number((res && (res.status || res.statusCode)) || 0);
  const bodyText = String((res && res.data) || '');
  const bodyObj = tryParseJson(bodyText);
  const ok = isProviderSuccess(statusCode, bodyObj, bodyText);
  const providerRequestId =
    (res && res.headers && (res.headers['x-ca-request-id'] || res.headers['x-request-id'])) || '';

  if (!ok) {
    const err = new Error('sms_market_send_failed');
    err.statusCode = statusCode;
    err.providerRequestId = providerRequestId;
    err.responseText = bodyText.slice(0, 500);
    throw err;
  }

  return {
    providerRequestId,
    statusCode,
    response: bodyObj || bodyText
  };
}

// 落库保存验证码（仅保存哈希前明文版本，与当前 verify 逻辑保持一致）。
// 字段 used/expiresAt 用于校验函数消费和过期判断。
async function saveCode({ db, phone, code, type, now }) {
  return db.collection('sms_codes').add({
    phone,
    code,
    type,
    expiresAt: now + CODE_EXPIRE_MS,
    used: false,
    createdAt: now
  });
}

// 主流程：
// 1) 参数校验；
// 2) 60 秒频控；
// 3) 按配置尝试 market 通道；
// 4) 失败时按开关决定是否回退 demo；
// 5) 成功后统一写入 sms_codes，供后续验证码校验使用。
exports.main = withResponse(async (event) => {
  const phone = String((event && event.phone) || '').trim();
  const type = pickType(event && event.type);
  const config = loadConfig();

  if (!phone) {
    throw new ApiError(400, 'phone is required');
  }
  if (!isValidPhone(phone)) {
    throw new ApiError(400, 'invalid phone number');
  }

  const db = uniCloud.database();
  const now = Date.now();

  // 60 秒频控：同手机号同类型在窗口内只允许发送一次。
  const recentCode = await db
    .collection('sms_codes')
    .where({
      phone,
      type,
      createdAt: db.command.gt(now - RESEND_GAP_MS)
    })
    .limit(1)
    .get();
  if (Array.isArray(recentCode.data) && recentCode.data.length > 0) {
    throw new ApiError(429, '发送过于频繁，请稍后再试');
  }

  const code = genCode();
  // mode=market 强制走供应商；mode=auto 在 appCode 存在时优先走供应商。
  const preferMarket = config.mode === 'market' || (config.mode === 'auto' && !!config.appCode);

  if (preferMarket) {
    try {
      const provider = await sendByAliMarket({ phone, code, config });
      await saveCode({ db, phone, code, type, now });

      console.log('sms-send-code summary', {
        buildTag: BUILD_TAG,
        mode: 'market',
        type,
        phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`,
        providerRequestId: provider.providerRequestId || '',
        statusCode: provider.statusCode
      });

      return {
        success: true,
        message: '验证码已发送',
        expiresIn: Math.floor(CODE_EXPIRE_MS / 1000),
        channel: 'market'
      };
    } catch (err) {
      // 供应商失败：根据开关决定直接报错，还是降级到 demo 通道。
      console.error('sms market send failed:', err);
      if (!config.fallbackToDemoOnProviderError) {
        throw new ApiError(500, (err && err.message) || '验证码发送失败，请稍后重试');
      }
    }
  }

  // 演示兜底（可关闭）
  await saveCode({ db, phone, code, type, now });
  console.log('sms-send-code summary', {
    buildTag: BUILD_TAG,
    mode: 'demo',
    type,
    phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`
  });
  return {
    success: true,
    message: '验证码已发送（演示模式）',
    code,
    expiresIn: Math.floor(CODE_EXPIRE_MS / 1000),
    channel: 'demo'
  };
});
