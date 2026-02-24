<template>
  <view class="admin-page">
    <!-- 顶部导航（无返回按钮，作为根页面） -->
    <app-nav :showBack="false" />

    <!-- 欢迎横幅：展示门店名、工作台标题、通知入口、今日待处理数 -->
    <view class="hero">
      <view class="hero-top">
        <view>
          <text class="hero-kicker">管理员工作台</text>
          <text class="hero-title">门店管理</text>
          <text class="hero-store">{{ storeName }}</text>
        </view>
        <!-- 通知铃铛：有未读时显示红点 -->
        <view class="notify-btn" @click="goNotifications">
          <app-icon name="bell" color="#FFFFFF" :size="28" :stroke-width="2.1" />
          <text v-if="unreadCount > 0" class="notify-dot"></text>
        </view>
      </view>
      <!-- 今日待处理订单数量快览 -->
      <view class="hero-stats">
        <text class="hero-label">今日待处理订单</text>
        <text class="hero-value">{{ todayPendingOrderCount }}</text>
      </view>
    </view>

    <!-- 快捷入口格：核验码扫描 + 数据看板 -->
    <view class="quick-grid">
        <view class="quick-item" @click="goVerify">
          <view class="quick-icon dark">
            <app-icon name="shield" color="#FFFFFF" :size="24" :stroke-width="2.1" />
          </view>
          <text class="quick-text">核验</text>
        </view>
        <view class="quick-item" @click="goDashboard">
          <view class="quick-icon light">
            <app-icon name="lightbulb" color="#0F172A" :size="24" :stroke-width="2.1" />
          </view>
          <text class="quick-text">数据看板</text>
        </view>
    </view>

    <!-- 门店管理菜单组：门店信息/理发师审核/项目设置/理发师管理/评价 -->
    <view class="section">
      <text class="section-title">门店管理</text>
      <view class="menu-card">
        <view class="menu-item" @click="goStoreSettings">
          <text class="menu-label">门店信息设置</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <!-- 理发师审核：待审核数量 > 0 时显示红色角标 -->
        <view class="menu-item" @click="goBarberApprovals">
          <view class="menu-row">
            <text class="menu-label">理发师审核</text>
            <text v-if="pendingBarberCount > 0" class="count-tag">{{ pendingBarberCount }}</text>
          </view>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <view class="menu-item" @click="goBarberServices">
          <text class="menu-label">理发师项目设置</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <view class="menu-item" @click="goBarberManage">
          <text class="menu-label">理发师管理</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <view class="menu-item" @click="goStoreReviews">
          <text class="menu-label">门店评价</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 订单处理菜单组：订单列表 + 售后管理 -->
    <view class="section">
      <text class="section-title">订单处理</text>
      <view class="menu-card">
        <view class="menu-item" @click="goOrders">
          <text class="menu-label">订单列表</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <view class="menu-item" @click="goAftersales">
          <text class="menu-label">售后管理</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>
    </view>

    <!-- 账号操作：账号设置 + 退出登录 -->
    <view class="section">
      <view class="menu-card">
        <view class="menu-item" @click="goAccountSettings">
          <text class="menu-label">账号设置</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <view class="menu-item danger" @click="handleLogout">
          <text class="menu-label danger-text">退出登录</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
// 店家管理入口页：跳转订单/看板/售后
import { authStore } from '../../../store/auth';
import { getUnreadCount } from '../../../api/notifications';
import { fetchBarberApplications } from '../../../api/barberApproval';
import { me } from '../../../api/auth';
import { fetchStoreDetail } from '../../../api/store';
import { callCloud } from '../../../api/client';
import { syncCriticalSystemNotifications, maybePromptNotificationPermissionOnFirstLogin } from '../../../utils/system-notify';

// Date -> YYYY-MM-DD（用于查询“今日待处理订单”）
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 管理员工作台首页
 * 汇总展示：
 * 1) 未读通知数量
 * 2) 待审核理发师数量
 * 3) 今日待处理订单数
 */
export default {
  data() {
    return {
      // 通知红点数量
      unreadCount: 0,
      // 待审核理发师数量
      pendingBarberCount: 0,
      // 今日待处理订单数（BOOKED/ARRIVED/IN_SERVICE）
      todayPendingOrderCount: 0,
      // 门店展示名称
      storeName: '当前门店'
    };
  },
  onShow() {
    setTimeout(() => {
      maybePromptNotificationPermissionOnFirstLogin();
    }, 350);
    setTimeout(() => {
      syncCriticalSystemNotifications({ force: true });
    }, 600);
    this.loadStoreName();
    this.loadUnreadCount();
    this.loadPendingBarberCount();
    this.loadTodayPendingOrderCount();
  },
  onLoad() {
    uni.$on('user-profile-updated', this.handleUserProfileUpdated);
  },
  onUnload() {
    uni.$off('user-profile-updated', this.handleUserProfileUpdated);
  },
  // 管理员管理页最小入口
  methods: {
    // 资料保存后实时同步本地用户信息（无需手动刷新）
    async handleUserProfileUpdated(user) {
      if (!user || typeof user !== 'object') return;
      authStore.setUser({
        ...(authStore.state.user || {}),
        ...user
      });
      await this.loadStoreName();
    },
    // 加载门店名称：优先本地用户信息，缺失时回源查询
    async loadStoreName() {
      try {
        let user = authStore.state.user || {};
        if (!user.storeId) {
          const latest = await me();
          if (latest) {
            user = latest;
            authStore.setUser(latest);
          }
        }
        const storeId = user && user.storeId;
        const storeName = user && user.storeName;
        if (storeName) {
          this.storeName = storeName;
          return;
        }
        if (!storeId) {
          this.storeName = '当前门店';
          return;
        }
        const detail = await fetchStoreDetail(storeId, { noCache: true });
        this.storeName = (detail && detail.name) || (detail && detail.store && detail.store.name) || storeId;
      } catch (err) {
        this.storeName = '当前门店';
      }
    },
    // 拉取未读通知数量
    async loadUnreadCount() {
      try {
        this.unreadCount = await getUnreadCount();
      } catch (err) {
        this.unreadCount = 0;
      }
    },
    // 拉取待审核理发师数量
    async loadPendingBarberCount() {
      try {
        const data = await fetchBarberApplications({ page: 1, pageSize: 1, status: 'PENDING' });
        this.pendingBarberCount = Number((data && data.pendingCount) || 0);
      } catch (err) {
        this.pendingBarberCount = 0;
      }
    },
    // 订单状态归一化（兼容中文）
    normalizeOrderStatus(status) {
      const map = {
        已预约: 'BOOKED',
        已到店: 'ARRIVED',
        服务中: 'IN_SERVICE',
        已完成: 'FINISHED',
        已取消: 'CANCELLED',
        爽约: 'NO_SHOW'
      };
      return map[status] || String(status || '').toUpperCase();
    },
    // 是否属于“待处理订单”状态
    isPendingOrderStatus(status) {
      const normalized = this.normalizeOrderStatus(status);
      return normalized === 'BOOKED' || normalized === 'ARRIVED' || normalized === 'IN_SERVICE';
    },
    // 统计今日待处理订单数量（分页拉取门店订单）
    async loadTodayPendingOrderCount() {
      const date = toDateString(new Date());
      const pageSize = 100;
      let page = 1;
      let count = 0;
      try {
        while (true) {
          const data = await callCloud('orders-store-list', { date, page, pageSize });
          const list = Array.isArray(data && data.list) ? data.list : [];
          count += list.filter((item) => this.isPendingOrderStatus(item && item.status)).length;
          if (list.length < pageSize) break;
          page += 1;
        }
        this.todayPendingOrderCount = count;
      } catch (err) {
        this.todayPendingOrderCount = 0;
      }
    },
    // 跳转消息列表
    goNotifications() {
      syncCriticalSystemNotifications({ force: true });
      uni.navigateTo({ url: '/pages/user/notifications/index' });
    },
    // 跳转核验页
    goVerify() {
      uni.navigateTo({ url: '/pages/admin/verify' });
    },
    // 跳转门店订单
    goOrders() {
      uni.navigateTo({ url: '/pages/admin/orders/index' });
    },
    // 跳转运营看板
    goDashboard() {
      uni.navigateTo({ url: '/pages/admin/dashboard' });
    },
    // 跳转售后管理
    goAftersales() {
      uni.navigateTo({ url: '/pages/admin/aftersales' });
    },
    // 跳转门店设置
    goStoreSettings() {
      uni.navigateTo({
        url: '/pages/admin/store-settings/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
    },
    // 跳转理发师审核
    goBarberApprovals() {
      uni.navigateTo({
        url: '/pages/admin/barber-approvals/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
    },
    goBarberServices() {
      uni.navigateTo({
        url: '/pages/admin/barber-services/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
    },
    goBarberManage() {
      uni.navigateTo({
        url: '/pages/admin/barbers/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
    },
    // 跳转门店评价页
    goStoreReviews() {
      uni.navigateTo({
        url: '/pages/admin/reviews/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
    },
    // 跳转账号设置（手机号绑定）
    goAccountSettings() {
      uni.navigateTo({
        url: '/pages/account/settings/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
    },
    // 退出登录
    handleLogout() {
      authStore.clear();
      uni.reLaunch({ url: '/pages/auth/login' });
    }
  }
};
</script>

<style scoped lang="scss">
.admin-page {
  min-height: 100vh;
  padding: 108rpx 20rpx 30rpx;
  background: #f8fafc;
}

.hero {
  background: #0f172a;
  border-radius: 30rpx;
  padding: 26rpx;
  color: #ffffff;
  box-shadow: 0 18rpx 36rpx rgba(15, 23, 42, 0.26);
}

.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.hero-kicker {
  display: block;
  color: rgba(255, 255, 255, 0.68);
  font-size: 22rpx;
}

.hero-title {
  display: block;
  margin-top: 8rpx;
  font-size: 38rpx;
  font-weight: 700;
}

.hero-store {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.78);
}

.hero-stats {
  border-top: 1rpx solid rgba(255, 255, 255, 0.14);
  padding-top: 14rpx;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.hero-label {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.75);
}

.hero-value {
  font-size: 44rpx;
  line-height: 1;
  font-weight: 800;
}

.notify-btn {
  width: 66rpx;
  height: 66rpx;
  border-radius: 33rpx;
  background: rgba(255, 255, 255, 0.16);
  border: 1rpx solid rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.notify-icon {
  font-size: 34rpx;
}

.notify-dot {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
  background: #ff4d4f;
}

.quick-grid {
  margin-top: 16rpx;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
}

.quick-item {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 22rpx;
  padding: 24rpx 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}

.quick-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 38rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-icon.dark {
  background: #0f172a;
}

.quick-icon.light {
  background: #f1f5f9;
}

.quick-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #0f172a;
}

.section {
  margin-top: 18rpx;
}

.section-title {
  display: block;
  font-size: 24rpx;
  color: #0f172a;
  font-weight: 700;
  margin: 0 8rpx 12rpx;
}

.menu-card {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 22rpx;
  overflow: hidden;
}

.menu-item {
  min-height: 90rpx;
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.menu-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.menu-label {
  font-size: 25rpx;
  color: #0f172a;
  font-weight: 600;
}

.menu-arrow {
  font-size: 36rpx;
  color: #cbd5e1;
}

.divider {
  margin-left: 20rpx;
  margin-right: 20rpx;
  height: 1rpx;
  background: #f1f5f9;
}

.count-tag {
  min-width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  padding: 0 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ff4d4f;
  color: #ffffff;
  font-size: 21rpx;
  font-weight: 700;
}

.danger-text {
  color: #ef4444;
}
</style>
