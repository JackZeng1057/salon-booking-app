async function updateStoreRating(db, storeId) {
  if (!storeId) return;

  try {
    const reviewsRes = await db.collection('reviews').where({ storeId }).field({ rating: true }).get();
    const reviews = reviewsRes.data || [];

    if (reviews.length === 0) {
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

    reviews.forEach((item) => {
      const rating = item && item.rating;
      if (!rating) return;
      totalOverall += Number(rating.overall || 0);
      totalService += Number(rating.service || 0);
      totalEnvironment += Number(rating.environment || 0);
    });

    const count = reviews.length;
    await db.collection('stores').doc(storeId).update({
      rating: {
        overall: Number((totalOverall / count).toFixed(1)),
        service: Number((totalService / count).toFixed(1)),
        environment: Number((totalEnvironment / count).toFixed(1)),
        count
      }
    });
  } catch (err) {
    console.error('updateStoreRating error:', err);
  }
}

module.exports = {
  updateStoreRating
};
