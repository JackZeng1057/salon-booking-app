<template>
  <!-- 用户设置首页根容器（无返回按钮，作为 TabBar 根页面） -->
  <view class="settings-page">
    <app-nav :showBack="false" :showTitle="true" title="设置" />

    <view class="settings-content">
      <!-- 账号功能菜单组：个人资料 / 绑定手机号 / 修改密码 / 我的评价 -->
      <view class="group-card">
        <!-- 个人资料入口：右侧展示当前昵称 -->
        <view class="group-item" @click="goProfile">
          <view class="item-left">
            <view class="item-icon"><app-icon name="user" color="#64748B" :size="22" :stroke-width="2.1" /></view>
            <text class="item-label">个人资料</text>
          </view>
          <view class="item-right">
            <text class="item-value">{{ displayName || '-' }}</text>
            <text class="item-arrow">›</text>
          </view>
        </view>

        <view class="divider"></view>

        <!-- 绑定手机号入口：右侧展示脱敏后的手机号 -->
        <view class="group-item" @click="goPhone">
          <view class="item-left">
            <view class="item-icon"><app-icon name="phone" color="#64748B" :size="22" :stroke-width="2.1" /></view>
            <text class="item-label">绑定手机号</text>
          </view>
          <view class="item-right">
            <text class="item-value">{{ phoneMasked }}</text>
            <text class="item-arrow">›</text>
          </view>
        </view>

        <view class="divider"></view>

        <!-- 修改密码入口（需先绑定手机号，密码重置通过验证码） -->
        <view class="group-item" @click="goPassword">
          <view class="item-left">
            <view class="item-icon"><app-icon name="shield" color="#64748B" :size="22" :stroke-width="2.1" /></view>
            <text class="item-label">修改密码</text>
          </view>
          <view class="item-right">
            <text class="item-arrow">›</text>
          </view>
        </view>

        <view class="divider"></view>

        <!-- 我的评价入口 -->
        <view class="group-item" @click="goReviews">
          <view class="item-left">
            <view class="item-icon"><app-icon name="file" color="#64748B" :size="22" :stroke-width="2.1" /></view>
            <text class="item-label">我的评价</text>
          </view>
          <view class="item-right">
            <text class="item-arrow">›</text>
          </view>
        </view>
      </view>

      <!-- 版本信息卡片 -->
      <view class="group-card">
        <view class="group-item">
          <view class="item-left">
            <view class="item-icon"><app-icon name="sliders" color="#64748B" :size="22" :stroke-width="2.1" /></view>
            <text class="item-label">版本</text>
          </view>
          <view class="item-right">
            <text class="item-value">v2.0</text>
          </view>
        </view>
      </view>

      <!-- 退出登录按钮（清除本地 token 并跳转登录页） -->
      <view class="logout-btn" @click="handleLogout">退出登录</view>
    </view>

    <!-- 底部 TabBar 组件 -->
    <bottom-tab-bar current="settings" />
  </view>
</template>

<script>
import { me } from '../../../api/auth';
import { authStore } from '../../../store/auth';
import BottomTabBar from '../../../components/bottom-tab-bar/bottom-tab-bar.vue';

/**
 * 用户端设置首页
 * 功能：资料入口、手机号入口、密码入口、我的评价入口、退出登录。
 */
export default {
  components: {
    BottomTabBar
  },
  data() {
    return {
      // 优先使用本地登录态，进入页面后再做远端刷新
      user: authStore.state.user || {}
    };
  },
  computed: {
    // 展示名：昵称优先，其次账号名
    displayName() {
      return this.user.name || this.user.username || '';
    },
    // 手机号脱敏展示
    phoneMasked() {
      const phone = String(this.user.phone || this.user.mobile || '');
      if (!phone) return '未绑定';
      return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
    }
  },
  onLoad() {
    this.hideNativeTabBar();
  },
  onShow() {
    this.hideNativeTabBar();
    this.loadMe();
  },
  methods: {
    // 本项目使用自定义底部栏，进入页面先隐藏系统 tabbar
    hideNativeTabBar() {
      try {
        uni.hideTabBar({ animation: false });
      } catch (e) {}
    },
    // 拉取用户最新资料并同步回 authStore
    async loadMe() {
      try {
        const data = await me();
        this.user = data || {};
        authStore.setUser(data || null);
      } catch (err) {}
    },
    // 跳转：个人资料
    goProfile() {
      uni.navigateTo({ url: '/pages/user/settings/profile' });
    },
    // 跳转：手机号绑定
    goPhone() {
      uni.navigateTo({ url: '/pages/user/settings/phone' });
    },
    // 跳转：密码修改
    goPassword() {
      uni.navigateTo({ url: '/pages/user/settings/password' });
    },
    // 跳转：我的评价
    goReviews() {
      uni.navigateTo({ url: '/pages/user/reviews/index' });
    },
    // 退出登录并清空本地身份状态
    handleLogout() {
      authStore.clear();
      uni.reLaunch({ url: '/pages/auth/login' });
    }
  }
};
</script>

<style scoped lang="scss">
.settings-page {
  min-height: 100vh;
  background: #f8fafc;
}

.settings-content {
  padding: 112rpx 20rpx 188rpx;
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.group-card {
  background: #ffffff;
  border-radius: 20rpx;
  border: 1rpx solid #e2e8f0;
  overflow: hidden;
}

.group-item {
  min-height: 94rpx;
  padding: 0 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.item-icon {
  width: 48rpx;
  height: 48rpx;
  border-radius: 999rpx;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-label {
  font-size: 25rpx;
  color: #0f172a;
  font-weight: 600;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.item-value {
  font-size: 22rpx;
  color: #94a3b8;
}

.item-arrow {
  font-size: 40rpx;
  line-height: 1;
  color: #cbd5e1;
}

.divider {
  margin-left: 74rpx;
  height: 1rpx;
  background: #f1f5f9;
}

.logout-btn {
  margin-top: 18rpx;
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
</style>
