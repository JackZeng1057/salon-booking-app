/**
 * user-profile-update 云函数 —— 处理帐号资料
 *
 * 【可传字段】
 * - username/name：帐号名称（全局唯一，重复返回 409）
 * - avatar：头像 URL
 * - intro：理发师擅长介绍
 *
 * 【昵称策略】
 * - admin 角色：name = 门店名（优先）或 username
 * - barber/user 角色：name = username
 *
 * 【权限】
 * - user、admin、barber 均可调用
 */
// 账号资料处理：账号名、头像、擅长介绍
const { withResponse, requireRole, ApiError } = require('sb-common');

// 文本清洗：去首尾空格并限制最大长度，避免超长昵称污染展示/索引字段。
function sanitizeText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, 20);
}

// 擅长介绍清洗：允许空字符串（用于清空），上限 80 字符。
function sanitizeIntro(value) {
  return String(value || '').trim().slice(0, 80);
}

// 处理个人资料入参：
// - username/name（统一落到 username）和 avatar；
// - 根据角色同步 name 字段，确保前台展示命名规则一致。
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user', 'admin', 'barber'], event, context);
  const userId = user._id || user.uid || user.userId;

  // 兼容前端不同字段命名：username 与 name 二选一取值。
  const username = sanitizeText((event && event.username) || (event && event.name));
  const avatar = String((event && event.avatar) || '').trim();
  const hasIntro = !!(event && Object.prototype.hasOwnProperty.call(event, 'intro'));
  const intro = sanitizeIntro(event && event.intro);

  // 至少要有一个字段，避免空请求无意义写库。
  if (!username && !avatar && !hasIntro) {
    throw new ApiError(400, 'username or avatar or intro is required');
  }

  const db = uniCloud.database();
  const updateData = {
    updatedAt: Date.now()
  };
  if (username) {
    // username 全局唯一（当前实现未按门店分域），冲突则返回 409。
    const existedRes = await db.collection('users')
      .where({ username })
      .limit(1)
      .get();
    const existed = existedRes.data && existedRes.data[0];
    if (existed && existed._id !== userId) {
      throw new ApiError(409, 'username already exists');
    }
    // 用户名可修改，昵称策略：
    // admin 昵称默认=门店名；barber/普通用户昵称=账号名。
    updateData.username = username;
    if (user.role === 'admin' || user.role === 'barber') {
      const storeId = user.storeId || '';
      let storeName = '';
      if (storeId) {
        const storeRes = await db.collection('stores').doc(storeId).field({ name: true }).get();
        const store = storeRes && storeRes.data && storeRes.data[0];
        storeName = String((store && store.name) || '').trim();
      }
      if (user.role === 'admin') {
        updateData.name = storeName || username;
      } else {
        updateData.name = username;
      }
    } else {
      updateData.name = username;
    }
  }
  // 头像可独立提交，不依赖 username。
  if (avatar) updateData.avatar = avatar;
  // intro 支持显式清空（传空字符串也会覆盖）。
  if (hasIntro) updateData.intro = intro;

  await db.collection('users').doc(userId).update(updateData);

  // 回读最新用户信息，确保返回值与数据库最终状态一致。
  const userRes = await db.collection('users').doc(userId).field({
    _id: true,
    username: true,
    role: true,
    storeId: true,
    phone: true,
    name: true,
    avatar: true,
    intro: true
  }).get();
  const latest = (userRes.data && userRes.data[0]) || {};

  // 返回规范化结构，避免前端再做空值兜底。
  return {
    user: {
      _id: latest._id || userId,
      username: latest.username || '',
      role: latest.role || 'user',
      storeId: latest.storeId || '',
      phone: latest.phone || '',
      name: latest.name || '',
      avatar: latest.avatar || '',
      intro: latest.intro || ''
    }
  };
});
