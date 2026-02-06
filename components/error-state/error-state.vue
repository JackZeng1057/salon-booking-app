<template>
  <view class="error-state">
    <view class="error-icon">{{ icon }}</view>
    <text class="error-title">{{ title }}</text>
    <text v-if="description" class="error-desc">{{ description }}</text>
    <button class="error-btn" @click="handleRetry">
      {{ buttonText }}
    </button>
  </view>
</template>

<script>
// 标准错误组件：标题/描述 + 重试按钮
export default {
  name: 'ErrorState',
  props: {
    // 图标
    icon: {
      type: String,
      default: '⚠️'
    },
    // 标题
    title: {
      type: String,
      default: '加载失败'
    },
    // 描述
    description: {
      type: String,
      default: '请检查网络连接'
    },
    // 按钮文字
    buttonText: {
      type: String,
      default: '重新加载'
    }
  },
  methods: {
    handleRetry() {
      this.$emit('retry');
    }
  }
};
</script>

<style scoped lang="scss">
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 60rpx;
  
  .error-icon {
    font-size: 160rpx;
    margin-bottom: 32rpx;
    opacity: 0.8;
  }
  
  .error-title {
    font-size: 32rpx;
    font-weight: 600;
    color: $uni-text-color;
    margin-bottom: 16rpx;
  }
  
  .error-desc {
    font-size: 26rpx;
    color: $uni-text-color-grey;
    text-align: center;
    line-height: 1.6;
    margin-bottom: 32rpx;
  }
  
  .error-btn {
    width: 240rpx;
    height: 72rpx;
    line-height: 72rpx;
    padding: 0;
    background-color: $uni-bg-color-grey;
    color: $uni-text-color;
    border: 2rpx solid $uni-border-color;
    
    &:active {
      background-color: $uni-bg-color-hover;
    }
  }
}
</style>
