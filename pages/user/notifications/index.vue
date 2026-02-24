<template>
  <!-- 消息通知页根容器 -->
  <view class="page">
    <!-- 吸顶头部导航栏 -->
    <view class="page-header">
      <app-nav :showTitle="true" title="消息通知" />
    </view>
    <!-- 过滤行：全部/未读 Tab 切换 + 全部已读按钮 -->
    <view class="filter-row">
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
      <!-- 全部已读按钮：列表非空时显示，无未读消息时置灰 -->
      <view
        v-if="notifications.length > 0"
        class="mark-all-btn"
        :class="{ disabled: markAllLoading || unreadCount === 0 }"
        @click="markAllRead"
      >
        {{ markAllLoading ? '处理中...' : '全部消息已读' }}
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y>
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

      <!-- 通知消息列表 -->
      <view v-else class="notifications-list">
        <!-- 支持左滑删除的消息行（swipe-row） -->
        <view
          v-for="notif in notifications"
          :key="notif._id"
          class="swipe-row"
          :class="{ 'swipe-open': getSwipeOffset(notif._id) < 0 }"
          @touchstart="onTouchStart($event, notif)"
          @touchmove="onTouchMove($event, notif)"
          @touchend="onTouchEnd($event, notif)"
        >
          <!-- 左滑展开时显示的删除操作区 -->
          <view
            v-if="getSwipeOffset(notif._id) < 0"
            class="swipe-actions"
            :style="{ width: actionWidth + 'rpx' }"
          >
            <view class="swipe-delete" @click.stop="confirmDelete(notif)">删除</view>
          </view>
          <!-- 消息卡片主体（未读时加深背景） -->
          <view class="swipe-content" :style="getSwipeStyle(notif)">
            <view
              class="notification-card"
              :class="{ unread: !notif.isRead }"
              @click="handleNotificationClick(notif)"
            >
              <!-- 通知类型图标 -->
              <view class="notif-icon">
                <app-icon
                  :name="getNotificationIconMeta(notif.type).name"
                  :color="getNotificationIconMeta(notif.type).color"
                  :size="52"
                  :stroke-width="2.2"
                />
              </view>
              <!-- 标题 + 正文 + 时间 -->
              <view class="notif-content">
                <view class="notif-header">
                  <text class="notif-title">{{ notif.title }}</text>
                  <!-- 未读红点 -->
                  <text v-if="!notif.isRead" class="unread-dot"></text>
                </view>
                <text class="notif-text">{{ notif.content }}</text>
                <text class="notif-time">{{ formatTime(notif.createdAt) }}</text>
              </view>
              <view class="notif-arrow">›</view>
            </view>
          </view>
        </view>

        <!-- 加载更多 -->
        <view v-if="hasMore" class="load-more" @click="loadMore">
          <text>{{ loadingMore ? '加载中...' : '加载更多' }}</text>
        </view>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>

    <app-modal
      :visible="confirmDialog.visible"
      :title="confirmDialog.title"
      :confirm-text="confirmDialog.confirmText"
      :confirm-type="confirmDialog.confirmType"
      @close="handleConfirmDialogCancel"
      @cancel="handleConfirmDialogCancel"
      @confirm="handleConfirmDialogConfirm"
    >
      <view class="confirm-dialog-content">{{ confirmDialog.content }}</view>
    </app-modal>
  </view>
</template>

<script>
// 通知列表页：筛选未读、标记已读与跳转
// 页面能力：
// - 支持分页加载、仅未读筛选；
// - 支持侧滑删除；
// - 点击后先读后跳，确保未读数准确。
import { fetchNotifications, markNotificationsRead, deleteNotification } from '../../../api/notifications';

export default {
  data() {
    return {
      notifications: [],
      // 后端返回的未读总数，用于头部按钮/角标展示
      unreadCount: 0,
      unreadOnly: false,
      loading: false,
      markAllLoading: false,
      // 侧滑删除配置（rpx）
      actionWidth: 160,
      swipeOffsets: {},
      swipeOpenId: '',
      touchStartX: 0,
      touchStartY: 0,
      loadingMore: false,
      page: 1,
      pageSize: 20,
      hasMore: true,
      // 通用确认弹窗状态
      confirmDialog: {
        visible: false,
        title: '',
        content: '',
        confirmText: '确定',
        confirmType: 'primary'
      },
      confirmDialogResolver: null
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
        // 刷新时重置分页与侧滑状态，避免旧状态残留。
        this.page = 1;
        this.notifications = [];
        this.hasMore = true;
        this.swipeOffsets = {};
        this.swipeOpenId = '';
      }

      this.loading = true;
      try {
        const res = await fetchNotifications({
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
        // 单页未满说明没有更多数据。
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
    getSwipeOffset(notificationId) {
      return this.swipeOffsets[notificationId] || 0;
    },
    setSwipeOffset(notificationId, value) {
      this.$set(this.swipeOffsets, notificationId, value);
    },
    closeSwipe(notificationId) {
      if (!notificationId) return;
      this.setSwipeOffset(notificationId, 0);
      if (this.swipeOpenId === notificationId) {
        this.swipeOpenId = '';
      }
    },
    resetSwipe(exceptId) {
      if (this.swipeOpenId && this.swipeOpenId !== exceptId) {
        this.closeSwipe(this.swipeOpenId);
      }
    },
    getSwipeStyle(notif) {
      if (!notif || !notif._id) return {};
      const offset = this.getSwipeOffset(notif._id);
      return {
        transform: `translateX(${offset}rpx)`
      };
    },
    onTouchStart(e, notif) {
      if (!notif || !notif._id) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.resetSwipe(notif._id);
    },
    onTouchMove(e, notif) {
      if (!notif || !notif._id) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      // 仅处理横向滑动，避免与纵向滚动冲突。
      if (Math.abs(deltaY) > Math.abs(deltaX)) return;
      const offset = Math.max(Math.min(deltaX, 0), -this.actionWidth);
      this.setSwipeOffset(notif._id, offset);
    },
    onTouchEnd(e, notif) {
      if (!notif || !notif._id) return;
      const offset = this.getSwipeOffset(notif._id);
      if (offset < -this.actionWidth / 2) {
        this.setSwipeOffset(notif._id, -this.actionWidth);
        this.swipeOpenId = notif._id;
      } else {
        this.closeSwipe(notif._id);
      }
    },
    async confirmDelete(notif) {
      if (!notif || !notif._id) return;
      const confirmed = await this.openConfirmDialog({
        title: '删除消息',
        content: '确定删除该消息吗？删除后无法恢复。',
        confirmText: '删除',
        confirmType: 'danger'
      });
      if (!confirmed) return;
      try {
        await deleteNotification({ notificationId: notif._id });
        this.notifications = this.notifications.filter((item) => item._id !== notif._id);
        if (!notif.isRead) {
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        }
        this.closeSwipe(notif._id);
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: err.message || '删除失败', icon: 'none' });
      }
    },
    // 标记全部已读
    async markAllRead() {
      if (this.markAllLoading || this.unreadCount <= 0) return;
      this.markAllLoading = true;
      const prevUnread = this.unreadCount;
      const prevList = this.notifications.map((item) => ({ ...item }));
      // 先做乐观更新，提高交互响应速度；失败再回滚。
      this.unreadCount = 0;
      this.notifications = this.notifications.map((item) => ({ ...item, isRead: true }));
      try {
        await markNotificationsRead({ markAll: true });
        uni.showToast({ title: '全部消息已读', icon: 'none' });
        await this.loadNotifications(true);
      } catch (err) {
        this.unreadCount = prevUnread;
        this.notifications = prevList;
        uni.showToast({
          title: err.message || '操作失败',
          icon: 'none'
        });
      } finally {
        this.markAllLoading = false;
      }
    },
    // 点击通知：先标记已读，再跳转相关页面
    async handleNotificationClick(notif) {
      if (this.getSwipeOffset(notif._id) < 0) {
        this.closeSwipe(notif._id);
        return;
      }
      // 标记为已读
      if (!notif.isRead) {
        try {
          await markNotificationsRead({ notificationId: notif._id });
          notif.isRead = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        } catch (err) {
          // 标记已读失败不阻断跳转，避免用户被困在当前页。
          console.error('mark read error:', err);
        }
      }

      // 统一跳转消息详情页：先看完整通知，再决定是否查看关联订单
      const payload = encodeURIComponent(JSON.stringify({
        _id: notif._id || '',
        title: notif.title || '',
        content: notif.content || '',
        type: notif.type || '',
        createdAt: notif.createdAt || 0,
        relatedId: notif.relatedId || '',
        relatedType: notif.relatedType || ''
      }));
      uni.navigateTo({
        url: `/pages/user/notifications/detail?payload=${payload}`
      });
    },
    // 获取通知图标（SVG）
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
    },
    openConfirmDialog(options = {}) {
      // 防止并发弹窗：若已有 resolver 先关闭旧弹窗 promise。
      if (this.confirmDialogResolver) {
        this.confirmDialogResolver(false);
        this.confirmDialogResolver = null;
      }
      this.confirmDialog = {
        visible: true,
        title: String(options.title || '').trim(),
        content: String(options.content || '').trim(),
        confirmText: String(options.confirmText || '确定').trim(),
        confirmType: options.confirmType === 'danger' ? 'danger' : 'primary'
      };
      return new Promise((resolve) => {
        this.confirmDialogResolver = resolve;
      });
    },
    closeConfirmDialog(result) {
      const resolver = this.confirmDialogResolver;
      this.confirmDialogResolver = null;
      this.confirmDialog.visible = false;
      if (typeof resolver === 'function') {
        resolver(!!result);
      }
    },
    handleConfirmDialogCancel() {
      this.closeConfirmDialog(false);
    },
    handleConfirmDialogConfirm() {
      this.closeConfirmDialog(true);
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: calc(118rpx + 20px) 28rpx 0;
  background: #f8fafc;
  box-sizing: border-box;
  overflow: hidden;
}

.page-header {
  flex-shrink: 0;
  background: #f8fafc;
  z-index: 20;
}

.page-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 10rpx;
  height: 0;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 8rpx;
  margin-bottom: 8rpx;
}

.mark-all-btn {
  min-width: 210rpx;
  height: 64rpx;
  font-size: 26rpx;
  color: $uni-color-primary;
  padding: 0 20rpx;
  border-radius: 22rpx;
  background: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  margin-left: 0;
  margin-bottom: 0;
  flex-shrink: 0;
}

.mark-all-btn.disabled {
  opacity: 0.5;
}

.filter-tabs {
  display: flex;
  background: transparent;
  padding: 0;
  margin-bottom: 0;
  gap: 16rpx;
  
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
  padding: 0 0 32rpx;
}

.swipe-row {
  position: relative;
  overflow: hidden;
  border-radius: $uni-border-radius-lg;
  margin-bottom: 16rpx;
}

.swipe-actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ff4d4f;
  border-radius: $uni-border-radius-lg;
  opacity: 0;
  transition: opacity 0.15s ease;
  visibility: hidden;
  z-index: 0;
}

.swipe-delete {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: $uni-font-size-base;
  font-weight: 600;
}

.swipe-content {
  transition: transform 0.2s ease;
  position: relative;
  z-index: 1;
}

.swipe-row.swipe-open .swipe-actions {
  opacity: 1;
  visibility: visible;
}

.notification-card {
  display: flex;
  align-items: center;
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
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
    width: 96rpx;
    height: 96rpx;
    border-radius: 48rpx;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
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
    font-size: 42rpx;
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

.confirm-dialog-content {
  color: #334155;
  font-size: 27rpx;
  line-height: 1.6;
}

.scroll-bottom-gap {
  height: 24rpx;
}
</style>
