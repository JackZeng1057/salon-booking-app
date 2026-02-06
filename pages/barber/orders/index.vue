<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav :showBack="false" />
    <text class="title">我的订单</text>

    <view class="field">
      <text class="label">日期</text>
      <picker mode="date" :value="date" @change="onDateChange">
        <view class="picker-value">{{ date }}</view>
      </picker>
    </view>

    <view v-if="loading" class="hint">加载中...</view>
    <view v-else-if="orders.length === 0" class="hint">暂无订单</view>

    <view v-else class="list">
      <view v-for="order in orders" :key="order._id" class="card">
        <view class="row">
          <text class="label">时间</text>
          <text class="value">{{ order.date }} {{ order.startTime }}-{{ order.endTime }}</text>
        </view>
        <view class="row">
          <text class="label">状态</text>
          <text class="value">{{ formatOrderStatus(order.status) }}</text>
        </view>
        <view class="actions">
          <button
            class="action-btn"
            type="primary"
            :loading="isActionLoading(order._id, 'start')"
            :disabled="order.status !== 'ARRIVED' || isActionLoading(order._id, 'start')"
            @click="handleStart(order._id)"
          >
            开始服务
          </button>
          <button
            class="action-btn"
            type="default"
            :loading="isActionLoading(order._id, 'finish')"
            :disabled="order.status !== 'IN_SERVICE' || isActionLoading(order._id, 'finish')"
            @click="handleFinish(order._id)"
          >
            完成服务
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
// 理发师订单页：按日期查看订单，并进行开始/完成服务操作
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
      actionLoading: {}
    };
  },
  onLoad() {
    this.loadOrders();
  },
  onShow() {
    this.loadOrders();
  },
  methods: {
    formatOrderStatus,
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
.page {
  min-height: 100vh;
  /* 顶部整体再下移一小段，避免标题与返回按钮太靠近 */
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
  border-radius: $uni-border-radius-lg;
  padding: 20rpx 24rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
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

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 24rpx;
  box-shadow: $uni-shadow-base;
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

.actions {
  display: flex;
  gap: 16rpx;
}

.action-btn {
  flex: 1;
}
</style>
