<template>
  <view class="orders-page">
    <!-- 顶部导航栏，标题固定为"门店订单" -->
    <app-nav :showTitle="true" title="门店订单" />

    <!-- =====================================================
         顶部筛选控制条
         - 状态 Tab：全部/待到店/服务中/已完成/已取消/爽约，点击切换筛选
         - 日期选择器：按日期过滤订单，默认今天；modern-date-picker 自定义组件
         - 两者联动：变更任一均重新过滤 filteredOrders 计算属性
    ===================================================== -->
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

      <!-- 日期选择器：picker 插槽内显示当前已选日期文本 -->
      <view class="field">
        <text class="label">日期</text>
        <modern-date-picker :value="date" @change="onDateChange">
          <view class="picker-value">{{ date }}</view>
        </modern-date-picker>
      </view>
    </view>

    <!-- =====================================================
         订单列表滚动区
         - 支持侧滑删除：左滑露出红色删除按钮（canSwipeDelete 判断权限）
         - 每张订单卡片包含：
           * 门店名（带图标）+ 状态徽章（按 statusClass() 动态着色）
           * 服务名 + 预约时间段 + 理发师名
           * 排队等待提示（waitHint）
           * 订单号
           * 操作按钮区：开始服务 / 完成服务 / 取消订单 / 标记爽约
             - 开始服务：需先核验顾客（弹出核验码输入弹窗），ARRIVED 状态可用
             - 完成服务：IN_SERVICE 状态可用
             - 取消订单：BOOKED/ARRIVED 状态且 canCancel() 判定为真
             - 标记爽约：顾客超时未到，canNoShow() 判断后允许操作
    ===================================================== -->
    <scroll-view class="orders-scroll" scroll-y>
      <view class="orders-scroll-content">
        <!-- 加载中占位 -->
        <view v-if="loading" class="hint">加载中...</view>
        <!-- 筛选后空状态 -->
        <view v-else-if="filteredOrders.length === 0" class="hint">暂无订单</view>

        <view v-else class="list">
          <view
            v-for="order in filteredOrders"
            :key="order._id"
            class="swipe-row"
            :class="{ 'swipe-open': getSwipeOffset(order._id) < 0 }"
            @touchstart="onTouchStart($event, order)"
            @touchmove="onTouchMove($event, order)"
            @touchend="onTouchEnd($event, order)"
          >
            <!-- 侧滑删除操作区（已完成/已取消才可删除） -->
            <view
              v-if="canSwipeDelete(order) && getSwipeOffset(order._id) < 0"
              class="swipe-actions"
              :style="{ width: actionWidth + 'rpx' }"
            >
              <view class="swipe-delete" @click.stop="confirmDelete(order)">删除</view>
            </view>
            <!-- 订单卡片主体 -->
            <view class="swipe-content" :style="getSwipeStyle(order)">
              <view class="order-card">
                <!-- 卡片头部：门店名 + 状态徽章 -->
                <view class="order-head">
                  <view class="store-line">
                    <app-icon name="store" color="#94A3B8" :size="20" :stroke-width="2.1" />
                    <text class="store-name">{{ order.storeName || order.storeId || '门店订单' }}</text>
                  </view>
                  <!-- 状态徽章：颜色由 statusClass() 根据 order.status 动态绑定 -->
                  <view class="status-pill" :class="statusClass(order.status)">
                    {{ formatOrderStatus(order.status) }}
                  </view>
                </view>
                <!-- 订单主信息 -->
                <view class="order-main">
                  <text class="service-name">{{ order.serviceName || order.serviceId || '未知服务' }}</text>
                  <text class="meta">预约时间：{{ order.date }} {{ order.startTime }}-{{ order.endTime }}</text>
                  <text class="meta">理发师：{{ order.barberName || order.barberId || '未知' }}</text>
                </view>
                <!-- 排队等待提示（有队列信息时显示） -->
                <view v-if="waitHint(order)" class="order-queue">
                  <text class="meta">{{ waitHint(order) }}</text>
                </view>
                <!-- 卡片底部：订单号 -->
                <view class="order-foot">
                  <text class="foot-text">订单号：{{ order.orderNo || order._id }}</text>
                </view>
                <!-- 操作按钮区：仅对可操作状态的订单显示 -->
                <view v-if="showActions(order.status) || canNoShow(order) || canCancel(order)" class="actions">
                  <!-- 开始服务：前置弹出核验码输入弹窗，核验通过后触发 ARRIVED→IN_SERVICE -->
                  <button
                    class="action-btn"
                    type="primary"
                    :loading="isActionLoading(order._id, 'start')"
                    :disabled="!canStart(order.status) || isActionLoading(order._id, 'start')"
                    @click="handleStartAction(order)"
                  >
                    开始服务
                  </button>
                  <!-- 完成服务：IN_SERVICE→FINISHED，关闭服务流程 -->
                  <button
                    class="action-btn"
                    type="default"
                    :loading="isActionLoading(order._id, 'finish')"
                    :disabled="!canFinish(order.status) || isActionLoading(order._id, 'finish')"
                    @click="handleFinish(order._id)"
                  >
                    完成服务
                  </button>
                  <!-- 取消订单：BOOKED/ARRIVED 状态下可取消 -->
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
                  <!-- 标记爽约：顾客超时未到店时由管理员手动触发，订单转为 NO_SHOW -->
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
        <view class="scroll-bottom-safe"></view>
      </view>
    </scroll-view>

    <!-- =====================================================
         核验码输入弹窗（点击"开始服务"时弹出）
         - 管理员输入顾客手机上显示的 6 位预约核验码
         - 点击"核验并开始"后调用 orders-verify + orders-start-service
         - 核验成功才真正触发 ARRIVED→IN_SERVICE 状态流转
    ===================================================== -->
    <app-modal
      :visible="showVerifyModal"
      title="输入核验码"
      subtitle="请向顾客核对预约核验码后再开始服务"
      confirm-text="核验并开始"
      :confirm-disabled="!(verifyCodeInput || '').trim()"
      @close="closeVerifyModal"
      @cancel="closeVerifyModal"
      @confirm="confirmVerifyStart"
    >
      <view class="verify-box">
        <!-- 6位数字输入框，inputmode="numeric" 优化移动端键盘类型 -->
        <input
          class="verify-input"
          v-model="verifyCodeInput"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="请输入6位核验码"
        />
        <text class="verify-tip">核验成功后订单将进入服务中状态</text>
      </view>
    </app-modal>

    <!-- 通用操作二次确认弹窗（取消/删除等需确认的操作） -->
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
// 门店订单页：核验开始、完结服务与爽约标记
// 页面职责：
// 1) 门店侧按日期管理订单状态流转；
// 2) 提供到店核验、开始服务、完成服务、取消、爽约、删除等操作；
// 3) 支持增量同步与侧滑删除，保证高频操作场景下的交互流畅。
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
      actionLoading: {},
      confirmDialog: {
        visible: false,
        title: '',
        content: '',
        confirmText: '确定',
        confirmType: 'primary'
      },
      confirmDialogResolver: null,
      activeTab: 'pending',
      statusOptions: [
        { label: '全部', value: 'all' },
        { label: '待服务', value: 'pending' },
        { label: '已完成', value: 'completed' },
        { label: '已取消', value: 'cancelled' }
      ]
    };
  },
  computed: {
    // 按 UI 标签聚合订单状态，避免在模板中写复杂判断。
    filteredOrders() {
      const mapStatus = (status) => {
        const s = this.normalizeStatus(status);
        if (s === 'BOOKED' || s === 'ARRIVED' || s === 'IN_SERVICE') return 'pending';
        if (s === 'FINISHED') return 'completed';
        if (s === 'CANCELLED' || s === 'NO_SHOW') return 'cancelled';
        return 'pending';
      };
      if (this.activeTab === 'all') return this.orders || [];
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
    // “开始服务”入口：
    // - ARRIVED 状态可直接开始；
    // - BOOKED 状态需先核验验证码再开始。
    async handleStartAction(order) {
      if (!order || !order._id) return;
      const status = this.normalizeStatus(order.status);
      if (status === 'ARRIVED') {
        await this.handleStart(order._id);
        return;
      }
      this.openVerifyModal(order._id);
    },
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
    statusClass(status) {
      const s = this.normalizeStatus(status);
      if (s === 'BOOKED' || s === 'ARRIVED' || s === 'IN_SERVICE') return 'is-pending';
      if (s === 'FINISHED') return 'is-finished';
      return 'is-cancelled';
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
      const confirmed = await this.openConfirmDialog({
        title: '删除订单',
        content: '确定删除该订单吗？删除后不会在订单列表显示。',
        confirmText: '删除',
        confirmType: 'danger'
      });
      if (!confirmed) return;
      try {
        await deleteOrder({ orderId: order._id });
        this.orders = this.orders.filter((item) => item._id !== order._id);
        this.closeSwipe(order._id);
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: err.message || '删除失败', icon: 'none' });
      }
    },
    parseTimeToMinutes(text) {
      const m = String(text || '').match(/^(\d{2}):(\d{2})$/);
      if (!m) return NaN;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
      return hh * 60 + mm;
    },
    estimateOrderDurationMin(order) {
      const start = this.parseTimeToMinutes(order && order.startTime);
      const end = this.parseTimeToMinutes(order && order.endTime);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return end - start;
      }
      // 兜底 45 分钟
      return 45;
    },
    getRemainingServiceMin(order) {
      const duration = this.estimateOrderDurationMin(order);
      const inServiceAt = Number(order && order.inServiceAt);
      if (!Number.isFinite(inServiceAt) || inServiceAt <= 0) return duration;
      const elapsed = Math.floor((Date.now() - inServiceAt) / (60 * 1000));
      return Math.max(duration - elapsed, 5);
    },
    // 计算排队信息：仅 ARRIVED 订单显示“前方人数 + 预计等待分钟”
    queueSnapshot(order) {
      const status = this.normalizeStatus(order && order.status);
      const barberId = order && order.barberId;
      if (status !== 'ARRIVED' || !barberId) return null;

      const queue = (this.orders || [])
        .filter((o) => {
          const s = this.normalizeStatus(o && o.status);
          return o && o.barberId === barberId && (s === 'ARRIVED' || s === 'IN_SERVICE');
        })
        .sort((a, b) => {
          const sa = this.normalizeStatus(a && a.status);
          const sb = this.normalizeStatus(b && b.status);
          if (sa !== sb) return sa === 'IN_SERVICE' ? -1 : 1;
          const aa = Number(a && a.arrivedAt);
          const bb = Number(b && b.arrivedAt);
          if (Number.isFinite(aa) && Number.isFinite(bb) && aa !== bb) return aa - bb;
          return String((a && a.startTime) || '').localeCompare(String((b && b.startTime) || ''));
        });

      const idx = queue.findIndex((o) => o && o._id === order._id);
      if (idx <= 0) return { aheadCount: 0, waitMinutes: 0 };

      const aheadOrders = queue.slice(0, idx);
      const waitMinutes = aheadOrders.reduce((sum, item) => {
        const s = this.normalizeStatus(item && item.status);
        if (s === 'IN_SERVICE') return sum + this.getRemainingServiceMin(item);
        return sum + this.estimateOrderDurationMin(item);
      }, 0);
      return { aheadCount: idx, waitMinutes };
    },
    waitHint(order) {
      const aheadCount = Number(order && order.queueAheadCount);
      const waitMin = Number(order && order.queueWaitMin);
      if (Number.isFinite(aheadCount) && Number.isFinite(waitMin)) {
        if (this.normalizeStatus(order && order.status) !== 'ARRIVED') return '';
        return `预计等待：前方 ${Math.max(aheadCount, 0)} 人，约 ${Math.max(waitMin, 0)} 分钟`;
      }
      const snapshot = this.queueSnapshot(order);
      if (!snapshot) return '';
      return `预计等待：前方 ${snapshot.aheadCount} 人，约 ${snapshot.waitMinutes} 分钟`;
    },
    canStart(status) {
      const s = this.normalizeStatus(status);
      return s === 'ARRIVED';
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
    // 增量同步时合并新旧数据，按开始时间倒序（最新在前）
    mergeOrders(list) {
      const map = new Map(this.orders.map((o) => [o._id, o]));
      list.forEach((item) => {
        if (!item || !item._id) return;
        const existing = map.get(item._id) || {};
        map.set(item._id, { ...existing, ...item });
      });
      return Array.from(map.values()).sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
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
          // 使用 lastSyncAt 拉增量变更，降低门店端重复全量拉取压力。
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
        if (verifyCode) {
          // 仅在传入核验码时执行到店核验（BOOKED -> ARRIVED）
          await callCloud('orders-verify', { verifyCode });
        }
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
        // 422 多为状态竞争（被他端先操作），提示用户刷新后重试。
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
        // 统一处理状态冲突提示，减少“操作失败”模糊反馈。
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
        // 特殊错误码翻译为可理解业务文案。
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
      const confirmed = await this.openConfirmDialog({
        title: '取消订单',
        content: '确认取消该预约订单吗？',
        confirmText: '确认取消',
        confirmType: 'danger'
      });
      if (!confirmed) return;

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
        // 取消超时或状态不允许均走明确提示，避免店员误判系统异常。
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
    },
    openConfirmDialog(options = {}) {
      // 若已有未决弹窗，先回收上一个 Promise，防止悬空回调。
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
      if (typeof resolver === 'function') resolver(!!result);
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
  height: 34rpx;
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
  background: #ef4444;
  border-radius: 18rpx;
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

.order-card {
  background: #ffffff;
  border-radius: 18rpx;
  border: 1rpx solid #e2e8f0;
  padding: 14rpx;
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
}

.order-queue {
  margin-top: 6rpx;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.action-btn {
  flex: 1 1 30%;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 36rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.verify-box {
  border-radius: 20rpx;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  border: 1rpx solid #e2e8f0;
  padding: 20rpx;
}

.verify-input {
  width: 100%;
  border-radius: 14rpx;
  border: 2rpx solid #dbe2ea;
  background: #ffffff;
  padding: 0 20rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 32rpx;
  color: #0f172a;
  letter-spacing: 4rpx;
}

.verify-tip {
  display: block;
  margin-top: 12rpx;
  color: #64748b;
  font-size: 22rpx;
}

.confirm-dialog-content {
  color: #334155;
  font-size: 27rpx;
  line-height: 1.6;
}
</style>
