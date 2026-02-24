/**
 * @file chinaTime.js — 中国时区时间工具（UTC+8）
 *
 * 【设计背景】
 * uniCloud 云函数运行在阿里云服务器上，Node.js 进程的系统时区是 UTC，
 * 而业务日期字段（如 orders.date、barber_schedules.date）均为中国日期（UTC+8）。
 * 若直接使用 new Date().toISOString() 或 Date() 字符串解析，
 * 在 0:00 ~ 7:59 UTC 时段（即中国 8:00 ~ 15:59 前一天）会产生日期偏差。
 *
 * 本文件通过"手工加 8 小时偏移"的方式，在所有云函数中统一做 UTC→UTC+8 转换，
 * 避免跨时区引发的日期计算错误。
 *
 * 【函数说明】
 * getChinaDateString(ts)  - 将任意时间戳转为 'YYYY-MM-DD' 中国日期字符串；
 * toChinaTimestamp(dateStr, timeStr) - 将日期 + 时间字符串解析为中国时区毫秒时间戳，
 *                                      用于"服务开始前 5 分钟截止预约"等时间判断。
 */

// 将数字补齐为 2 位字符串（例如 3 -> "03"）
function pad2(num) {
  return String(num).padStart(2, '0');
}

// 根据时间戳计算中国时区当天日期（YYYY-MM-DD）
function getChinaDateString(ts = Date.now()) {
  const china = new Date(ts + 8 * 60 * 60 * 1000);
  const y = china.getUTCFullYear();
  const m = pad2(china.getUTCMonth() + 1);
  const d = pad2(china.getUTCDate());
  return `${y}-${m}-${d}`;
}

// 将“日期 + 时间”按中国时区解析为毫秒时间戳
function toChinaTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return 0;
  return new Date(`${dateStr}T${timeStr}:00+08:00`).getTime();
}

module.exports = {
  getChinaDateString,
  toChinaTimestamp
};
