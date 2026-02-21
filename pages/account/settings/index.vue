<template>
  <view class="page">
    <app-nav :showTitle="true" title="账号设置" />

    <view class="content">
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
    </view>
  </view>
</template>

<script>
import { me } from '../../../api/auth';

export default {
  data() {
    return {
      user: {}
    };
  },
  computed: {
    displayName() {
      return this.user.name || this.user.username || '';
    },
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
    async loadMe() {
      try {
        this.user = (await me()) || {};
      } catch (e) {}
    },
    goProfile() {
      uni.navigateTo({ url: '/pages/user/settings/profile' });
    },
    goPhone() {
      uni.navigateTo({ url: '/pages/user/settings/phone' });
    },
    goPassword() {
      uni.navigateTo({ url: '/pages/user/settings/password' });
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
</style>
