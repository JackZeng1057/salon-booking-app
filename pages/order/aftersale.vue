<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <text class="title">提交售后</text>

    <view class="card">
      <text class="label">类型</text>
      <picker :range="typeOptions" range-key="label" :value="typeIndex" @change="onTypeChange">
        <view class="input">{{ typeOptions[typeIndex].label }}</view>
      </picker>

      <text class="label">描述</text>
      <textarea class="textarea" v-model="content" placeholder="请输入售后描述"></textarea>

      <button class="submit" type="primary" :loading="loading" @click="handleSubmit">提交售后</button>
    </view>
  </view>
</template>

<script>
// 售后申请页：选择类型并提交描述
import { createAftersale } from '../../api/order';

export default {
  data() {
    return {
      orderId: '',
      typeOptions: [
        { label: '服务问题', value: 'SERVICE' },
        { label: '迟到/爽约', value: 'NO_SHOW' },
        { label: '其他', value: 'OTHER' }
      ],
      typeIndex: 0,
      content: '',
      loading: false
    };
  },
  onLoad(options) {
    this.orderId = (options && options.orderId) || '';
  },
  methods: {
    onTypeChange(e) {
      this.typeIndex = Number(e.detail.value || 0);
    },
    async handleSubmit() {
      if (!this.orderId) return;
      this.loading = true;
      try {
        const type = this.typeOptions[this.typeIndex].value;
        await createAftersale({
          orderId: this.orderId,
          type,
          content: this.content
        });
        uni.showToast({ title: '提交成功', icon: 'success' });
        setTimeout(() => {
          uni.navigateBack();
        }, 400);
      } catch (err) {
        uni.showToast({ title: err.message || '提交失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  /* 顶部留白稍微加大一些，避免标题紧贴状态栏（与其他业务页保持一致） */
  padding: 120rpx 30rpx 30rpx;
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
}

.label {
  display: block;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
  margin-bottom: 12rpx;
}

.input {
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx 24rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  margin-bottom: 16rpx;
}

.textarea {
  min-height: 200rpx;
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  margin-bottom: 16rpx;
  width: 100%;
  box-sizing: border-box;
}

.submit {
  margin-top: 8rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
