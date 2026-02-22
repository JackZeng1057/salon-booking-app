// 门店理发师管理：列表、改名、移出门店
const { withResponse, requireRole, ApiError, ERROR_CODES } = require('sb-common');

function sanitizeName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, 20);
}

async function getBarberById(db, barberId) {
  const res = await db
    .collection('users')
    .doc(barberId)
    .field({
      _id: true,
      username: true,
      name: true,
      role: true,
      storeId: true,
      phone: true,
      avatar: true,
      serviceIds: true,
      createdAt: true,
      updatedAt: true
    })
    .get();
  return (res && res.data && res.data[0]) || null;
}

exports.main = withResponse(async (event, context) => {
  const admin = await requireRole(['admin'], event, context);
  const storeId = String((admin && admin.storeId) || '').trim();
  if (!storeId) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'storeId required');
  }

  const action = String((event && event.action) || 'list').trim().toLowerCase();
  const db = uniCloud.database();

  // 列表：当前门店全部理发师
  if (action === 'list') {
    const listRes = await db
      .collection('users')
      .where({ storeId, role: 'barber' })
      .field({
        _id: true,
        username: true,
        name: true,
        phone: true,
        avatar: true,
        serviceIds: true,
        createdAt: true,
        updatedAt: true
      })
      .orderBy('createdAt', 'desc')
      .get();
    return {
      list: (listRes && listRes.data) || []
    };
  }

  const barberId = String((event && event.barberId) || '').trim();
  if (!barberId) {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'barberId required');
  }

  const barber = await getBarberById(db, barberId);
  if (!barber || barber.role !== 'barber') {
    throw new ApiError(404, 'barber not found');
  }
  if (String(barber.storeId || '') !== storeId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 改名：管理员可直接改理发师账号名
  if (action === 'rename') {
    const username = sanitizeName(event && event.username);
    if (!username) {
      throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'username required');
    }

    const existedRes = await db.collection('users').where({ username }).limit(1).get();
    const existed = existedRes && existedRes.data && existedRes.data[0];
    if (existed && String(existed._id || '') !== barberId) {
      throw new ApiError(ERROR_CODES.CONFLICT, 'username already exists');
    }

    await db.collection('users').doc(barberId).update({
      username,
      // 与账号名保持一致，避免前端师傅名与账号名不一致
      name: username,
      updatedAt: Date.now()
    });

    return {
      success: true,
      action: 'rename',
      barberId,
      username
    };
  }

  // 移出门店：降级为普通用户并清空门店与项目绑定
  if (action === 'remove') {
    await db.collection('users').doc(barberId).update({
      role: 'user',
      storeId: '',
      pendingRole: '',
      approvalStatus: '',
      serviceIds: [],
      updatedAt: Date.now()
    });

    return {
      success: true,
      action: 'remove',
      barberId
    };
  }

  throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'invalid action');
});

