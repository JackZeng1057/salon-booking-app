<template>
  <view class="verify-page">
    <app-nav :showTitle="true" title="核验" />

    <view class="input-card">
      <text class="label">输入核验码</text>
      <input
        class="input"
        :value="verifyCode"
        type="text"
        inputmode="numeric"
        maxlength="6"
        :focus="isFocus"
        confirm-type="done"
        placeholder="请输入 6 位核验码"
        @input="onInput"
        @click="ensureFocus"
        @blur="isFocus = false"
        @confirm="handleVerify"
      />
      <button class="submit" type="primary" :loading="loading" @click="handleVerify">核验</button>
    </view>

    <view v-if="order" class="result-card">
      <view class="row">
        <text class="label">订单号</text>
        <text class="value">{{ order.orderNo }}</text>
      </view>
      <view class="row">
        <text class="label">状态</text>
        <text class="value">{{ formatOrderStatus(order.status) }}</text>
      </view>
      <view class="row">
        <text class="label">时间</text>
        <text class="value">{{ order.date }} {{ order.startTime }}-{{ order.endTime }}</text>
      </view>
    </view>
  </view>
</template>

<script>
// 到店核验页：输入核验码并返回订单信息
import { callCloud } from '../../api/client';
import { formatOrderStatus } from '../../utils/status';

export default {
  data() {
    return {
      // 输入的核验码
      verifyCode: '',
      // 控制输入框聚焦，保证点击容器也能唤起键盘
      isFocus: false,
      loading: false,
      // 核验成功后展示的订单信息
      order: null
    };
  },
  methods: {
    formatOrderStatus,
    // 强制重新聚焦输入框（解决部分机型点击失焦问题）
    ensureFocus() {
      this.isFocus = false;
      this.$nextTick(() => {
        this.isFocus = true;
      });
    },
    // 仅允许数字输入，截断到 6 位
    onInput(e) {
      const val = (e && e.detail && e.detail.value) || '';
      this.verifyCode = val.replace(/\D+/g, '').slice(0, 6);
    },
    // 核验订单
    async handleVerify() {
      if (!this.verifyCode.trim()) {
        uni.showToast({ title: '请输入核验码', icon: 'none' });
        return;
      }
      this.loading = true;
      try {
        const res = await callCloud('orders-verify', { verifyCode: this.verifyCode.trim() });
        this.order = res && res.order;
        uni.showToast({ title: '核验成功', icon: 'success' });
      } catch (err) {
        if (err && err.code === 422) {
          uni.showToast({ title: '当前状态不允许核验', icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '核验失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped lang="scss">
.verify-page {
  min-height: 100vh;
  padding: 112rpx 20rpx 30rpx;
  background: #f8fafc;
}

.input-card,
.result-card {
  margin-top: 26rpx;
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
}

.label {
  display: block;
  font-size: 22rpx;
  color: #64748b;
  margin-bottom: 12rpx;
}

.input {
  background: #f8fafc;
  border-radius: 14rpx;
  padding: 24rpx 20rpx;
  font-size: 34rpx;
  color: #0f172a;
  margin-bottom: 16rpx;
  min-height: 84rpx;
  line-height: 84rpx;
}

.submit {
  margin-top: 8rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.value {
  color: #0f172a;
  font-size: 25rpx;
}
</style>
