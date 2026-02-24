<template>
  <!-- 到店核验页根容器：管理员录入 6 位核验码，确认顾客已到店 -->
  <view class="verify-page">
    <!-- 顶部导航栏 -->
    <app-nav :showTitle="true" title="核验" />

    <!-- 核验码输入卡片 -->
    <view class="input-card">
      <text class="label">输入核验码</text>
      <!--
        6 位数字输入框设计要点：
        - inputmode="numeric" 在 H5 端唤起数字键盘
        - maxlength="6" 限制最长 6 位
        - :focus="isFocus" 通过 isFocus 变量控制聚焦，解决部分机型点击失焦问题
        - @input 过滤非数字字符，保证输入内容始终为纯数字
      -->
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
      <!-- 核验按钮：加载中时禁用，防止重复提交 -->
      <button class="submit" type="primary" :loading="loading" @click="handleVerify">核验</button>
    </view>

    <!-- 核验结果卡片（核验成功后显示订单快照，供现场二次确认） -->
    <view v-if="order" class="result-card">
      <!-- 订单号 -->
      <view class="row">
        <text class="label">订单号</text>
        <text class="value">{{ order.orderNo }}</text>
      </view>
      <!-- 当前订单状态（核验成功后变为 ARRIVED） -->
      <view class="row">
        <text class="label">状态</text>
        <text class="value">{{ formatOrderStatus(order.status) }}</text>
      </view>
      <!-- 预约时间 -->
      <view class="row">
        <text class="label">时间</text>
        <text class="value">{{ order.date }} {{ order.startTime }}-{{ order.endTime }}</text>
      </view>
    </view>
  </view>
</template>

<script>
// 到店核验页：输入核验码并返回订单信息
// 使用场景：
// - 前台到店时由店员输入 6 位核验码；
// - 核验成功后订单进入可开始服务状态。
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
      // 基础校验：空值不提交，避免无效请求。
      if (!this.verifyCode.trim()) {
        uni.showToast({ title: '请输入核验码', icon: 'none' });
        return;
      }
      this.loading = true;
      try {
        // 调用云函数进行核验，成功后返回订单快照用于现场确认。
        const res = await callCloud('orders-verify', { verifyCode: this.verifyCode.trim() });
        this.order = res && res.order;
        uni.showToast({ title: '核验成功', icon: 'success' });
      } catch (err) {
        // 422 常见于“订单状态不允许核验”（如已取消/已完成）。
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
