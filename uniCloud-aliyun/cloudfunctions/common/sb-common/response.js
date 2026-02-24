/**
 * response.js —— 统一 API 响应结构封装
 *
 * 【统一响应协议】
 * 所有云函数通过 withResponse 包装后，最终都会调用此模块的 success / fail，
 * 保证前端拿到的数据结构永远一致：
 *   {
 *     code:      number,   // 0 表示成功；其他值表示错误（参考 HTTP 状态码语义）
 *     message:   string,   // 成功时为 'ok'；失败时为具体错误说明
 *     data:      any,      // 成功时为业务数据；失败时通常为 null
 *     requestId: string    // 请求追踪 ID，便于客服/运维按 ID 定位日志
 *   }
 *
 * 【设计意义】
 * 统一响应结构是前后端协作的基础约定：
 * - 前端的 api/client.js（callCloud）只需判断 code === 0 即可，
 *   不必关心具体云函数的返回格式；
 * - 后端的 withResponse 负责填充 requestId 并调用 success/fail，
 *   业务开发者无需手写样板代码。
 *
 * 【code 与 HTTP 状态码的对应关系】
 *   0   → 成功
 *   400 → 请求参数错误
 *   401 → 未登录 / token 失效
 *   403 → 权限不足（角色不匹配）
 *   404 → 资源不存在
 *   409 → 冲突（如用户名重复、一门店重复注册 admin 等）
 *   422 → 参数不合规（业务前置条件不满足，如预约时段已被占用）
 *   500 → 服务端内部错误
 */

// 操作成功时的默认提示文案
const DEFAULT_MESSAGE = 'ok';

/**
 * 构造标准响应对象。
 * data 为 undefined 时统一置为 null，避免 JSON 序列化时字段丢失。
 */
function buildResponse({ code, message, data, requestId }) {
  return {
    code,
    message: message || DEFAULT_MESSAGE,
    data: data === undefined ? null : data,
    requestId: requestId || ''
  };
}

/**
 * 构造成功响应，code 固定为 0。
 * @param {any} data - 业务数据（对象/数组/基本类型均可）
 * @param {string} requestId - 请求追踪 ID
 */
function success(data, requestId) {
  return buildResponse({ code: 0, message: DEFAULT_MESSAGE, data, requestId });
}

/**
 * 构造失败响应，code 为具体错误码。
 * @param {number} code - 错误码（参考 HTTP 语义）
 * @param {string} message - 错误说明（供前端展示或调试）
 * @param {string} requestId - 请求追踪 ID
 * @param {any} data - 可选的额外错误数据（如字段校验详情）
 */
function fail(code, message, requestId, data) {
  return buildResponse({ code, message, data, requestId });
}

module.exports = {
  buildResponse,
  success,
  fail
};
