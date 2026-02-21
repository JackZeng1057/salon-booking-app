<template>
  <view class="home-page">
    <app-nav :showBack="false" />

    <view class="home-content">
      <view class="header-row">
        <view class="header-copy">
          <text class="greeting-text">{{ greetingText }}，{{ displayName }}</text>
          <text class="headline-text">开启今日造型</text>
        </view>

        <view class="header-actions">
          <view class="notify-btn" @click="goNotifications">
            <app-icon name="bell" color="#334155" :size="34" :stroke-width="2.1" />
            <text v-if="unreadCount > 0" class="notify-dot"></text>
          </view>

          <view class="avatar-wrap" @click="goSettings">
            <image
              v-if="currentUser.avatar"
              class="avatar-image"
              :src="currentUser.avatar"
              mode="aspectFill"
            />
            <view v-else class="avatar-image avatar-fallback">{{ displayName.slice(0, 1).toUpperCase() }}</view>
          </view>
        </view>
      </view>

      <view class="search-bar" @click="goSearch">
        <app-icon class="search-icon-svg" name="search" color="#94A3B8" :size="31" :stroke-width="2.1" />
        <text class="search-text">搜索门店、发型师、服务...</text>
      </view>

      <view class="promo-card" @click="goStores">
        <image class="promo-bg" :src="bannerCover" mode="aspectFill" />
        <view class="promo-overlay"></view>
        <view class="promo-content">
          <text class="promo-kicker">Season Offer</text>
          <text class="promo-title">夏日清爽特惠</text>
          <text class="promo-subtitle">精选护理项目限时 8.5 折</text>
          <view class="promo-cta">立即查看</view>
        </view>
      </view>

      <view class="quick-actions">
        <view
          v-for="item in quickActions"
          :key="item.key"
          class="quick-item"
          @click="handleQuickAction(item.key)"
          hover-class="quick-item-hover"
        >
          <view class="quick-icon" :style="{ background: item.bg }">
            <app-icon :name="item.iconName" color="#334155" :size="36" :stroke-width="2.15" />
          </view>
          <text class="quick-label">{{ item.label }}</text>
        </view>
      </view>

      <view class="section-header">
        <text class="section-title">附近推荐</text>
        <text class="section-more" @click="goStores">更多</text>
      </view>

      <view v-if="storeLoading" class="state-card">
        <text class="state-text">正在加载门店...</text>
      </view>
      <view v-else-if="recommendedStores.length === 0" class="state-card">
        <text class="state-text">暂无可展示门店</text>
      </view>
      <view v-else class="store-list">
        <view
          v-for="store in recommendedStores"
          :key="store._id"
          class="store-card"
          @click="goStoreDetail(store._id)"
        >
          <view class="store-cover-wrap">
            <image class="store-cover" :src="getStoreCover(store)" mode="aspectFill" />
            <view v-if="store.distance !== null && store.distance !== undefined" class="store-distance">
              <app-icon name="map-pin" color="#FFFFFF" :size="19" :stroke-width="2.2" />
              <text>{{ formatDistance(store.distance) }}</text>
            </view>
          </view>

          <view class="store-info">
            <view class="store-name-row">
              <text class="store-name">{{ store.name || '未命名门店' }}</text>
              <text class="store-rating">★ {{ formatStoreRating(store) }}</text>
            </view>

            <text class="store-address">{{ store.address || '地址信息待完善' }}</text>

            <view class="store-meta-row">
              <text class="store-meta-pill">{{ formatPrice(store) }}</text>
              <text class="store-meta-pill">{{ formatReviewCount(store) }}</text>
              <text class="store-meta-pill">{{ getBusinessStatusText(store) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <bottom-tab-bar current="home" />
  </view>
</template>

<script>
import { authStore } from '../../../store/auth';
import { getUnreadCount } from '../../../api/notifications';
import { fetchStores } from '../../../api/store';
import BottomTabBar from '../../../components/bottom-tab-bar/bottom-tab-bar.vue';

export default {
  components: {
    BottomTabBar
  },
  data() {
    return {
      unreadCount: 0,
      storeLoading: false,
      recommendedStores: [],
      bannerCover:
        'https://images.unsplash.com/photo-1560066984-138dadb4c035?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      defaultStoreCover:
        'https://images.unsplash.com/photo-1521590832896-7ea20ade7336?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
      quickActions: [
        { key: 'stores', label: '找门店', iconName: 'store', bg: '#dbeafe' },
        { key: 'orders', label: '我的预约', iconName: 'calendar', bg: '#dcfce7' },
        { key: 'pricing', label: '价目表', iconName: 'file', bg: '#fef3c7' },
        { key: 'profile', label: '个人中心', iconName: 'user', bg: '#ede9fe' }
      ]
    };
  },
  computed: {
    currentUser() {
      return authStore.state.user || { nickname: 'Guest' };
    },
    displayName() {
      const user = this.currentUser || {};
      return user.username || user.name || user.nickname || '新朋友';
    },
    greetingText() {
      const hour = new Date().getHours();
      if (hour < 11) return '上午好';
      if (hour < 18) return '下午好';
      return '晚上好';
    }
  },
  onLoad() {
    this.hideNativeTabBar();
  },
  onShow() {
    this.hideNativeTabBar();
    this.refreshHome();
  },
  onPullDownRefresh() {
    this.refreshHome(true).finally(() => {
      uni.stopPullDownRefresh();
    });
  },
  methods: {
    hideNativeTabBar() {
      try {
        uni.hideTabBar({ animation: false });
      } catch (e) {}
    },
    async refreshHome(forceRefresh = false) {
      await Promise.all([this.loadUnreadCount(), this.loadRecommendedStores(forceRefresh)]);
    },
    async loadUnreadCount() {
      try {
        this.unreadCount = await getUnreadCount();
      } catch (err) {
        this.unreadCount = 0;
      }
    },
    async loadRecommendedStores(forceRefresh = false) {
      this.storeLoading = true;
      try {
        const result = await fetchStores({ noCache: !!forceRefresh });
        const list = Array.isArray(result) ? result : [];
        this.recommendedStores = list
          .slice()
          .sort((a, b) => {
            const aScore = Number((a && a.rating && a.rating.overall) || 0);
            const bScore = Number((b && b.rating && b.rating.overall) || 0);
            return bScore - aScore;
          })
          .slice(0, 3);
      } catch (err) {
        this.recommendedStores = [];
      } finally {
        this.storeLoading = false;
      }
    },
    handleQuickAction(key) {
      if (key === 'stores') {
        this.goStores();
        return;
      }
      if (key === 'orders') {
        uni.switchTab({ url: '/pages/user/orders/index' });
        return;
      }
      if (key === 'pricing') {
        uni.navigateTo({ url: '/pages/user/pricing/index' });
        return;
      }
      if (key === 'profile') {
        this.goSettings();
      }
    },
    formatStoreRating(store) {
      const score = Number((store && store.rating && store.rating.overall) || 0);
      return score > 0 ? score.toFixed(1) : '5.0';
    },
    formatDistance(distance) {
      if (distance === null || distance === undefined) return '';
      if (distance < 1) return `${Math.round(distance * 1000)}米`;
      return `${Number(distance).toFixed(1)}公里`;
    },
    formatPrice(store) {
      const minPrice = Number((store && store.minPrice) || 0);
      return minPrice > 0 ? `¥${minPrice}起` : '价格面议';
    },
    formatReviewCount(store) {
      const count = Number((store && store.rating && store.rating.count) || 0);
      if (!count) return '暂无评价';
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k评价`;
      return `${count}条评价`;
    },
    getTodayHours(store) {
      if (!store || !store.businessHours) return '';
      const day = new Date().getDay();
      return day === 0 || day === 6 ? store.businessHours.weekend : store.businessHours.weekday;
    },
    parseBusinessRange(rangeText) {
      const text = String(rangeText || '').trim();
      if (!text) return null;
      const matched = text.match(/(\d{1,2}):(\d{2})\s*[-~到至]\s*(\d{1,2}):(\d{2})/);
      if (!matched) return null;
      const startHour = Number(matched[1]);
      const startMinute = Number(matched[2]);
      const endHour = Number(matched[3]);
      const endMinute = Number(matched[4]);
      if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;
      return {
        start: startHour * 60 + startMinute,
        end: endHour * 60 + endMinute
      };
    },
    getBusinessStatusText(store) {
      const range = this.parseBusinessRange(this.getTodayHours(store));
      if (!range) return '营业时间待设置';
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const isOpen =
        range.end < range.start
          ? minutes >= range.start || minutes <= range.end
          : minutes >= range.start && minutes <= range.end;
      return isOpen ? '营业中' : '休息中';
    },
    getStoreCover(store) {
      return (store && store.cover) || this.defaultStoreCover;
    },
    goSearch() {
      uni.navigateTo({ url: '/pages/search/index' });
    },
    goStores() {
      uni.navigateTo({ url: '/pages/store/list' });
    },
    goStoreDetail(id) {
      if (!id) return;
      uni.navigateTo({ url: `/pages/store/detail?id=${id}` });
    },
    goNotifications() {
      uni.navigateTo({ url: '/pages/user/notifications/index' });
    },
    goSettings() {
      uni.switchTab({ url: '/pages/user/settings/index' });
    }
  }
};
</script>

<style scoped lang="scss">
.home-page {
  min-height: 100vh;
  padding: 98rpx 28rpx 168rpx;
  background: #f8fafc;
}

.home-content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-copy {
  display: flex;
  flex-direction: column;
}

.greeting-text {
  font-size: 24rpx;
  color: #64748b;
  font-weight: 500;
}

.headline-text {
  margin-top: 8rpx;
  font-size: 50rpx;
  line-height: 1.2;
  font-weight: 800;
  color: #0f172a;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.notify-btn,
.avatar-wrap {
  width: 76rpx;
  height: 76rpx;
  border-radius: 38rpx;
  background: rgba(255, 255, 255, 0.95);
  border: 1rpx solid rgba(148, 163, 184, 0.26);
  box-shadow: 0 10rpx 24rpx rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.notify-icon {
  font-size: 30rpx;
}

.notify-dot {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
  background: #ef4444;
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 38rpx;
}

.avatar-fallback {
  background: linear-gradient(140deg, #0f172a, #1e293b);
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-bar {
  height: 96rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.94);
  border: 1rpx solid rgba(148, 163, 184, 0.28);
  display: flex;
  align-items: center;
  padding: 0 28rpx;
  box-shadow: 0 8rpx 20rpx rgba(15, 23, 42, 0.06);
}

.search-icon {
  font-size: 30rpx;
  margin-right: 14rpx;
}

.search-icon-svg {
  margin-right: 14rpx;
}

.search-text {
  font-size: 27rpx;
  color: #94a3b8;
}

.promo-card {
  position: relative;
  height: 320rpx;
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 20rpx 48rpx rgba(15, 23, 42, 0.18);
}

.promo-bg {
  width: 100%;
  height: 100%;
}

.promo-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.18));
}

.promo-content {
  position: absolute;
  left: 28rpx;
  top: 34rpx;
  display: flex;
  flex-direction: column;
}

.promo-kicker {
  color: #34d399;
  font-size: 20rpx;
  letter-spacing: 2rpx;
  font-weight: 700;
}

.promo-title {
  margin-top: 8rpx;
  color: #ffffff;
  font-size: 42rpx;
  font-weight: 700;
}

.promo-subtitle {
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.9);
  font-size: 24rpx;
}

.promo-cta {
  margin-top: 24rpx;
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.24);
  border: 1rpx solid rgba(255, 255, 255, 0.42);
  color: #ffffff;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  padding: 10rpx 24rpx;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 10rpx 4rpx;
}

.quick-item-hover {
  opacity: 0.8;
}

.quick-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34rpx;
  box-shadow: 0 8rpx 18rpx rgba(15, 23, 42, 0.08);
}

.quick-label {
  font-size: 24rpx;
  color: #475569;
  font-weight: 600;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 34rpx;
  color: #0f172a;
  font-weight: 700;
}

.section-more {
  font-size: 24rpx;
  color: #94a3b8;
}

.state-card {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 30rpx;
  border: 1rpx solid rgba(148, 163, 184, 0.16);
}

.state-text {
  color: #64748b;
  font-size: 26rpx;
}

.store-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.store-card {
  background: #ffffff;
  border-radius: 28rpx;
  border: 1rpx solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.06);
  padding: 16rpx;
  display: flex;
  gap: 14rpx;
}

.store-cover-wrap {
  width: 184rpx;
  height: 184rpx;
  border-radius: 20rpx;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}

.store-cover {
  width: 100%;
  height: 100%;
}

.store-distance {
  position: absolute;
  left: 10rpx;
  top: 10rpx;
  background: rgba(15, 23, 42, 0.68);
  color: #ffffff;
  font-size: 18rpx;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
}

.store-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}

.store-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.store-name {
  font-size: 28rpx;
  color: #0f172a;
  font-weight: 700;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-rating {
  font-size: 22rpx;
  color: #f59e0b;
  font-weight: 700;
}

.store-address {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-meta-row {
  margin-top: 12rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.store-meta-pill {
  font-size: 20rpx;
  color: #475569;
  background: #f1f5f9;
  border-radius: 999rpx;
  padding: 6rpx 14rpx;
}
</style>
