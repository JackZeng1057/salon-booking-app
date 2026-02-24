<template>
  <view class="orders-page">
    <!-- 通用顶部导航栏，标题固定为"我的预约" -->
    <app-nav :showBack="false" :showTitle="true" title="我的预约" />

    <!-- =====================================================
         状态 Tab 筛选区
         - statusOptions 包含："全部 / 待到店 / 服务中 / 已完成 / 已取消" 等选项
         - 点击切换 status 后自动重新拉取对应状态的订单列表
         - 激活项下方显示绿色高亮条（tab-line）
    ===================================================== -->
    <view class="orders-top">
      <view class="tabs-wrap">
        <view
          v-for="item in statusOptions"
          :key="item.value"
          class="tab-item"
          :class="{ active: status === item.value }"
          @click="changeStatus(item.value)"
        >
          <text>{{ item.label }}</text>
          <view v-if="status === item.value" class="tab-line"></view>
        </view>
      </view>
    </view>

    <!-- =====================================================
         订单列表滚动区
         - scrolltolower 触发分页加载更多
         - 列表为"侧滑删除"交互：
           * 向左滑动（swipe-open）露出红色删除区（swipe-actions）
           * 已完成/已取消才允许侧滑删除（canSwipeDelete 控制）
         - 每张订单卡片包含：
           * 门店名（带门店图标）+ 状态徽章（颜色按状态动态）
           * 服务名称 + 预约时间段 + 理发师姓名
           * 排队等待提示（waitHint — 仅有排队信息时显示）
           * 订单号 + 核验码（到店时凭核验码核身）
         - 点击卡片跳转订单详情页
    ===================================================== -->
    <scroll-view class="orders-scroll" scroll-y @scrolltolower="onListScrollToLower" lower-threshold="120">
      <view class="orders-scroll-content">
        <!-- 加载中占位 -->
        <view v-if="loading && orders.length === 0" class="hint">加载中...</view>
        <!-- 空状态提示 -->
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
            <!-- 侧滑删除操作区（仅 canSwipeDelete 为真且已左滑时显示） -->
            <view
              v-if="canSwipeDelete(order) && getSwipeOffset(order._id) < 0"
              class="swipe-actions"
              :style="{ width: actionWidth + 'rpx' }"
            >
              <view class="swipe-delete" @click.stop="confirmDelete(order)">删除</view>
            </view>

            <!-- 订单卡片主体：点击跳转订单详情 -->
            <view class="swipe-content" :style="getSwipeStyle(order)" @click="goDetail(order._id)">
              <view class="order-card">
                <!-- 卡片头部：门店名 + 状态徽章 -->
                <view class="order-head">
                  <view class="store-line">
                    <app-icon name="store" color="#94A3B8" :size="20" :stroke-width="2.1" />
                    <text class="store-name">{{ order.storeName || order.storeId || '未知门店' }}</text>
                  </view>
                  <!-- 状态徽章：颜色由 getStatusClass() 根据 order.status 动态绑定 -->
                  <view class="status-pill" :class="getStatusClass(order.status)">
                    {{ formatOrderStatus(order.status) }}
                  </view>
                </view>

                <!-- 订单主信息：服务名称 + 预约时间段 + 理发师 -->
                <view class="order-main">
                  <text class="service-name">{{ order.serviceName || order.serviceId || '未知服务' }}</text>
                  <text class="meta">预约时间：{{ order.date }} {{ order.startTime }}-{{ order.endTime }}</text>
                  <text class="meta">理发师：{{ order.barberName || order.barberId || '未知' }}</text>
                </view>
                <!-- 排队等待提示：当前排在第几位，仅有队列信息时显示 -->
                <view v-if="waitHint(order)" class="order-queue">
                  <text class="meta">{{ waitHint(order) }}</text>
                </view>

                <!-- 卡片底部：订单号 + 6位核验码（到店出示给管理员扫码/输入核验） -->
                <view class="order-foot">
                  <text class="foot-text">订单号：{{ order.orderNo }}</text>
                  <text class="foot-text">核验码：{{ order.verifyCode }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
        <view class="scroll-bottom-safe"></view>
      </view>
    </scroll-view>

    <!-- 删除/操作二次确认弹窗（app-modal 通用组件） -->
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

    <!-- 底部用户 Tab 栏，当前选中 "orders"（我的预约） -->
    <bottom-tab-bar current="orders" />
  </view>
</template>

<script>
import { fetchOrderList, deleteOrder } from '../../../api/order';
import { getCache } from '../../../utils/cache';
import { formatOrderStatus } from '../../../utils/status';
import BottomTabBar from '../../../components/bottom-tab-bar/bottom-tab-bar.vue';

/**
 * 用户订单页（我的预约）
 * 核心能力：
 * 1) 按状态分页查看订单
 * 2) 支持缓存 + 增量同步降低首屏等待
 * 3) 已完成/已取消订单支持左滑删除
 */
export default {
  components: {
    BottomTabBar
  },
  data() {
    return {
      // 列表加载状态
      loading: false,
      // 订单列表
      orders: [],
      // 当前筛选状态（空字符串表示全部）
      status: '',
      // 分页参数
      page: 1,
      pageSize: 10,
      hasMore: true,
      // 增量同步游标（由后端返回）
      lastSyncAt: 0,
      // 左滑动作区宽度（rpx）
      actionWidth: 160,
      // 每行左滑偏移量缓存：{ [orderId]: number }
      swipeOffsets: {},
      // 当前展开的左滑行 ID
      swipeOpenId: '',
      // 触摸起始坐标
      touchStartX: 0,
      touchStartY: 0,
      // 通用确认弹窗状态
      confirmDialog: {
        visible: false,
        title: '',
        content: '',
        confirmText: '确定',
        confirmType: 'primary'
      },
      confirmDialogResolver: null,
      // 顶部状态筛选项
      statusOptions: [
        { label: '全部', value: '' },
        { label: '已预约', value: 'BOOKED' },
        { label: '已完成', value: 'FINISHED' },
        { label: '已取消', value: 'CANCELLED' }
      ]
    };
  },
  onLoad() {
    this.hideNativeTabBar();
    this.loadOrders(true);
  },
  onShow() {
    this.hideNativeTabBar();
    this.loadOrders(true);
  },
  onPullDownRefresh() {
    this.page = 1;
    this.loadOrders(true).finally(() => {
      uni.stopPullDownRefresh();
    });
  },
  onReachBottom() {
    this.page += 1;
    this.loadOrders();
  },
  methods: {
    // 内层滚动触底加载下一页
    onListScrollToLower() {
      if (this.loading || !this.hasMore) return;
      this.page += 1;
      this.loadOrders();
    },
    // 使用自定义底栏时隐藏系统 tabbar
    hideNativeTabBar() {
      try {
        uni.hideTabBar({ animation: false });
      } catch (e) {}
    },
    formatOrderStatus,
    // 兼容旧中文状态与新状态码
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
    // 状态文案映射为样式 class
    getStatusClass(status) {
      const normalized = this.normalizeStatus(status);
      if (normalized === 'BOOKED' || normalized === 'ARRIVED' || normalized === 'IN_SERVICE') {
        return 'is-pending';
      }
      if (normalized === 'FINISHED') {
        return 'is-finished';
      }
      if (normalized === 'CANCELLED' || normalized === 'NO_SHOW') {
        return 'is-cancelled';
      }
      return 'is-default';
    },
    // 仅“已到店”状态展示排队等待提示
    waitHint(order) {
      const status = this.normalizeStatus(order && order.status);
      if (status !== 'ARRIVED') return '';
      const ahead = Number(order && order.queueAheadCount);
      const waitMin = Number(order && order.queueWaitMin);
      if (!Number.isFinite(ahead) || !Number.isFinite(waitMin)) return '';
      return `当前等位：前方 ${Math.max(ahead, 0)} 人，预计等待约 ${Math.max(waitMin, 0)} 分钟`;
    },
    // 已取消/已完成订单支持左滑删除
    canSwipeDelete(order) {
      const status = this.normalizeStatus(order && order.status);
      return status === 'CANCELLED' || status === 'FINISHED';
    },
    // 读取单行左滑偏移
    getSwipeOffset(orderId) {
      return this.swipeOffsets[orderId] || 0;
    },
    // 设置单行左滑偏移（保持响应式）
    setSwipeOffset(orderId, value) {
      this.$set(this.swipeOffsets, orderId, value);
    },
    // 关闭指定行的左滑状态
    closeSwipe(orderId) {
      if (!orderId) return;
      this.setSwipeOffset(orderId, 0);
      if (this.swipeOpenId === orderId) {
        this.swipeOpenId = '';
      }
    },
    // 打开当前行前，先关闭其他已展开行
    resetSwipe(exceptId) {
      if (this.swipeOpenId && this.swipeOpenId !== exceptId) {
        this.closeSwipe(this.swipeOpenId);
      }
    },
    // 根据偏移值生成位移动画样式
    getSwipeStyle(order) {
      if (!this.canSwipeDelete(order)) return {};
      const offset = this.getSwipeOffset(order._id);
      return {
        transform: `translateX(${offset}rpx)`
      };
    },
    // 记录触摸起点
    onTouchStart(e, order) {
      if (!this.canSwipeDelete(order)) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.resetSwipe(order._id);
    },
    // 仅处理水平位移，限制最大左滑距离
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
    // 根据阈值决定保持展开或回弹关闭
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
    // 删除前二次确认，成功后本地移除
    async confirmDelete(order) {
      if (!this.canSwipeDelete(order)) return;
      const confirmed = await this.openConfirmDialog({
        title: '删除订单',
        content: '确定删除该订单吗？删除后可在后台数据中保留，但不会在列表显示。',
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
    // 与订单 API 缓存 key 保持一致
    getCacheKey() {
      return `orders-mine:${this.status || ''}:${this.page || 1}:${this.pageSize || 10}`;
    },
    // 合并增量订单并按更新时间倒序
    mergeOrders(list) {
      const map = new Map(this.orders.map((o) => [o._id, o]));
      list.forEach((item) => {
        if (!item || !item._id) return;
        const existing = map.get(item._id) || {};
        map.set(item._id, { ...existing, ...item });
      });
      return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    // 使用 lastSyncAt 增量拉取最新订单变更
    async syncIncremental() {
      if (!this.lastSyncAt) return;
      try {
        const data = await fetchOrderList({ status: this.status, lastSyncAt: this.lastSyncAt, limit: 20 });
        const list = (data && data.list) || [];
        if (list.length > 0) {
          this.orders = this.mergeOrders(list);
        }
        this.lastSyncAt = (data && data.lastSyncAt) || this.lastSyncAt;
      } catch (err) {}
    },
    // 加载订单：支持重置、缓存预热、分页加载
    // 分支逻辑：
    //   ① 首页且有缓存数据：先从缓存渲染，并在后台调用 syncIncremental 补取增量变更，实现首屏秒开
    //   ② 缓存为空：直接全量拉取后写入列表
    //   ③ 非首页（翻页）：直接居律拼接到现有列表
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
    // 切换筛选后重置分页并刷新列表
    changeStatus(value) {
      if (this.status === value) return;
      this.status = value;
      this.page = 1;
      this.hasMore = true;
      this.lastSyncAt = 0;
      this.loadOrders(true);
    },
    // 跳转订单详情
    goDetail(id) {
      if (!id) return;
      uni.navigateTo({ url: `/pages/order/detail?id=${id}` });
    },
    // 打开确认弹窗并返回 Promise<boolean>
    openConfirmDialog(options = {}) {
      if (this.confirmDialogResolver) {
        this.confirmDialogResolver(false);
        this.confirmDialogResolver = null;
      }
      const title = String(options.title || '').trim();
      const content = String(options.content || '').trim();
      const confirmText = String(options.confirmText || '确定').trim();
      const confirmType = options.confirmType === 'danger' ? 'danger' : 'primary';
      this.confirmDialog = {
        visible: true,
        title,
        content,
        confirmText,
        confirmType
      };
      return new Promise((resolve) => {
        this.confirmDialogResolver = resolve;
      });
    },
    // 关闭确认弹窗并回写结果
    closeConfirmDialog(result) {
      const resolver = this.confirmDialogResolver;
      this.confirmDialogResolver = null;
      this.confirmDialog.visible = false;
      if (typeof resolver === 'function') {
        resolver(!!result);
      }
    },
    // 取消回调
    handleConfirmDialogCancel() {
      this.closeConfirmDialog(false);
    },
    // 确认回调
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
  height: 184rpx;
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
  border-radius: 18rpx;
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
  visibility: hidden;
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
  font-size: 24rpx;
  font-weight: 600;
}

.swipe-content {
  transition: transform 0.2s ease;
}

.order-card {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 18rpx;
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
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  flex-shrink: 0;
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
  color: #b91c1c;
  background: #fef2f2;
}

.status-pill.is-default {
  color: #64748b;
  background: #f8fafc;
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

.order-queue {
  margin-top: 6rpx;
}

.order-foot {
  margin-top: 10rpx;
  display: flex;
  flex-direction: column;
  gap: 3rpx;
}

.foot-text {
  font-size: 20rpx;
  color: #94a3b8;
}

.confirm-dialog-content {
  color: #334155;
  font-size: 27rpx;
  line-height: 1.6;
}
</style>
