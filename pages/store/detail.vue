<template>
  <view class="detail-page">
    <app-nav />

    <view v-if="loading && !store" class="hint-box">
      <text>加载中...</text>
    </view>
    <view v-else-if="!store" class="hint-box">
      <text>暂无门店信息</text>
    </view>

    <view v-else>
      <view class="hero-wrap">
        <image class="hero-image" :src="store.cover || defaultCover" mode="aspectFill" />
        <view class="hero-mask"></view>
      </view>

      <view class="sheet">
        <view class="head-row">
          <view class="head-main">
            <text class="store-name">{{ store.name || '未命名门店' }}</text>
            <view class="address-line">
              <app-icon name="map-pin" color="#64748B" :size="22" :stroke-width="2.1" />
              <text class="address-text">{{ store.address || '地址待完善' }}</text>
            </view>
          </view>

          <view class="rating-pill">
            <text class="rating-star">★</text>
            <text class="rating-score">{{ formatRating(store) }}</text>
          </view>
        </view>

        <view class="stat-row">
          <view class="stat-card">
            <view class="stat-icon stat-icon-emerald">
              <app-icon name="clock" color="#059669" :size="22" :stroke-width="2.1" />
            </view>
            <view class="stat-main">
              <text class="stat-label">营业时间</text>
              <text class="stat-value">{{ getBusinessHoursText('weekday') }}</text>
            </view>
          </view>

          <view class="stat-card stat-card-nav" @click="openNavigation">
            <view class="stat-icon stat-icon-blue">
              <app-icon name="compass" color="#2563EB" :size="22" :stroke-width="2.1" />
            </view>
            <text class="stat-nav-title">导航</text>
          </view>
        </view>

        <view class="contact-card" :class="{ disabled: !getStorePhone() }" @click="callStore">
          <view class="stat-icon stat-icon-violet">
            <app-icon name="phone" color="#7C3AED" :size="22" :stroke-width="2.1" />
          </view>
          <view class="contact-main">
            <text class="contact-label">联系电话</text>
            <text class="contact-value">{{ getStorePhone() || '门店暂未设置电话' }}</text>
          </view>
          <text class="contact-action">{{ getStorePhone() ? '拨打' : '' }}</text>
        </view>

        <view class="section">
          <text class="section-title">服务项目</text>

          <view v-if="services.length === 0" class="section-hint">暂无服务项目</view>
          <view v-else class="service-list">
            <view
              v-for="service in services"
              :key="service._id"
              class="service-card"
              @click="goCreateOrder(service._id)"
            >
              <view class="service-main">
                <text class="service-name">{{ service.name }}</text>
                <text class="service-desc">{{ service.description || '专业造型服务，按需求定制。' }}</text>
                <text class="service-meta">{{ service.duration || 60 }} 分钟</text>
              </view>
              <view class="service-side">
                <text class="service-price">¥{{ Number(service.price || 0) }}</text>
                <text class="service-book">预约</text>
              </view>
            </view>
          </view>
        </view>

        <view class="section">
          <text class="section-title">精选发型师</text>

          <view v-if="barbers.length === 0" class="section-hint">暂无理发师</view>
          <view v-else class="barber-list">
            <view
              v-for="barber in barbers"
              :key="barber._id"
              class="barber-card"
              @click="goCreateOrder('')"
            >
              <image class="barber-avatar" :src="barber.avatar || defaultAvatar" mode="aspectFill" />
              <view class="barber-main">
                <text class="barber-name">{{ barber.name || barber.username || '理发师' }}</text>
                <text class="barber-desc">{{ barber.intro || '擅长剪发/烫染，提供个性化造型建议。' }}</text>
              </view>
              <view class="barber-action">预约</view>
            </view>
          </view>
        </view>

        <view class="section">
          <text class="section-title">预约须知</text>
          <view class="rule-list">
            <view class="rule-item">
              <app-icon name="file" color="#475569" :size="22" :stroke-width="2.1" />
              <text class="rule-text">{{ getBookingRuleText('notice') }}</text>
            </view>
            <view class="rule-item">
              <app-icon name="x-circle" color="#475569" :size="22" :stroke-width="2.1" />
              <text class="rule-text">{{ getBookingRuleText('cancelRule') }}</text>
            </view>
            <view class="rule-item">
              <app-icon name="refresh" color="#475569" :size="22" :stroke-width="2.1" />
              <text class="rule-text">{{ getBookingRuleText('rescheduleRule') }}</text>
            </view>
          </view>
        </view>

        <view class="section">
          <view class="review-head">
            <text class="section-title">用户评价</text>
            <text class="review-more" @click="goStoreReviews">查看全部</text>
            <view class="review-filters">
              <text
                v-for="filter in reviewFilters"
                :key="filter.value"
                class="review-filter"
                :class="{ active: reviewFilter === filter.value }"
                @click="changeReviewFilter(filter.value)"
              >
                {{ filter.label }}
              </text>
            </view>
          </view>

          <view v-if="reviewsLoading" class="section-hint">评价加载中...</view>
          <view v-else-if="reviews.length === 0" class="section-hint">暂无评价</view>
          <view v-else class="review-list">
            <view v-for="review in reviews" :key="review._id" class="review-card">
              <view class="review-top">
                <text class="review-user">{{ review.userName || '匿名用户' }}</text>
                <text class="review-score">★ {{ (review.rating && review.rating.overall) || 5 }}</text>
              </view>
              <text class="review-content">{{ review.content || '用户未填写内容' }}</text>
              <view v-if="getReviewImages(review).length > 0" class="review-images">
                <image
                  v-for="(img, idx) in getReviewImages(review)"
                  :key="`${review._id || 'review'}_${idx}`"
                  class="review-image"
                  :src="img"
                  mode="aspectFill"
                  @click="previewReviewImage(review, idx)"
                />
              </view>
              <text class="review-time">{{ formatReviewTime(review.createdAt) }}</text>
            </view>
          </view>
        </view>

        <view class="bottom-action">
          <view class="book-btn" @click="goCreateOrder('')">去预约</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { fetchStoreDetail, fetchStoreServices, fetchStoreBarbers } from '../../api/store';
import { fetchStoreReviews, normalizeReviewImages, resolveReviewImageUrls } from '../../api/review';

export default {
  data() {
    return {
      storeId: '',
      store: null,
      services: [],
      barbers: [],
      reviews: [],
      loading: false,
      reviewsLoading: false,
      reviewFilter: 'all',
      reviewFilters: [
        { label: '全部', value: 'all' },
        { label: '好评', value: 'good' },
        { label: '差评', value: 'bad' },
        { label: '有图', value: 'withImages' }
      ],
      distance: null,
      userLat: null,
      userLng: null,
      defaultCover:
        'https://images.unsplash.com/photo-1521590832169-dcb6f5465cbf?auto=format&fit=crop&q=80&w=800',
      defaultAvatar:
        'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&q=80&w=200'
    };
  },
  onLoad(options) {
    this.storeId = (options && options.id) || '';
    if (!this.storeId) return;
    this.getUserLocation();
    this.loadDetail();
  },
  onShow() {
    if (this.storeId) {
      this.loadDetail({ forceRefresh: true });
    }
  },
  methods: {
    getUserLocation() {
      uni.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.userLat = res.latitude;
          this.userLng = res.longitude;
          if (this.store && this.store.location) {
            this.calculateDistance();
          }
        }
      });
    },
    calculateDistance() {
      if (!this.store || !this.store.location || !this.userLat || !this.userLng) {
        return;
      }
      const storeLat = this.store.location.lat;
      const storeLng = this.store.location.lng;
      if (!storeLat || !storeLng) {
        return;
      }
      const R = 6371;
      const dLat = ((storeLat - this.userLat) * Math.PI) / 180;
      const dLng = ((storeLng - this.userLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((this.userLat * Math.PI) / 180) *
          Math.cos((storeLat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      this.distance = R * c;
    },
    formatDistance(distance) {
      if (distance === null || distance === undefined) return '';
      if (distance < 1) return `${Math.round(distance * 1000)}米`;
      return `${Number(distance).toFixed(1)}公里`;
    },
    openNavigation() {
      const address = this.getNavigationAddress();
      if (!address) {
        uni.showToast({ title: '门店地址未设置', icon: 'none' });
        return;
      }
      uni.showActionSheet({
        itemList: ['高德地图', '百度地图'],
        success: async (res) => {
          const provider = res.tapIndex === 0 ? 'amap' : 'baidu';
          await this.copyAddress(address);
          const opened = this.openMapByAddress(provider, address);
          if (!opened) {
            uni.showToast({ title: '未安装地图应用', icon: 'none' });
          }
        }
      });
    },
    getNavigationAddress() {
      const address = this.store && this.store.address ? String(this.store.address).trim() : '';
      return address || '';
    },
    getStorePhone() {
      const phone = this.store && this.store.phone ? String(this.store.phone).trim() : '';
      return phone || '';
    },
    callStore() {
      const phone = this.getStorePhone();
      if (!phone) {
        uni.showToast({ title: '门店电话未设置', icon: 'none' });
        return;
      }
      uni.makePhoneCall({
        phoneNumber: phone,
        fail: () => {
          uni.showToast({ title: '拨号失败，请稍后重试', icon: 'none' });
        }
      });
    },
    copyAddress(address) {
      return new Promise((resolve) => {
        uni.setClipboardData({
          data: address,
          showToast: false,
          success: () => resolve(true),
          fail: () => resolve(false)
        });
      });
    },
    openMapByAddress(provider, address) {
      const keyword = encodeURIComponent(address);
      const appName = encodeURIComponent('salon-booking-app');
      const urls =
        provider === 'amap'
          ? {
              scheme: `amapuri://route/plan/?sourceApplication=${appName}&dname=${keyword}&dev=0&t=0`,
              fallback: `https://uri.amap.com/search?keyword=${keyword}&src=salon-booking-app&callnative=1`
            }
          : {
              scheme: `baidumap://map/place/search?query=${keyword}&region=${encodeURIComponent('全国')}&src=salon-booking-app`,
              fallback: `https://map.baidu.com/search/${keyword}`
            };

      if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.openURL) {
        plus.runtime.openURL(urls.scheme, () => {
          if (urls.fallback) {
            plus.runtime.openURL(urls.fallback);
          }
        });
        return true;
      }
      if (typeof window !== 'undefined' && urls.fallback) {
        window.open(urls.fallback, '_blank');
        return true;
      }
      return false;
    },
    async loadDetail(options = {}) {
      this.loading = true;
      try {
        const [store, services, barbers] = await Promise.all([
          fetchStoreDetail(this.storeId, { noCache: !!options.forceRefresh }),
          fetchStoreServices(this.storeId, { noCache: !!options.forceRefresh }),
          fetchStoreBarbers(this.storeId, { noCache: true })
        ]);
        this.store = store || null;
        this.services = Array.isArray(services) ? services : [];
        this.barbers = Array.isArray(barbers) ? barbers : [];
        if (this.userLat && this.userLng) {
          this.calculateDistance();
        }
        this.loadReviews();
      } catch (err) {
        uni.showToast({ title: err.message || '加载门店失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    async loadReviews() {
      this.reviewsLoading = true;
      try {
        const res = await fetchStoreReviews({
          storeId: this.storeId,
          filterType: this.reviewFilter,
          page: 1,
          pageSize: 10
        });
        const list = (res && res.list) || [];
        this.reviews = await resolveReviewImageUrls(list);
      } catch (err) {
        this.reviews = [];
      } finally {
        this.reviewsLoading = false;
      }
    },
    changeReviewFilter(filter) {
      this.reviewFilter = filter;
      this.loadReviews();
    },
    getReviewImages(review) {
      return normalizeReviewImages(review);
    },
    previewReviewImage(review, index) {
      const images = this.getReviewImages(review);
      if (!images.length) return;
      const safeIndex = Math.max(0, Math.min(Number(index || 0), images.length - 1));
      uni.previewImage({
        current: images[safeIndex],
        urls: images
      });
    },
    formatReviewTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days === 0) return '今天';
      if (days === 1) return '昨天';
      if (days < 30) return `${days}天前`;
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },
    formatRating(store) {
      if (!store.rating || !store.rating.overall) return '5.0';
      return Number(store.rating.overall).toFixed(1);
    },
    getBusinessHoursText(key) {
      const businessHours = (this.store && this.store.businessHours) || {};
      return businessHours[key] || '未设置';
    },
    getBookingRuleText(key) {
      const defaults = {
        notice: '预约成功后请按约定时间到店，迟到可能影响服务安排。',
        cancelRule: '如需取消，请至少提前2小时操作。',
        rescheduleRule: '如需改期，请联系门店并尽量提前处理。'
      };
      const bookingRules = (this.store && this.store.bookingRules) || {};
      return bookingRules[key] || defaults[key] || '未设置';
    },
    goCreateOrder(serviceId = '') {
      if (!this.storeId) return;
      const serviceQuery = serviceId ? `&serviceId=${encodeURIComponent(serviceId)}` : '';
      uni.navigateTo({ url: `/pages/order/create?storeId=${this.storeId}${serviceQuery}` });
    },
    goStoreReviews() {
      if (!this.storeId) return;
      const name = encodeURIComponent((this.store && this.store.name) || '');
      uni.navigateTo({ url: `/pages/store/reviews?id=${this.storeId}&name=${name}` });
    }
  }
};
</script>

<style scoped lang="scss">
.detail-page {
  min-height: 100vh;
  background: #f8fafc;
}

.hint-box {
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 24rpx;
}

.hero-wrap {
  position: relative;
  height: 480rpx;
}

.hero-image {
  width: 100%;
  height: 100%;
}

.hero-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0));
}

.sheet {
  position: relative;
  margin-top: -44rpx;
  border-radius: 34rpx 34rpx 0 0;
  background: #f8fafc;
  padding: 24rpx 20rpx 32rpx;
}

.head-row {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}

.head-main {
  flex: 1;
  min-width: 0;
}

.store-name {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.22;
}

.address-line {
  margin-top: 8rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.address-text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rating-pill {
  margin-top: 4rpx;
  display: inline-flex;
  align-items: center;
  gap: 3rpx;
  padding: 8rpx 14rpx;
  border-radius: 14rpx;
  background: #fffbeb;
}

.rating-star {
  color: #f59e0b;
  font-size: 20rpx;
}

.rating-score {
  color: #b45309;
  font-size: 24rpx;
  font-weight: 700;
}

.stat-row {
  margin-top: 20rpx;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10rpx;
}

.stat-card {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 20rpx;
  padding: 14rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.stat-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon-emerald {
  background: #ecfdf5;
}

.stat-icon-blue {
  background: #eff6ff;
}

.stat-icon-violet {
  background: #f5f3ff;
}

.stat-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3rpx;
}

.stat-label {
  font-size: 20rpx;
  color: #94a3b8;
}

.stat-value {
  font-size: 22rpx;
  color: #0f172a;
  font-weight: 700;
}

.stat-card-nav {
  justify-content: flex-start;
}

.stat-nav-title {
  font-size: 28rpx;
  color: #0f172a;
  font-weight: 600;
  letter-spacing: 1rpx;
}

.contact-card {
  margin-top: 10rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 20rpx;
  padding: 14rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.contact-card.disabled {
  opacity: 0.62;
}

.contact-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3rpx;
}

.contact-label {
  font-size: 20rpx;
  color: #94a3b8;
}

.contact-value {
  font-size: 24rpx;
  color: #0f172a;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-all;
}

.contact-action {
  font-size: 24rpx;
  color: #2563eb;
  font-weight: 700;
}

.section {
  margin-top: 16rpx;
  background: #ffffff;
  border-radius: 22rpx;
  border: 1rpx solid #e2e8f0;
  padding: 16rpx;
}

.section-title {
  display: block;
  font-size: 30rpx;
  color: #0f172a;
  font-weight: 700;
  margin-bottom: 14rpx;
}

.section-hint {
  color: #94a3b8;
  font-size: 23rpx;
}

.service-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.service-card {
  border: 1rpx solid #e2e8f0;
  border-radius: 18rpx;
  background: #ffffff;
  display: flex;
  justify-content: space-between;
  gap: 10rpx;
  padding: 14rpx;
}

.service-main {
  flex: 1;
  min-width: 0;
}

.service-name {
  display: block;
  font-size: 28rpx;
  color: #0f172a;
  font-weight: 700;
}

.service-desc {
  margin-top: 4rpx;
  display: block;
  font-size: 22rpx;
  color: #64748b;
  line-height: 1.45;
}

.service-meta {
  margin-top: 8rpx;
  display: block;
  font-size: 20rpx;
  color: #94a3b8;
}

.service-side {
  width: 118rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
}

.service-price {
  font-size: 30rpx;
  color: #0f172a;
  font-weight: 800;
}

.service-book {
  font-size: 20rpx;
  color: #ffffff;
  background: #0f172a;
  border-radius: 999rpx;
  padding: 6rpx 16rpx;
}

.barber-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.barber-card {
  display: flex;
  align-items: center;
  gap: 12rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 18rpx;
  background: #ffffff;
  padding: 12rpx;
}

.barber-avatar {
  width: 92rpx;
  height: 92rpx;
  border-radius: 14rpx;
  background: #f1f5f9;
  flex-shrink: 0;
}

.barber-main {
  flex: 1;
  min-width: 0;
}

.barber-name {
  display: block;
  font-size: 26rpx;
  color: #0f172a;
  font-weight: 700;
}

.barber-desc {
  margin-top: 4rpx;
  display: block;
  font-size: 21rpx;
  color: #64748b;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.barber-action {
  font-size: 20rpx;
  color: #ffffff;
  background: #0f172a;
  border-radius: 999rpx;
  padding: 6rpx 14rpx;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  background: #f8fafc;
  border-radius: 14rpx;
  padding: 12rpx;
}

.rule-text {
  flex: 1;
  font-size: 22rpx;
  color: #475569;
  line-height: 1.5;
}

.review-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 12rpx;
}

.review-more {
  margin-left: auto;
  font-size: 22rpx;
  color: #475569;
  padding: 2rpx 0;
}

.review-filters {
  display: flex;
  gap: 6rpx;
}

.review-filter {
  font-size: 20rpx;
  color: #94a3b8;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
}

.review-filter.active {
  color: #0f172a;
  background: #ffffff;
  border-color: #cbd5e1;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.review-card {
  background: #f8fafc;
  border-radius: 14rpx;
  padding: 12rpx;
}

.review-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.review-user {
  font-size: 24rpx;
  color: #0f172a;
  font-weight: 600;
}

.review-score {
  font-size: 22rpx;
  color: #f59e0b;
  font-weight: 700;
}

.review-content {
  margin-top: 6rpx;
  display: block;
  font-size: 22rpx;
  color: #475569;
  line-height: 1.45;
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

.review-time {
  margin-top: 6rpx;
  display: block;
  font-size: 20rpx;
  color: #94a3b8;
}

.bottom-action {
  margin-top: 18rpx;
}

.book-btn {
  height: 84rpx;
  border-radius: 18rpx;
  background: #0f172a;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
