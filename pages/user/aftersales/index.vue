<template>
  <view class="page">
    <view class="page-header">
      <app-nav :showTitle="true" title="售后处理" />
      <view class="hero-card">
        <text class="hero-subtitle">查看您提交过的售后申请及处理进度</text>
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y @scrolltolower="loadMore">
      <view v-if="loading && list.length === 0" class="hint">加载中...</view>
      <view v-else-if="list.length === 0" class="hint">暂无售后记录</view>

      <view v-else class="list">
        <view v-for="item in list" :key="item._id" class="card">
          <view class="card-head">
            <text class="type">{{ formatAftersaleType(item.type) }}</text>
            <view class="status-pill" :class="getStatusClass(item.status)">
              <text>{{ formatAftersaleStatus(item.status) }}</text>
            </view>
          </view>

          <view class="order-meta">
            <text class="meta-line">订单号：{{ getOrderNo(item) }}</text>
            <text class="meta-line">服务项目：{{ getServiceText(item) }}</text>
            <text class="meta-line">服务时间：{{ getServiceTimeText(item) }}</text>
            <text class="meta-line">提交时间：{{ formatTime(item.createdAt) }}</text>
          </view>

          <view class="block">
            <text class="label">问题描述</text>
            <text class="value">{{ item.content || '无' }}</text>
          </view>

          <view class="block">
            <text class="label">商家回复</text>
            <text class="value">{{ item.reply || '暂未回复' }}</text>
          </view>
        </view>

        <view class="load-more" @click="loadMore">
          <text>{{ hasMore ? (loadingMore ? '加载中...' : '加载更多') : '没有更多了' }}</text>
        </view>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>
  </view>
</template>

<script>
import { fetchMyAftersales } from '../../../api/order';
import { formatAftersaleStatus, formatAftersaleType } from '../../../utils/status';

export default {
  data() {
    return {
      loading: false,
      loadingMore: false,
      list: [],
      page: 1,
      pageSize: 10,
      hasMore: true
    };
  },
  onShow() {
    this.loadList(true);
  },
  onPullDownRefresh() {
    this.loadList(true).finally(() => uni.stopPullDownRefresh());
  },
  onReachBottom() {
    this.loadMore();
  },
  methods: {
    formatAftersaleStatus,
    formatAftersaleType,
    // 售后状态映射到颜色标签，确保与管理员端状态口径一致
    getStatusClass(status) {
      const map = {
        OPEN: 'is-open',
        PROCESSING: 'is-processing',
        RESOLVED: 'is-resolved',
        REJECTED: 'is-rejected'
      };
      const key = String(status || '').toUpperCase();
      return map[key] || 'is-default';
    },
    // 时间戳格式化为 yyyy-MM-dd HH:mm
    formatTime(ts) {
      if (!ts) return '-';
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    },
    // 订单展示兜底：优先订单号，其次订单ID
    getOrderNo(item) {
      if (!item) return '-';
      const orderNo = String(item.orderNo || '').trim();
      if (orderNo) return orderNo;
      const orderId = String(item.orderId || '').trim();
      return orderId || '-';
    },
    // 服务展示兜底：优先服务名，其次服务ID
    getServiceText(item) {
      if (!item) return '-';
      const serviceName = String(item.serviceName || '').trim();
      if (serviceName) return serviceName;
      const serviceId = String(item.serviceId || '').trim();
      return serviceId || '-';
    },
    // 服务时间展示：date + start-end，字段缺失时按可用部分降级展示
    getServiceTimeText(item) {
      if (!item) return '-';
      const date = String(item.date || '').trim();
      const start = String(item.startTime || '').trim();
      const end = String(item.endTime || '').trim();
      const range = [start, end].filter((part) => !!part).join('-');
      if (!date && !range) return '-';
      if (!date) return range;
      if (!range) return date;
      return `${date} ${range}`;
    },
    // reset=true 时重置分页并覆盖列表；否则执行追加加载
    async loadList(reset = false) {
      if (this.loading || (!reset && !this.hasMore)) return;
      let ok = true;
      if (reset) {
        this.page = 1;
        this.hasMore = true;
      }

      this.loading = true;
      try {
        const res = await fetchMyAftersales({
          page: this.page,
          pageSize: this.pageSize
        });
        const rows = (res && res.list) || [];
        if (reset) {
          this.list = rows;
        } else {
          this.list = this.list.concat(rows);
        }
        this.hasMore = !!(res && res.hasMore);
      } catch (err) {
        ok = false;
        uni.showToast({ title: err.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
      return ok;
    },
    // 触底加载：先 +1 页，失败时回滚页码避免“跳页”
    async loadMore() {
      if (this.loadingMore || this.loading || !this.hasMore) return;
      this.loadingMore = true;
      this.page += 1;
      try {
        const ok = await this.loadList(false);
        if (!ok) {
          this.page = Math.max(1, this.page - 1);
        }
      } finally {
        this.loadingMore = false;
      }
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: #f8fafc;
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f8fafc;
}

.hero-card {
  margin: calc(102rpx + 20px) 20rpx 12rpx;
  border-radius: 26rpx;
  padding: 24rpx;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  box-shadow: 0 12rpx 28rpx rgba(15, 23, 42, 0.18);
}

.hero-subtitle {
  display: block;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.84);
  line-height: 1.5;
}

.page-scroll {
  height: calc(100vh - 100rpx);
}

.list {
  padding: 8rpx 20rpx 0;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.card {
  border-radius: 20rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  padding: 18rpx;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.type {
  font-size: 28rpx;
  color: #0f172a;
  font-weight: 600;
}

.status-pill {
  border-radius: 999rpx;
  padding: 8rpx 18rpx;
  font-size: 21rpx;
}

.is-open {
  background: #fff7ed;
  color: #c2410c;
}

.is-processing {
  background: #eff6ff;
  color: #1d4ed8;
}

.is-resolved {
  background: #ecfdf5;
  color: #047857;
}

.is-rejected {
  background: #fef2f2;
  color: #b91c1c;
}

.is-default {
  background: #f1f5f9;
  color: #475569;
}

.order-meta {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: 14rpx;
  border-radius: 14rpx;
  background: #f8fafc;
  margin-bottom: 12rpx;
}

.meta-line {
  font-size: 23rpx;
  color: #334155;
  line-height: 1.5;
}

.block {
  margin-bottom: 10rpx;
}

.label {
  display: block;
  font-size: 22rpx;
  color: #64748b;
  margin-bottom: 4rpx;
}

.value {
  display: block;
  font-size: 24rpx;
  color: #0f172a;
  line-height: 1.6;
}

.hint {
  text-align: center;
  color: #94a3b8;
  font-size: 24rpx;
  padding: 100rpx 0;
}

.load-more {
  padding: 18rpx 0 10rpx;
  text-align: center;
  color: #94a3b8;
  font-size: 22rpx;
}

.scroll-bottom-gap {
  height: 36rpx;
}
</style>
