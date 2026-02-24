/**
 * errors.js —— 业务错误码定义 & ApiError 类
 *
 * 【错误处理设计思路】
 * 云函数中存在两类错误：
 *
 *   1. 业务错误（ApiError）：由业务逻辑主动抛出，属于"预期内的异常"。
 *      例如：token 过期（401）、用户名已存在（409）、预约时段冲突（422）。
 *      这类错误应将详细信息返回给前端，方便用户看到友好提示。
 *
 *   2. 系统错误（普通 Error）：代码 BUG、数据库连接超时、第三方服务异常等"未预期错误"。
 *      这类错误不应向前端暴露内部细节（防止信息泄露），统一返回 500。
 *
 * withResponse 通过 isApiError 区分这两类错误并分别处理。
 *
 * 【ERROR_CODES 与 HTTP 语义对齐的好处】
 * - 与 HTTP 状态码对齐，使得代码更易读（看到 401 就知道是未授权）；
 * - 前端可以用统一逻辑处理（如 code === 401 时跳转登录页），无需学习额外约定；
 * - 便于在论文中描述 RESTful 风格的接口设计规范。
 */

/**
 * 业务约定的错误码，与 HTTP 语义保持一致。
 * 在整个后端代码中统一引用此常量，避免魔法数字散落各处。
 */
const ERROR_CODES = {
  UNAUTHORIZED: 401,   // 未登录或 token 已过期
  FORBIDDEN: 403,      // 已登录但角色权限不足（如普通用户访问管理员接口）
  CONFLICT: 409,       // 资源冲突（用户名重复、一门店已有 admin 等）
  UNPROCESSABLE: 422   // 参数在语法上合法但业务上不满足前置条件（如时段被占用）
};

/**
 * 业务错误类，携带错误码和可选的附加数据。
 * 继承自 Error，保留完整的调用栈信息，便于服务端日志排查。
 *
 * @param {number} code - 错误码（通常取 ERROR_CODES 中的值）
 * @param {string} message - 错误描述（会出现在响应的 message 字段中）
 * @param {any} [data] - 可选附加数据（如字段级校验错误详情）
 */
class ApiError extends Error {
  constructor(code, message, data) {
    super(message || 'error');
    this.code = code;
    this.data = data;
  }
}

/**
 * 判断一个抛出的值是否为业务错误实例。
 * 由 withResponse 调用，用于区分"主动抛出的业务异常"和"意外的系统异常"。
 * @param {any} err - catch 块捕获的异常对象
 * @returns {boolean}
 */
function isApiError(err) {
  return err instanceof ApiError;
}

module.exports = {
  ERROR_CODES,
  ApiError,
  isApiError
};
