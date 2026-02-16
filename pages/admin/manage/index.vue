<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav :showBack="false" />
    <view class="page-actions">
      <view class="notify-btn" @click="goNotifications">
        <text class="notify-icon">🔔</text>
        <text v-if="unreadCount > 0" class="notify-dot"></text>
      </view>
    </view>
    <text class="title">店家管理</text>

    <view class="card">
      <text class="label">门店订单</text>
      <button class="btn" type="primary" @click="goOrders">查看订单</button>
    </view>

    <view class="card">
      <text class="label">运营看板</text>
      <button class="btn" type="primary" @click="goDashboard">查看看板</button>
    </view>

    <view class="card">
      <text class="label">售后管理</text>
      <button class="btn" type="primary" @click="goAftersales">处理售后</button>
    </view>

    <view class="card">
      <text class="label">门店信息设置</text>
      <button class="btn" type="primary" @click="goStoreSettings">编辑门店资料</button>
    </view>

    <view class="card">
      <view class="label-row">
        <text class="label">理发师审核</text>
        <text v-if="pendingBarberCount > 0" class="count-tag">{{ pendingBarberCount }}</text>
      </view>
      <button class="btn" type="primary" @click="goBarberApprovals">审核申请</button>
    </view>

    <view class="card">
      <text class="label">理发师项目设置</text>
      <button class="btn" type="primary" @click="goBarberServices">配置项目</button>
    </view>

    <view class="card logout-card">
      <text class="label">账号</text>
      <view class="account-actions">
        <button class="btn" type="default" @click="goAccountSettings">账号设置</button>
        <button class="btn" type="default" @click="handleLogout">退出登录</button>
      </view>
    </view>
  </view>
</template>

<script>
// 店家管理入口页：跳转订单/看板/售后
import { authStore } from '../../../store/auth';
import { getUnreadCount } from '../../../api/notifications';
import { fetchBarberApplications } from '../../../api/barberApproval';

export default {
  data() {
    return {
      unreadCount: 0,
      pendingBarberCount: 0
    };
  },
  onShow() {
    this.loadUnreadCount();
    this.loadPendingBarberCount();
  },
  // 管理员管理页最小入口
  methods: {
    async loadUnreadCount() {
      try {
        this.unreadCount = await getUnreadCount();
      } catch (err) {
        this.unreadCount = 0;
      }
    },
    async loadPendingBarberCount() {
      try {
        const data = await fetchBarberApplications({ page: 1, pageSize: 1, status: 'PENDING' });
        this.pendingBarberCount = Number((data && data.pendingCount) || 0);
      } catch (err) {
        this.pendingBarberCount = 0;
      }
    },
    goNotifications() {
      uni.navigateTo({ url: '/pages/user/notifications/index' });
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
    // 跳转账号设置（手机号绑定）
    goAccountSettings() {
      uni.navigateTo({
        url: '/pages/user/settings/index',
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
.page {
  min-height: 100vh;
  /* 顶部留白再下调一点，避免“店家管理”与返回按钮挤在一起 */
  padding: 96rpx 30rpx 30rpx;
  background-color: $uni-bg-color-grey;
}

.page-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8rpx;
  margin-bottom: 6rpx;
}

.notify-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: #ffffff;
  box-shadow: 0 6rpx 16rpx rgba(15, 23, 42, 0.12);
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
  top: 12rpx;
  right: 12rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
  background: #ff4d4f;
}

.title {
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  margin-bottom: 24rpx;
  padding-left: 6rpx;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
  box-shadow: $uni-shadow-base;
  margin-bottom: 20rpx;
}

.label {
  display: block;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
  margin-bottom: 12rpx;
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.label-row .label {
  margin-bottom: 0;
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
  font-size: 24rpx;
  font-weight: 600;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.account-actions {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
</style>
