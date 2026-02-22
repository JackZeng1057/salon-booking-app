<template>
  <view class="page">
    <app-nav :showTitle="true" title="我的评价" />
    <view class="hero-card">
      <text class="hero-subtitle">查看历史评价与评分，支持回访与管理</text>
    </view>

    <view v-if="loading && reviews.length === 0" class="hint">加载中...</view>
    <view v-else-if="reviews.length === 0" class="hint">暂无评价记录</view>

    <view v-else class="list">
      <view v-for="item in reviews" :key="item._id" class="card">
        <view class="card-head">
          <text class="store">{{ item.storeName || item.storeId || '门店' }}</text>
          <text class="time">{{ formatTime(item.createdAt) }}</text>
        </view>

        <view class="order-meta">
          <text class="meta-line">订单号：{{ item.orderNo || '-' }}</text>
          <text class="meta-line">{{ item.serviceName || '服务' }} · {{ item.barberName || '技师' }}</text>
          <text class="meta-line">{{ item.date || '-' }} {{ item.startTime || '' }}{{ item.endTime ? '-' + item.endTime : '' }}</text>
        </view>

        <view class="rating-row">
          <text class="score">{{ formatScore(item.rating) }}</text>
          <text class="stars">{{ formatStars(item.rating) }}</text>
        </view>

        <text class="content">{{ item.content || '（无评价内容）' }}</text>

        <view v-if="item.images && item.images.length" class="images-row">
          <image
            v-for="(img, idx) in item.images"
            :key="idx"
            class="review-image"
            :src="img"
            mode="aspectFill"
            @click="previewImages(item.images, idx)"
          />
        </view>

        <view v-if="item.reply && item.reply.content" class="reply-box">
          <text class="reply-label">商家回复：</text>
          <text class="reply-content">{{ item.reply.content }}</text>
        </view>

        <view class="actions">
          <button class="btn btn-light" type="default" @click="goOrderDetail(item)">查看订单</button>
          <button
            class="btn btn-danger"
            type="warn"
            :loading="deletingId === item._id"
            @click="confirmDelete(item)"
          >
            删除评价
          </button>
        </view>
      </view>

      <view class="load-more" @click="loadMore">
        <text>{{ hasMore ? (loadingMore ? '加载中...' : '加载更多') : '没有更多了' }}</text>
      </view>
    </view>

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
import { fetchMyReviews, deleteReview } from '../../../api/order';

/**
 * 我的评价列表页
 * 支持：
 * 1) 分页加载历史评价
 * 2) 预览评价图片
 * 3) 删除评价（带二次确认）
 */
export default {
  data() {
    return {
      // 首屏加载态
      loading: false,
      // 追加加载态（加载更多）
      loadingMore: false,
      // 当前正在删除的评价 ID（用于按钮 loading）
      deletingId: '',
      // 评价列表
      reviews: [],
      // 分页参数
      page: 1,
      pageSize: 10,
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
  onShow() {
    this.loadReviews(true);
  },
  onPullDownRefresh() {
    this.loadReviews(true).finally(() => uni.stopPullDownRefresh());
  },
  onReachBottom() {
    this.loadMore();
  },
  methods: {
    // 统一格式化评分为 1 位小数
    formatScore(rating) {
      if (!rating) return '0.0';
      const score = typeof rating === 'number' ? rating : rating.overall;
      return Number(score || 0).toFixed(1);
    },
    // 将评分转为星级字符展示
    formatStars(rating) {
      if (!rating) return '☆☆☆☆☆';
      const score = Number(typeof rating === 'number' ? rating : rating.overall) || 0;
      const count = Math.max(0, Math.min(5, Math.round(score)));
      return '★'.repeat(count) + '☆'.repeat(5 - count);
    },
    // 时间戳转本地可读时间
    formatTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    },
    // 图片大图预览
    previewImages(urls, index) {
      if (!Array.isArray(urls) || urls.length === 0) return;
      uni.previewImage({ urls, current: index });
    },
    // 跳转订单详情
    goOrderDetail(item) {
      if (!item || !item.orderId) {
        uni.showToast({ title: '订单信息不存在', icon: 'none' });
        return;
      }
      uni.navigateTo({ url: `/pages/order/detail?id=${item.orderId}` });
    },
    // 拉取评价列表（支持重置与追加）
    async loadReviews(reset = false) {
      if (this.loading || (!reset && !this.hasMore)) return;
      let ok = true;
      if (reset) {
        this.page = 1;
        this.hasMore = true;
      }

      this.loading = true;
      try {
        const res = await fetchMyReviews({
          page: this.page,
          pageSize: this.pageSize
        });
        const list = (res && res.list) || [];
        if (reset) {
          this.reviews = list;
        } else {
          this.reviews = this.reviews.concat(list);
        }
        this.hasMore = !!(res && res.hasMore);
      } catch (err) {
        ok = false;
        uni.showToast({ title: err.message || '加载评价失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
      return ok;
    },
    // 上拉分页加载
    async loadMore() {
      if (this.loadingMore || this.loading || !this.hasMore) return;
      this.loadingMore = true;
      this.page += 1;
      try {
        const ok = await this.loadReviews(false);
        if (!ok) {
          this.page = Math.max(1, this.page - 1);
        }
      } finally {
        this.loadingMore = false;
      }
    },
    // 删除前二次确认，确认后调用删除接口并本地移除
    async confirmDelete(item) {
      if (!item || !item._id || this.deletingId) return;
      const confirmed = await this.openConfirmDialog({
        title: '删除评价',
        content: '确认删除这条评价吗？删除后可重新评价该订单。',
        confirmText: '删除',
        confirmType: 'danger'
      });
      if (!confirmed) return;

      this.deletingId = item._id;
      try {
        await deleteReview({ reviewId: item._id });
        this.reviews = this.reviews.filter((review) => review._id !== item._id);
        uni.showToast({ title: '评价已删除', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: err.message || '删除失败', icon: 'none' });
      } finally {
        this.deletingId = '';
      }
    },
    // 打开通用确认弹窗，返回 Promise<boolean>
    openConfirmDialog(options = {}) {
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
    // 关闭确认弹窗并将结果返回给调用方
    closeConfirmDialog(result) {
      const resolver = this.confirmDialogResolver;
      this.confirmDialogResolver = null;
      this.confirmDialog.visible = false;
      if (typeof resolver === 'function') resolver(!!result);
    },
    handleConfirmDialogCancel() {
      this.closeConfirmDialog(false);
    },
    // 确认按钮回调
    handleConfirmDialogConfirm() {
      this.closeConfirmDialog(true);
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
  color: $uni-text-color-placeholder;
  font-size: $uni-font-size-base;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  box-shadow: $uni-shadow-base;
  padding: 24rpx;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.store {
  font-size: 32rpx;
  font-weight: 700;
  color: $uni-text-color;
}

.time {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
}

.order-meta {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  margin-bottom: 14rpx;
}

.meta-line {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.confirm-dialog-content {
  color: #334155;
  font-size: 27rpx;
  line-height: 1.6;
}

.rating-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.score {
  color: #d46b08;
  font-size: 34rpx;
  font-weight: 700;
}

.stars {
  color: #f5a623;
  font-size: 28rpx;
}

.content {
  display: block;
  color: $uni-text-color;
  font-size: $uni-font-size-base;
  line-height: 1.6;
  margin-bottom: 14rpx;
}

.images-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-bottom: 14rpx;
}

.review-image {
  width: 146rpx;
  height: 146rpx;
  border-radius: $uni-border-radius-base;
  background: #f3f4f6;
}

.reply-box {
  margin-bottom: 14rpx;
  padding: 14rpx;
  border-radius: $uni-border-radius-base;
  background: #f8fafc;
  border: 1rpx solid #e5e7eb;
}

.reply-label {
  color: #334155;
  font-size: $uni-font-size-sm;
  font-weight: 600;
}

.reply-content {
  color: #475569;
  font-size: $uni-font-size-sm;
}

.actions {
  display: flex;
  gap: 12rpx;
}

.btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0;
  font-size: $uni-font-size-base;
  border-radius: 999rpx;
}

.btn-light {
  color: $uni-text-color;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
}

.btn-danger {
  background: #fa5151;
  color: #ffffff;
  border: none;
}

.load-more {
  text-align: center;
  color: $uni-text-color-placeholder;
  font-size: $uni-font-size-sm;
  padding: 12rpx 0;
}
</style>
