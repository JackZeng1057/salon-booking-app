const crypto = require('crypto');

/**
 * 密码哈希工具
 * 说明：当前使用 SHA-256 做单向哈希，调用方仅保存哈希值。
 */

// 对输入密码做哈希，空值也会被安全转换为字符串后处理
function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

module.exports = {
  hashPassword
};
