<template>
  <view class="page">
    <!-- 自定义顶部导航（订单列表作为 Tab 页，不需要返回按钮） -->
    <app-nav :showBack="false" />
    <text class="title">我的订单</text>

    <view class="filter">
      <view
        v-for="item in statusOptions"
        :key="item.value"
        class="filter-item"
        :class="{ active: status === item.value }"
        @click="changeStatus(item.value)"
      >
        {{ item.label }}
      </view>
    </view>

    <view v-if="loading" class="hint">加载中...</view>
    <view v-else-if="orders.length === 0" class="hint">暂无订单</view>

    <view v-else class="list">
      <view
        v-for="order in orders"
        :key="order._id"
        class="swipe-row"
        :class="{ 'swipe-open': getSwipeOffset(order._id) < 0 }"
        @touchstart="onTouchStart($event, order)"
        @touchmove="onTouchMove($event, order)"
        @touchend="onTouchEnd($event, order)"
      >
        <view
          v-if="canSwipeDelete(order) && getSwipeOffset(order._id) < 0"
          class="swipe-actions"
          :style="{ width: actionWidth + 'rpx' }"
        >
          <view class="swipe-delete" @click.stop="confirmDelete(order)">删除</view>
        </view>
        <view class="swipe-content" :style="getSwipeStyle(order)" @click="goDetail(order._id)">
          <view class="card">
            <view class="card-header">
              <text class="store">{{ order.storeName || order.storeId || '未知门店' }}</text>
              <text class="status">{{ formatOrderStatus(order.status) }}</text>
            </view>
            <view class="card-body">
              <text class="service">{{ order.serviceName || order.serviceId || '未知服务' }}</text>
              <text class="meta">{{ order.date }} {{ order.startTime }}-{{ order.endTime }}</text>
              <text class="meta">理发师：{{ order.barberName || order.barberId || '未知' }}</text>
            </view>
            <view class="card-footer">
              <text class="order-no">订单号：{{ order.orderNo }}</text>
              <text class="verify">核验码：{{ order.verifyCode }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
// 用户订单列表（标签页）：支持侧滑删除已完成/已取消订单
import { fetchOrderList, deleteOrder } from '../../../api/order';
import { getCache } from '../../../utils/cache';
import { formatOrderStatus } from '../../../utils/status';

export default {
  data() {
    return {
      loading: false,
      orders: [],
      status: '',
      page: 1,
      pageSize: 10,
      hasMore: true,
      lastSyncAt: 0,
      actionWidth: 160,
      swipeOffsets: {},
      swipeOpenId: '',
      touchStartX: 0,
      touchStartY: 0,
      statusOptions: [
        { label: '全部', value: '' },
        { label: '已预约', value: 'BOOKED' },
        { label: '已取消', value: 'CANCELLED' },
        { label: '已到店', value: 'ARRIVED' },
        { label: '已完成', value: 'FINISHED' },
        { label: '爽约', value: 'NO_SHOW' }
      ]
    };
  },
  onLoad() {
    this.loadOrders(true);
  },
  onShow() {
    this.loadOrders(true);
  },
  onPullDownRefresh() {
    // 下拉刷新
    this.page = 1;
    this.loadOrders(true).finally(() => {
      uni.stopPullDownRefresh();
    });
  },
  onReachBottom() {
    // 触底加载下一页
    this.page += 1;
    this.loadOrders();
  },
  methods: {
    formatOrderStatus,
    normalizeStatus(status) {
      const map = {
        已预约: 'BOOKED',
        已到店: 'ARRIVED',
        服务中: 'IN_SERVICE',
        已完成: 'FINISHED',
        已取消: 'CANCELLED',
        爽约: 'NO_SHOW'
      };
      return map[status] || status;
    },
    canSwipeDelete(order) {
      const status = this.normalizeStatus(order && order.status);
      return status === 'CANCELLED' || status === 'FINISHED';
    },
    getSwipeOffset(orderId) {
      return this.swipeOffsets[orderId] || 0;
    },
    setSwipeOffset(orderId, value) {
      this.$set(this.swipeOffsets, orderId, value);
    },
    closeSwipe(orderId) {
      if (!orderId) return;
      this.setSwipeOffset(orderId, 0);
      if (this.swipeOpenId === orderId) {
        this.swipeOpenId = '';
      }
    },
    resetSwipe(exceptId) {
      if (this.swipeOpenId && this.swipeOpenId !== exceptId) {
        this.closeSwipe(this.swipeOpenId);
      }
    },
    getSwipeStyle(order) {
      if (!this.canSwipeDelete(order)) return {};
      const offset = this.getSwipeOffset(order._id);
      return {
        transform: `translateX(${offset}rpx)`
      };
    },
    onTouchStart(e, order) {
      if (!this.canSwipeDelete(order)) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.resetSwipe(order._id);
    },
    onTouchMove(e, order) {
      if (!this.canSwipeDelete(order)) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      if (Math.abs(deltaY) > Math.abs(deltaX)) return;
      const offset = Math.max(Math.min(deltaX, 0), -this.actionWidth);
      this.setSwipeOffset(order._id, offset);
    },
    onTouchEnd(e, order) {
      if (!this.canSwipeDelete(order)) return;
      const offset = this.getSwipeOffset(order._id);
      if (offset < -this.actionWidth / 2) {
        this.setSwipeOffset(order._id, -this.actionWidth);
        this.swipeOpenId = order._id;
      } else {
        this.closeSwipe(order._id);
      }
    },
    async confirmDelete(order) {
      if (!this.canSwipeDelete(order)) return;
      const res = await uni.showModal({
        title: '删除订单',
        content: '确定删除该订单吗？删除后可在后台数据中保留，但不会在列表显示。',
        confirmText: '删除',
        confirmColor: '#fa5151'
      });
      if (!res || !res.confirm) return;
      try {
        await deleteOrder({ orderId: order._id });
        this.orders = this.orders.filter((item) => item._id !== order._id);
        this.closeSwipe(order._id);
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: err.message || '删除失败', icon: 'none' });
      }
    },
    getCacheKey() {
      return `orders-mine:${this.status || ''}:${this.page || 1}:${this.pageSize || 10}`;
    },
    mergeOrders(list) {
      const map = new Map(this.orders.map((o) => [o._id, o]));
      list.forEach((item) => {
        if (!item || !item._id) return;
        const existing = map.get(item._id) || {};
        map.set(item._id, { ...existing, ...item });
      });
      return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async syncIncremental() {
      if (!this.lastSyncAt) return;
      try {
        const data = await fetchOrderList({ status: this.status, lastSyncAt: this.lastSyncAt, limit: 20 });
        const list = (data && data.list) || [];
        if (list.length > 0) {
          this.orders = this.mergeOrders(list);
        }
        this.lastSyncAt = (data && data.lastSyncAt) || this.lastSyncAt;
      } catch (err) {
        // 静默失败，避免打断页面
      }
    },
    // 获取订单列表
    async loadOrders(reset = false) {
      if (!this.hasMore && !reset) return;
      if (reset) {
        this.page = 1;
        this.hasMore = true;
        this.swipeOffsets = {};
        this.swipeOpenId = '';
      }
      const key = this.getCacheKey();
      if (this.page === 1) {
        const cached = getCache(key);
        if (cached && Array.isArray(cached.list)) {
          this.orders = cached.list;
          this.lastSyncAt = cached.lastSyncAt || 0;
          this.hasMore = cached.list.length >= this.pageSize;
          // 空缓存可能导致“全部订单”长期显示为空，需回源做一次全量校验
          if (cached.list.length > 0) {
            this.loading = false;
            await this.syncIncremental();
            return;
          }
        }
      }
      this.loading = true;
      try {
        const data = await fetchOrderList({
          status: this.status,
          page: this.page,
          pageSize: this.pageSize
        });
        const list = (data && data.list) || [];
        if (reset) {
          this.orders = Array.isArray(list) ? list : [];
        } else {
          this.orders = this.orders.concat(Array.isArray(list) ? list : []);
        }
        this.hasMore = Array.isArray(list) && list.length >= this.pageSize;
        this.lastSyncAt = (data && data.lastSyncAt) || this.lastSyncAt;
      } catch (err) {
        uni.showToast({ title: err.message || '加载订单失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    // 切换状态筛选
    changeStatus(value) {
      if (this.status === value) return;
      this.status = value;
      this.page = 1;
      this.hasMore = true;
      this.lastSyncAt = 0;
      this.loadOrders(true);
    },
    // 跳转到订单详情
    goDetail(id) {
      if (!id) return;
      uni.navigateTo({ url: `/pages/order/detail?id=${id}` });
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  /* 顶部整体再下移一小段，避免与悬浮返回按钮挤在一起 */
  padding: 96rpx 30rpx 30rpx;
  background-color: $uni-bg-color-grey;
}

.title {
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  margin-bottom: 24rpx;
  padding-left: 6rpx;
}

.filter {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 20rpx;
}


.filter-item {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  box-shadow: $uni-shadow-base;
}

.filter-item.active {
  color: #ffffff;
  background: $uni-color-primary;
}

.hint {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-placeholder;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.swipe-row {
  position: relative;
  overflow: hidden;
  border-radius: $uni-border-radius-lg;
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
  visibility: hidden;
  z-index: 1;
}

.swipe-row.swipe-open .swipe-actions {
  visibility: visible;
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
  z-index: 2;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 24rpx;
  box-shadow: $uni-shadow-base;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.store {
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  font-weight: 600;
}

.status {
  font-size: $uni-font-size-sm;
  color: $uni-color-primary;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.service {
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  font-weight: 600;
}

.meta {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
}

.card-footer {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.order-no,
.verify {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-placeholder;
}
</style>
