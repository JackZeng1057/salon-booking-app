<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <!-- 头部 -->
    <view class="header">
      <text class="title">消息通知</text>
      <view v-if="unreadCount > 0" class="unread-badge">{{ unreadCount }}</view>
      <text v-if="notifications.length > 0" class="mark-all-btn" @click="markAllRead">全部已读</text>
    </view>

    <!-- 筛选标签 -->
    <view class="filter-tabs">
      <view 
        class="filter-tab"
        :class="{ active: !unreadOnly }"
        @click="unreadOnly = false; loadNotifications(true)"
      >
        全部
      </view>
      <view 
        class="filter-tab"
        :class="{ active: unreadOnly }"
        @click="unreadOnly = true; loadNotifications(true)"
      >
        未读
      </view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading && notifications.length === 0" class="status-box">
      <view class="spinner"></view>
      <text>加载中...</text>
    </view>

    <!-- 空状态 -->
    <view v-else-if="notifications.length === 0" class="status-box">
      <text class="empty-icon">📭</text>
      <text class="empty-text">{{ unreadOnly ? '暂无未读消息' : '暂无消息' }}</text>
    </view>

    <!-- 通知列表 -->
    <view v-else class="notifications-list">
      <view 
        v-for="notif in notifications" 
        :key="notif._id"
        class="notification-card"
        :class="{ unread: !notif.isRead }"
        @click="handleNotificationClick(notif)"
      >
        <view class="notif-icon">{{ getNotificationIcon(notif.type) }}</view>
        <view class="notif-content">
          <view class="notif-header">
            <text class="notif-title">{{ notif.title }}</text>
            <text v-if="!notif.isRead" class="unread-dot"></text>
          </view>
          <text class="notif-text">{{ notif.content }}</text>
          <text class="notif-time">{{ formatTime(notif.createdAt) }}</text>
        </view>
        <view class="notif-arrow">›</view>
      </view>

      <!-- 加载更多 -->
      <view v-if="hasMore" class="load-more" @click="loadMore">
        <text>{{ loadingMore ? '加载中...' : '加载更多' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
// 通知列表页：筛选未读、标记已读与跳转
import { callCloud } from '../../../api/client';

export default {
  data() {
    return {
      notifications: [],
      unreadCount: 0,
      unreadOnly: false,
      loading: false,
      loadingMore: false,
      page: 1,
      pageSize: 20,
      hasMore: true
    };
  },
  onLoad() {
    this.loadNotifications();
  },
  onShow() {
    // 每次显示时刷新
    this.loadNotifications(true);
  },
  methods: {
    // 加载通知列表：支持刷新与分页
    async loadNotifications(refresh = false) {
      if (refresh) {
        this.page = 1;
        this.notifications = [];
        this.hasMore = true;
      }

      this.loading = true;
      try {
        const res = await callCloud('notifications-list', {
          unreadOnly: this.unreadOnly,
          page: this.page,
          pageSize: this.pageSize
        });

        const newNotifications = res.list || [];
        if (refresh) {
          this.notifications = newNotifications;
        } else {
          this.notifications = [...this.notifications, ...newNotifications];
        }

        this.unreadCount = res.unreadCount || 0;
        this.hasMore = newNotifications.length >= this.pageSize;
      } catch (err) {
        uni.showToast({
          title: err.message || '加载失败',
          icon: 'none'
        });
      } finally {
        this.loading = false;
      }
    },
    // 加载更多：基于分页追加
    loadMore() {
      if (this.loadingMore || !this.hasMore) return;
      this.loadingMore = true;
      this.page++;
      this.loadNotifications().finally(() => {
        this.loadingMore = false;
      });
    },
    // 标记全部已读
    async markAllRead() {
      try {
        await callCloud('notifications-mark-read', { markAll: true });
        uni.showToast({ title: '已全部标记为已读', icon: 'success' });
        this.loadNotifications(true);
      } catch (err) {
        uni.showToast({
          title: err.message || '操作失败',
          icon: 'none'
        });
      }
    },
    // 点击通知：先标记已读，再跳转相关页面
    async handleNotificationClick(notif) {
      // 标记为已读
      if (!notif.isRead) {
        try {
          await callCloud('notifications-mark-read', { notificationId: notif._id });
          notif.isRead = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        } catch (err) {
          console.error('mark read error:', err);
        }
      }

      // 跳转到相关页面（目前仅订单通知支持跳转）
      if (notif.relatedType === 'order' && notif.relatedId) {
        uni.navigateTo({
          url: `/pages/order/detail?id=${notif.relatedId}`
        });
      }
    },
    // 获取通知图标
    getNotificationIcon(type) {
      const iconMap = {
        'booking_success': '✅',
        'reschedule': '🔄',
        'cancel': '❌',
        'no_show': '⚠️',
        'arrival_reminder': '⏰',
        'service_start': '💇',
        'service_finish': '✨'
      };
      return iconMap[type] || '📬';
    },
    // 格式化时间
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      // 一分钟内
      if (diff < 60000) return '刚刚';
      // 一小时内
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
      // 今天
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `今天 ${hours}:${minutes}`;
      }
      // 昨天
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();
      if (isYesterday) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `昨天 ${hours}:${minutes}`;
      }
      
      // 其他日期
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding-top: 80rpx;
  background-color: $uni-bg-color-grey;
}

.header {
  display: flex;
  align-items: center;
  background: #ffffff;
  padding: 32rpx;
  margin-bottom: 16rpx;
  position: relative;
  
  .title {
    font-size: 40rpx;
    font-weight: 700;
    color: $uni-color-primary;
    flex: 1;
  }
  
  .unread-badge {
    position: absolute;
    top: 28rpx;
    left: 180rpx;
    background: linear-gradient(135deg, #ff4d4f, #ff7875);
    color: #ffffff;
    font-size: 20rpx;
    padding: 4rpx 12rpx;
    border-radius: 20rpx;
    min-width: 40rpx;
    text-align: center;
  }
  
  .mark-all-btn {
    font-size: 26rpx;
    color: $uni-color-primary;
  }
}

.filter-tabs {
  display: flex;
  background: #ffffff;
  padding: 16rpx 32rpx;
  margin-bottom: 16rpx;
  gap: 24rpx;
  
  .filter-tab {
    font-size: 28rpx;
    color: $uni-text-color-grey;
    padding: 12rpx 32rpx;
    border-radius: 20rpx;
    transition: all 0.3s;
    
    &.active {
      background-color: $uni-color-primary;
      color: #ffffff;
      font-weight: 600;
    }
  }
}

.status-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
  
  .spinner {
    width: 40rpx;
    height: 40rpx;
    border: 4rpx solid #ddd;
    border-top-color: $uni-color-primary;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 20rpx;
  }
  
  .empty-icon {
    font-size: 120rpx;
    margin-bottom: 20rpx;
  }
  
  .empty-text {
    color: $uni-text-color-grey;
    font-size: $uni-font-size-base;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.notifications-list {
  padding: 0 32rpx 32rpx;
}

.notification-card {
  display: flex;
  align-items: center;
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
  margin-bottom: 16rpx;
  box-shadow: $uni-shadow-base;
  position: relative;
  transition: all 0.3s;
  
  &.unread {
    background: linear-gradient(to right, #ffffff, #f0f9ff);
    
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 6rpx;
      background: linear-gradient(135deg, $uni-color-primary, #52c41a);
      border-radius: $uni-border-radius-lg 0 0 $uni-border-radius-lg;
    }
  }
  
  .notif-icon {
    font-size: 56rpx;
    margin-right: 20rpx;
    flex-shrink: 0;
  }
  
  .notif-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    
    .notif-header {
      display: flex;
      align-items: center;
      gap: 12rpx;
      
      .notif-title {
        font-size: 30rpx;
        font-weight: 600;
        color: $uni-text-color;
      }
      
      .unread-dot {
        width: 12rpx;
        height: 12rpx;
        border-radius: 50%;
        background-color: #ff4d4f;
      }
    }
    
    .notif-text {
      font-size: 26rpx;
      color: $uni-text-color-grey;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    
    .notif-time {
      font-size: 22rpx;
      color: $uni-text-color-placeholder;
    }
  }
  
  .notif-arrow {
    font-size: 48rpx;
    color: $uni-text-color-placeholder;
    margin-left: 12rpx;
    flex-shrink: 0;
  }
}

.load-more {
  text-align: center;
  padding: 32rpx;
  font-size: 28rpx;
  color: $uni-text-color-grey;
}
</style>
