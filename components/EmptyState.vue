<template>
  <view class="empty-state">
    <text class="empty-icon">{{ icon }}</text>
    <text class="empty-text">{{ text }}</text>
    <text v-if="subtext" class="empty-subtext">{{ subtext }}</text>
    <button v-if="buttonText" class="empty-btn" type="primary" @click="handleClick">
      {{ buttonText }}
    </button>
  </view>
</template>

<script>
// 简易空状态组件：图标 + 文案 + 可选按钮
export default {
  props: {
    icon: {
      type: String,
      default: '📭'
    },
    text: {
      type: String,
      default: '暂无数据'
    },
    subtext: {
      type: String,
      default: ''
    },
    buttonText: {
      type: String,
      default: ''
    }
  },
  methods: {
    handleClick() {
      this.$emit('click');
    }
  }
};
</script>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 60rpx;
  
  .empty-icon {
    font-size: 120rpx;
    margin-bottom: 24rpx;
    opacity: 0.8;
  }
  
  .empty-text {
    font-size: 30rpx;
    color: #666666;
    margin-bottom: 12rpx;
  }
  
  .empty-subtext {
    font-size: 24rpx;
    color: #999999;
    text-align: center;
    line-height: 1.6;
    margin-bottom: 32rpx;
  }
  
  .empty-btn {
    width: 240rpx;
  }
}
</style>
