<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav :showBack="false" />
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

    <view class="card logout-card">
      <text class="label">账号</text>
      <button class="btn" type="default" @click="handleLogout">退出登录</button>
    </view>
  </view>
</template>

<script>
// 店家管理入口页：跳转订单/看板/售后
import { authStore } from '../../../store/auth';

export default {
  // 管理员管理页最小入口
  methods: {
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
</style>
