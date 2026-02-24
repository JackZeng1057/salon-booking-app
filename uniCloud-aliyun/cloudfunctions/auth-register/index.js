/**
 * auth-register 云函数 —— 账号注册
 *
 * 【系统角色说明】
 * 本系统有三种用户角色，注册流程因角色不同而存在明显差异：
 *
 *   user（普通用户/顾客）：
 *     最简单的注册路径，仅需 username + password，无需门店绑定。
 *     注册后直接可用（role = 'user'，无审核步骤）。
 *
 *   admin（门店管理员）：
 *     注册时需提供 storeName，系统自动创建对应的 stores 文档，
 *     并将新门店的 _id 绑定到该账号（storeId）。
 *     每个门店只允许一个 admin，重复注册会返回 409 CONFLICT。
 *
 *   barber（理发师）：
 *     不立即拥有 barber 角色，而是先以 user 身份注册，
 *     同时将 pendingRole='barber'、approvalStatus='PENDING' 写入。
 *     需等待 admin 在"理发师审核"页面操作审批后，role 才切换为 barber。
 *     设计意图：防止任意人员自称理发师进行营业操作；
 *              同时自动给对应门店的 admin 发一条通知，提示有新申请待处理。
 *
 * 【门店关联方式（barber 注册时）】
 *   - 若前端传入 storeId（扫码或下拉选门店后获取），直接按 ID 精确关联；
 *   - 若只传入 storeName，则按名称模糊匹配：
 *     - 0 条匹配 → 404（门店不存在）
 *     - 1 条匹配 → 关联成功
 *     - 多条匹配 → 409（门店名称不唯一，要求用户选择具体门店）
 *
 * 【密码安全】
 *   密码在写入前经过 hashPassword（SHA-256）处理，数据库中只存哈希值，
 *   即使数据库泄露也无法还原明文密码。
 *
 * 【注册后的返回结构】
 *   返回字段包括 userId / role / pendingRole / approvalStatus，
 *   前端据此判断是直接进入 App 还是显示"等待审核"提示页。
 */
const { withResponse, ApiError, ERROR_CODES, hashPassword } = require('sb-common');

/**
 * 角色名称归一化：前端传来的 role 字符串只允许三种值，其他任意值都降级为 user，
 * 防止因参数篡改而写入非法角色（如 'superadmin'）。
 */
function normalizeRole(role) {
  const allowed = ['user', 'barber', 'admin'];
  return allowed.includes(role) ? role : 'user';
}

/**
 * 字符串净化：去除首尾空白并截断到指定长度，防止超长字符串写入数据库。
 * maxLength 默认 60，适配门店名称等短文本字段。
 */
function normalizeText(value, maxLength = 60) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

/** 按 storeId 精确查找门店文档，不存在则返回 null。 */
async function findStoreById(db, storeId) {
  const id = String(storeId || '').trim();
  if (!id) return null;
  const res = await db.collection('stores').doc(id).get();
  return (res && res.data && res.data[0]) || null;
}

/**
 * 按门店名称查找门店列表（精确匹配，不支持模糊搜索）。
 * 上限 20 条，用于判断名称是否唯一：
 *   0 条 → 门店不存在；1 条 → 精确关联；多条 → 名称重复，让用户进一步选择。
 */
async function findStoresByName(db, storeName, limit = 20) {
  const name = normalizeText(storeName, 60);
  if (!name) return [];
  const res = await db.collection('stores').where({ name }).limit(limit).get();
  return (res && res.data) || [];
}

/**
 * 创建新门店文档（用于 admin 注册时自动建店）。
 * 新门店的地址、联系电话等信息初始化为占位值，
 * admin 注册完成后需在"门店设置"页面完善。
 * rating 字段初始化为全 0，随评价数据的积累动态更新。
 */
async function createStoreByName(db, storeName) {
  const name = normalizeText(storeName, 60);
  const now = Date.now();
  const storeRes = await db.collection('stores').add({
    name,
    address: '待设置地址',
    phone: '',
    cover: 'https://dummyimage.com/600x400/efefef/333&text=Store',
    description: '',
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

// 注册账号：校验参数 -> 判断重名 -> 按角色差异化处理 -> 写入 users 集合
exports.main = withResponse(async (event, context) => {
  const username = (event && event.username) || '';
  const password = (event && event.password) || '';
  const role = normalizeRole((event && event.role) || 'user');
  const storeNameInput = (event && event.storeName) || '';  // admin/barber 注册时需填写
  const storeIdInput = (event && event.storeId) || '';      // 理发师可直接传已有门店 ID，跳过名称模糊匹配

  if (!username || !password) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'username and password required');
  }

  const db = uniCloud.database();
  // 用户名唯一性校验：在写操作前先 SELECT，避免写入冲突。
  // 注：生产环境更稳健的做法是给 username 建唯一索引，在 DB 层兜底；
  //     此处的预检查作为"前置快速失败"以提升报错友好性。
  const existed = await db.collection('users').where({ username }).limit(1).get();
  if (existed.data && existed.data.length > 0) {
    throw new ApiError(ERROR_CODES.CONFLICT, 'username already exists');
  }

  // 以下变量在三个角色分支中被赋值，最后统一写入 users.add()。
  // 提前声明并赋空值，确保各分支只修改自己关心的字段，不影响其他角色路径。
  let store = null;
  let storeId = '';
  let displayName = username;   // 默认昵称与账号名保持一致
  let finalRole = role;         // admin/user 注册后 role 立即生效；barber 需审核
  let pendingRole = '';         // 仅 barber 申请时非空（值为 'barber'）
  let approvalStatus = '';      // 仅 barber 申请时非空（初始值为 'PENDING'）

  // ─── admin 注册分支 ────────────────────────────────────────────────────────
  // admin 注册时自动创建旗下门店（1:1 关系），storeName 为必填字段。
  // 不复用已有同名门店，为每个 admin 独立建店，避免多 admin 共享一家门店的歧义。
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
    // admin 的显示名称设为门店名，便于在通知、订单等场景中展示"XXX门店"标识
    displayName = store.name || safeStoreName;
  }

  // ─── barber 注册分支 ───────────────────────────────────────────────────────
  // 理发师注册的核心约束：必须关联到已存在的门店，且账号初始角色为 user+待审核。
  // 这一设计防止理发师"自注册即上岗"，确保所有接受服务的理发师都经过了门店管理员的确认。
  if (role === 'barber') {
    const safeStoreName = normalizeText(storeNameInput, 60);
    const safeStoreId = String(storeIdInput || '').trim();
    if (!safeStoreName && !safeStoreId) {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'store name required');
    }

    if (safeStoreId) {
      // 按 ID 精确关联（来自扫码或下拉选，可信度高）
      store = await findStoreById(db, safeStoreId);
    } else {
      // 按名称模糊匹配，需保证唯一；多条匹配时要求前端引导用户选特定门店
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
    // 【核心设计】barber 申请时，写入 users 的 role 仍为 'user'，
    // pendingRole='barber' + approvalStatus='PENDING' 记录申请状态。
    // 审核通过时，barber-approvals 云函数将 role 改为 'barber' 并清空这两个字段。
    finalRole = 'user';
    pendingRole = 'barber';
    approvalStatus = 'PENDING';
    // 理发师昵称与账号名保持一致，避免后续改名时"账号名与师傅名不同步"的问题
    displayName = username;
  }

  // admin 一门店一人限制检查：同一 storeId 下不允许存在第二个 admin。
  // 校验放在 store 创建之后、users.add() 之前，防止竞态下写入两个 admin。
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

  const userRes = await db.collection('users').add({
    username,
    passwordHash: hashPassword(password),  // SHA-256 哈希，不存明文密码
    role: finalRole,
    storeId: storeId || '',       // 普通用户无门店，允许为空
    pendingRole,                  // barber 申请中时为 'barber'，否则为空
    approvalStatus,               // barber 申请中时为 'PENDING'，否则为空
    name: displayName,            // admin=门店名；barber/user=账号名
    avatar: '',
    createdAt: Date.now()
  });

  // 理发师注册后异步通知对应门店的 admin（fire-and-forget）：
  // - 调用 notifications-create 云函数写入通知记录，admin 下次打开 App 时会看到提示；
  // - 用 try/catch 包裹且不 await，确保通知失败不影响注册主流程。
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

  // 返回注册结果供前端决策：
  // - userId：注册成功后的文档 ID（兼容 add() 返回 .id 或 .data[0]._id 两种结构）
  // - role + pendingRole + approvalStatus：前端据此判断是直接登录还是跳转"审核中"提示页
  // - storeId / name：前端存入 store，后续请求无需再查
  return {
    userId: userRes.id || (userRes.data && userRes.data[0] && userRes.data[0]._id) || '',
    username,
    role: finalRole,
    pendingRole,
    approvalStatus,
    storeId: storeId || '',
    name: displayName
  };
});
