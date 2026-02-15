<template>
  <view class="page">
    <app-nav />

    <view class="header">
      <text class="title">账号设置</text>
      <text class="subtitle">请选择要维护的账号信息</text>
    </view>

    <view class="profile-card">
      <image v-if="user.avatar" class="avatar" :src="user.avatar" mode="aspectFill" />
      <view v-else class="avatar placeholder">{{ (displayName || 'U').slice(0, 1).toUpperCase() }}</view>
      <view class="profile-info">
        <text class="name">{{ displayName || '-' }}</text>
        <text class="meta">{{ accountName || '-' }}</text>
      </view>
    </view>

    <view class="menu-card">
      <view class="menu-item" @click="goProfile">
        <view class="menu-left">
          <text class="menu-title">修改账号名/头像</text>
          <text class="menu-desc">更新登录账号名与头像</text>
        </view>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="goPhone">
        <view class="menu-left">
          <text class="menu-title">绑定/修改手机号</text>
          <text class="menu-desc">用于账号安全与找回密码</text>
        </view>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="goPassword">
        <view class="menu-left">
          <text class="menu-title">修改密码</text>
          <text class="menu-desc">通过手机号验证码修改</text>
        </view>
        <text class="menu-arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script>
import { me } from '../../../api/auth';
import { authStore } from '../../../store/auth';

export default {
  data() {
    return {
      user: authStore.state.user || {}
    };
  },
  computed: {
    displayName() {
      return this.user.name || this.user.username || '';
    },
    accountName() {
      return this.user.username || '';
    }
  },
  onShow() {
    this.loadMe();
  },
  methods: {
    async loadMe() {
      try {
        const data = await me();
        this.user = data || {};
        authStore.setUser(data || null);
      } catch (err) {
        uni.showToast({ title: err.message || '获取用户失败', icon: 'none' });
      }
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
  padding: 120rpx 30rpx 30rpx;
  background: $uni-bg-color-grey;
}

.header {
  margin-bottom: 24rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  line-height: 1.25;
  padding-left: 6rpx;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-base;
  padding-left: 6rpx;
  line-height: 1.5;
}

.profile-card {
  background: linear-gradient(145deg, $uni-color-primary, $uni-color-primary-light);
  border-radius: $uni-border-radius-lg;
  box-shadow: $uni-shadow-base;
  padding: 24rpx;
  margin-bottom: 24rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.avatar {
  width: 92rpx;
  height: 92rpx;
  border-radius: 46rpx;
  flex-shrink: 0;
}

.avatar.placeholder {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  font-weight: 700;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.name {
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 700;
}

.meta {
  color: rgba(255, 255, 255, 0.82);
  font-size: $uni-font-size-sm;
}

.menu-card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  box-shadow: $uni-shadow-base;
}

.menu-item {
  min-height: 120rpx;
  padding: 22rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1rpx solid #f1f3f6;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-left {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.menu-title {
  color: $uni-text-color;
  font-size: $uni-font-size-base;
  font-weight: 600;
}

.menu-desc {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.menu-arrow {
  color: $uni-text-color-placeholder;
  font-size: 46rpx;
  line-height: 1;
}
</style>
