<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <text class="title">核验到店</text>

    <view class="card">
      <text class="label">核验码</text>
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

    <view v-if="order" class="card">
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
    // 核验到店
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
  margin-bottom: 20rpx;
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
  padding: 26rpx 24rpx;
  font-size: $uni-font-size-lg;
  color: $uni-text-color;
  margin-bottom: 16rpx;
  min-height: 88rpx;
  line-height: 88rpx;
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

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.value {
  color: $uni-text-color;
  font-size: $uni-font-size-base;
}
</style>
