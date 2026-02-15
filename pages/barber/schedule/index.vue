<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav :showBack="false" />
    <view class="page-actions">
      <view class="notify-btn" @click="goNotifications">
        <text class="notify-icon">🔔</text>
        <text v-if="unreadCount > 0" class="notify-dot"></text>
      </view>
    </view>
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
        <view class="picker-value" @tap="openTimePicker('workStart')">{{ workStart || '请选择开始时间' }}</view>
      </view>

      <view class="field">
        <text class="label">工作结束</text>
        <view class="picker-value" @tap="openTimePicker('workEnd')">{{ workEnd || '请选择结束时间' }}</view>
      </view>

      <view class="field">
        <text class="label">生成未来 7 天时段</text>
        <switch :checked="generateFuture" @change="onFutureChange" />
      </view>

      <button class="submit" type="primary" :loading="loading" @click="handleSubmit">
        保存排班并生成时段
      </button>

      <view v-if="result" class="result">
        <text class="result-title">{{ Number(result.createdCount || 0) > 0 ? '生成成功' : '已设置排班' }}</text>
        <text
          v-if="result.generatedDates && result.generatedDates.length > 1"
          class="result-tip"
        >
          已生成日期：{{ result.generatedDates[0] }} 至 {{ result.generatedDates[result.generatedDates.length - 1] }}
        </text>
        <text class="result-tip">
          当前可预约 {{ Number(result.totalBookableCount || (Number(result.createdCount || 0) + Number(result.existedCount || 0))) }} 段
        </text>
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
        <view class="logout-actions">
          <button class="logout-btn" type="default" @click="goAccountSettings">账号设置</button>
          <button class="logout-btn" type="default" @click="handleLogout">退出登录</button>
        </view>
      </view>
    </view>

    <view v-if="showTimePicker" class="picker-mask" @tap="cancelTimePicker">
      <view class="picker-panel" @tap.stop>
        <view class="picker-toolbar">
          <text class="picker-action picker-cancel" @tap="cancelTimePicker">取消</text>
          <text class="picker-action picker-done" @tap="confirmTimePicker">完成</text>
        </view>
        <view class="picker-wheel-wrap">
          <picker-view class="picker-wheel" :value="tempTimeValue" indicator-class="picker-indicator" @change="onTimePickerChange">
            <picker-view-column>
              <view v-for="hour in hourOptions" :key="`hour-${hour}`" class="picker-item">{{ hour }}</view>
            </picker-view-column>
            <picker-view-column>
              <view v-for="minute in minuteOptions" :key="`minute-${minute}`" class="picker-item">{{ minute }}</view>
            </picker-view-column>
          </picker-view>
          <text class="picker-colon">:</text>
        </view>
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
import { getUnreadCount } from '../../../api/notifications';
import { authStore } from '../../../store/auth';

// 日期格式化为 YYYY-MM-DD（用于选择器回显与接口入参）
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => pad2(i));

function parseTimeToPickerValue(value) {
  const text = String(value || '').trim();
  const matched = text.match(/^(\d{2}):(\d{2})$/);
  if (!matched) return [9, 0];
  const h = Number(matched[1]);
  const m = Number(matched[2]);
  const hourIndex = Number.isFinite(h) && h >= 0 && h <= 23 ? h : 9;
  const minuteIndex = Number.isFinite(m) && m >= 0 && m <= 59 ? m : 0;
  return [hourIndex, minuteIndex];
}

export default {
  data() {
    return {
      // 默认日期为今天，避免空值导致接口校验失败
      date: toDateString(new Date()),
      // 默认起止时间，提供一个常用工作区间
      workStart: '09:00',
      workEnd: '22:00',
      hourOptions: HOUR_OPTIONS,
      minuteOptions: MINUTE_OPTIONS,
      showTimePicker: false,
      timePickerKey: '',
      tempTimeValue: [9, 0],
      // 是否生成未来 7 天时段，便于一次性排多天班
      generateFuture: true,
      // 按钮 loading 态
      loading: false,
      // 云函数返回统计数据（生成结果摘要）
      result: null,
      // 统计时段时的加载状态
      summaryLoading: false,
      // 各服务的可预约时段汇总
      serviceSummaries: [],
      unreadCount: 0
    };
  },
  onShow() {
    this.loadUnreadCount();
  },
  methods: {
    async loadUnreadCount() {
      try {
        this.unreadCount = await getUnreadCount();
      } catch (err) {
        this.unreadCount = 0;
      }
    },
    goNotifications() {
      uni.navigateTo({ url: '/pages/user/notifications/index' });
    },
    // 日期选择变更
    onDateChange(e) {
      this.date = e.detail.value || '';
    },
    // time picker 默认索引（小时、分钟）
    timePickerValue(value) {
      return parseTimeToPickerValue(value);
    },
    openTimePicker(key) {
      this.timePickerKey = key;
      this.tempTimeValue = this.timePickerValue(this[key] || '');
      this.showTimePicker = true;
    },
    onTimePickerChange(e) {
      const value = (e && e.detail && e.detail.value) || [0, 0];
      this.tempTimeValue = [Number(value[0] || 0), Number(value[1] || 0)];
    },
    cancelTimePicker() {
      this.showTimePicker = false;
      this.timePickerKey = '';
    },
    confirmTimePicker() {
      if (!this.timePickerKey) {
        this.cancelTimePicker();
        return;
      }
      const value = this.tempTimeValue || [0, 0];
      const hour = HOUR_OPTIONS[Number(value[0] || 0)] || '00';
      const minute = MINUTE_OPTIONS[Number(value[1] || 0)] || '00';
      this[this.timePickerKey] = `${hour}:${minute}`;
      this.cancelTimePicker();
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
        const generatedDates = (res && Array.isArray(res.generatedDates) && res.generatedDates.length > 0)
          ? res.generatedDates
          : [this.date];
        await this.loadServiceSummaries(generatedDates, {
          _id: (res && res.serviceId) || '',
          name: (res && res.serviceName) || ''
        });
        const dayCount = Number((res && res.days) || 0);
        const created = Number((res && res.createdCount) || 0);
        const rawCreated = Number((res && res.rawCreatedCount) || 0);
        uni.showToast({
          title: (rawCreated > 0 || created > 0)
            ? (dayCount > 1 ? `已生成${dayCount}天时段` : '保存成功')
            : '已设置排班',
          icon: 'success'
        });
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
    async loadServiceSummaries(targetDates = [], preferredService = null) {
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
        // 优先统计当前理发师对应服务，避免“服务数 × 天数”高并发请求
        let list = [];
        if (preferredService && preferredService._id) {
          list = [{
            _id: preferredService._id,
            name: preferredService.name || '服务'
          }];
        } else {
          const services = await fetchStoreServices(storeId);
          const serviceList = Array.isArray(services) ? services : [];
          if (preferredService && preferredService.name) {
            const matched = serviceList.find((item) => (item && item.name) === preferredService.name);
            if (matched) {
              list = [matched];
            }
          }
          if (list.length === 0) {
            list = serviceList;
          }
        }
        const dates = Array.isArray(targetDates) && targetDates.length > 0
          ? Array.from(new Set(targetDates))
          : [this.date];

        const summaries = await Promise.all(
          list.map(async (service) => {
            const counts = await Promise.all(
              dates.map(async (date) => {
                const data = await fetchBarberSlots({
                  barberId,
                  date,
                  serviceId: service._id,
                  noCache: true
                });
                return Array.isArray(data)
                  ? data.filter((slot) => slot.status === 'AVAILABLE').length
                  : 0;
              })
            );
            const available = counts.reduce((sum, item) => sum + Number(item || 0), 0);
            return {
              id: service._id || service.name || String(Math.random()),
              name: `${service.name || '服务'}（${dates.length}天）`,
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
    },
    // 跳转账号设置（手机号绑定）
    goAccountSettings() {
      uni.navigateTo({
        url: '/pages/user/settings/index',
        fail: () => {
          uni.showToast({
            title: '页面未生效，请重新编译',
            icon: 'none'
          });
        }
      });
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

.page-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8rpx;
  margin-bottom: 6rpx;
}

.notify-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: #ffffff;
  box-shadow: 0 6rpx 16rpx rgba(15, 23, 42, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.notify-icon {
  font-size: 34rpx;
}

.notify-dot {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
  background: #ff4d4f;
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
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 36rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout-actions {
  display: flex;
  gap: 12rpx;
}

.picker-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}

.picker-panel {
  width: 100%;
  background: #ffffff;
  border-top-left-radius: 24rpx;
  border-top-right-radius: 24rpx;
  overflow: hidden;
}

.picker-toolbar {
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.picker-action {
  font-size: 34rpx;
}

.picker-cancel {
  color: $uni-text-color-grey;
}

.picker-done {
  color: #007aff;
  font-weight: 500;
}

.picker-wheel-wrap {
  position: relative;
  width: 320rpx;
  margin: 0 auto;
}

.picker-wheel {
  height: 420rpx;
}

.picker-item {
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  font-size: 42rpx;
  color: $uni-text-color;
}

:deep(.picker-indicator) {
  height: 84rpx;
}

.picker-colon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 44rpx;
  color: $uni-text-color;
  font-weight: 500;
  pointer-events: none;
}
</style>
