<template>
  <view class="page">
    <app-nav :showTitle="true" title="提交售后" />
    <view class="hero-card">
      <text class="hero-subtitle">描述问题后提交，门店将尽快处理</text>
    </view>

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

/**
 * 提交售后页面（用户侧）
 * 入口参数：orderId
 * 流程：选择类型 -> 填写描述 -> 提交售后申请
 */
export default {
  data() {
    return {
      // 当前订单 ID（由路由传入）
      orderId: '',
      // 售后类型选项
      typeOptions: [
        { label: '服务问题', value: 'SERVICE' },
        { label: '迟到/爽约', value: 'NO_SHOW' },
        { label: '其他', value: 'OTHER' }
      ],
      // 当前选中类型索引
      typeIndex: 0,
      // 描述内容
      content: '',
      // 提交中状态
      loading: false
    };
  },
  onLoad(options) {
    this.orderId = (options && options.orderId) || '';
  },
  methods: {
    // 切换售后类型
    onTypeChange(e) {
      this.typeIndex = Number(e.detail.value || 0);
    },
    // 提交售后申请
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
  padding: calc(118rpx + 20px) 28rpx 30rpx;
  background: #f8fafc;
}

.hero-card {
  border-radius: 28rpx;
  padding: 24rpx 26rpx;
  background: linear-gradient(140deg, #0f172a, #1e293b);
  box-shadow: 0 14rpx 30rpx rgba(15, 23, 42, 0.16);
  margin-bottom: 18rpx;
}

.hero-subtitle {
  display: block;
  color: rgba(255, 255, 255, 0.82);
  font-size: 24rpx;
  line-height: 1.5;
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
