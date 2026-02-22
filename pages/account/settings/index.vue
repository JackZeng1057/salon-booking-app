<template>
  <view class="page">
    <app-nav :showBack="!isBarberRole" :showTitle="true" title="账号设置" />

    <view class="content" :class="{ 'content--with-tab': isBarberRole }">
      <view class="summary-card">
        <text class="name">{{ displayName || '-' }}</text>
        <text class="meta">手机号：{{ phoneMasked }}</text>
      </view>

      <view class="menu-card">
        <view class="menu-item" @click="goProfile">
          <text class="menu-title">个人资料</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <view class="menu-item" @click="goPhone">
          <text class="menu-title">绑定手机号</text>
          <text class="menu-arrow">›</text>
        </view>
        <view class="divider"></view>
        <view class="menu-item" @click="goPassword">
          <text class="menu-title">修改密码</text>
          <text class="menu-arrow">›</text>
        </view>
      </view>

      <view class="logout-btn" @click="handleLogout">退出登录</view>
    </view>

    <view v-if="isBarberRole" class="bottom-tab">
      <view class="bar-item" @click="goBarberSchedule">
        <app-icon name="calendar" color="#64748B" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>排班</text>
      </view>
      <view class="bar-item" @click="goBarberOrders">
        <app-icon name="file" color="#64748B" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>订单</text>
      </view>
      <view class="bar-item active">
        <app-icon name="user" color="#10B981" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>我的</text>
      </view>
    </view>
  </view>
</template>

<script>
import { me } from '../../../api/auth';
import { authStore } from '../../../store/auth';

/**
 * 账号设置页（理发师/通用账号）
 * 能力：
 * 1) 展示当前账号摘要信息
 * 2) 跳转个人资料、手机绑定、密码修改页
 * 3) 处理退出登录
 */
export default {
  data() {
    return {
      // 登录用户详情（onShow 时拉取最新）
      user: {}
    };
  },
  computed: {
    // 是否为理发师角色：用于控制底部栏形态与返回按钮展示
    isBarberRole() {
      const role = String((this.user && this.user.role) || authStore.state.role || '').toLowerCase();
      return role === 'barber';
    },
    // 理发师端顶部昵称与“用户名”保持一致
    displayName() {
      return this.user.username || this.user.name || '';
    },
    // 手机号脱敏显示
    phoneMasked() {
      const phone = String(this.user.phone || this.user.mobile || '');
      if (!phone) return '未绑定';
      return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
    }
  },
  onShow() {
    this.loadMe();
  },
  methods: {
    // 获取最新用户信息，确保设置页展示与服务端一致
    async loadMe() {
      try {
        this.user = (await me()) || {};
      } catch (e) {}
    },
    // 跳转：个人资料
    goProfile() {
      uni.navigateTo({ url: '/pages/user/settings/profile' });
    },
    // 跳转：绑定手机号
    goPhone() {
      uni.navigateTo({ url: '/pages/user/settings/phone' });
    },
    // 跳转：修改密码
    goPassword() {
      uni.navigateTo({ url: '/pages/user/settings/password' });
    },
    // 理发师端快捷跳转：排班页
    goBarberSchedule() {
      uni.redirectTo({ url: '/pages/barber/schedule/index' });
    },
    // 理发师端快捷跳转：订单页
    goBarberOrders() {
      uni.redirectTo({ url: '/pages/barber/orders/index' });
    },
    // 清空登录态并回到登录页
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
  background: #f8fafc;
}

.content {
  padding: 112rpx 20rpx 24rpx;
  margin-top: 20px;
}

.content--with-tab {
  padding-bottom: 170rpx;
}

.summary-card {
  background: #0f172a;
  border-radius: 20rpx;
  padding: 20rpx;
  margin-bottom: 14rpx;
}

.name {
  display: block;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 700;
}

.meta {
  display: block;
  margin-top: 8rpx;
  color: rgba(255, 255, 255, 0.72);
  font-size: 22rpx;
}

.menu-card {
  background: #ffffff;
  border-radius: 20rpx;
  border: 1rpx solid #e2e8f0;
  overflow: hidden;
}

.menu-item {
  min-height: 92rpx;
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.menu-title {
  color: #0f172a;
  font-size: 26rpx;
  font-weight: 600;
}

.menu-arrow {
  color: #cbd5e1;
  font-size: 38rpx;
}

.divider {
  margin: 0 20rpx;
  height: 1rpx;
  background: #f1f5f9;
}

.logout-btn {
  margin-top: 16rpx;
  height: 84rpx;
  border-radius: 18rpx;
  border: 1rpx solid #fecaca;
  background: #ffffff;
  color: #ef4444;
  font-size: 28rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bottom-tab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 96rpx;
  background: #ffffff;
  border-top: 1rpx solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 21;
}

.bar-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  color: #64748b;
  font-size: 22rpx;
}

.bar-item.active {
  color: #10b981;
}
</style>
