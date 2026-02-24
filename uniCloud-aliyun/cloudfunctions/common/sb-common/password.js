const crypto = require('crypto');

/**
 * @file password.js — 密码哈希工具
 *
 * 【安全设计说明】
 * 当前使用 SHA-256 对密码做单向哈希后存入 users.passwordHash 字段，
 * 数据库中永远不保存明文密码，即使数据泄露也无法直接还原。
 *
 * 【局限性说明（论文参考）】
 * SHA-256 是快速哈希算法，不包含"盐值"（salt），
 * 易受彩虹表攻击。生产级系统通常使用 bcrypt/argon2 等带盐慢哈希算法。
 * 本项目采用 SHA-256 出于以下考量：
 *   1. uniCloud（阿里云 Node.js 运行时）不内置 bcrypt/argon2；
 *   2. 学习阶段项目，优先保证功能完整性；
 *   3. 实际应用时建议替换为更安全的方案。
 *
 * 【使用场景】
 * - auth-register/index.js: 注册时加密密码写入 DB
 * - auth-login/index.js:    登录时对比 passwordHash 字段
 * - password-reset/index.js: 重置密码时更新 passwordHash
 */

// 对输入密码做哈希，空值也会被安全转换为字符串后处理
function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

module.exports = {
  hashPassword
};
