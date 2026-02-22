/**
 * 中国时区时间工具（UTC+8）
 * 统一处理“日期字符串”和“时间戳”之间转换，避免跨时区偏差。
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
