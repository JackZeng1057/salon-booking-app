<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <text class="title">售后管理</text>

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
    <view v-else-if="list.length === 0" class="hint">暂无售后</view>

    <view v-else class="list">
      <view v-for="item in list" :key="item._id" class="card">
        <view class="row">
          <text class="label">类型</text>
          <text class="tag">{{ formatAftersaleType(item.type) }}</text>
        </view>
        <view class="row">
          <text class="label">状态</text>
          <text class="tag status">{{ formatAftersaleStatus(item.status) }}</text>
        </view>
        <view class="row">
          <text class="label">描述</text>
          <text class="value">{{ item.content || '无' }}</text>
        </view>
        <view class="row">
          <text class="label">回复</text>
          <text class="value">{{ item.reply || '未回复' }}</text>
        </view>
        <view v-if="!item.reply" class="actions">
          <input
            class="input"
            :value="item._reply"
            :focus="item._focus"
            placeholder="填写回复"
            @input="onReplyInput($event, item)"
            @click="ensureReplyFocus(item)"
            @blur="item._focus = false"
          />
          <button class="action-btn" type="primary" @click="handleReply(item)">回复并处理</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
// 售后管理页：筛选处理状态并回复
import { fetchAftersales, replyAftersale } from '../../api/order';
import { formatAftersaleStatus, formatAftersaleType } from '../../utils/status';

export default {
  data() {
    return {
      loading: false,
      list: [],
      status: '',
      statusOptions: [
        { label: '全部', value: '' },
        { label: '待处理', value: 'OPEN' },
        { label: '处理中', value: 'PROCESSING' },
        { label: '已解决', value: 'RESOLVED' }
      ]
    };
  },
  onLoad() {
    this.loadList();
  },
  onShow() {
    this.loadList();
  },
  methods: {
    formatAftersaleStatus,
    formatAftersaleType,
    async loadList() {
      this.loading = true;
      try {
        const data = await fetchAftersales({ status: this.status });
        this.list = Array.isArray(data) ? data : [];
      } catch (err) {
        uni.showToast({ title: err.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    changeStatus(value) {
      this.status = value;
      this.loadList();
    },
    ensureReplyFocus(target) {
      this.list = this.list.map((item) => ({
        ...item,
        _focus: item._id === target._id
      }));
    },
    onReplyInput(e, item) {
      const val = (e && e.detail && e.detail.value) || '';
      item._reply = val;
    },
    async handleReply(item) {
      try {
        await replyAftersale({
          id: item._id,
          reply: item._reply || '',
          status: item._reply ? 'RESOLVED' : 'PROCESSING'
        });
        uni.showToast({ title: '已处理', icon: 'success' });
        item.reply = item._reply || '';
        item.status = item._reply ? 'RESOLVED' : 'PROCESSING';
        item._reply = '';
        item._focus = false;
      } catch (err) {
        uni.showToast({ title: err.message || '处理失败', icon: 'none' });
      }
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  /* 顶部留白稍微加大一些，避免标题紧贴状态栏（与其他业务页保持一致） */
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

.filter {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 8rpx;
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

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.label {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.value {
  color: $uni-text-color;
  font-size: $uni-font-size-base;
  text-align: right;
}

.tag {
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  color: $uni-text-color;
  font-size: $uni-font-size-sm;
}

.tag.status {
  background: #e8f0ff;
  color: #2f54eb;
}

.actions {
  display: flex;
  gap: 12rpx;
  align-items: center;
}

.input {
  flex: 1;
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 22rpx 20rpx;
  font-size: $uni-font-size-base;
  min-height: 80rpx;
  line-height: 80rpx;
}

.action-btn {
  min-width: 180rpx;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 20rpx;
  font-size: $uni-font-size-sm;
  border-radius: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
