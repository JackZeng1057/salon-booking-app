import { authStore } from '../store/auth';

/**
 * @file client.js — 前端云函数调用统一客户端
 *
 * 【职责定位】
 * 所有前端 api/*.js 模块最终都通过本文件的 callCloud() 发起云函数调用。
 * 集中处理以下三类关注点，避免在每个业务模块中反复实现：
 *   1. Token 注入      — 从 Vuex store 读取 token 并自动附加到每次请求，
 *                        页面层完全无需手动传递 token 参数；
 *   2. 错误翻译        — 将后端英文错误码/网络错误统一转换为用户可读的中文提示，
 *                        通过 exactMap 精确匹配 + 正则模式 + HTTP 状态码 三重兜底；
 *   3. requestId 追踪  — 从错误信息中提取 requestId 并附加到 Error 对象，
 *                        供 debug 时定位云函数执行日志。
 *
 * 【调用链路】
 *   页面层 (pages/)
 *     → 业务 API 模块 (api/order.js, api/auth.js …)
 *       → callCloud(name, data)        ← 本文件
 *         → uniCloud.callFunction()    ← uniCloud SDK
 *           → 云函数 (uniCloud-aliyun/cloudfunctions/)
 *
 * 【错误处理两路径】
 *   A. 网络层错误（uniCloud.callFunction throw）：SDK 层超时/连接失败，
 *      捕获后构造统一 Error 对象并抛出
 *   B. 业务层错误（result.code !== 0）：云函数正常返回但业务失败，
 *      同样转为 Error 抛出，保证调用方只需 catch 一种类型
 *
 * 【成功路径】
 *   只返回 result.data，页面层不感知 { code, message, data, requestId } 包裹结构，
 *   写法更简洁（直接 const data = await apiXxx()，无需 .data.data 解包）
 */

/**
 * 从错误文本中提取 requestId
 * 后端 withResponse.js 会将 requestId 以 [requestId:xxx] 格式拼接到 message 末尾，
 * 此函数将其解析出来，供排障时检索云函数执行日志。
 * @param {string} text - 原始错误消息
 * @returns {string} requestId 或空字符串
 */
function extractRequestId(text) {
  const m = String(text || '').match(/\[requestId:([^\]]+)\]/);
  return m ? m[1] : '';
}

/**
 * 清理错误消息中的 requestId 后缀
 * 由于 requestId 是内部调试信息，不适合直接展示给终端用户（如 toast），
 * 此函数将其从消息文本中剥离，获得纯净的错误说明。
 * @param {string} text
 * @returns {string}
 */
function stripRequestId(text) {
  return String(text || '').replace(/\s*\[requestId:[^\]]+\]\s*/g, '').trim();
}

/**
 * 错误文案翻译器（三级降级策略）
 *
 * 翻译优先级：
 *   1. 超时特判 —— 对 AI 云函数超时单独提示，引导用户到控制台调整超时配置；
 *   2. exactMap 精确匹配 —— 约 60 条已知英文错误码→中文映射，覆盖所有业务场景；
 *   3. 正则模式匹配 —— 捕获网络错误、凭证错误等通用模式；
 *   4. HTTP 状态码兜底 —— 对未匹配的错误按 401/403/404/5xx/4xx 兜底翻译；
 *   5. 最终兜底 —— "请求失败，请稍后重试"
 *
 * 设计动机：将所有文案集中在此处，UI 层只负责展示，不感知英文错误码。
 *
 * @param {string} message - 原始英文错误消息
 * @param {number} code    - 业务错误码（与 HTTP 状态码语义对齐）
 * @returns {string} 中文可读文案
 */
function translateErrorMessage(message, code) {
  const pure = stripRequestId(message);
  const lower = pure.toLowerCase();
  if (pure.includes('请求云函数超时')) {
    return '云函数执行超时，请在 uniCloud 将 ai-service-advisor 超时时间调大到 20-30 秒后重试';
  }

  const exactMap = {
    'No response': '服务无响应，请稍后重试',
    'Request failed': '请求失败，请稍后重试',
    'Internal Server Error': '服务器开小差了，请稍后重试',
    Unauthorized: '登录已失效，请重新登录',
    Forbidden: '暂无权限执行该操作',
    forbidden: '暂无权限执行该操作',
    'invalid credentials': '用户名或密码错误',
    'username and password required': '请输入用户名和密码',
    'username already exists': '用户名已存在',
    'storeId required': '请填写门店ID',
    'store name required': '请填写所属门店名称',
    'multiple stores matched': '存在同名门店，请在下拉列表中选择具体门店',
    'admin already exists for this store': '该门店已存在店家账号',
    'create store failed': '创建门店失败，请稍后重试',
    'invalid store data': '门店数据异常，请稍后重试',
    'admin storeId required': '当前管理员未绑定门店',
    'services must be array': '服务列表格式错误',
    'service name required': '请填写服务名称',
    'invalid service price': '服务价格格式错误',
    'invalid service duration': '服务时长格式错误',
    'assignments must be array': '理发师项目配置格式错误',
    'invalid barberId': '存在无效的理发师配置，请刷新重试',
    'invalid serviceId': '存在无效的服务项目配置，请刷新重试',
    'service not available for booking': '当前服务暂不可预约',
    'barber not available for selected service': '该理发师暂不提供此服务',
    'phone and code are required': '请输入手机号和验证码',
    'phone is required': '请输入手机号',
    'name or avatar is required': '请填写要保存的资料',
    'username or avatar is required': '请填写账号名或头像',
    'user not found': '未找到用户',
    'phone already bound': '该手机号已被绑定',
    'invalid phone number': '手机号格式不正确',
    'store id required': '缺少门店ID',
    'storeId required': '缺少门店ID',
    'text or image required': '请先输入需求或上传图片',
    'store not found': '未找到门店信息',
    'userId required': '缺少理发师账号ID',
    'invalid action': '审核操作无效',
    'application not found': '未找到理发师申请记录',
    'order not found': '未找到订单信息',
    'notification not found': '未找到通知',
    'notificationId is required': '缺少通知ID',
    'reviewId is required': '缺少评价ID',
    'review not found': '未找到评价记录',
    'images must be cloud file id or http(s) url': '评价图片格式无效，请升级到最新版本后重试',
    'status_not_allowed': '当前状态不允许此操作',
    reschedule_window_expired: '距离开始不足5分钟，当前不可改期',
    schedule_not_set: '该日期未设置排班',
    schedule_invalid: '排班配置异常，请联系门店管理员',
    outside_schedule: '所选时段不在排班时间内',
    outside_business_hours: '所选时段不在门店营业时间内',
    slot_conflict: '该时段已被占用，请重新选择',
    booking_window_closed: '该时段距离开始不足5分钟，已停止预约',
    time_expired: '该时段已过期，请重新选择',
    not_overdue: '当前订单尚未超时',
    review_exists: '该订单已评价',
    'barber not found': '未找到理发师信息',
    'create order failed': '创建订单失败，请稍后重试',
    sms_market_appcode_missing: '短信服务未配置AppCode',
    sms_market_endpoint_missing: '短信服务接口地址未配置',
    sms_market_template_config_missing: '短信模板配置缺失，请检查smsSignId和templateId',
    sms_market_send_failed: '短信通道返回失败，请检查模板变量配置',
    qwen_request_failed: 'AI服务暂时不可用，请稍后再试',
    qwen_empty_response: 'AI服务返回异常，请稍后再试',
    qwen_invalid_json: 'AI结果解析失败，请稍后再试'
  };
  if (exactMap[pure]) return exactMap[pure];

  if (/network|request:fail|failed to fetch|fetch failed|timeout|timed out|超时|econn|enotfound|dns/i.test(lower)) {
    return '网络连接失败，请检查网络';
  }
  if (/invalid credentials|password|username/i.test(lower) && code === 401) {
    return '用户名或密码错误';
  }
  if (code === 401) return '登录已失效，请重新登录';
  if (code === 403) return '暂无权限执行该操作';
  if (code === 404) return '未找到相关数据';
  if (code >= 500) return '服务器开小差了，请稍后重试';
  if (code === 400 || code === 422) return '请求参数有误，请检查后重试';

  return pure || '请求失败，请稍后重试';
}

/**
 * 云函数调用入口（全局统一）
 *
 * 封装了 uniCloud.callFunction 的所有样板代码：
 * - 自动从 Vuex authStore 读取 token 并注入到 payload，无需调用方传递；
 * - 默认超时 15 秒（AI 云函数建议通过 options.timeout 设为 25000）；
 * - 网络层抛出时：提取 requestId，翻译为中文，构造统一 Error 抛出；
 * - 业务层失败（code!==0）时：同样翻译并构造统一 Error 抛出；
 * - 成功时只返回 data 字段，页面层直接得到数据，无需 .data 解包。
 *
 * @param {string} name            - 云函数名称（如 'orders-create'）
 * @param {Object} [data={}]       - 业务参数（token 会被自动追加，无需手动传）
 * @param {Object} [options={}]    - 可选配置
 * @param {number} [options.timeout=15000] - 超时毫秒数
 * @returns {Promise<any>}         - 云函数返回的 result.data
 * @throws {Error}                 - 含 .code / .requestId / .data 的增强 Error 对象
 */
export async function callCloud(name, data = {}, options = {}) {
  // 克隆入参，避免污染调用方传入的对象（引用类型问题）
  const payload = { ...data };
  // 已登录时自动透传 token（云函数中 sb-common/auth.js 会验证此字段）
  if (authStore.state.token) {
    payload.token = authStore.state.token;
  }

  let res;
  try {
    res = await uniCloud.callFunction({
      name,
      data: payload,
      timeout: Number(options.timeout || 15000)
    });
  } catch (e) {
    // 网络层异常（SDK 层 throw）：超时、断网、DNS 失败等
    // 统一构造增强 Error 对象供页面层 catch：err.code / err.requestId / err.data
    const requestId = (e && e.requestId) || extractRequestId(e && e.message);
    const readable = translateErrorMessage(e && e.message, e && e.code);
    const err = new Error(readable);
    err.code = (e && e.code) || -1;
    err.data = (e && e.data) || null;
    err.requestId = requestId || '';
    throw err;
  }

  // 云函数未返回 result（极少见，通常是函数崩溃或 runtime 错误）
  const result = res && res.result;
  if (!result) {
    throw new Error('服务无响应，请稍后重试');
  }
  // 业务层非 0 code（如 400 参数错误、401 未登录、403 权限不足等）
  // 与网络层错误统一为 throw Error，页面层只需一个 catch 块处理所有失败情况
  if (result.code !== 0) {
    const requestId = result.requestId || '';
    const readable = translateErrorMessage(result.message, result.code);
    const err = new Error(readable);
    err.code = result.code;
    err.data = result.data;
    err.requestId = requestId;
    throw err;
  }

  // 成功：仅返回 data，页面层不感知 result 包装结构，写法更简洁
  return result.data;
}
