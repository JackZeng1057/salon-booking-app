<template>
  <view class="reviews-page">
    <app-nav :showTitle="true" title="门店评价" />

    <view class="page-content">
      <view class="hero-card">
        <text class="hero-title">{{ storeName || '门店评价' }}</text>
        <view class="hero-meta">
          <text class="hero-meta-text">评分 {{ scoreText }}</text>
          <text class="hero-meta-dot">·</text>
          <text class="hero-meta-text">{{ totalCountText }}</text>
        </view>
      </view>

      <view class="filter-wrap">
        <text
          v-for="item in filters"
          :key="item.value"
          class="filter-item"
          :class="{ active: filterType === item.value }"
          @click="changeFilter(item.value)"
        >
          {{ item.label }}
        </text>
      </view>

      <view v-if="loading && reviews.length === 0" class="hint">评价加载中...</view>
      <view v-else-if="reviews.length === 0" class="hint">暂无评价</view>

      <view v-else class="review-list">
        <view v-for="item in reviews" :key="item._id" class="review-card">
          <view class="review-top">
            <text class="review-user">{{ item.userName || '匿名用户' }}</text>
            <text class="review-score">★ {{ formatScore(item.rating) }}</text>
          </view>
          <text class="review-content">{{ item.content || '用户未填写内容' }}</text>
          <view v-if="getImages(item).length > 0" class="review-images">
            <image
              v-for="(img, idx) in getImages(item)"
              :key="`${item._id}_${idx}`"
              class="review-image"
              :src="img"
              mode="aspectFill"
              @click="previewReviewImage(item, idx)"
            />
          </view>
          <view v-if="getReplyText(item)" class="reply-box">
            <text class="reply-label">商家回复：</text>
            <text class="reply-text">{{ getReplyText(item) }}</text>
          </view>
          <text class="review-time">{{ formatTime(item.createdAt) }}</text>
        </view>
      </view>

      <view v-if="reviews.length > 0" class="load-more" @click="loadMore">
        <text>{{ hasMore ? (loadingMore ? '加载中...' : '加载更多') : '没有更多了' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { fetchStoreDetail } from '../../api/store';
import { fetchStoreReviews, normalizeReviewImages, resolveReviewImageUrls } from '../../api/review';

export default {
  data() {
    return {
      storeId: '',
      storeName: '',
      storeRating: 0,
      reviewCount: 0,
      filters: [
        { label: '全部', value: 'all' },
        { label: '好评', value: 'good' },
        { label: '差评', value: 'bad' },
        { label: '有图', value: 'withImages' }
      ],
      filterType: 'all',
      reviews: [],
      page: 1,
      pageSize: 10,
      hasMore: true,
      loading: false,
      loadingMore: false
    };
  },
  computed: {
    scoreText() {
      const score = Number(this.storeRating || 0);
      return score > 0 ? score.toFixed(1) : '暂无';
    },
    totalCountText() {
      const count = Number(this.reviewCount || 0);
      return count > 0 ? `${count}条评价` : '暂无评价';
    }
  },
  onLoad(options) {
    this.storeId = (options && (options.id || options.storeId)) || '';
    this.storeName = decodeURIComponent((options && options.name) || '');
    if (!this.storeId) return;
    this.loadStoreMeta();
    this.loadReviews(true);
  },
  onPullDownRefresh() {
    Promise.all([this.loadStoreMeta(), this.loadReviews(true)]).finally(() => uni.stopPullDownRefresh());
  },
  onReachBottom() {
    this.loadMore();
  },
  methods: {
    async loadStoreMeta() {
      if (!this.storeId) return;
      try {
        const detail = await fetchStoreDetail(this.storeId, { noCache: true });
        const store = detail && detail.store ? detail.store : detail;
        this.storeName = (store && store.name) || this.storeName || '门店评价';
        this.storeRating = Number((store && store.rating && store.rating.overall) || 0);
        this.reviewCount = Number((store && store.rating && store.rating.count) || 0);
      } catch (err) {}
    },
    async loadReviews(reset = false) {
      if (!this.storeId || this.loading || (!reset && !this.hasMore)) return;
      let ok = true;
      if (reset) {
        this.page = 1;
        this.hasMore = true;
      }
      this.loading = true;
      try {
        const res = await fetchStoreReviews({
          storeId: this.storeId,
          filterType: this.filterType,
          page: this.page,
          pageSize: this.pageSize
        });
        const list = await resolveReviewImageUrls((res && res.list) || []);
        if (reset) {
          this.reviews = list;
        } else {
          this.reviews = this.reviews.concat(list);
        }
        this.hasMore = list.length >= this.pageSize;
      } catch (err) {
        ok = false;
        uni.showToast({ title: err.message || '加载评价失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
      return ok;
    },
    async loadMore() {
      if (this.loading || this.loadingMore || !this.hasMore) return;
      this.loadingMore = true;
      this.page += 1;
      try {
        const ok = await this.loadReviews(false);
        if (!ok) {
          this.page = Math.max(1, this.page - 1);
        }
      } catch (err) {
        this.page = Math.max(1, this.page - 1);
      } finally {
        this.loadingMore = false;
      }
    },
    changeFilter(value) {
      if (this.filterType === value || this.loading) return;
      this.filterType = value;
      this.loadReviews(true);
    },
    getImages(review) {
      return normalizeReviewImages(review);
    },
    previewReviewImage(review, index) {
      const images = this.getImages(review);
      if (!images.length) return;
      const safeIndex = Math.max(0, Math.min(Number(index || 0), images.length - 1));
      uni.previewImage({
        current: images[safeIndex],
        urls: images
      });
    },
    formatScore(rating) {
      if (!rating) return '5.0';
      return Number(rating.overall || rating || 5).toFixed(1);
    },
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}`;
    },
    getReplyText(review) {
      const reply = review && review.reply;
      if (!reply) return '';
      if (typeof reply === 'string') return reply.trim();
      if (typeof reply === 'object') return String(reply.content || '').trim();
      return '';
    }
  }
};
</script>

<style scoped lang="scss">
.reviews-page {
  min-height: 100vh;
  background: #f8fafc;
}

.page-content {
  padding: calc(116rpx + 20px) 20rpx 30rpx;
}

.hero-card {
  border-radius: 24rpx;
  padding: 22rpx 20rpx;
  background: linear-gradient(140deg, #0f172a, #1e293b);
  box-shadow: 0 16rpx 30rpx rgba(15, 23, 42, 0.2);
}

.hero-title {
  display: block;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 700;
}

.hero-meta {
  margin-top: 8rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.hero-meta-text {
  color: rgba(255, 255, 255, 0.85);
  font-size: 22rpx;
}

.hero-meta-dot {
  color: rgba(255, 255, 255, 0.6);
  font-size: 20rpx;
}

.filter-wrap {
  margin-top: 14rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.filter-item {
  border-radius: 999rpx;
  border: 1rpx solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  padding: 8rpx 16rpx;
  font-size: 22rpx;
}

.filter-item.active {
  border-color: #0f172a;
  color: #0f172a;
  font-weight: 600;
}

.hint {
  margin-top: 20rpx;
  color: #94a3b8;
  font-size: 24rpx;
}

.review-list {
  margin-top: 14rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.review-card {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 18rpx;
  padding: 16rpx;
}

.review-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.review-user {
  font-size: 24rpx;
  color: #0f172a;
  font-weight: 700;
}

.review-score {
  font-size: 22rpx;
  color: #f59e0b;
  font-weight: 700;
}

.review-content {
  margin-top: 8rpx;
  display: block;
  font-size: 23rpx;
  color: #475569;
  line-height: 1.5;
}

.review-images {
  margin-top: 10rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.review-image {
  width: 148rpx;
  height: 148rpx;
  border-radius: 12rpx;
  background: #f1f5f9;
}

.reply-box {
  margin-top: 10rpx;
  border-radius: 12rpx;
  background: #f8fafc;
  padding: 10rpx 12rpx;
}

.reply-label {
  color: #64748b;
  font-size: 21rpx;
}

.reply-text {
  color: #334155;
  font-size: 21rpx;
  line-height: 1.45;
}

.review-time {
  margin-top: 8rpx;
  display: block;
  color: #94a3b8;
  font-size: 20rpx;
}

.load-more {
  margin-top: 14rpx;
  color: #64748b;
  font-size: 22rpx;
  text-align: center;
  padding: 16rpx 0;
}
</style>
