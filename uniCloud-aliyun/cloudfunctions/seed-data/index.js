/**
 * seed-data 云函数 —— 初始化演示数据
 *
 * 【业务说明】
 * 快速创建两家门店、与其对应服务项目、以及演示用户账号样例，
 * 便于开发、测试与论文演示环境快速建立初始数据。
 *
 * 【幂等性设计】
 * 使用固定 _id（store_001/store_002）创建门店，已存在则复用，
 * 不会因重复调用而产生重复数据。
 *
 * 【权限】
 * - 仅 admin 角色可调用（生产环境应禁用此接口）
 */
// 初始化演示数据：门店/服务/账号样例
const { withResponse, requireRole } = require('sb-common');

// SHA-256("123456") 的封升值，用于创建演示账号时设置初始密码
const passwordHash123456 = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

// 若指定 _id 已存在则直接复用，否则按固定 _id 新增文档
async function ensureDocById(db, collection, id, data) {
  const res = await db.collection(collection).doc(id).get();
  const existed = res.data && res.data[0];
  if (existed) return existed._id || id;
  await db.collection(collection).add({ _id: id, ...data });
  return id;
}

// 按 username 幂等创建用户（已存在则返回原用户 ID）
async function ensureUserByUsername(db, username, data) {
  const res = await db.collection('users').where({ username }).limit(1).get();
  if (res.data && res.data[0]) return res.data[0]._id;
  const addRes = await db.collection('users').add(data);
  return addRes.id || (addRes.ids && addRes.ids[0]) || '';
}

/**
 * 演示数据初始化入口
 * 仅管理员可调用，用于快速生成门店、服务、账号样例。
 */
exports.main = withResponse(async (event, context) => {
  await requireRole(['admin'], event, context);

  const db = uniCloud.database();
  const now = Date.now();

  const storeA = 'store_001';
  const storeB = 'store_002';

  await ensureDocById(db, 'stores', storeA, {
    name: '光影理发屋',
    address: '深圳市南山区科技园 88 号',
    phone: 'STORE_PHONE_PLACEHOLDER',
    cover: 'https://dummyimage.com/600x400/efefef/333&text=Store+1',
    description: '主打轻奢风格，专业男士剪发与造型。',
    createdAt: now
  });

  await ensureDocById(db, 'stores', storeB, {
    name: '原木发艺',
    address: '深圳市福田区深南大道 100 号',
    phone: 'STORE_PHONE_PLACEHOLDER',
    cover: 'https://dummyimage.com/600x400/eeeeee/333&text=Store+2',
    description: '家庭友好型门店，提供亲子理发与护理。',
    createdAt: now
  });

  const services = [
    { storeId: storeA, name: '男士剪发', price: 68, duration: 45 },
    { storeId: storeA, name: '造型设计', price: 128, duration: 60 },
    { storeId: storeB, name: '儿童剪发', price: 48, duration: 30 },
    { storeId: storeB, name: '护理烫染', price: 198, duration: 90 }
  ];

  for (const item of services) {
    const existed = await db
      .collection('services')
      .where({ storeId: item.storeId, name: item.name })
      .limit(1)
      .get();
    if (!existed.data || !existed.data[0]) {
      await db.collection('services').add({ ...item, createdAt: now });
    }
  }

  // 创建演示账号集：普通用户 ×1、理发师 ×2（分属 storeA/storeB）、管理员 ×2（分属 storeA/storeB）。初始密码均为 123456
  await ensureUserByUsername(db, 'user_001', {
    username: 'user_001',
    passwordHash: passwordHash123456,
    role: 'user',
    name: '普通用户A',
    createdAt: now
  });

  await ensureUserByUsername(db, 'barber_chen', {
    username: 'barber_chen',
    passwordHash: passwordHash123456,
    role: 'barber',
    name: '陈师傅',
    storeId: storeA,
    avatar: 'https://dummyimage.com/120x120/ddd/333&text=B1',
    createdAt: now
  });

  await ensureUserByUsername(db, 'barber_li', {
    username: 'barber_li',
    passwordHash: passwordHash123456,
    role: 'barber',
    name: '李师傅',
    storeId: storeB,
    avatar: 'https://dummyimage.com/120x120/ddd/333&text=B2',
    createdAt: now
  });

  await ensureUserByUsername(db, 'admin_001', {
    username: 'admin_001',
    passwordHash: passwordHash123456,
    role: 'admin',
    name: '管理员A',
    storeId: storeA,
    createdAt: now
  });

  await ensureUserByUsername(db, 'admin_002', {
    username: 'admin_002',
    passwordHash: passwordHash123456,
    role: 'admin',
    name: '管理员B',
    storeId: storeB,
    createdAt: now
  });

  return {
    ok: true
  };
});
