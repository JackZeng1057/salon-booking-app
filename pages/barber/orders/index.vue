<template>
  <view class="orders-page">
    <app-nav :showBack="false" :showTitle="true" title="理发师订单" />

    <view class="orders-top">
      <view class="tabs-wrap">
        <view
          v-for="item in statusOptions"
          :key="item.value"
          class="tab-item"
          :class="{ active: activeTab === item.value }"
          @click="activeTab = item.value"
        >
          <text>{{ item.label }}</text>
          <view v-if="activeTab === item.value" class="tab-line"></view>
        </view>
      </view>

      <view class="field">
        <text class="label">日期</text>
        <modern-date-picker :value="date" @change="onDateChange">
          <view class="picker-value">{{ date }}</view>
        </modern-date-picker>
      </view>
    </view>

    <scroll-view class="orders-scroll" scroll-y>
      <view class="orders-scroll-content">
        <view v-if="loading" class="hint">加载中...</view>
        <view v-else-if="filteredOrders.length === 0" class="hint">暂无订单</view>

        <view v-else class="list">
          <view v-for="order in filteredOrders" :key="order._id" class="card">
            <view class="order-head">
              <view class="store-line">
                <app-icon name="store" color="#94A3B8" :size="20" :stroke-width="2.1" />
                <text class="store-name">{{ getStoreText(order) }}</text>
              </view>
              <text class="status-pill" :class="statusClass(order.status)">
                {{ formatOrderStatus(order.status) }}
              </text>
            </view>
            <view class="order-main">
              <text class="service-name">{{ getServiceText(order) }}</text>
              <text class="meta">预约时间：{{ getScheduleText(order) }}</text>
              <text class="meta">理发师：{{ getBarberText(order) }}</text>
            </view>
            <view class="order-foot">
              <text class="foot-text">订单号：{{ getOrderNo(order) }}</text>
            </view>
            <view class="actions">
              <button
                class="action-btn"
                type="primary"
                :loading="isActionLoading(order._id, 'start')"
                :disabled="!canStart(order.status) || isActionLoading(order._id, 'start')"
                @click="handleStart(order._id)"
              >
                开始服务
              </button>
              <button
                class="action-btn"
                type="default"
                :loading="isActionLoading(order._id, 'finish')"
                :disabled="!canFinish(order.status) || isActionLoading(order._id, 'finish')"
                @click="handleFinish(order._id)"
              >
                完成服务
              </button>
            </view>
          </view>
        </view>
        <view class="scroll-bottom-safe"></view>
      </view>
    </scroll-view>

    <view class="bottom-tab">
      <view class="bar-item" @click="goSchedule">
        <app-icon name="calendar" color="#64748B" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>排班</text>
      </view>
      <view class="bar-item active">
        <app-icon name="file" color="#10B981" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>订单</text>
      </view>
      <view class="bar-item" @click="goAccountSettings">
        <app-icon name="user" color="#64748B" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>我的</text>
      </view>
    </view>

  </view>
</template>

<script>
// 理发师订单页：按日期查看订单，并进行开始/完成服务操作
// 交互重点：
// - 默认查看当天订单；
// - 支持按“待服务/已完成/已取消”分栏；
// - 状态操作采用按钮 loading 防抖，避免重复提交。
import { fetchBarberOrders, startService, finishService } from '../../../api/order';
import { formatOrderStatus } from '../../../utils/status';

// 日期格式化为 YYYY-MM-DD（用于 picker 回显与接口入参）
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default {
  data() {
    return {
      // 默认日期为今天，便于快速查看当天订单
      date: toDateString(new Date()),
      loading: false,
      orders: [],
      // 增量同步时间戳，用于减少重复拉取
      lastSyncAt: 0,
      // 操作中状态，避免短时间重复点击
      actionLoading: {},
      activeTab: 'pending',
      statusOptions: [
        { label: '待服务', value: 'pending' },
        { label: '已完成', value: 'completed' },
        { label: '已取消', value: 'cancelled' }
      ]
    };
  },
  computed: {
    // 前端分栏映射：把后端状态聚合成 3 类，便于理发师快速处理。
    filteredOrders() {
      const mapStatus = (status) => {
        const s = this.normalizeStatus(status);
        if (s === 'ARRIVED' || s === 'BOOKED' || s === 'IN_SERVICE') return 'pending';
        if (s === 'FINISHED') return 'completed';
        if (s === 'CANCELLED' || s === 'NO_SHOW') return 'cancelled';
        return 'pending';
      };
      return (this.orders || []).filter((item) => mapStatus(item.status) === this.activeTab);
    }
  },
  onLoad() {
    this.loadOrders();
  },
  onShow() {
    this.loadOrders();
  },
  methods: {
    formatOrderStatus,
    // 兼容老数据中的中文状态值，统一成英文枚举供逻辑判断使用。
    normalizeStatus(status) {
      const map = {
        已预约: 'BOOKED',
        已到店: 'ARRIVED',
        服务中: 'IN_SERVICE',
        已完成: 'FINISHED',
        已取消: 'CANCELLED',
        爽约: 'NO_SHOW'
      };
      return map[status] || String(status || '').toUpperCase();
    },
    getStoreText(order) {
      return (order && (order.storeName || order.storeId)) || '门店订单';
    },
    getServiceText(order) {
      return (order && (order.serviceName || order.serviceId)) || '未知服务';
    },
    getBarberText(order) {
      return (order && (order.barberName || order.barberId)) || '未知';
    },
    getOrderNo(order) {
      return (order && (order.orderNo || order._id)) || '-';
    },
    getScheduleText(order) {
      if (!order) return '-';
      const date = order.date || '';
      const start = order.startTime || '';
      const end = order.endTime || '';
      if (date && start && end) return `${date} ${start}-${end}`;
      if (date && start) return `${date} ${start}`;
      if (date) return date;
      return '-';
    },
    canStart(status) {
      // 到店后可开始服务；兼容老数据 BOOKED 直接开始。
      const s = this.normalizeStatus(status);
      return s === 'ARRIVED' || s === 'BOOKED';
    },
    canFinish(status) {
      return this.normalizeStatus(status) === 'IN_SERVICE';
    },
    goSchedule() {
      uni.redirectTo({ url: '/pages/barber/schedule/index' });
    },
    goAccountSettings() {
      uni.navigateTo({
        url: '/pages/account/settings/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
    },
    // 在列表中合并某个订单的状态变化
    updateOrderInList(orderId, patch) {
      this.orders = this.orders.map((o) => {
        if (o._id !== orderId) return o;
        return { ...o, ...patch };
      });
    },
    // 增量同步时合并新旧数据，按开始时间排序
    mergeOrders(list) {
      const map = new Map(this.orders.map((o) => [o._id, o]));
      list.forEach((item) => {
        if (!item || !item._id) return;
        const existing = map.get(item._id) || {};
        map.set(item._id, { ...existing, ...item });
      });
      return Array.from(map.values()).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    },
    onDateChange(e) {
      this.date = e.detail.value || '';
      // 切换日期后清空增量信息，强制全量刷新
      this.lastSyncAt = 0;
      this.orders = [];
      this.loadOrders();
    },
    // 判断某个订单的某个动作是否正在执行
    isActionLoading(orderId, action) {
      return !!this.actionLoading[`${orderId}:${action}`];
    },
    statusClass(status) {
      const s = this.normalizeStatus(status);
      if (s === 'ARRIVED' || s === 'BOOKED' || s === 'IN_SERVICE') return 'is-pending';
      if (s === 'FINISHED') return 'is-finished';
      return 'is-cancelled';
    },
    // 设置动作加载状态（使用 $set 保证响应式）
    setActionLoading(orderId, action, value) {
      const key = `${orderId}:${action}`;
      this.$set(this.actionLoading, key, value);
    },
    // 拉取订单列表：支持增量同步减少数据量
    async loadOrders() {
      this.loading = true;
      try {
        const useIncremental = this.lastSyncAt > 0;
        const payload = { date: this.date };
        if (useIncremental) {
          // 增量场景只传 lastSyncAt，后端返回变更集。
          payload.lastSyncAt = this.lastSyncAt;
          payload.limit = 50;
        }
        const data = await fetchBarberOrders(payload);
        const list = (data && data.list) || [];
        // 增量模式合并老数据，非增量直接覆盖
        this.orders = useIncremental ? this.mergeOrders(list) : list;
        this.lastSyncAt = (data && data.lastSyncAt) || this.lastSyncAt;
      } catch (err) {
        uni.showToast({ title: err.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    // 开始服务：成功后更新列表状态与时间
    async handleStart(orderId) {
      if (this.isActionLoading(orderId, 'start')) return;
      this.setActionLoading(orderId, 'start', true);
      try {
        const res = await startService({ orderId });
        const order = res && res.order;
        if (order) {
          this.updateOrderInList(orderId, {
            status: order.status || 'IN_SERVICE',
            arrivedAt: order.arrivedAt,
            verifiedBy: order.verifiedBy,
            inServiceAt: order.inServiceAt,
            updatedAt: order.updatedAt
          });
        } else {
          this.updateOrderInList(orderId, { status: 'IN_SERVICE' });
        }
        uni.showToast({ title: '已开始服务', icon: 'success' });
      } catch (err) {
        // 422 表示状态已变化或不允许操作，提示后不再二次报错。
        if (err && err.code === 422) {
          uni.showToast({ title: '当前状态不允许操作', icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '操作失败', icon: 'none' });
      } finally {
        this.setActionLoading(orderId, 'start', false);
      }
    },
    // 完成服务：成功后更新列表状态与时间
    async handleFinish(orderId) {
      if (this.isActionLoading(orderId, 'finish')) return;
      this.setActionLoading(orderId, 'finish', true);
      try {
        const res = await finishService({ orderId });
        const order = res && res.order;
        if (order) {
          this.updateOrderInList(orderId, {
            status: order.status || 'FINISHED',
            finishedAt: order.finishedAt,
            updatedAt: order.updatedAt
          });
        } else {
          this.updateOrderInList(orderId, { status: 'FINISHED' });
        }
        uni.showToast({ title: '已完成服务', icon: 'success' });
      } catch (err) {
        if (err && err.code === 422) {
          uni.showToast({ title: '当前状态不允许操作', icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '操作失败', icon: 'none' });
      } finally {
        this.setActionLoading(orderId, 'finish', false);
      }
    }
  }
};
</script>

<style scoped lang="scss">
.orders-page {
  height: 100vh;
  padding: calc(100rpx + 20px) 20rpx 0;
  background: #f8fafc;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.orders-top {
  flex-shrink: 0;
}

.orders-scroll {
  flex: 1;
  min-height: 0;
}

.orders-scroll-content {
  display: flex;
  flex-direction: column;
}

.scroll-bottom-safe {
  height: 170rpx;
}

.tabs-wrap {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin: 0 8rpx 14rpx;
}

.tab-item {
  position: relative;
  flex: 1;
  height: 74rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 23rpx;
  font-weight: 600;
}

.tab-item.active {
  color: #0f172a;
}

.tab-line {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  bottom: 8rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: #0f172a;
}

.field {
  margin-bottom: 20rpx;
}

.label {
  display: block;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
  margin-bottom: 12rpx;
}

.picker-value {
  background: #ffffff;
  border-radius: 14rpx;
  border: 1rpx solid #e2e8f0;
  padding: 18rpx 20rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}


.hint {
  text-align: center;
  color: #94a3b8;
  font-size: 24rpx;
  padding: 100rpx 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 0 8rpx;
}

.card {
  background: #ffffff;
  border-radius: 18rpx;
  border: 1rpx solid #e2e8f0;
  padding: 14rpx;
}

.status-pill {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
}

.status-pill.is-pending {
  color: #047857;
  background: #ecfdf5;
}

.status-pill.is-finished {
  color: #475569;
  background: #f1f5f9;
}

.status-pill.is-cancelled {
  color: #be123c;
  background: #fff1f2;
}

.order-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10rpx;
  padding-bottom: 10rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.store-line {
  display: flex;
  align-items: center;
  gap: 6rpx;
  min-width: 0;
}

.store-name {
  font-size: 23rpx;
  color: #334155;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-main {
  margin-top: 10rpx;
}

.service-name {
  display: block;
  font-size: 28rpx;
  color: #0f172a;
  font-weight: 700;
}

.meta {
  margin-top: 4rpx;
  display: block;
  font-size: 22rpx;
  color: #64748b;
}

.order-foot {
  margin-top: 10rpx;
}

.foot-text {
  display: block;
  font-size: 20rpx;
  color: #94a3b8;
  word-break: break-all;
}

.action-btn {
  flex: 1 1 48%;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 36rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.actions {
  margin-top: 10rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.bottom-tab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 96rpx;
  background: #ffffff;
  border-top: 1rpx solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 21;
}

.bar-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  color: #64748b;
  font-size: 22rpx;
}

.bar-item.active {
  color: #10b981;
}

</style>
