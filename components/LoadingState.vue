<template>
  <view class="loading-state">
    <view class="spinner"></view>
    <text class="loading-text">{{ text }}</text>
  </view>
</template>

<script>
// 简易加载状态组件：旋转指示 + 文案
export default {
  props: {
    text: {
      type: String,
      default: '加载中...'
    }
  }
};
</script>

<style scoped lang="scss">
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
  
  .spinner {
    width: 60rpx;
    height: 60rpx;
    border: 6rpx solid #e8e8e8;
    border-top-color: $uni-color-primary;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 24rpx;
  }
  
  .loading-text {
    font-size: 28rpx;
    color: #999999;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
