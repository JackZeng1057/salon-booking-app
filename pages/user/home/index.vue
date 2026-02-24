<template>
  <!-- 用户首页根容器 -->
  <view class="home-page">
    <!-- 顶部导航（不需要返回按钮，首页） -->
    <app-nav :showBack="false" />

    <view class="home-content">
      <!-- 顶部头部区域：问候语 + 通知按钮 + 头像 + 搜索框 -->
      <view class="home-top">
        <view class="header-row">
          <!-- 左侧：时段问候语（早安/上午好/下午好/晚上好）+ 用户名 -->
          <view class="header-copy">
            <text class="greeting-text">{{ greetingText }}，{{ displayName }}</text>
            <text class="headline-text">开启今日造型</text>
          </view>

          <!-- 右侧操作区：通知角标 + 头像入口 -->
          <view class="header-actions">
            <!-- 铃铛通知按钮；有未读消息时显示红点角标 -->
            <view class="notify-btn" @click="goNotifications">
              <app-icon name="bell" color="#334155" :size="34" :stroke-width="2.1" />
              <!-- 未读消息红点（unreadCount > 0 才显示） -->
              <text v-if="unreadCount > 0" class="notify-dot"></text>
            </view>

            <!-- 用户头像（有头像显示图片，否则显示首字母占位圆） -->
            <view class="avatar-wrap" @click="goSettings">
              <image
                v-if="userAvatar"
                class="avatar-image"
                :src="userAvatar"
                mode="aspectFill"
                @error="handleAvatarError"
              />
              <!-- 头像兜底：用 username 首字母作为占位符 -->
              <view v-else class="avatar-image avatar-fallback">{{ avatarInitial }}</view>
            </view>
          </view>
        </view>

        <!-- 搜索框（点击后跳转门店列表页进行搜索，非原地输入） -->
        <view class="search-bar" @click="goSearch">
          <app-icon class="search-icon-svg" name="search" color="#94A3B8" :size="31" :stroke-width="2.1" />
          <text class="search-text">搜索门店、发型师、服务...</text>
        </view>
      </view>

      <!-- 主要内容滚动区域 -->
      <scroll-view class="home-scroll" scroll-y>
        <view class="home-scroll-content">
          <!-- 促销 Banner 卡片（点击跳转门店列表；背景图、标题、副标题可运营配置） -->
          <view class="promo-card" @click="goStores">
            <image class="promo-bg" :src="bannerCover" mode="aspectFill" />
            <!-- 渐变蒙层提升文字对比度 -->
            <view class="promo-overlay"></view>
            <view class="promo-content">
              <text class="promo-kicker">Season Offer</text>
              <text class="promo-title">夏日清爽特惠</text>
              <text class="promo-subtitle">精选护理项目限时 8.5 折</text>
              <view class="promo-cta">立即查看</view>
            </view>
          </view>

          <!-- 快捷功能入口区：预约/AI 顾问/我的订单/评价 4 个图标格 -->
          <view class="quick-actions">
            <view
              v-for="item in quickActions"
              :key="item.key"
              class="quick-item"
              @click="handleQuickAction(item.key)"
              hover-class="quick-item-hover"
            >
              <!-- 彩色圆形图标底板 + SVG 图标 -->
              <view class="quick-icon" :style="{ background: item.bg }">
                <app-icon :name="item.iconName" color="#334155" :size="36" :stroke-width="2.15" />
              </view>
              <text class="quick-label">{{ item.label }}</text>
            </view>
          </view>

          <!-- 附近推荐门店区域标题行 -->
          <view class="section-header">
            <text class="section-title">附近推荐</text>
            <!-- "更多"链接跳转完整门店列表 -->
            <text class="section-more" @click="goStores">更多</text>
          </view>

          <!-- 门店列表加载中状态 -->
          <view v-if="storeLoading" class="state-card">
            <text class="state-text">正在加载门店...</text>
          </view>
          <!-- 无推荐门店兜底 -->
          <view v-else-if="recommendedStores.length === 0" class="state-card">
            <text class="state-text">暂无可展示门店</text>
          </view>
          <!-- 推荐门店卡片列表（最多展示 6 家） -->
          <view v-else class="store-list">
            <view
              v-for="store in recommendedStores"
              :key="store._id"
              class="store-card"
              @click="goStoreDetail(store._id)"
            >
              <!-- 门店封面图 + 右下角距离徽章 -->
              <view class="store-cover-wrap">
                <image class="store-cover" :src="getStoreCover(store)" mode="aspectFill" />
                <!-- 距离徽章（用户授权定位后展示，单位自动切换 m/km） -->
                <view v-if="store.distance !== null && store.distance !== undefined" class="store-distance">
                  <app-icon name="map-pin" color="#FFFFFF" :size="19" :stroke-width="2.2" />
                  <text>{{ formatDistance(store.distance) }}</text>
                </view>
              </view>

              <!-- 门店文字信息：名称/评分 + 地址 + 标签行 -->
              <view class="store-info">
                <!-- 名称行 + 评分 -->
                <view class="store-name-row">
                  <text class="store-name">{{ store.name || '未命名门店' }}</text>
                  <text class="store-rating">★ {{ formatStoreRating(store) }}</text>
                </view>

                <text class="store-address">{{ store.address || '地址信息待完善' }}</text>

                <!-- 胶囊标签行：价格档 + 评价数 + 营业状态 -->
                <view class="store-meta-row">
                  <text class="store-meta-pill">{{ formatPrice(store) }}</text>
                  <text class="store-meta-pill">{{ formatReviewCount(store) }}</text>
                  <text class="store-meta-pill">{{ getBusinessStatusText(store) }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 底部安全边距（防止内容被 Tab Bar 遮住） -->
          <view class="scroll-bottom-safe"></view>
        </view>
      </scroll-view>
    </view>

    <!-- 底部导航 Tab Bar（当前选中 home） -->
    <bottom-tab-bar current="home" />
  </view>
</template>

<script>
import { authStore } from '../../../store/auth';
import { me } from '../../../api/auth';
import { getUnreadCount } from '../../../api/notifications';
import { fetchStores } from '../../../api/store';
import { syncCriticalSystemNotifications, maybePromptNotificationPermissionOnFirstLogin } from '../../../utils/system-notify';
import BottomTabBar from '../../../components/bottom-tab-bar/bottom-tab-bar.vue';

function getNameInitial(value, fallback = 'U') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const first = text.charAt(0);
  if (/^[a-z]$/i.test(first)) return first.toUpperCase();
  return first;
}

/**
 * 用户首页
 * 提供：
 * 1) 问候区与消息入口
 * 2) 快捷功能入口
 * 3) 附近推荐门店卡片
 */
export default {
  components: {
    BottomTabBar
  },
  data() {
    return {
      // 未读消息数量（用于红点）
      unreadCount: 0,
      // 推荐门店加载态
      storeLoading: false,
      // 首页推荐门店（最多 3 条）
      recommendedStores: [],
      // 顶部活动图与门店兜底图
      bannerCover:
        'https://images.unsplash.com/photo-1560066984-138dadb4c035?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
      defaultStoreCover:
        'https://images.unsplash.com/photo-1521590832896-7ea20ade7336?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
      // 快捷入口配置
      quickActions: [
        { key: 'stores', label: '找门店', iconName: 'store', bg: '#dbeafe' },
        { key: 'orders', label: '我的预约', iconName: 'calendar', bg: '#dcfce7' },
        { key: 'pricing', label: '价目表', iconName: 'file', bg: '#fef3c7' },
        { key: 'profile', label: '个人中心', iconName: 'user', bg: '#ede9fe' }
      ],
      // 当前时间戳：用于驱动问候语随时间自动变化
      nowTs: Date.now(),
      greetingTimer: null,
      // 强制触发 currentUser 相关计算属性更新
      userSyncTick: 0
    };
  },
  computed: {
    // 当前登录用户（兜底为 Guest）
    currentUser() {
      // 引用 tick，确保跨页面 setUser 后可立即重算
      void this.userSyncTick;
      return authStore.state.user || { nickname: 'Guest' };
    },
    // 首页展示名：账号名 > 姓名 > 昵称
    displayName() {
      const user = this.currentUser || {};
      return user.username || user.name || user.nickname || '新朋友';
    },
    // 头像字段容错：无效值统一视作未设置
    normalizedAvatar() {
      const value = String((this.currentUser && this.currentUser.avatar) || '').trim();
      if (!value) return '';
      const lowered = value.toLowerCase();
      if (lowered === 'default' || lowered === 'null' || lowered === 'undefined') return '';
      return value;
    },
    // 与理发师端一致：仅当头像有效时显示图片，否则走字母占位
    userAvatar() {
      return this.normalizedAvatar;
    },
    // 默认头像文字：按用户名首字符变化（英文字母转大写）
    avatarInitial() {
      return getNameInitial(this.displayName, 'U');
    },
    // 按当前时段展示问候语
    greetingText() {
      const hour = new Date(this.nowTs).getHours();
      if (hour >= 17 || hour < 4) return '晚上好';
      if (hour < 9) return '早上好';
      if (hour < 12) return '上午好';
      if (hour < 13) return '中午好';
      if (hour < 17) return '下午好';
      return '晚上好';
    }
  },
  onLoad() {
    this.hideNativeTabBar();
    uni.$on('user-profile-updated', this.handleUserProfileUpdated);
  },
  onShow() {
    this.hideNativeTabBar();
    this.startGreetingTicker();
    setTimeout(() => {
      maybePromptNotificationPermissionOnFirstLogin();
    }, 350);
    setTimeout(() => {
      syncCriticalSystemNotifications({ force: true });
    }, 600);
    this.refreshHome();
  },
  onHide() {
    this.stopGreetingTicker();
  },
  onUnload() {
    this.stopGreetingTicker();
    uni.$off('user-profile-updated', this.handleUserProfileUpdated);
  },
  onPullDownRefresh() {
    this.refreshHome(true).finally(() => {
      uni.stopPullDownRefresh();
    });
  },
  methods: {
    // 项目使用自定义底部栏，进入页面后隐藏系统 tabbar
    hideNativeTabBar() {
      try {
        uni.hideTabBar({ animation: false });
      } catch (e) {}
    },
    // 启动问候语时钟：每 30 秒刷新一次时间戳
    startGreetingTicker() {
      this.stopGreetingTicker();
      this.nowTs = Date.now();
      this.greetingTimer = setInterval(() => {
        this.nowTs = Date.now();
      }, 30000);
    },
    // 停止问候语时钟
    stopGreetingTicker() {
      if (this.greetingTimer) {
        clearInterval(this.greetingTimer);
        this.greetingTimer = null;
      }
    },
    // 刷新首页核心数据：未读数 + 推荐门店
    async refreshHome(forceRefresh = false) {
      await Promise.all([this.loadCurrentUser(), this.loadUnreadCount(), this.loadRecommendedStores(forceRefresh)]);
    },
    // 资料页保存后实时更新首页显示（无需手动刷新）
    handleUserProfileUpdated(user) {
      if (!user || typeof user !== 'object') return;
      authStore.setUser({
        ...(authStore.state.user || {}),
        ...user
      });
      this.userSyncTick += 1;
    },
    // 拉取当前用户最新资料并同步到本地登录态
    async loadCurrentUser() {
      try {
        const data = await me();
        if (data && typeof data === 'object') {
          authStore.setUser(data);
          this.userSyncTick += 1;
        }
      } catch (err) {}
    },
    // 与理发师端一致：头像加载失败后清空头像字段，回退字母占位
    handleAvatarError() {
      authStore.setUser({
        ...(this.currentUser || {}),
        avatar: ''
      });
      this.userSyncTick += 1;
    },
    // 拉取未读消息数
    async loadUnreadCount() {
      try {
        this.unreadCount = await getUnreadCount();
      } catch (err) {
        this.unreadCount = 0;
      }
    },
    // 拉取门店并按评分降序取前 3 条
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
    // 快捷入口路由分发
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
    // 评分格式化
    formatStoreRating(store) {
      const score = Number((store && store.rating && store.rating.overall) || 0);
      return score > 0 ? score.toFixed(1) : '5.0';
    },
    // 距离格式化
    formatDistance(distance) {
      if (distance === null || distance === undefined) return '';
      if (distance < 1) return `${Math.round(distance * 1000)}米`;
      return `${Number(distance).toFixed(1)}公里`;
    },
    // 起价文案
    formatPrice(store) {
      const minPrice = Number((store && store.minPrice) || 0);
      return minPrice > 0 ? `¥${minPrice}起` : '价格面议';
    },
    // 评价数量文案
    formatReviewCount(store) {
      const count = Number((store && store.rating && store.rating.count) || 0);
      if (!count) return '暂无评价';
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k评价`;
      return `${count}条评价`;
    },
    // 获取当天营业时间文本
    getTodayHours(store) {
      if (!store || !store.businessHours) return '';
      const day = new Date().getDay();
      return day === 0 || day === 6 ? store.businessHours.weekend : store.businessHours.weekday;
    },
    // 解析营业时间区间（HH:mm-HH:mm）
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
    // 返回营业状态文案
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
    // 读取门店封面（无封面时回退默认图）
    getStoreCover(store) {
      return (store && store.cover) || this.defaultStoreCover;
    },
    // 跳转搜索/门店列表
    goSearch() {
      uni.navigateTo({ url: '/pages/store/list' });
    },
    // 跳转门店列表
    goStores() {
      uni.navigateTo({ url: '/pages/store/list' });
    },
    // 跳转门店详情
    goStoreDetail(id) {
      if (!id) return;
      uni.navigateTo({ url: `/pages/store/detail?id=${id}` });
    },
    // 跳转消息中心
    goNotifications() {
      syncCriticalSystemNotifications({ force: true });
      uni.navigateTo({ url: '/pages/user/notifications/index' });
    },
    // 跳转“我的”设置页
    goSettings() {
      uni.switchTab({ url: '/pages/user/settings/index' });
    }
  }
};
</script>

<style scoped lang="scss">
.home-page {
  height: 100vh;
  padding: 98rpx 28rpx 0;
  background: #f8fafc;
  overflow: hidden;
}

.home-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.home-top {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin-bottom: 24rpx;
  flex-shrink: 0;
}

.home-scroll {
  flex: 1;
  min-height: 0;
}

.home-scroll-content {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.scroll-bottom-safe {
  height: 168rpx;
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
  background: #0f172a;
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
