// 统一导出 common 内的工具，方便云函数按需引用
const response = require('./response');
const errors = require('./errors');
const auth = require('./auth');
const withResponse = require('./withResponse');
const audit = require('./audit');
const autoCancel = require('./autoCancel');
const bookingSlots = require('./bookingSlots');
const chinaTime = require('./chinaTime');
const reviewStats = require('./reviewStats');
const password = require('./password');
const barberServices = require('./barberServices');

module.exports = {
  ...response,
  ...errors,
  ...auth,
  ...withResponse,
  ...audit,
  ...autoCancel,
  ...bookingSlots,
  ...chinaTime,
  ...reviewStats,
  ...password,
  ...barberServices
};
