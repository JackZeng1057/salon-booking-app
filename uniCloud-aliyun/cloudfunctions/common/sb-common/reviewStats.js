/**
 * 评价统计聚合工具
 * 用于在评价新增/删除后回写门店 rating 字段，保证列表与详情展示一致。
 */

// 重新计算并更新门店评分（总体/服务/环境 + 评价数）
async function updateStoreRating(db, storeId) {
  if (!storeId) return;

  try {
    // 仅查询评分字段，降低数据库读取负担
    const reviewsRes = await db.collection('reviews').where({ storeId }).field({ rating: true }).get();
    const reviews = reviewsRes.data || [];

    if (reviews.length === 0) {
      // 无评价时回退到默认 5 分，并将 count 置 0
      await db.collection('stores').doc(storeId).update({
        rating: {
          overall: 5,
          service: 5,
          environment: 5,
          count: 0
        }
      });
      return;
    }

    let totalOverall = 0;
    let totalService = 0;
    let totalEnvironment = 0;

    // 汇总三类评分，忽略异常记录
    reviews.forEach((item) => {
      const rating = item && item.rating;
      if (!rating) return;
      totalOverall += Number(rating.overall || 0);
      totalService += Number(rating.service || 0);
      totalEnvironment += Number(rating.environment || 0);
    });

    const count = reviews.length;
    // 保留 1 位小数，前端展示更稳定
    await db.collection('stores').doc(storeId).update({
      rating: {
        overall: Number((totalOverall / count).toFixed(1)),
        service: Number((totalService / count).toFixed(1)),
        environment: Number((totalEnvironment / count).toFixed(1)),
        count
      }
    });
  } catch (err) {
    // 聚合失败不阻断主流程，但保留日志便于排查
    console.error('updateStoreRating error:', err);
  }
}

module.exports = {
  updateStoreRating
};
