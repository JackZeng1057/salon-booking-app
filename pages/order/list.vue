<template>
  <view class="page">
    <app-nav :showTitle="true" title="我的订单" />
    <view class="hero-card">
      <text class="hero-subtitle">按状态筛选预约记录，支持分页加载</text>
    </view>

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
        class="card"
        @click="goDetail(order._id)"
      >
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
</template>

<script>
// 我的订单页：状态筛选、分页与增量同步
// 读取策略：
// 1) 首屏优先读本地缓存提升速度；
// 2) 有 lastSyncAt 时走增量同步补齐变更；
// 3) 触底分页按页追加。
import { fetchOrderList } from '../../api/order';
import { getCache } from '../../utils/cache';
import { formatOrderStatus } from '../../utils/status';

export default {
  data() {
    return {
      loading: false,
      orders: [],
      // 当前筛选状态（空字符串=全部）
      status: '',
      // 分页参数
      page: 1,
      pageSize: 10,
      hasMore: true,
      // 增量同步游标：后端返回的“最后更新时间戳”
      lastSyncAt: 0,
      // tabs 与后端状态枚举映射
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
    // 首次进入拉取数据
    this.loadOrders(true);
  },
  onShow() {
    // 回到页面时刷新，确保详情页操作后的状态可见
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
    // 缓存按“筛选条件 + 分页参数”隔离，避免不同筛选串数据。
    getCacheKey() {
      return `orders-mine:${this.status || ''}:${this.page || 1}:${this.pageSize || 10}`;
    },
    // 合并增量返回的订单：以 _id 去重，后到数据覆盖旧字段。
    mergeOrders(list) {
      const map = new Map(this.orders.map((o) => [o._id, o]));
      list.forEach((item) => {
        if (!item || !item._id) return;
        const existing = map.get(item._id) || {};
        map.set(item._id, { ...existing, ...item });
      });
      return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    // 增量同步：只拉取 lastSyncAt 之后变更，降低网络与解析开销。
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
        // 静默失败：不打断用户当前浏览，下一次全量/增量刷新会自动纠正。
      }
    },
    // 获取订单列表
    async loadOrders(reset = false) {
      // 非重置模式下，若已无更多数据则直接返回。
      if (!this.hasMore && !reset) return;
      if (reset) {
        // 重置分页游标并允许继续翻页。
        this.page = 1;
        this.hasMore = true;
      }
      const key = this.getCacheKey();
      if (this.page === 1) {
        // 首屏命中缓存：立即渲染 + 后台增量补齐，减少白屏等待。
        const cached = getCache(key);
        if (cached && Array.isArray(cached.list)) {
          this.orders = cached.list;
          this.lastSyncAt = cached.lastSyncAt || 0;
          this.hasMore = cached.list.length >= this.pageSize;
          this.loading = false;
          await this.syncIncremental();
          return;
        }
      }
      this.loading = true;
      try {
        // 分页拉取当前筛选下的数据
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
        // 返回数量达到 pageSize 说明可能还有下一页。
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
      // 切换筛选后重置列表与增量游标，重新走首屏加载逻辑。
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
