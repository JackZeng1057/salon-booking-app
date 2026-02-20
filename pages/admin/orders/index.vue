<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <text class="title">门店订单</text>

    <view class="field">
      <text class="label">日期</text>
      <picker mode="date" :value="date" @change="onDateChange">
        <view class="picker-value">{{ date }}</view>
      </picker>
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
        <view class="swipe-content" :style="getSwipeStyle(order)">
          <view class="card">
            <view class="row">
              <text class="label">时间</text>
              <text class="value">{{ order.date }} {{ order.startTime }}-{{ order.endTime }}</text>
            </view>
            <view class="row">
              <text class="label">服务</text>
              <text class="value">{{ order.serviceName || order.serviceId || '未知服务' }}</text>
            </view>
            <view class="row">
              <text class="label">理发师</text>
              <text class="value">{{ order.barberName || order.barberId || '未知' }}</text>
            </view>
            <view class="row">
              <text class="label">状态</text>
              <text class="tag status">{{ formatOrderStatus(order.status) }}</text>
            </view>
            <view v-if="waitHint(order)" class="row">
              <text class="label">等待提示</text>
              <text class="value">{{ waitHint(order) }}</text>
            </view>
            <view class="row">
              <text class="label">订单号</text>
              <text class="value">{{ order.orderNo || order._id }}</text>
            </view>
            <view v-if="showActions(order.status) || canNoShow(order) || canCancel(order)" class="actions">
              <button
                class="action-btn"
                type="primary"
                :loading="isActionLoading(order._id, 'start')"
                :disabled="!canStart(order.status) || isActionLoading(order._id, 'start')"
                @click="openVerifyModal(order._id)"
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
              <button
                v-if="canCancel(order)"
                class="action-btn"
                type="warn"
                :loading="isActionLoading(order._id, 'cancel')"
                :disabled="isActionLoading(order._id, 'cancel')"
                @click="handleCancel(order)"
              >
                取消订单
              </button>
              <button
                v-if="canNoShow(order)"
                class="action-btn"
                type="warn"
                :loading="isActionLoading(order._id, 'noshow')"
                :disabled="isActionLoading(order._id, 'noshow')"
                @click="handleNoShow(order)"
              >
                标记爽约
              </button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view v-if="showVerifyModal" class="modal-mask" @click="closeVerifyModal">
      <view class="modal-card" @click.stop>
        <text class="modal-title">核验码</text>
        <input
          class="modal-input"
          v-model="verifyCodeInput"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="请输入6位核验码"
        />
        <view class="modal-actions">
          <button class="modal-btn ghost" @click="closeVerifyModal">取消</button>
          <button class="modal-btn primary" @click="confirmVerifyStart">核验并开始</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
// 门店订单页：核验开始、完结服务与爽约标记
import { fetchStoreOrders, startService, finishService, markNoShow, deleteOrder, cancelOrder } from '../../../api/order';
import { callCloud } from '../../../api/client';
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
      // 默认日期为今天，便于查看当天订单
      date: toDateString(new Date()),
      loading: false,
      orders: [],
      // 增量同步时间戳，减少重复拉取
      lastSyncAt: 0,
      actionWidth: 160,
      // 侧滑删除的偏移量与打开状态
      swipeOffsets: {},
      swipeOpenId: '',
      touchStartX: 0,
      touchStartY: 0,
      // 核验弹窗控制与输入
      showVerifyModal: false,
      verifyCodeInput: '',
      pendingStartOrderId: '',
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
    // 打开核验弹窗并记录当前订单
    openVerifyModal(orderId) {
      this.pendingStartOrderId = orderId;
      this.verifyCodeInput = '';
      this.showVerifyModal = true;
    },
    // 关闭核验弹窗并清理输入
    closeVerifyModal() {
      this.showVerifyModal = false;
      this.verifyCodeInput = '';
      this.pendingStartOrderId = '';
    },
    // 校验输入后触发开始服务
    async confirmVerifyStart() {
      const orderId = this.pendingStartOrderId;
      const verifyCode = (this.verifyCodeInput || '').trim();
      if (!verifyCode) {
        uni.showToast({ title: '请输入核验码', icon: 'none' });
        return;
      }
      await this.handleStart(orderId, verifyCode);
      this.closeVerifyModal();
    },
    // 兼容中文状态值，统一转换成英文枚举
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
    // 仅已取消/已完成允许侧滑删除
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
    // 侧滑删除：记录起始触点并关闭其他打开行
    onTouchStart(e, order) {
      if (!this.canSwipeDelete(order)) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.resetSwipe(order._id);
    },
    // 侧滑删除：横向滑动时更新偏移量
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
    // 侧滑删除：滑动超过阈值则保持打开
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
        content: '确定删除该订单吗？删除后不会在订单列表显示。',
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
    // 计算等待提示：仅 ARRIVED 且同理发师订单参与排队
    waitHint(order) {
      const status = this.normalizeStatus(order.status);
      if (status !== 'ARRIVED') return '';
      const barberId = order.barberId;
      if (!barberId) return '';
      const arrived = this.orders
        .filter((o) => this.normalizeStatus(o.status) === 'ARRIVED' && o.barberId === barberId)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      const index = arrived.findIndex((o) => o._id === order._id);
      if (index <= 0) return '预计等待：前方 0 人';
      return `预计等待：前方 ${index} 人`;
    },
    canStart(status) {
      const s = this.normalizeStatus(status);
      return s === 'ARRIVED' || s === 'BOOKED';
    },
    canFinish(status) {
      const s = this.normalizeStatus(status);
      return s === 'IN_SERVICE';
    },
    showActions(status) {
      const s = this.normalizeStatus(status);
      return s === 'BOOKED' || s === 'ARRIVED' || s === 'IN_SERVICE';
    },
    canCancel(order) {
      if (!order) return false;
      const s = this.normalizeStatus(order.status);
      if (s !== 'BOOKED') return false;
      const startMs = this.combineDateTime(order.date, order.startTime);
      if (!startMs) return false;
      return Date.now() <= startMs + 5 * 60 * 1000;
    },
    // 判断是否允许标记爽约：超出阈值时间且仍是已预约
    canNoShow(order) {
      const s = this.normalizeStatus(order.status);
      if (s !== 'BOOKED') return false;
      const thresholdMin = 20;
      const startMs = this.combineDateTime(order.date, order.startTime);
      if (!startMs) return false;
      return Date.now() - startMs > thresholdMin * 60 * 1000;
    },
    // 将日期与时间拼成时间戳（用于计算超时阈值）
    combineDateTime(dateStr, timeStr) {
      if (!dateStr || !timeStr) return 0;
      return new Date(`${dateStr}T${timeStr}:00+08:00`).getTime();
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
    // 合并订单变更到列表
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
      this.lastSyncAt = 0;
      this.orders = [];
      this.loadOrders();
    },
    // 拉取订单列表：支持增量同步减少数据量
    async loadOrders() {
      this.loading = true;
      try {
        // 刷新时重置侧滑状态，避免残影
        this.swipeOffsets = {};
        this.swipeOpenId = '';
        const useIncremental = this.lastSyncAt > 0;
        const payload = { date: this.date };
        if (useIncremental) {
          payload.lastSyncAt = this.lastSyncAt;
          payload.limit = 50;
        }
        const data = await fetchStoreOrders(payload);
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
    async handleStart(orderId, verifyCode) {
      if (this.isActionLoading(orderId, 'start')) return;
      this.setActionLoading(orderId, 'start', true);
      try {
        // 先核验到店，再进入开始服务流程
        await callCloud('orders-verify', { verifyCode });
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
    },
    async handleNoShow(order) {
      if (this.isActionLoading(order._id, 'noshow')) return;
      this.setActionLoading(order._id, 'noshow', true);
      try {
        const res = await markNoShow({ orderId: order._id, reason: '超时未到店' });
        const latest = res && res.order;
        if (latest) {
          this.updateOrderInList(order._id, {
            status: latest.status || 'NO_SHOW',
            noShowAt: latest.noShowAt,
            noShowReason: latest.noShowReason,
            updatedAt: latest.updatedAt
          });
        } else {
          this.updateOrderInList(order._id, { status: 'NO_SHOW' });
        }
        uni.showToast({ title: '已标记爽约', icon: 'success' });
      } catch (err) {
        if (err && err.code === 422) {
          const msg = err.message === 'not_overdue' ? '未超过爽约时间' : '当前状态不允许操作';
          uni.showToast({ title: msg, icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '操作失败', icon: 'none' });
      } finally {
        this.setActionLoading(order._id, 'noshow', false);
      }
    },
    async handleCancel(order) {
      if (!order || this.isActionLoading(order._id, 'cancel')) return;
      const modal = await uni.showModal({
        title: '取消订单',
        content: '确认取消该预约订单吗？',
        confirmText: '确认取消',
        confirmColor: '#fa5151'
      });
      if (!modal || !modal.confirm) return;

      this.setActionLoading(order._id, 'cancel', true);
      try {
        const res = await cancelOrder({ orderId: order._id, reason: '门店取消' });
        const latest = res && res.order;
        if (latest) {
          this.updateOrderInList(order._id, {
            status: latest.status || 'CANCELLED',
            cancelReason: latest.cancelReason || '',
            updatedAt: latest.updatedAt
          });
        } else {
          this.updateOrderInList(order._id, { status: 'CANCELLED' });
        }
        uni.showToast({ title: '已取消', icon: 'success' });
      } catch (err) {
        if (err && err.code === 422) {
          const msg = err.message === 'cancel_window_expired'
            ? '已超过可取消时限（开始后5分钟）'
            : '当前状态不允许操作';
          uni.showToast({ title: msg, icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '取消失败', icon: 'none' });
      } finally {
        this.setActionLoading(order._id, 'cancel', false);
      }
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  /* 顶部留白稍微加大一些，避免标题紧贴状态栏（在前一次基础上再微调一点高度） */
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

.tag {
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background: $uni-bg-color-grey;
  color: $uni-text-color;
  font-size: $uni-font-size-sm;
}

.tag.status {
  background: #e8f0ff;
  color: #2f54eb;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.action-btn {
  flex: 1 1 30%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.modal-card {
  width: 80%;
  background: #ffffff;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.18);
}

.modal-title {
  font-size: 34rpx;
  font-weight: 700;
  color: $uni-text-color;
  margin-bottom: 16rpx;
}

.modal-input {
  background: $uni-bg-color-grey;
  border-radius: 16rpx;
  padding: 24rpx 24rpx;
  font-size: $uni-font-size-lg;
  min-height: 88rpx;
  line-height: 88rpx;
  color: $uni-text-color;
  margin-bottom: 20rpx;
}

.modal-actions {
  display: flex;
  gap: 16rpx;
}

.modal-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-btn.ghost {
  background: #ffffff;
  color: $uni-text-color-grey;
  border: 2rpx solid $uni-border-color;
}

.modal-btn.primary {
  background: $uni-color-primary;
  color: #ffffff;
}
</style>
