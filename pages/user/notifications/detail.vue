<template>
  <view class="page">
    <app-nav :showTitle="true" title="消息详情" />
    <view class="hero-card">
      <text class="hero-subtitle">{{ formatTime(detail.createdAt) }}</text>
    </view>

    <view class="card">
      <view class="top-row">
        <view class="icon-wrap">
          <app-icon
            :name="getNotificationIconMeta(detail.type).name"
            :color="getNotificationIconMeta(detail.type).color"
            :size="56"
            :stroke-width="2.2"
          />
        </view>
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
/**
 * 消息详情页
 * 通过路由参数 payload（URL 编码的 JSON 字符串）接收消息对象并展示。
 */
export default {
  data() {
    return {
      // 详情默认结构，避免模板取值时出现 undefined
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
    // payload 由消息列表页传入，内容为 encodeURIComponent(JSON.stringify(detail))
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
    // 根据通知类型返回图标名称与颜色
    getNotificationIconMeta(type) {
      const normalized = String(type || '').toLowerCase();
      const iconMap = {
        booking_success: { name: 'calendar', color: '#f59e0b' },
        reschedule: { name: 'refresh', color: '#2563eb' },
        cancel: { name: 'x-circle', color: '#ef4444' },
        no_show: { name: 'alert-triangle', color: '#f59e0b' },
        arrival_reminder: { name: 'bell', color: '#14b8a6' },
        service_start: { name: 'shield', color: '#0f172a' },
        service_finish: { name: 'sparkles', color: '#8b5cf6' }
      };
      return iconMap[normalized] || { name: 'mailbox', color: '#64748b' };
    },
    // 通知类型映射为中文展示文案
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
    // 时间戳格式化为 yyyy-MM-dd HH:mm
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
  padding: calc(118rpx + 20px) 28rpx 30rpx;
  background: #f8fafc;
}

.hero-card {
  border-radius: 28rpx;
  padding: 24rpx 26rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  box-shadow: 0 8rpx 18rpx rgba(15, 23, 42, 0.06);
  margin-bottom: 18rpx;
}

.hero-subtitle {
  display: block;
  color: #475569;
  font-size: 24rpx;
  line-height: 1.5;
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

.icon-wrap {
  width: 96rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
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
