<template>
  <view class="orders-page">
    <app-nav :showTitle="true" title="售后管理" />

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

    <scroll-view class="orders-scroll" scroll-y>
      <view class="orders-scroll-content">
        <view v-if="loading" class="hint">加载中...</view>
        <view v-else-if="list.length === 0" class="hint">暂无售后</view>

        <view v-else class="list">
          <view v-for="item in list" :key="item._id" class="after-card">
            <view class="card-head">
              <text class="service-name">{{ formatAftersaleType(item.type) }}</text>
              <view class="status-pill" :class="getStatusClass(item.status)">
                {{ formatAftersaleStatus(item.status) }}
              </view>
            </view>

            <view class="card-main">
              <view class="row">
                <text class="label">描述</text>
                <text class="value">{{ item.content || '无' }}</text>
              </view>
              <view class="row">
                <text class="label">当前回复</text>
                <text class="value">{{ item.reply || '未回复' }}</text>
              </view>
            </view>

            <view v-if="!item.reply" class="card-foot">
              <input
                class="reply-input"
                :value="item._reply"
                :focus="item._focus"
                placeholder="填写回复内容"
                @input="onReplyInput($event, item)"
                @click="ensureReplyFocus(item)"
                @blur="item._focus = false"
              />
              <button class="action-btn" type="primary" @click="handleReply(item)">回复并处理</button>
            </view>
          </view>
        </view>
        <view class="scroll-bottom-safe"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
// 售后管理页：筛选处理状态并回复
import { fetchAftersales, replyAftersale } from '../../api/order';
import { formatAftersaleStatus, formatAftersaleType } from '../../utils/status';

/**
 * 售后管理页（管理员）
 * 功能：
 * 1) 按售后状态筛选列表
 * 2) 对未回复售后进行文本回复并更新处理状态
 */
export default {
  data() {
    return {
      // 列表加载态
      loading: false,
      // 售后单列表
      list: [],
      // 当前筛选状态
      status: '',
      // 状态 tab 配置
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
    // 将状态映射到标签样式
    getStatusClass(status) {
      const map = {
        待处理: 'is-open',
        处理中: 'is-processing',
        已解决: 'is-resolved'
      };
      return map[this.formatAftersaleStatus(status)] || 'is-default';
    },
    // 加载售后列表
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
    // 切换筛选状态并刷新
    changeStatus(value) {
      this.status = value;
      this.loadList();
    },
    // 点击输入框时设置当前项聚焦，并取消其他项聚焦
    ensureReplyFocus(target) {
      this.list = this.list.map((item) => ({
        ...item,
        _focus: item._id === target._id
      }));
    },
    // 缓存当前售后项输入中的回复内容
    onReplyInput(e, item) {
      const val = (e && e.detail && e.detail.value) || '';
      item._reply = val;
    },
    // 提交回复：有内容则直接标记已解决，否则标记处理中
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
  height: 24rpx;
}

.hint {
  text-align: center;
  color: #94a3b8;
  font-size: 24rpx;
  padding: 100rpx 0;
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

.list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 0 8rpx;
}

.after-card {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 18rpx;
  padding: 14rpx;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10rpx;
  padding-bottom: 10rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.service-name {
  font-size: 28rpx;
  color: #0f172a;
  font-weight: 700;
}

.status-pill {
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.status-pill.is-open {
  color: #b45309;
  background: #fffbeb;
}

.status-pill.is-processing {
  color: #1d4ed8;
  background: #eff6ff;
}

.status-pill.is-resolved {
  color: #047857;
  background: #ecfdf5;
}

.status-pill.is-default {
  color: #64748b;
  background: #f8fafc;
}

.card-main {
  margin-top: 10rpx;
}

.row + .row {
  margin-top: 8rpx;
}

.row .label {
  display: block;
  font-size: 22rpx;
  color: #64748b;
}

.row .value {
  margin-top: 4rpx;
  display: block;
  font-size: 24rpx;
  color: #334155;
  line-height: 1.45;
}

.card-foot {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.reply-input {
  width: 100%;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 14rpx;
  padding: 0 18rpx;
  height: 72rpx;
  font-size: 24rpx;
  color: #334155;
  box-sizing: border-box;
}

.action-btn {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0;
  font-size: 24rpx;
  border-radius: 36rpx;
}
</style>
