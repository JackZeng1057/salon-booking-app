// 云函数响应包装：统一返回格式并捕获业务错误
const { success, fail } = require('./response');
const { isApiError } = require('./errors');

// 从 context 中提取可追踪的请求 ID
function getRequestId(context) {
  if (!context) return '';
  return context.requestId || context.eventId || context.traceId || '';
}

// 将云函数逻辑包装成统一返回结构
function withResponse(handler) {
  return async (event, context) => {
    const requestId = getRequestId(context);
    try {
      const data = await handler(event, context);
      return success(data, requestId);
    } catch (err) {
      if (isApiError(err)) {
        return fail(err.code, err.message, requestId, err.data);
      }
      return fail(500, 'Internal Server Error', requestId);
    }
  };
}

module.exports = {
  withResponse
};
