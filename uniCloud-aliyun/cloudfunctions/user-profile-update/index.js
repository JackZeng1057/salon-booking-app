// 账号资料更新：支持账号名（username）与头像
const { withResponse, requireRole, ApiError } = require('sb-common');

function sanitizeText(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, 20);
}

exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user', 'admin', 'barber'], event, context);
  const userId = user._id || user.uid || user.userId;

  const username = sanitizeText((event && event.username) || (event && event.name));
  const avatar = String((event && event.avatar) || '').trim();

  if (!username && !avatar) {
    throw new ApiError(400, 'username or avatar is required');
  }

  const db = uniCloud.database();
  const updateData = {
    updatedAt: Date.now()
  };
  if (username) {
    const existedRes = await db.collection('users')
      .where({ username })
      .limit(1)
      .get();
    const existed = existedRes.data && existedRes.data[0];
    if (existed && existed._id !== userId) {
      throw new ApiError(409, 'username already exists');
    }
    // 按你的规则：账号名和昵称视为同一字段，保持同步
    updateData.username = username;
    updateData.name = username;
  }
  if (avatar) updateData.avatar = avatar;

  await db.collection('users').doc(userId).update(updateData);

  const userRes = await db.collection('users').doc(userId).field({
    _id: true,
    username: true,
    role: true,
    storeId: true,
    phone: true,
    name: true,
    avatar: true
  }).get();
  const latest = (userRes.data && userRes.data[0]) || {};

  return {
    user: {
      _id: latest._id || userId,
      username: latest.username || '',
      role: latest.role || 'user',
      storeId: latest.storeId || '',
      phone: latest.phone || '',
      name: latest.name || '',
      avatar: latest.avatar || ''
    }
  };
});
