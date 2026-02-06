<template>
  <view class="error-state">
    <text class="error-icon">😕</text>
    <text class="error-text">{{ text }}</text>
    <text v-if="detail" class="error-detail">{{ detail }}</text>
    <button class="retry-btn" type="default" @click="handleRetry">
      {{ retryText }}
    </button>
  </view>
</template>

<script>
// 简易错误状态组件：提示信息 + 重试按钮
export default {
  props: {
    text: {
      type: String,
      default: '加载失败'
    },
    detail: {
      type: String,
      default: ''
    },
    retryText: {
      type: String,
      default: '重试'
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
    font-size: 120rpx;
    margin-bottom: 24rpx;
  }
  
  .error-text {
    font-size: 30rpx;
    color: #666666;
    margin-bottom: 12rpx;
  }
  
  .error-detail {
    font-size: 24rpx;
    color: #999999;
    text-align: center;
    line-height: 1.6;
    margin-bottom: 32rpx;
  }
  
  .retry-btn {
    width: 240rpx;
    background-color: $uni-color-primary;
    color: #ffffff;
    border: none;
  }
}
</style>
