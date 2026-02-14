<template>
  <view class="page">
    <app-nav />

    <view class="header">
      <text class="title">消息详情</text>
      <text class="subtitle">{{ formatTime(detail.createdAt) }}</text>
    </view>

    <view class="card">
      <view class="top-row">
        <text class="icon">{{ getNotificationIcon(detail.type) }}</text>
        <view class="main">
          <text class="msg-title">{{ detail.title || '系统通知' }}</text>
          <text class="msg-type">{{ formatType(detail.type) }}</text>
        </view>
      </view>

      <view class="content-box">
        <text class="content">{{ detail.content || '暂无内容' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      detail: {
        _id: '',
        title: '',
        content: '',
        type: '',
        createdAt: 0,
        relatedId: '',
        relatedType: ''
      }
    };
  },
  onLoad(options) {
    const payload = options && options.payload;
    if (!payload) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(payload));
      this.detail = { ...this.detail, ...(parsed || {}) };
    } catch (err) {
      uni.showToast({ title: '消息解析失败', icon: 'none' });
    }
  },
  methods: {
    getNotificationIcon(type) {
      const normalized = String(type || '').toLowerCase();
      const iconMap = {
        booking_success: '✅',
        reschedule: '🔄',
        cancel: '❌',
        no_show: '⚠️',
        arrival_reminder: '🔔',
        service_start: '🛡️',
        service_finish: '✨'
      };
      return iconMap[normalized] || '📬';
    },
    formatType(type) {
      const normalized = String(type || '').toLowerCase();
      const typeMap = {
        booking_success: '预约通知',
        reschedule: '改期通知',
        cancel: '取消通知',
        no_show: '爽约通知',
        arrival_reminder: '提醒通知',
        service_start: '服务通知',
        service_finish: '服务通知'
      };
      return typeMap[normalized] || '系统通知';
    },
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d} ${h}:${mm}`;
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 120rpx 30rpx 30rpx;
  background: $uni-bg-color-grey;
}

.header {
  margin-bottom: 24rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  line-height: 1.25;
  padding-left: 6rpx;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  padding-left: 6rpx;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  box-shadow: $uni-shadow-base;
  padding: 28rpx;
}

.top-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.icon {
  font-size: 50rpx;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.msg-title {
  color: $uni-text-color;
  font-size: 34rpx;
  font-weight: 700;
}

.msg-type {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.content-box {
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx;
}

.content {
  color: $uni-text-color;
  font-size: $uni-font-size-base;
  line-height: 1.7;
}
</style>
