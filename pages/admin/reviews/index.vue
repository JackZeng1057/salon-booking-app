<template>
  <view class="reviews-page">
    <!-- 吸顶头部：导航栏 + 门店评价概览 Banner + 筛选标签行 -->
    <view class="page-header">
      <app-nav :showTitle="true" title="门店评价" />
      <!-- 评分概览卡片：展示门店总评分与评价总数 -->
      <view class="hero-card">
        <text class="hero-kicker">管理员视角</text>
        <text class="hero-title">{{ storeName || '当前门店' }}</text>
        <view class="hero-meta">
          <text class="hero-meta-text">评分 {{ scoreText }}</text>
          <text class="hero-meta-dot">·</text>
          <text class="hero-meta-text">{{ totalCountText }}</text>
        </view>
      </view>

      <!-- 评价筛选标签：全部 / 好评 / 差评 / 有图 -->
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
    </view>

    <!-- 评价列表滚动区域：触底自动加载更多 -->
    <scroll-view class="page-scroll" scroll-y @scrolltolower="loadMore">
      <view class="page-content">
      <!-- 未绑定门店提示 -->
      <view v-if="!storeId" class="hint">当前账号未绑定门店</view>
      <!-- 初次加载中占位 -->
      <view v-else-if="loading && reviews.length === 0" class="hint">评价加载中...</view>
      <!-- 空列表提示 -->
      <view v-else-if="reviews.length === 0" class="hint">暂无评价</view>

      <!-- 评价卡片列表 -->
      <view v-else class="review-list">
        <view v-for="item in reviews" :key="item._id" class="review-card">
          <!-- 卡片头：用户名 + 星级评分 -->
          <view class="review-top">
            <text class="review-user">{{ item.userName || '匿名用户' }}</text>
            <text class="review-score">★ {{ formatScore(item.rating) }}</text>
          </view>
          <text class="review-order">关联订单：{{ getOrderText(item) }}</text>
          <text class="review-meta">服务项目：{{ getServiceText(item) }}</text>
          <text class="review-meta">服务时段：{{ getServiceTimeText(item) }}</text>
          <!-- 评价内容文本 -->
          <text class="review-content">{{ item.content || '用户未填写内容' }}</text>
          <!-- 评价图片组（点击预览大图） -->
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
          <!-- 商家回复区（若已回复则显示） -->
          <view v-if="getReplyText(item)" class="reply-box">
            <text class="reply-label">商家回复：</text>
            <text class="reply-text">{{ getReplyText(item) }}</text>
          </view>
          <!-- 发布时间 -->
          <text class="review-time">{{ formatTime(item.createdAt) }}</text>
        </view>
      </view>

      <!-- 加载更多触发区 -->
      <view v-if="storeId && reviews.length > 0" class="load-more" @click="loadMore">
        <text>{{ hasMore ? (loadingMore ? '加载中...' : '加载更多') : '没有更多了' }}</text>
      </view>
      <view class="scroll-bottom-gap"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { authStore } from '../../../store/auth';
import { me } from '../../../api/auth';
import { fetchStoreDetail } from '../../../api/store';
import { fetchStoreReviews, normalizeReviewImages, resolveReviewImageUrls } from '../../../api/review';

/**
 * 管理员门店评价页
 * 与用户侧评价页区别：
 * 1) storeId 来自管理员账号上下文
 * 2) 当本地用户信息缺失时会主动调用 me() 补齐门店信息
 */
export default {
  data() {
    return {
      // 当前管理员所属门店信息
      storeId: '',
      storeName: '',
      storeRating: 0,
      reviewCount: 0,
      // 评价筛选项
      filters: [
        { label: '全部', value: 'all' },
        { label: '好评', value: 'good' },
        { label: '差评', value: 'bad' },
        { label: '有图', value: 'withImages' }
      ],
      filterType: 'all',
      // 列表与分页状态
      reviews: [],
      page: 1,
      pageSize: 10,
      hasMore: true,
      // 加载状态
      loading: false,
      loadingMore: false
    };
  },
  computed: {
    // 评分展示文本
    scoreText() {
      const score = Number(this.storeRating || 0);
      return score > 0 ? score.toFixed(1) : '暂无';
    },
    // 评价总数展示文本
    totalCountText() {
      const count = Number(this.reviewCount || 0);
      return count > 0 ? `${count}条评价` : '暂无评价';
    }
  },
  async onShow() {
    await this.ensureStoreContext();
    if (!this.storeId) return;
    await Promise.all([this.loadStoreMeta(), this.loadReviews(true)]);
  },
  onPullDownRefresh() {
    this.onShow().finally(() => uni.stopPullDownRefresh());
  },
  onReachBottom() {
    this.loadMore();
  },
  methods: {
    // 确保拿到管理员所属门店上下文（优先本地，其次远端）
    async ensureStoreContext() {
      const user = authStore.state.user || {};
      if (user && user.storeId) {
        this.storeId = user.storeId;
        this.storeName = user.storeName || this.storeName;
        return;
      }
      try {
        const latest = await me();
        if (latest) {
          authStore.setUser(latest);
          this.storeId = latest.storeId || '';
          this.storeName = latest.storeName || this.storeName;
        }
      } catch (err) {}
    },
    // 拉取门店评分与名称信息
    async loadStoreMeta() {
      if (!this.storeId) return;
      try {
        const detail = await fetchStoreDetail(this.storeId, { noCache: true });
        const store = detail && detail.store ? detail.store : detail;
        this.storeName = (store && store.name) || this.storeName || '当前门店';
        this.storeRating = Number((store && store.rating && store.rating.overall) || 0);
        this.reviewCount = Number((store && store.rating && store.rating.count) || 0);
      } catch (err) {}
    },
    // 加载评价列表（支持 reset）
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
    // 追加分页
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
    // 切换筛选并重置列表
    changeFilter(value) {
      if (this.filterType === value || this.loading) return;
      this.filterType = value;
      this.loadReviews(true);
    },
    // 统一读取评价图片数组
    getImages(review) {
      return normalizeReviewImages(review);
    },
    // 预览评价图片
    previewReviewImage(review, index) {
      const images = this.getImages(review);
      if (!images.length) return;
      const safeIndex = Math.max(0, Math.min(Number(index || 0), images.length - 1));
      uni.previewImage({
        current: images[safeIndex],
        urls: images
      });
    },
    // 评分统一格式
    formatScore(rating) {
      if (!rating) return '5.0';
      return Number(rating.overall || rating || 5).toFixed(1);
    },
    // 时间格式化
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
    // 读取回复文案（兼容字符串/对象结构）
    getReplyText(review) {
      const reply = review && review.reply;
      if (!reply) return '';
      if (typeof reply === 'string') return reply.trim();
      if (typeof reply === 'object') return String(reply.content || '').trim();
      return '';
    },
    // 关联订单展示：优先订单号，其次订单ID
    getOrderText(review) {
      if (!review) return '-';
      const orderNo = String(review.orderNo || '').trim();
      if (orderNo) return orderNo;
      const orderId = String(review.orderId || '').trim();
      return orderId || '-';
    },
    // 服务项目展示：优先服务名，其次服务ID
    getServiceText(review) {
      if (!review) return '-';
      const serviceName = String(review.serviceName || '').trim();
      if (serviceName) return serviceName;
      const serviceId = String(review.serviceId || '').trim();
      return serviceId || '-';
    },
    // 服务时段展示：date + start-end
    getServiceTimeText(review) {
      if (!review) return '-';
      const date = String(review.date || '').trim();
      const start = String(review.startTime || '').trim();
      const end = String(review.endTime || '').trim();
      const range = [start, end].filter((part) => !!part).join('-');
      if (!date && !range) return '-';
      if (!date) return range;
      if (!range) return date;
      return `${date} ${range}`;
    }
  }
};
</script>

<style scoped lang="scss">
.reviews-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  box-sizing: border-box;
}

.page-header {
  flex-shrink: 0;
  padding: calc(116rpx + 20px) 20rpx 0;
}

.page-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 14rpx;
}

.page-content {
  padding: 0 20rpx 0;
}

.hero-card {
  border-radius: 24rpx;
  padding: 24rpx 20rpx;
  background: linear-gradient(140deg, #0f172a, #1e293b);
  box-shadow: 0 16rpx 30rpx rgba(15, 23, 42, 0.2);
}

.hero-kicker {
  display: block;
  color: rgba(255, 255, 255, 0.72);
  font-size: 22rpx;
}

.hero-title {
  margin-top: 8rpx;
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

.review-order {
  margin-top: 8rpx;
  display: block;
  font-size: 22rpx;
  color: #334155;
}

.review-meta {
  margin-top: 4rpx;
  display: block;
  font-size: 22rpx;
  color: #334155;
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

.scroll-bottom-gap {
  height: 24rpx;
}
</style>
