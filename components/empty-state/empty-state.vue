<template>
  <view class="empty-state">
    <view class="empty-icon">{{ icon }}</view>
    <text class="empty-title">{{ title }}</text>
    <text v-if="description" class="empty-desc">{{ description }}</text>
    <button v-if="buttonText" class="empty-btn" type="primary" @click="handleClick">
      {{ buttonText }}
    </button>
  </view>
</template>

<script>
// 标准空态组件：图标 + 标题 + 描述 + 按钮
export default {
  name: 'EmptyState',
  props: {
    // 图标
    icon: {
      type: String,
      default: '📭'
    },
    // 标题
    title: {
      type: String,
      default: '暂无数据'
    },
    // 描述
    description: {
      type: String,
      default: ''
    },
    // 按钮文字
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
    font-size: 160rpx;
    margin-bottom: 32rpx;
    opacity: 0.8;
  }
  
  .empty-title {
    font-size: 32rpx;
    font-weight: 600;
    color: $uni-text-color;
    margin-bottom: 16rpx;
  }
  
  .empty-desc {
    font-size: 26rpx;
    color: $uni-text-color-grey;
    text-align: center;
    line-height: 1.6;
    margin-bottom: 32rpx;
  }
  
  .empty-btn {
    width: 240rpx;
    height: 72rpx;
    line-height: 72rpx;
    padding: 0;
  }
}
</style>
