function pad2(num) {
  return String(num).padStart(2, '0');
}

function getChinaDateString(ts = Date.now()) {
  const china = new Date(ts + 8 * 60 * 60 * 1000);
  const y = china.getUTCFullYear();
  const m = pad2(china.getUTCMonth() + 1);
  const d = pad2(china.getUTCDate());
  return `${y}-${m}-${d}`;
}

function toChinaTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return 0;
  return new Date(`${dateStr}T${timeStr}:00+08:00`).getTime();
}

module.exports = {
  getChinaDateString,
  toChinaTimestamp
};
