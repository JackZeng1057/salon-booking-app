const { withResponse, ApiError, ERROR_CODES, requireRole, updateStoreRating } = require('sb-common');

// 创建评价（仅 FINISHED 订单可评价）：支持多维评分与图片
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  const orderId = (event && event.orderId) || '';
  const ratingData = event && event.rating;
  const content = (event && event.content) || '';
  const images = (event && event.images) || [];

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
  if (order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }
  if (order.status !== 'FINISHED') {
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'status_not_allowed');
  }

  const existed = await db.collection('reviews').where({ orderId }).limit(1).get();
  if (existed.data && existed.data.length > 0) {
    throw new ApiError(ERROR_CODES.CONFLICT, 'review_exists');
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
    images: Array.isArray(images) ? images : [],
    helpful: 0,
    createdAt: now
  };

  const res = await db.collection('reviews').add(reviewData);
  const reviewId = res.id || (res.ids && res.ids[0]) || '';

  // 更新门店评分统计
  await updateStoreRating(db, order.storeId);

  return { id: reviewId };
});
