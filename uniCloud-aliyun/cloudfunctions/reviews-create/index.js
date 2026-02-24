/**
 * @file reviews-create/index.js — 创建评价云函数
 *
 * 【业务定位】
 * 顾客完成服务后，对本次预约体验进行三维度评分与图文评论的写入接口。
 * 评价创建完成后，立即触发门店整体评分聚合更新（updateStoreRating），
 * 确保门店详情页的评分数据实时性。
 *
 * 【三维度评分设计】
 * 评分由三个维度组成，均为 1-5 的整数（或小数）：
 *   - service（服务质量）：理发技术、服务态度；
 *   - environment（环境）：门店整洁度、氛围；
 *   - barber（理发师满意度）：综合单次体验。
 * overall（综合均分）= (service + environment + barber) / 3，保留 1 位小数，
 * 用于门店排序与展示，对顾客更直观。
 *
 * 【三重准入校验】
 * 1. 权限：仅 user 角色可评价，且 order.userId === currentUser._id；
 * 2. 状态机：仅 FINISHED 订单可评价（确保服务已完成）；
 * 3. 幂等：同一 orderId 只允许写入 1 条评价（review_exists 保护）。
 *
 * 【图片安全校验】
 * 仅接受 cloud:// fileID 或 http(s):// URL，
 * 拒绝本地临时路径（如 file:// / wxfile://），
 * 防止上传失败的临时路径被持久化到数据库。
 *
 * 【评分聚合（updateStoreRating）】
 * 评价写入后立即调用 sb-common 中的 updateStoreRating()，
 * 重新计算门店 reviews 集合中所有评价的 overall 均值，
 * 更新写入 stores.rating 字段，供门店列表页实时展示。
 */
const { withResponse, ApiError, ERROR_CODES, requireRole, updateStoreRating } = require('sb-common');

// 创建评价（仅 FINISHED 订单可评价）：支持多维评分与图片
// 关键约束：
// 1) 仅订单所属用户可评价；
// 2) 同一订单仅允许评价一次；
// 3) 评价创建后立即重算门店评分聚合。
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  const orderId = (event && event.orderId) || '';
  const ratingData = event && event.rating;
  const content = (event && event.content) || '';
  const images = (event && event.images) || [];

  // 统一清洗图片引用列表，去掉空值与非字符串噪音。
  function normalizeImages(input) {
    if (!Array.isArray(input)) return [];
    return input
      .map((item) => String(item || '').trim())
      .filter((item) => !!item);
  }

  function isSupportedImageRef(value) {
    const text = String(value || '');
    return text.startsWith('cloud://') || text.startsWith('http://') || text.startsWith('https://');
  }

  if (!orderId) {
    throw new ApiError(400, 'orderId is required');
  }

  // 校验评分数据
  if (!ratingData || typeof ratingData !== 'object') {
    throw new ApiError(400, 'rating object is required');
  }

  const { service, environment, barber } = ratingData;
  if (!service || !environment || !barber) {
    throw new ApiError(400, 'service, environment, and barber ratings are required');
  }

  // 校验评分范围
  [service, environment, barber].forEach(score => {
    const num = Number(score);
    if (isNaN(num) || num < 1 || num > 5) {
      throw new ApiError(400, 'rating must be between 1-5');
    }
  });

  // 计算综合评分
  const overall = ((Number(service) + Number(environment) + Number(barber)) / 3).toFixed(1);

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;
  const userName = user.name || user.username || '匿名用户';

  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true,
      status: true,
      storeId: true,
      barberId: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }
  // 权限：只能评价自己的订单。
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  // 状态机：仅已完成订单可评价。
  if (order.status !== 'FINISHED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  // 幂等保护：同订单只允许 1 条评价。
  const existed = await db.collection('reviews').where({ orderId }).limit(1).get();
  if (existed.data && existed.data.length > 0) {
    throw new ApiError(ERROR_CODES.CONFLICT, 'review_exists');
  }

  const safeImages = normalizeImages(images);
  // 图片仅接受 cloud fileID 或 http(s) 直链，防止写入本地临时路径。
  const invalidImages = safeImages.filter((item) => !isSupportedImageRef(item));
  if (invalidImages.length > 0) {
    throw new ApiError(400, 'images must be cloud file id or http(s) url');
  }

  const now = Date.now();
  const reviewData = {
    orderId,
    userId,
    userName,
    storeId: order.storeId,
    barberId: order.barberId,
    rating: {
      overall: Number(overall),
      service: Number(service),
      environment: Number(environment),
      barber: Number(barber)
    },
    content,
    images: safeImages,
    helpful: 0,
    createdAt: now
  };

  const res = await db.collection('reviews').add(reviewData);
  const reviewId = res.id || (res.ids && res.ids[0]) || '';

  // 更新门店评分统计
  await updateStoreRating(db, order.storeId);

  // 返回新增评价主键，便于前端做路由回退与提示。
  return { id: reviewId };
});
