/**
 * notifications-create 云函数 —— 创建系统内部通知
 *
 * 【设计说明】
 * 本云函数为紧耦内部调用接口，不直接对外暴露。
 * 其他云函数（如 orders-create、orders-cancel 等）通过
 * uniCloud.callFunction({ name: 'notifications-create', ... }) 调用。
 *
 * 【幂等性配限】
 * 支持 idempotencyKey 参数：对同一 userId+type+key 组合生成固定文档 ID，
 * 重复调用时利用数据库 upsert 特性自动去重，
 * 避免网络重试导致用户收到重复通知。
 *
 * 【支持的通知类型】
 * booking_success 、reschedule、cancel、no_show、arrival_reminder、service_start、service_finish
 */
// 通知创建：供内部云函数调用，写入通知表
// 引入统一响应包装
const { withResponse, ApiError } = require('sb-common');
const crypto = require('crypto');

const TYPE_ALIAS = {
  BOOKING_SUCCESS: 'booking_success',
  RESCHEDULE: 'reschedule',
  CANCEL: 'cancel',
  NO_SHOW: 'no_show',
  ARRIVAL_REMINDER: 'arrival_reminder',
  SERVICE_START: 'service_start',
  SERVICE_FINISH: 'service_finish'
};

const ALLOWED_TYPES = new Set([
  'booking_success',
  'reschedule',
  'cancel',
  'no_show',
  'arrival_reminder',
  'service_start',
  'service_finish'
]);

function normalizeType(type) {
  const raw = String(type || '').trim();
  if (!raw) return '';
  // 先尝试大写映射别名（如 BOOKING_SUCCESS），再降为小写做精确匹配
  const mapped = TYPE_ALIAS[raw] || raw.toLowerCase();
  if (ALLOWED_TYPES.has(mapped)) return mapped;
  // 未知类型 fallback 到 arrival_reminder，避免写入非法类型
  return 'arrival_reminder';
}

// 根据 userId + type + idempotencyKey 生成固定文档 ID
// 相同参数多次调用产生相同 docId，配合 upsert 防止重复通知写入
function makeIdempotentDocId(userId, type, idempotencyKey) {
  const raw = `${userId}::${type}::${idempotencyKey}`;
  return `noti_${crypto.createHash('md5').update(raw).digest('hex')}`;
}

/**
 * 创建通知（系统内部调用）
 * 可被其他云函数调用
 */
exports.main = withResponse(async (event, context) => {
  const userId = event && event.userId;
  const type = normalizeType(event && event.type);
  const title = event && event.title;
  const content = event && event.content;
  const relatedId = event && event.relatedId;
  const relatedType = event && event.relatedType;
  const idempotencyKey = String((event && event.idempotencyKey) || '').trim();

  if (!userId || !type || !title || !content) {
    throw new ApiError(400, 'userId, type, title, and content are required');
  }

  const db = uniCloud.database();
  const now = Date.now();

  const notificationData = {
    userId,
    type,
    title,
    content,
    relatedId: relatedId || '',
    relatedType: relatedType || 'order',
    isRead: false,
    isDeleted: false,
    createdAt: now
  };

  // 可选幂等写入：调用方传入 idempotencyKey 时，使用固定 _id 防止并发重复写入
  if (idempotencyKey) {
    const docId = makeIdempotentDocId(userId, type, idempotencyKey);
    try {
      await db.collection('notifications').add({
        _id: docId,
        ...notificationData
      });
      return { id: docId };
    } catch (err) {
      // 重复写入时数据库抛出 duplicate/conflict/exists 错误，视为成功（返回已有 docId）
      const message = String((err && err.message) || '').toLowerCase();
      if (message.includes('duplicate') || message.includes('conflict') || message.includes('exists')) {
        return { id: docId };
      }
      throw err;
    }
  }

  const res = await db.collection('notifications').add(notificationData);
  return { id: res.id || (res.ids && res.ids[0]) || '' };
});

/**
 * 创建通知的辅助函数（供其他云函数导出使用）
 */
async function createNotification(userId, type, title, content, relatedId = '', relatedType = 'order') {
  const db = uniCloud.database();
  const now = Date.now();

  const notificationData = {
    userId,
    type: normalizeType(type),
    title,
    content,
    relatedId,
    relatedType,
    isRead: false,
    isDeleted: false,
    createdAt: now
  };

  try {
    await db.collection('notifications').add(notificationData);
  } catch (err) {
    console.error('createNotification error:', err);
  }
}

// 导出辅助函数
exports.createNotification = createNotification;
