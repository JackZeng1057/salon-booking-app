const { withResponse, ApiError, ERROR_CODES, requireRole, updateStoreRating } = require('sb-common');

// 删除用户自己提交的评价
exports.main = withResponse(async (event, context) => {
  const user = await requireRole(['user'], event, context);

  const reviewId = (event && event.reviewId) || '';
  if (!reviewId) {
    throw new ApiError(400, 'reviewId is required');
  }

  const db = uniCloud.database();
  const userId = user._id || user.uid || user.userId;

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
  if (review.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  await db.collection('reviews').doc(reviewId).remove();
  await updateStoreRating(db, review.storeId);

  return { id: reviewId };
});
