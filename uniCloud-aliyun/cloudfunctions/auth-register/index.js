// 注册接口：校验用户信息并创建账号
// 引入 Node.js 加密模块
const crypto = require('crypto');
// 引入统一响应包装、错误类型与错误码常量
const { withResponse, ApiError, ERROR_CODES } = require('sb-common');

// 使用 sha256 生成密码摘要（示例用，生产可换更安全方案）
function hashPassword(password) {
  // 创建 sha256 哈希并生成十六进制摘要
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 只允许三种角色，其他一律降级为 user
function normalizeRole(role) {
  // 定义允许的角色列表
  const allowed = ['user', 'barber', 'admin'];
  // 如果角色合法则返回原值，否则降级为 user
  return allowed.includes(role) ? role : 'user';
}

function normalizeText(value, maxLength = 60) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

async function findStoreById(db, storeId) {
  const id = String(storeId || '').trim();
  if (!id) return null;
  const res = await db.collection('stores').doc(id).get();
  return (res && res.data && res.data[0]) || null;
}

async function findStoresByName(db, storeName, limit = 20) {
  const name = normalizeText(storeName, 60);
  if (!name) return [];
  const res = await db.collection('stores').where({ name }).limit(limit).get();
  return (res && res.data) || [];
}

async function createStoreByName(db, storeName) {
  const name = normalizeText(storeName, 60);
  const now = Date.now();
  const storeRes = await db.collection('stores').add({
    name,
    address: '待设置地址',
    phone: '',
    cover: 'https://dummyimage.com/600x400/efefef/333&text=Store',
    description: '',
    minPrice: 0,
    location: null,
    tags: [],
    businessHours: {
      weekday: '',
      weekend: ''
    },
    bookingRules: {
      notice: '',
      cancelRule: '',
      rescheduleRule: ''
    },
    rating: {
      count: 0,
      environment: 0,
      service: 0,
      barber: 0,
      overall: 0
    },
    createdAt: now,
    updatedAt: now
  });
  const storeId = storeRes.id || (storeRes.data && storeRes.data[0] && storeRes.data[0]._id) || '';
  if (!storeId) {
    throw new ApiError(500, 'create store failed');
  }
  return {
    _id: storeId,
    name
  };
}

// 注册账号：校验参数 -> 判断重名 -> 写入 users
exports.main = withResponse(async (event, context) => {
  // 从入参读取用户名，若不存在则使用空字符串兜底
  const username = (event && event.username) || '';
  // 从入参读取密码，若不存在则使用空字符串兜底
  const password = (event && event.password) || '';
  // 从入参读取角色并进行合法化处理
  const role = normalizeRole((event && event.role) || 'user');
  // 可选：门店名称（admin/barber 使用）
  const storeNameInput = (event && event.storeName) || '';
  // 可选：门店ID（仅前端理发师选择已有门店时透传，用户不需要手填）
  const storeIdInput = (event && event.storeId) || '';

  // 校验用户名和密码是否齐全
  if (!username || !password) {
    // 抛出统一错误：参数不可处理（缺少用户名或密码）
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'username and password required');
  }

  // 获取数据库操作实例
  const db = uniCloud.database();
  // 查询是否已存在相同用户名
  const existed = await db.collection('users').where({ username }).limit(1).get();
  // 若已存在用户名则抛出冲突错误
  if (existed.data && existed.data.length > 0) {
    // 抛出统一错误：用户名已存在
    throw new ApiError(ERROR_CODES.CONFLICT, 'username already exists');
  }

  let store = null;
  let storeId = '';
  let displayName = username;
  let finalRole = role;
  let pendingRole = '';
  let approvalStatus = '';

  // admin：每次注册都创建独立门店，不复用已有门店
  if (role === 'admin') {
    const safeStoreName = normalizeText(storeNameInput, 60);
    if (!safeStoreName) {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'store name required');
    }
    store = await createStoreByName(db, safeStoreName);
    storeId = store._id || '';
    if (!storeId) {
      throw new ApiError(500, 'invalid store data');
    }
    displayName = store.name || safeStoreName;
  }

  // barber：只能绑定已存在门店
  if (role === 'barber') {
    const safeStoreName = normalizeText(storeNameInput, 60);
    const safeStoreId = String(storeIdInput || '').trim();
    if (!safeStoreName && !safeStoreId) {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'store name required');
    }

    if (safeStoreId) {
      store = await findStoreById(db, safeStoreId);
    } else {
      const matched = await findStoresByName(db, safeStoreName);
      if (matched.length === 0) {
        throw new ApiError(404, 'store not found');
      }
      if (matched.length > 1) {
        throw new ApiError(ERROR_CODES.CONFLICT, 'multiple stores matched');
      }
      store = matched[0];
    }

    if (!store) {
      throw new ApiError(404, 'store not found');
    }

    storeId = store._id || '';
    if (!storeId) {
      throw new ApiError(500, 'invalid store data');
    }
    // 理发师账号改为“先注册为普通用户 + 待审核”
    finalRole = 'user';
    pendingRole = 'barber';
    approvalStatus = 'PENDING';
    displayName = `${store.name || safeStoreName}_${username}`;
  }

  // admin 限制同一门店只能有一个管理员
  if (role === 'admin') {
    const existedAdmin = await db
      .collection('users')
      .where({ role: 'admin', storeId })
      .limit(1)
      .get();
    if (existedAdmin.data && existedAdmin.data.length > 0) {
      throw new ApiError(ERROR_CODES.CONFLICT, 'admin already exists for this store');
    }
  }

  // 向 users 集合写入新的用户记录
  const userRes = await db.collection('users').add({
    // 保存用户名
    username,
    // 保存加密后的密码摘要
    passwordHash: hashPassword(password),
    // 保存角色信息
    role: finalRole,
    // 绑定店铺（user 可为空）
    storeId: storeId || '',
    pendingRole,
    approvalStatus,
    // 统一昵称策略：admin=门店名；barber=门店名_理发师名；user=用户名
    name: displayName,
    avatar: '',
    // 保存创建时间戳
    createdAt: Date.now()
  });

  // 理发师注册时通知店家有新的审核申请（失败不影响主流程）
  if (role === 'barber' && storeId) {
    try {
      const adminRes = await db
        .collection('users')
        .where({ role: 'admin', storeId })
        .field({ _id: true })
        .get();
      const admins = (adminRes && adminRes.data) || [];
      for (let i = 0; i < admins.length; i += 1) {
        const admin = admins[i] || {};
        const adminId = admin._id || '';
        if (!adminId) continue;
        await uniCloud.callFunction({
          name: 'notifications-create',
          data: {
            userId: adminId,
            type: 'arrival_reminder',
            title: '新的理发师申请',
            content: `账号 ${username} 申请加入门店，请前往“理发师审核”处理。`,
            relatedId: '',
            relatedType: 'system'
          }
        });
      }
    } catch (notifyErr) {
      console.error('notify admin barber application failed:', notifyErr);
    }
  }

  // 返回注册成功后的关键信息
  return {
    // 返回新用户 id（兼容不同返回结构）
    userId: userRes.id || (userRes.data && userRes.data[0] && userRes.data[0]._id) || '',
    // 返回用户名
    username,
    // 返回角色
    role: finalRole,
    pendingRole,
    approvalStatus,
    storeId: storeId || '',
    name: displayName
  };
});
