<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav :showBack="false" />
    <text class="title">排班设置</text>

    <view class="form">
      <view class="field">
        <text class="label">选择日期</text>
        <picker mode="date" :value="date" @change="onDateChange">
          <view class="picker-value">{{ date || '请选择日期' }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">工作开始</text>
        <picker mode="time" :value="workStart" @change="onStartChange">
          <view class="picker-value">{{ workStart || '请选择开始时间' }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">工作结束</text>
        <picker mode="time" :value="workEnd" @change="onEndChange">
          <view class="picker-value">{{ workEnd || '请选择结束时间' }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">生成未来 7 天时段</text>
        <switch :checked="generateFuture" @change="onFutureChange" />
      </view>

      <button class="submit" type="primary" :loading="loading" @click="handleSubmit">
        保存排班并生成时段
      </button>

      <view v-if="result" class="result">
        <text class="result-title">生成成功</text>
        <text v-if="summaryLoading" class="result-tip">正在统计可预约时间段...</text>
        <view v-else class="summary-list">
          <text
            v-for="item in serviceSummaries"
            :key="item.id"
            class="summary-item"
          >
            {{ item.name }}：可预约 {{ item.count }} 段
          </text>
          <text v-if="serviceSummaries.length === 0" class="result-tip">暂无可预约时间段</text>
        </view>
      </view>

      <view class="logout-card">
        <text class="logout-label">账号</text>
        <button class="logout-btn" type="default" @click="handleLogout">退出登录</button>
      </view>
    </view>
  </view>
</template>

<script>
// 理发师排班页：设置当天/未来排班并生成可预约时段
// - 保存排班并生成时段数据
// - 保存后按服务统计“可预约时间段”用于快速自检
import { setBarberSchedule, fetchBarberSlots } from '../../../api/barber';
import { fetchStoreServices } from '../../../api/store';
import { me } from '../../../api/auth';
import { authStore } from '../../../store/auth';

// 日期格式化为 YYYY-MM-DD（用于选择器回显与接口入参）
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default {
  data() {
    return {
      // 默认日期为今天，避免空值导致接口校验失败
      date: toDateString(new Date()),
      // 默认起止时间，提供一个常用工作区间
      workStart: '10:00',
      workEnd: '18:00',
      // 是否生成未来 7 天时段，便于一次性排多天班
      generateFuture: true,
      // 按钮 loading 态
      loading: false,
      // 云函数返回统计数据（生成结果摘要）
      result: null,
      // 统计时段时的加载状态
      summaryLoading: false,
      // 各服务的可预约时段汇总
      serviceSummaries: []
    };
  },
  methods: {
    // 日期选择变更
    onDateChange(e) {
      this.date = e.detail.value || '';
    },
    // 开始时间变更
    onStartChange(e) {
      this.workStart = e.detail.value || '';
    },
    // 结束时间变更
    onEndChange(e) {
      this.workEnd = e.detail.value || '';
    },
    // 是否生成未来 7 天
    onFutureChange(e) {
      this.generateFuture = !!(e && e.detail && e.detail.value);
    },
    // 提交保存排班：先校验 -> 调用云函数 -> 刷新统计
    async handleSubmit() {
      // 前端基础校验
      if (!this.date || !this.workStart || !this.workEnd) {
        uni.showToast({ title: '请填写完整', icon: 'none' });
        return;
      }
      this.loading = true;
      this.result = null;
      try {
        // 调用云函数：设置排班并生成时段
        const res = await setBarberSchedule({
          date: this.date,
          workStart: this.workStart,
          workEnd: this.workEnd,
          // 生成天数：仅当天或包含未来 7 天
          generateDays: this.generateFuture ? 7 : 1
        });
        this.result = res || null;
        // 排班成功后统计可预约时段
        await this.loadServiceSummaries();
        uni.showToast({ title: '保存成功', icon: 'success' });
      } catch (err) {
        // 统一错误提示
        uni.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none'
        });
      } finally {
        this.loading = false;
      }
    },
    // 统计各服务可预约时段数量（便于排班后自检）
    async loadServiceSummaries() {
      this.summaryLoading = true;
      this.serviceSummaries = [];
      try {
        // 优先复用已缓存的登录信息，必要时再刷新
        let user = authStore.state && authStore.state.user ? authStore.state.user : null;
        let storeId = user && user.storeId ? user.storeId : '';
        const barberId = user && (user._id || user.uid || user.userId);
        if (!storeId) {
          const latest = await me();
          if (latest) {
            authStore.setUser(latest);
            user = latest;
            storeId = latest.storeId || '';
          }
        }
        // 无门店或理发师 ID 时无法统计，直接退出
        if (!storeId || !barberId) {
          return;
        }
        // 先取门店服务列表，再逐项统计可预约数量
        const services = await fetchStoreServices(storeId);
        const list = Array.isArray(services) ? services : [];
        const summaries = await Promise.all(
          list.map(async (service) => {
            const data = await fetchBarberSlots({
              barberId,
              date: this.date,
              serviceId: service._id
            });
            // 仅统计可预约状态的时段数量
            const available = Array.isArray(data)
              ? data.filter((slot) => slot.status === 'AVAILABLE').length
              : 0;
            return {
              id: service._id || service.name || String(Math.random()),
              name: service.name || '服务',
              count: available
            };
          })
        );
        this.serviceSummaries = summaries;
      } catch (err) {
        // 统计失败时清空列表，避免展示过期数据
        this.serviceSummaries = [];
      } finally {
        this.summaryLoading = false;
      }
    },
    // 退出登录
    handleLogout() {
      authStore.clear();
      uni.reLaunch({ url: '/pages/auth/login' });
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  /* 顶部留白再多一点，避免“排班设置”标题与返回按钮重叠感 */
  padding: 96rpx 30rpx 30rpx;
  background-color: $uni-bg-color-grey;
}

.title {
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  margin-bottom: 24rpx;
  padding-left: 6rpx;
}

.form {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
  box-shadow: $uni-shadow-base;
}

.field {
  margin-bottom: 24rpx;
}

.label {
  display: block;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
  margin-bottom: 12rpx;
}

.picker-value {
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx 24rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}

.submit {
  margin-top: 12rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  color: $uni-text-color;
  font-size: $uni-font-size-sm;
}

.result-title {
  font-weight: 700;
  color: $uni-text-color;
}

.result-tip {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.summary-item {
  color: $uni-text-color;
}

.logout-card {
  margin-top: 24rpx;
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 24rpx;
  box-shadow: $uni-shadow-base;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.logout-label {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.logout-btn {
  height: 88rpx;
  line-height: 88rpx;
  width: 100%;
  padding: 0 36rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
