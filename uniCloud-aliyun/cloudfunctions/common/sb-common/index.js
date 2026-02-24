/**
 * @file index.js — sb-common 统一入口
 *
 * 所有云函数通过 require('sb-common') 一次性获得全部公共能力，
 * 无需分别引入各子模块，简化 import 管理。
 *
 * 【模块清单】
 * ┌─────────────────┬──────────────────────────────────────────────────────────┐
 * │ 模块文件         │ 主要导出                                                   │
 * ├─────────────────┼──────────────────────────────────────────────────────────┤
 * │ response.js     │ success() / fail() / failWithCode()                      │
 * │ errors.js       │ ERROR_CODES / ApiError / isApiError                      │
 * │ auth.js         │ requireLogin / requireRole / verifyToken / …             │
 * │ withResponse.js │ withResponse()（云函数包装高阶函数）                         │
 * │ audit.js        │ logAudit() / logOrderEvent()                             │
 * │ autoCancel.js   │ autoCancelOverdueBookedOrders()                          │
 * │ bookingSlots.js │ buildRequiredSlotStartTimes / lock* / ensure* / …       │
 * │ chinaTime.js    │ getChinaDateString() / toChinaTimestamp()                │
 * │ reviewStats.js  │ updateStoreRating()                                      │
 * │ password.js     │ hashPassword()                                           │
 * │ barberServices.js│ isBarberAssignedToService() / resolveAssignedService…  │
 * │ queue.js        │ buildQueueHintMap() / attachQueueHints()                 │
 * └─────────────────┴──────────────────────────────────────────────────────────┘
 */
// 统一导出 sb-common 内的工具，云函数通过 require('sb-common') 一次性拿到全部公共能力
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
const queue = require('./queue');

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
  ...barberServices,
  ...queue
};
