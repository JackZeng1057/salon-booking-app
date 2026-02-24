/**
 * reviews-delete 云函数 —— 删除用户自己的评价
 *
 * 【业务说明】
 * 用户可在“我的评价”页面删除自己提交的评价。
 * 删除后必须重新计算门店平均评分，
 * 避免评分统计数据滙后。
 *
 * 【权限与校验】
 * - 仅 user 角色可调用
 * - 只能删除自己提交的评价（userId 校验）
 */const { withResponse, ApiError, ERROR_CODES, requireRole, updateStoreRating } = require('sb-common');

// 删除用户自己提交的评价
// 关键约束：
// 1) 仅普通用户可调用；
// 2) 只能删除自己写的评论；
// 3) 删除后必须重算门店评分，避免统计数据滞后。
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  const reviewId = (event && event.reviewId) || '';
  if (!reviewId) {
    throw new ApiError(400, 'reviewId is required');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

  // 读取最小必要字段：鉴权只需 userId，重算评分只需 storeId。
  const reviewRes = await db
    .collection('reviews')
    .doc(reviewId)
    .field({
      userId: true,
      storeId: true
    })
    .get();
  const review = reviewRes.data && reviewRes.data[0];

  if (!review) {
    throw new ApiError(404, 'review not found');
  }
  // 防止越权删除他人评价。
  if (review.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 先删评论，再刷新门店 rating 聚合值。
  await db.collection('reviews').doc(reviewId).remove();
  await updateStoreRating(db, review.storeId);

  // 返回被删除评论 id，便于前端本地列表做精确移除。
  return { id: reviewId };
});
