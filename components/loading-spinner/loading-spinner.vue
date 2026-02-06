<template>
  <view class="loading-spinner" :class="{ fullscreen: fullscreen }">
    <view class="spinner" :class="sizeClass"></view>
    <text v-if="text" class="loading-text">{{ text }}</text>
  </view>
</template>

<script>
// 通用加载指示器：支持尺寸与全屏遮罩
export default {
  name: 'LoadingSpinner',
  props: {
    // 是否全屏显示
    fullscreen: {
      type: Boolean,
      default: false
    },
    // 加载文字
    text: {
      type: String,
      default: ''
    },
    // 尺寸：小/中/大（small/medium/large）
    size: {
      type: String,
      default: 'medium'
    }
  },
  computed: {
    sizeClass() {
      return `spinner-${this.size}`;
    }
  }
};
</script>

<style scoped lang="scss">
.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 0;
  
  &.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.9);
    z-index: 9999;
  }
  
  .spinner {
    border-radius: 50%;
    border-style: solid;
    border-color: $uni-border-color;
    border-top-color: $uni-color-primary;
    animation: spin 0.8s linear infinite;
    
    &.spinner-small {
      width: 32rpx;
      height: 32rpx;
      border-width: 3rpx;
    }
    
    &.spinner-medium {
      width: 48rpx;
      height: 48rpx;
      border-width: 4rpx;
    }
    
    &.spinner-large {
      width: 72rpx;
      height: 72rpx;
      border-width: 6rpx;
    }
  }
  
  .loading-text {
    margin-top: 24rpx;
    font-size: $uni-font-size-base;
    color: $uni-text-color-grey;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
