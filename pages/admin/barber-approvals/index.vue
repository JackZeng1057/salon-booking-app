<template>
  <view class="page">
    <app-nav :showTitle="true" title="理发师审核" />
    <view class="hero-card">
      <text class="hero-subtitle">统一审核理发师入驻申请并管理状态</text>
    </view>

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
import { fetchBarberApplications, reviewBarberApplication } from '../../../api/barberApproval';

/**
 * 理发师审核页面（管理员）
 * 功能：
 * 1) 拉取待审核申请列表
 * 2) 支持通过/拒绝审核操作
 * 3) 统一使用确认弹窗避免误操作
 */
export default {
  data() {
    return {
      // 列表加载态
      loading: false,
      // 审核提交中状态，防止重复操作
      reviewing: false,
      // 申请列表
      list: [],
      // 默认头像
      defaultAvatar: 'https://dummyimage.com/100x100/efefef/999&text=B',
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
  onLoad() {
    this.loadList();
  },
  onShow() {
    this.loadList();
  },
  methods: {
    // 拉取申请列表（当前仅展示待审核）
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
    // 审核状态转中文文案
    formatStatus(status) {
      if (status === 'APPROVED') return '已通过';
      if (status === 'REJECTED') return '未通过';
      return '待审核';
    },
    // 审核状态对应样式 class
    statusClass(status) {
      if (status === 'APPROVED') return 'ok';
      if (status === 'REJECTED') return 'fail';
      return 'wait';
    },
    // 时间戳格式化
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
    // 审核操作：二次确认后调用接口
    async handleReview(item, action) {
      if (this.reviewing) return;
      const isApprove = action === 'APPROVE';
      const confirmed = await this.openConfirmDialog({
        title: isApprove ? '确认通过' : '确认拒绝',
        content: isApprove ? '通过后该账号将成为理发师账号，是否继续？' : '拒绝后该账号保持普通用户，是否继续？',
        confirmText: isApprove ? '确认通过' : '确认拒绝',
        confirmType: isApprove ? 'primary' : 'danger'
      });
      if (!confirmed) return;
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
    },
    // 打开确认弹窗，返回 Promise<boolean>
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
    // 关闭确认弹窗并回写结果
    closeConfirmDialog(result) {
      const resolver = this.confirmDialogResolver;
      this.confirmDialogResolver = null;
      this.confirmDialog.visible = false;
      if (typeof resolver === 'function') resolver(!!result);
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

.confirm-dialog-content {
  color: #334155;
  font-size: 27rpx;
  line-height: 1.6;
}
</style>
