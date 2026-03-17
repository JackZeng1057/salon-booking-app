/**
 * withResponse —— 云函数响应包装器（高阶函数）
 *
 * 【解决的问题】
 * uniCloud 云函数的原始写法要求每个函数自行处理 try/catch、格式化返回值，
 * 导致大量样板代码重复且错误处理风格不统一。
 * withResponse 将"统一响应格式"、"入口/结果日志"和"错误捕获"提取为装饰器，
 * 业务函数只需专注于正常逻辑，异常会被自动拦截并转为标准 fail 响应。
 *
 * 【设计模式】
 * 这是一种"包装器/装饰器"模式（Wrapper Pattern）：
 *   withResponse(handler) 接收一个异步函数，返回一个新的异步函数，
 *   新函数在调用 handler 的同时注入了错误处理和响应格式化能力。
 *
 * 【错误分类处理】
 *   - ApiError（业务错误）：由开发者主动抛出，携带具体 code 和 message，
 *     如 401 未授权、404 资源不存在、409 冲突等。
 *     这类错误对前端是"已知的业务场景"，应如实返回 code 和 message。
 *   - 其他 Error（系统错误）：数据库超时、网络异常、代码 BUG 等，
 *     统一返回 500 Internal Server Error，不暴露堆栈信息给前端。
 *
 * 【requestId 追踪 + 统一日志】
 * 每次请求携带一个唯一的 requestId（来自 context），
 * 写入返回值并同步输出到日志，便于在日志系统中关联"某次请求"的完整链路。
 * 包装器会统一打印：
 *   - [cloud:start]   函数开始、入参 key、开始时间
 *   - [cloud:success] 函数成功、耗时
 *   - [cloud:error]   函数失败、耗时、错误摘要
 *
 * 【使用示例】
 *   exports.main = withResponse(async (event, context) => {
 *     // 直接写业务逻辑，抛出 ApiError 或返回数据即可
 *     return { ok: true };
 *   });
 */
const { success, fail } = require('./response');
const { isApiError } = require('./errors');

// 从 context 中提取可追踪的请求 ID（不同平台字段名不同，依次兜底）
function getRequestId(context) {
  if (!context) return '';
  return context.requestId || context.eventId || context.traceId || '';
}

/**
 * 将云函数业务 handler 包装成具有统一返回格式和全局错误捕获能力的函数。
 * @param {Function} handler - 原始业务逻辑函数 async (event, context) => data
 * @returns {Function} 包装后的云函数入口，签名与 handler 相同
 */
function withResponse(handler) {
  return async (event, context) => {
    const startedAt = Date.now();
    const requestId = getRequestId(context);
    const functionName = (context && (context.functionName || context.name)) || '';
    // 仅记录入参字段名，避免把 token、手机号等完整敏感值直接打进日志。
    const eventKeys = event && typeof event === 'object' ? Object.keys(event) : [];
    console.log('[cloud:start]', {
      functionName,
      requestId,
      eventKeys,
      startedAt
    });
    try {
      const data = await handler(event, context);
      // 成功日志只记录链路标识与耗时，保持日志轻量且便于批量检索。
      const durationMs = Date.now() - startedAt;
      console.log('[cloud:success]', {
        functionName,
        requestId,
        durationMs
      });
      // 正常执行：将业务返回值包装为 { code: 0, message: 'ok', data, requestId }
      return success(data, requestId);
    } catch (err) {
      // 失败日志保留 message/code/stack，方便控制台直接定位异常来源。
      const durationMs = Date.now() - startedAt;
      console.error('[cloud:error]', {
        functionName,
        requestId,
        durationMs,
        message: err && err.message,
        code: err && err.code,
        stack: err && err.stack
      });
      if (isApiError(err)) {
        // 业务异常：使用开发者指定的 code 和 message，可附带额外 data 字段
        return fail(err.code, err.message, requestId, err.data);
      }
      // 系统异常：不暴露内部错误细节，统一返回 500
      return fail(500, 'Internal Server Error', requestId);
    }
  };
}

module.exports = {
  withResponse
};
