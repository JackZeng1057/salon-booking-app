// 统一导出 common 内的工具，方便云函数按需引用
const response = require('./response');
const errors = require('./errors');
const auth = require('./auth');
const withResponse = require('./withResponse');
const audit = require('./audit');

module.exports = {
  ...response,
  ...errors,
  ...auth,
  ...withResponse,
  ...audit
};
