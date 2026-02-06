// 业务约定的错误码，和 HTTP 语义保持一致
const ERROR_CODES = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  UNPROCESSABLE: 422
};

// 统一业务错误类型，携带 code 和可选 data
class ApiError extends Error {
  constructor(code, message, data) {
    super(message || 'error');
    this.code = code;
    this.data = data;
  }
}

// 判断是否为业务错误，便于统一封装
function isApiError(err) {
  return err instanceof ApiError;
}

module.exports = {
  ERROR_CODES,
  ApiError,
  isApiError
};
