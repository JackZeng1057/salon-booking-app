<template>
  <view class="page">
    <app-nav />
    <text class="title">理发师审核</text>

    <view v-if="loading" class="hint">加载中...</view>
    <view v-else-if="list.length === 0" class="hint">暂无申请</view>

    <view v-else class="list">
      <view v-for="item in list" :key="item._id" class="card">
        <view class="header-row">
          <view class="identity">
            <image class="avatar" :src="item.avatar || defaultAvatar" mode="aspectFill" />
            <view class="meta">
              <text class="name">{{ item.name || item.username }}</text>
              <text class="sub">账号：{{ item.username || '-' }}</text>
              <text class="sub">手机号：{{ item.phone || '未绑定' }}</text>
            </view>
          </view>
          <text class="status-tag" :class="statusClass(item.approvalStatus)">
            {{ formatStatus(item.approvalStatus) }}
          </text>
        </view>

        <view class="time-row">
          <text>申请时间：{{ formatTime(item.createdAt) }}</text>
        </view>

        <view v-if="item.approvalStatus === 'REJECTED' && item.approvalReason" class="reason-row">
          <text>拒绝原因：{{ item.approvalReason }}</text>
        </view>

        <view v-if="item.approvalStatus === 'PENDING'" class="actions">
          <button class="action-btn reject" @click="handleReview(item, 'REJECT')">拒绝</button>
          <button class="action-btn approve" @click="handleReview(item, 'APPROVE')">通过</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { fetchBarberApplications, reviewBarberApplication } from '../../../api/barberApproval';

export default {
  data() {
    return {
      loading: false,
      reviewing: false,
      list: [],
      defaultAvatar: 'https://dummyimage.com/100x100/efefef/999&text=B'
    };
  },
  onLoad() {
    this.loadList();
  },
  onShow() {
    this.loadList();
  },
  methods: {
    async loadList() {
      this.loading = true;
      try {
        const data = await fetchBarberApplications({
          page: 1,
          pageSize: 50,
          status: 'PENDING'
        });
        this.list = Array.isArray(data && data.list) ? data.list : [];
      } catch (err) {
        this.list = [];
        uni.showToast({ title: err.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    formatStatus(status) {
      if (status === 'APPROVED') return '已通过';
      if (status === 'REJECTED') return '未通过';
      return '待审核';
    },
    statusClass(status) {
      if (status === 'APPROVED') return 'ok';
      if (status === 'REJECTED') return 'fail';
      return 'wait';
    },
    formatTime(ts) {
      const n = Number(ts || 0);
      if (!n) return '-';
      const d = new Date(n);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    },
    handleReview(item, action) {
      if (this.reviewing) return;
      const isApprove = action === 'APPROVE';
      uni.showModal({
        title: isApprove ? '确认通过' : '确认拒绝',
        content: isApprove ? '通过后该账号将成为理发师账号，是否继续？' : '拒绝后该账号保持普通用户，是否继续？',
        success: async (res) => {
          if (!res.confirm) return;
          this.reviewing = true;
          try {
            await reviewBarberApplication({
              userId: item._id,
              action
            });
            uni.showToast({ title: isApprove ? '已通过' : '已拒绝', icon: 'success' });
            this.loadList();
          } catch (err) {
            uni.showToast({ title: err.message || '操作失败', icon: 'none' });
          } finally {
            this.reviewing = false;
          }
        }
      });
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
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

.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.identity {
  display: flex;
  gap: 16rpx;
  flex: 1;
}

.avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 44rpx;
  background: #f3f4f6;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.name {
  font-size: 32rpx;
  color: $uni-text-color;
  font-weight: 700;
}

.sub {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
}

.status-tag {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: $uni-font-size-sm;
}

.status-tag.wait {
  background: #fff7e6;
  color: #d48806;
}

.status-tag.ok {
  background: #f6ffed;
  color: #389e0d;
}

.status-tag.fail {
  background: #fff1f0;
  color: #cf1322;
}

.time-row,
.reason-row {
  margin-top: 16rpx;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
}

.actions {
  margin-top: 20rpx;
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}

.action-btn {
  min-width: 140rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 36rpx;
  font-size: $uni-font-size-sm;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn.reject {
  background: #f5f5f5;
  color: $uni-text-color-grey;
  border: 1rpx solid #d9d9d9;
}

.action-btn.approve {
  background: $uni-color-primary;
  color: #ffffff;
  border: none;
}
</style>
