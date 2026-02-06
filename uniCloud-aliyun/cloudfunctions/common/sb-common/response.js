// 统一返回结构封装
// 统一返回结构的默认 message
const DEFAULT_MESSAGE = 'ok';

// 统一构造返回对象，保证所有字段齐全
function buildResponse({ code, message, data, requestId }) {
  return {
    code,
    message: message || DEFAULT_MESSAGE,
    data: data === undefined ? null : data,
    requestId: requestId || ''
  };
}

// 成功返回，约定 code=0
function success(data, requestId) {
  return buildResponse({ code: 0, message: DEFAULT_MESSAGE, data, requestId });
}

// 失败返回，可附带额外 data
function fail(code, message, requestId, data) {
  return buildResponse({ code, message, data, requestId });
}

module.exports = {
  buildResponse,
  success,
  fail
};
