<template>
  <view class="page">
    <app-nav :showTitle="true" title="订单详情" />
    <view class="hero-card">
      <text class="hero-subtitle">查看订单状态、明细与服务日志</text>
    </view>

    <view v-if="loading" class="hint">加载中...</view>
    <view v-else-if="!detail" class="hint">订单不存在</view>

    <view v-else class="card">
      <view class="row">
        <text class="label">门店</text>
        <text class="value">{{ displayStoreName }}</text>
      </view>
      <view class="row">
        <text class="label">服务</text>
        <text class="value">{{ displayServiceName }}</text>
      </view>
      <view class="row">
        <text class="label">理发师</text>
        <text class="value">{{ displayBarberName }}</text>
      </view>
      <view class="row">
        <text class="label">时间</text>
        <text class="value">{{ detail.order.date }} {{ detail.order.startTime }}-{{ detail.order.endTime }}</text>
      </view>
      <view class="row">
        <text class="label">状态</text>
        <text class="value">{{ formatOrderStatus(detail.order.status) }}</text>
      </view>
      <view v-if="queueHintText" class="row">
        <text class="label">等待提示</text>
        <text class="value">{{ queueHintText }}</text>
      </view>
      <view class="row">
        <text class="label">核验码</text>
        <text class="value code">{{ detail.order.verifyCode }}</text>
      </view>
      <view v-if="detail.order.remark" class="row">
        <text class="label">备注</text>
        <text class="value">{{ detail.order.remark }}</text>
      </view>

      <view class="actions">
        <button class="action-btn" type="default" :disabled="!canCancelOperate" @click="openCancel">取消预约</button>
        <button class="action-btn" type="primary" :disabled="!canRescheduleOperate" @click="openReschedule">改期</button>
      </view>

      <view class="actions">
        <button class="action-btn" type="primary" :disabled="!canReview" @click="goReview">去评价</button>
        <button class="action-btn" type="default" :disabled="!canReview" @click="goAftersale">申请售后</button>
      </view>

      <view v-if="review" class="panel">
        <text class="panel-title">我的评价</text>
        <text class="panel-text">
          评分：<text class="review-stars">{{ formatReviewStars(review.rating) }}</text>
          <text class="review-score">{{ formatReviewScore(review.rating) }}</text>
        </text>
        <text class="panel-text">内容：{{ review.content || '无' }}</text>
        <view v-if="review.images && review.images.length" class="review-images">
          <image
            v-for="(img, idx) in review.images"
            :key="idx"
            class="review-image"
            :src="img"
            mode="aspectFill"
            @click="previewReviewImage(idx)"
          />
        </view>
      </view>

      <view class="panel">
        <view class="panel-header" @click="toggleItems">
          <text class="panel-title">服务明细</text>
          <text class="panel-toggle">{{ showItems ? '收起' : '展开' }}</text>
        </view>
        <view v-if="showItems">
          <view v-if="itemsLoading" class="hint">加载中...</view>
          <view v-else-if="orderItems.length === 0" class="hint">暂无明细</view>
          <view v-else class="list">
            <view v-for="item in orderItems" :key="item._id" class="row">
              <text class="value">{{ item.name }}</text>
              <text class="meta">¥{{ item.price }} × {{ item.qty }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="panel">
        <view class="panel-header" @click="toggleEvents">
          <text class="panel-title">订单日志</text>
          <text class="panel-toggle">{{ showEvents ? '收起' : '展开' }}</text>
        </view>
        <view v-if="showEvents">
          <view v-if="eventsLoading" class="hint">加载中...</view>
          <view v-else-if="orderEvents.length === 0" class="hint">暂无日志</view>
          <view v-else class="list">
            <view v-for="event in orderEvents" :key="event._id" class="row">
              <text class="value">{{ formatOrderStatus(event.toStatus || event.fromStatus) }}</text>
              <text class="meta">{{ formatEventTime(event.ts) }} {{ formatEventRemark(event.remark) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="showCancel" class="panel">
        <text class="panel-title">取消原因</text>
        <textarea class="panel-textarea" v-model="cancelReason" placeholder="请输入取消原因" />
        <button class="panel-btn" type="warn" @click="handleCancel">确认取消</button>
      </view>

      <view v-if="showReschedule" class="panel">
        <text class="panel-title">选择新日期</text>
        <modern-date-picker :value="rescheduleDate" @change="onRescheduleDateChange">
          <view class="panel-input">{{ rescheduleDate || '请选择日期' }}</view>
        </modern-date-picker>
        <text class="panel-title">可预约时段</text>
        <view v-if="slotsLoading" class="hint">加载中...</view>
        <view v-else-if="slots.length === 0" class="hint">暂无可用时段</view>
        <view v-else class="slots-grid">
          <view
            v-for="slot in slots"
            :key="slot.startTime"
            class="slot-item"
            :class="slotClass(slot)"
            @click="selectSlot(slot)"
          >
            <text class="slot-time">{{ slot.startTime }}-{{ slot.endTime }}</text>
            <text class="slot-status">{{ formatSlotStatus(slot.status) }}</text>
          </view>
        </view>
        <button class="panel-btn" type="primary" :disabled="!selectedStartTime" @click="handleReschedule">确认改期</button>
      </view>
    </view>
  </view>
</template>

<script>
// 订单详情页：
// - 展示订单快照、评价、明细与日志
// - 提供取消与改期入口（仅 BOOKED）
// - 改期拉取服务时长对应的可预约窗口
import {
  fetchOrderDetail,
  cancelOrder,
  rescheduleOrder,
  fetchReviewByOrder,
  fetchOrderItems,
  fetchOrderEvents
} from '../../api/order';
import { fetchBarberSlots } from '../../api/barber';
import { fetchStores, fetchStoreServices, fetchStoreBarbers } from '../../api/store';
import { formatOrderStatus, formatSlotStatus } from '../../utils/status';

export default {
  data() {
    return {
      // 当前订单 ID（路由参数）
      id: '',
      loading: false,
      // 订单详情响应（含 order 主对象）
      detail: null,
      // 取消面板状态与输入
      showCancel: false,
      cancelReason: '',
      // 改期面板状态与选择信息
      showReschedule: false,
      rescheduleDate: '',
      slots: [],
      slotsLoading: false,
      selectedStartTime: '',
      // 评价信息（仅已完成订单展示）
      review: null,
      // 订单明细折叠面板
      showItems: false,
      itemsLoading: false,
      orderItems: [],
      // 订单事件日志折叠面板
      showEvents: false,
      eventsLoading: false,
      orderEvents: [],
      // 快照缺失时的本地字典兜底
      storeMap: {},
      serviceMap: {},
      barberMap: {}
    };
  },
  computed: {
    // 仅 BOOKED 可操作
    canOperate() {
      if (!this.detail || !this.detail.order) return false;
      return this.normalizeStatus(this.detail.order.status) === 'BOOKED';
    },
    // 取消预约：仅 BOOKED 且在开始后 5 分钟内
    canCancelOperate() {
      if (!this.detail || !this.detail.order) return false;
      const order = this.detail.order;
      return this.normalizeStatus(order.status) === 'BOOKED' && this.inCancelWindow(order, 5);
    },
    // 改期窗口：开始前 5 分钟截止
    canRescheduleOperate() {
      if (!this.detail || !this.detail.order) return false;
      const order = this.detail.order;
      if (this.normalizeStatus(order.status) !== 'BOOKED') return false;
      const startMs = this.toChinaTimestamp(order.date, order.startTime);
      if (!startMs) return false;
      return Date.now() < startMs - 5 * 60 * 1000;
    },
    // 仅 FINISHED 可评价/售后
    canReview() {
      if (!this.detail || !this.detail.order) return false;
      return this.normalizeStatus(this.detail.order.status) === 'FINISHED';
    },
    // 订单显示门店名（快照优先，其次缓存字典）
    displayStoreName() {
      if (!this.detail || !this.detail.order) return '';
      const { storeName, storeId } = this.detail.order;
      return storeName || this.storeMap[storeId] || storeId || '';
    },
    // 订单显示服务名（快照优先，其次缓存字典）
    displayServiceName() {
      if (!this.detail || !this.detail.order) return '';
      const { serviceName, serviceId } = this.detail.order;
      return serviceName || this.serviceMap[serviceId] || serviceId || '';
    },
    // 订单显示理发师名（快照优先，其次缓存字典）
    displayBarberName() {
      if (!this.detail || !this.detail.order) return '';
      const { barberName, barberId } = this.detail.order;
      return barberName || this.barberMap[barberId] || barberId || '';
    },
    queueHintText() {
      if (!this.detail || !this.detail.order) return '';
      const order = this.detail.order;
      if (this.normalizeStatus(order.status) !== 'ARRIVED') return '';
      const ahead = Number(order.queueAheadCount);
      const waitMin = Number(order.queueWaitMin);
      if (!Number.isFinite(ahead) || !Number.isFinite(waitMin)) return '';
      return `前方 ${Math.max(ahead, 0)} 人，预计等待约 ${Math.max(waitMin, 0)} 分钟`;
    }
  },
  onLoad(options) {
    // 从路由参数读取订单 ID
    this.id = (options && options.id) || '';
    if (!this.id) return;
    this.loadDetail();
  },
  methods: {
    formatOrderStatus,
    formatSlotStatus,
    // 兼容中文状态，统一用于页面逻辑判断。
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
    toChinaTimestamp(date, time) {
      if (!date || !time) return 0;
      const ms = new Date(`${date}T${time}:00+08:00`).getTime();
      return Number.isFinite(ms) ? ms : 0;
    },
    inCancelWindow(order, cancelWindowMin = 5) {
      if (!order) return false;
      const startMs = this.toChinaTimestamp(order.date, order.startTime);
      if (!startMs) return false;
      return Date.now() <= startMs + cancelWindowMin * 60 * 1000;
    },
    formatReviewStars(rating) {
      if (!rating) return '';
      const overall = typeof rating === 'number' ? rating : rating.overall;
      if (overall == null) return '';
      const count = Math.round(Number(overall) || 0);
      return '★'.repeat(Math.max(0, count)) || '0星';
    },
    formatReviewScore(rating) {
      if (!rating) return '';
      const overall = typeof rating === 'number' ? rating : rating.overall;
      if (overall == null) return '';
      return ` ${Number(overall).toFixed(1)}分`;
    },
    formatEventRemark(remark) {
      if (!remark) return '';
      const map = {
        start_service: '开始服务',
        finish_service: '服务完成',
        create_order: '创建订单',
        create: '创建订单',
        'create-order': '创建订单',
        cancel_order: '取消预约',
        reschedule_order: '改期'
      };
      return map[remark] || remark;
    },
    previewReviewImage(index) {
      if (!this.review || !this.review.images || this.review.images.length === 0) return;
      uni.previewImage({
        current: index,
        urls: this.review.images
      });
    },
    formatEventTime(ts) {
      if (!ts) return '';
      const date = new Date(ts);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}`;
    },
    // 加载订单详情：必要时补齐门店/服务/理发师名称
    async loadDetail() {
      this.loading = true;
      try {
        const data = await fetchOrderDetail({ id: this.id });
        this.detail = data || null;
        // 改期日期默认使用原预约日期。
        this.rescheduleDate = (data && data.order && data.order.date) || '';
        if (this.detail && this.detail.order) {
          const order = this.detail.order;
          const needStore = !order.storeName;
          const needService = !order.serviceName;
          const needBarber = !order.barberName;
          if (needStore || needService || needBarber) {
            // 快照缺失时补齐门店/服务/理发师名称
            await this.loadLocalMaps();
          }
          if (this.normalizeStatus(order.status) === 'FINISHED') {
            // 已完成订单尝试加载评价
            const reviewRes = await fetchReviewByOrder({ orderId: this.id });
            this.review = reviewRes && reviewRes.review;
          }
        }
      } catch (err) {
        uni.showToast({ title: err.message || '加载订单失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    async toggleItems() {
      // 懒加载：首次展开时才请求明细，减少初始请求数。
      this.showItems = !this.showItems;
      if (this.showItems && this.orderItems.length === 0) {
        this.itemsLoading = true;
        try {
          const res = await fetchOrderItems({ orderId: this.id });
          this.orderItems = (res && res.list) || [];
        } catch (err) {
          uni.showToast({ title: err.message || '加载明细失败', icon: 'none' });
        } finally {
          this.itemsLoading = false;
        }
      }
    },
    async toggleEvents() {
      // 懒加载：首次展开时才请求事件日志。
      this.showEvents = !this.showEvents;
      if (this.showEvents && this.orderEvents.length === 0) {
        this.eventsLoading = true;
        try {
          const res = await fetchOrderEvents({ orderId: this.id });
          this.orderEvents = (res && res.list) || [];
        } catch (err) {
          uni.showToast({ title: err.message || '加载日志失败', icon: 'none' });
        } finally {
          this.eventsLoading = false;
        }
      }
    },
    // 通过本地缓存数据构建名称字典（不额外增加云端读）
    async loadLocalMaps() {
      const order = this.detail && this.detail.order;
      if (!order) return;
      const storeId = order.storeId;
      try {
        const stores = await fetchStores();
        this.storeMap = (Array.isArray(stores) ? stores : []).reduce((acc, item) => {
          acc[item._id] = item.name || item._id;
          return acc;
        }, {});

        if (storeId) {
          const [services, barbers] = await Promise.all([
            fetchStoreServices(storeId),
            fetchStoreBarbers(storeId, { noCache: true })
          ]);
          this.serviceMap = (Array.isArray(services) ? services : []).reduce((acc, item) => {
            acc[item._id] = item.name || item._id;
            return acc;
          }, {});
          this.barberMap = (Array.isArray(barbers) ? barbers : []).reduce((acc, item) => {
            acc[item._id] = item.name || item.username || item._id;
            return acc;
          }, {});
        }
      } catch (err) {
        // 忽略缓存读取失败，不影响主流程
      }
    },
    // 取消预约：仅 BOOKED 可操作
    async handleCancel() {
      if (!this.cancelReason.trim()) {
        uni.showToast({ title: '请输入取消原因', icon: 'none' });
        return;
      }
      if (!this.canCancelOperate) {
        uni.showToast({ title: '已超过可取消时限（开始后5分钟）', icon: 'none' });
        return;
      }
      try {
        // 取消成功后合并后端返回订单快照，避免额外全量请求。
        const res = await cancelOrder({ orderId: this.id, reason: this.cancelReason });
        const order = res && res.order;
        if (order && this.detail && this.detail.order) {
          this.detail.order = { ...this.detail.order, ...order };
        }
        uni.showToast({ title: '已取消', icon: 'success' });
        this.showCancel = false;
        this.cancelReason = '';
      } catch (err) {
        if (err && err.code === 422) {
          const msg = err.message === 'cancel_window_expired'
            ? '已超过可取消时限（开始后5分钟）'
            : '当前状态不允许取消';
          uni.showToast({ title: msg, icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '取消失败', icon: 'none' });
      }
    },
    // 打开取消面板（与改期面板互斥）
    openCancel() {
      if (!this.canCancelOperate) {
        uni.showToast({ title: '已超过可取消时限（开始后5分钟）', icon: 'none' });
        return;
      }
      this.showReschedule = false;
      this.showCancel = !this.showCancel;
    },
    // 打开改期面板（与取消面板互斥）
    openReschedule() {
      if (!this.canRescheduleOperate) {
        uni.showToast({ title: '距离开始不足5分钟，当前不可改期', icon: 'none' });
        return;
      }
      this.showCancel = false;
      this.showReschedule = !this.showReschedule;
      if (this.showReschedule) {
        this.loadSlots();
      }
    },
    // 改期日期变化
    onRescheduleDateChange(e) {
      this.rescheduleDate = e.detail.value || '';
      this.loadSlots();
    },
    // 拉取可改期时段：由服务时长决定窗口粒度
    async loadSlots() {
      if (!this.detail || !this.detail.order) return;
      this.slotsLoading = true;
      this.slots = [];
      this.selectedStartTime = '';
      try {
        // 以理发师 + 日期 + 服务为维度获取可预约窗口
        const data = await fetchBarberSlots({
          barberId: this.detail.order.barberId,
          date: this.rescheduleDate,
          serviceId: this.detail.order.serviceId,
          noCache: true
        });
        this.slots = Array.isArray(data) ? data : [];
      } catch (err) {
        uni.showToast({ title: err.message || '加载时段失败', icon: 'none' });
      } finally {
        this.slotsLoading = false;
      }
    },
    // 选择时段：过滤不可预约/过期/已预约
    selectSlot(slot) {
      if (!slot || slot.status === 'BOOKED' || slot.status === 'EXPIRED' || slot.status === 'UNAVAILABLE') return;
      this.selectedStartTime = slot.startTime;
    },
    // 时段样式
    slotClass(slot) {
      if (slot.status === 'BOOKED') return 'slot-booked';
      if (slot.status === 'EXPIRED') return 'slot-expired';
      if (slot.status === 'UNAVAILABLE') return 'slot-unavailable';
      if (slot.startTime === this.selectedStartTime) return 'slot-selected';
      return 'slot-available';
    },
    // 确认改期：冲突与状态不允许时提示
    async handleReschedule() {
      if (!this.selectedStartTime) return;
      if (!this.canRescheduleOperate) {
        uni.showToast({ title: '距离开始不足5分钟，当前不可改期', icon: 'none' });
        return;
      }
      try {
        await rescheduleOrder({
          orderId: this.id,
          newDate: this.rescheduleDate,
          newStartTime: this.selectedStartTime
        });
        uni.showToast({ title: '改期成功', icon: 'success' });
        this.showReschedule = false;
        // 改期成功后回读详情，保证页面展示与服务端一致。
        this.loadDetail();
      } catch (err) {
        if (err && err.code === 409) {
          await this.loadSlots();
          uni.showToast({ title: '时段状态已变化，请重试', icon: 'none' });
          return;
        }
        if (err && err.code === 422) {
          const msg = err.message || '当前状态不允许改期';
          uni.showToast({ title: msg, icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '改期失败', icon: 'none' });
      }
    },
    // 跳转评价页
    goReview() {
      if (!this.id) return;
      uni.navigateTo({ url: `/pages/order/review?orderId=${this.id}` });
    },
    // 跳转售后页
    goAftersale() {
      if (!this.id) return;
      uni.navigateTo({ url: `/pages/order/aftersale?orderId=${this.id}` });
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
  background: linear-gradient(140deg, #0f172a, #1e293b);
  box-shadow: 0 14rpx 30rpx rgba(15, 23, 42, 0.16);
  margin-bottom: 18rpx;
}

.hero-subtitle {
  display: block;
  color: rgba(255, 255, 255, 0.82);
  font-size: 24rpx;
  line-height: 1.5;
}

.hint {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-placeholder;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
  box-shadow: $uni-shadow-base;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.label {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.value {
  color: $uni-text-color;
  font-size: $uni-font-size-base;
}

.meta {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.code {
  font-weight: 700;
  font-size: 34rpx;
  color: $uni-color-primary;
}

.actions {
  margin-top: 12rpx;
  display: flex;
  gap: 16rpx;
}

.action-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel {
  margin-top: 20rpx;
  padding: 20rpx;
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.panel-title {
  display: block;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.panel-toggle {
  color: $uni-color-primary;
  font-size: $uni-font-size-sm;
}

.panel-input {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 18rpx 20rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  margin-bottom: 16rpx;
}

.panel-textarea {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 18rpx 20rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  margin-bottom: 16rpx;
  min-height: 180rpx;
  width: 100%;
  box-sizing: border-box;
}

.panel-btn {
  margin-top: 8rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-text {
  display: block;
  color: $uni-text-color;
  font-size: $uni-font-size-sm;
  margin-bottom: 6rpx;
}

.review-stars {
  color: #FFD700;
  font-weight: 700;
}

.review-score {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  margin-left: 8rpx;
}

.review-images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 8rpx;
}

.review-image {
  width: 160rpx;
  height: 160rpx;
  border-radius: $uni-border-radius-base;
  background: #f0f0f0;
}

.slots-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
  margin-bottom: 12rpx;
}

.slot-item {
  padding: 18rpx 16rpx;
  border-radius: $uni-border-radius-lg;
  background: #ffffff;
  border: 2rpx solid transparent;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.04);
}

.slot-time {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: $uni-text-color;
}

.slot-status {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $uni-text-color-grey;
}

.slot-available {
  border-color: rgba(82, 196, 26, 0.3);
}

.slot-booked {
  background: #f0f0f0;
  color: $uni-text-color-placeholder;
}

.slot-expired {
  background: #f5f5f5;
  color: $uni-text-color-placeholder;
  border-color: #d9d9d9;
  opacity: 0.8;
}

.slot-expired .slot-time,
.slot-expired .slot-status {
  color: $uni-text-color-placeholder;
}

.slot-unavailable {
  background: #f7f7f7;
  color: $uni-text-color-placeholder;
  border-color: #e5e5e5;
  opacity: 0.75;
}

.slot-unavailable .slot-time,
.slot-unavailable .slot-status {
  color: $uni-text-color-placeholder;
}

.slot-selected {
  border-color: $uni-color-success;
  background: rgba(82, 196, 26, 0.12);
}
</style>
