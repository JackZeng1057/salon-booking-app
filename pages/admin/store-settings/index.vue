<template>
  <view class="page">
    <app-nav />
    <text class="title">门店信息设置</text>
    <text class="subtitle">管理员可维护地址、标签、营业时间和预约规则</text>

    <view v-if="loading" class="card hint-card">加载中...</view>

    <view v-else class="card">
      <view class="field">
        <text class="label">门店名称</text>
        <input class="input" v-model="form.name" placeholder="请输入门店名称" />
      </view>

      <view class="field">
        <text class="label">联系电话</text>
        <input class="input" v-model="form.phone" placeholder="请输入联系电话" />
      </view>

      <view class="field">
        <text class="label">门店地址（文本）</text>
        <input class="input" v-model="form.address" placeholder="请输入详细地址" />
      </view>

      <view class="field">
        <text class="label">标签（逗号分隔）</text>
        <textarea
          class="textarea"
          v-model="form.tagsText"
          maxlength="200"
          placeholder="例如：男士精剪, 造型设计, 头皮护理"
        />
      </view>

      <view class="field">
        <text class="label">工作日营业时间</text>
        <view class="time-row">
          <view class="time-picker" @tap="openTimePicker('weekdayStart')">
            {{ form.weekdayStart || '开始时间' }}
          </view>
          <text class="time-sep">-</text>
          <view class="time-picker" @tap="openTimePicker('weekdayEnd')">
            {{ form.weekdayEnd || '结束时间' }}
          </view>
        </view>
        <text class="time-preview">当前：{{ formatTimeRange(form.weekdayStart, form.weekdayEnd) || '未设置' }}</text>
      </view>

      <view class="field">
        <text class="label">周末营业时间</text>
        <view class="time-row">
          <view class="time-picker" @tap="openTimePicker('weekendStart')">
            {{ form.weekendStart || '开始时间' }}
          </view>
          <text class="time-sep">-</text>
          <view class="time-picker" @tap="openTimePicker('weekendEnd')">
            {{ form.weekendEnd || '结束时间' }}
          </view>
        </view>
        <text class="time-preview">当前：{{ formatTimeRange(form.weekendStart, form.weekendEnd) || '未设置' }}</text>
      </view>

      <view class="field">
        <text class="label">门店简介</text>
        <textarea class="textarea" v-model="form.description" maxlength="500" placeholder="请输入门店简介" />
      </view>

      <view class="field">
        <text class="label">预约须知</text>
        <textarea class="textarea" v-model="form.notice" maxlength="300" placeholder="例如：请提前10分钟到店" />
      </view>

      <view class="field">
        <text class="label">取消规则</text>
        <textarea class="textarea" v-model="form.cancelRule" maxlength="300" placeholder="例如：预约前2小时可免费取消" />
      </view>

      <view class="field">
        <text class="label">改期规则</text>
        <textarea class="textarea" v-model="form.rescheduleRule" maxlength="300" placeholder="例如：每单可改期1次" />
      </view>

    </view>

    <view class="action-bar">
      <button class="save-btn" :loading="saving" @click="saveStoreProfile">保存设置</button>
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
import { fetchStoreDetail, updateManagedStore } from '../../../api/store';
import { me } from '../../../api/auth';
import { authStore } from '../../../store/auth';

function splitTags(text) {
  return String(text || '')
    .split(/[,，、;\n]/)
    .map((item) => item.trim())
    .filter((item) => !!item)
    .slice(0, 8);
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
      loading: false,
      saving: false,
      storeId: '',
      hourOptions: HOUR_OPTIONS,
      minuteOptions: MINUTE_OPTIONS,
      showTimePicker: false,
      timePickerKey: '',
      tempTimeValue: [9, 0],
      form: {
        name: '',
        phone: '',
        address: '',
        tagsText: '',
        weekdayStart: '',
        weekdayEnd: '',
        weekendStart: '',
        weekendEnd: '',
        description: '',
        notice: '',
        cancelRule: '',
        rescheduleRule: ''
      }
    };
  },
  onShow() {
    this.loadStoreProfile();
  },
  methods: {
    async ensureStoreId() {
      let user = authStore.state.user || {};
      if (!user.storeId) {
        const profile = await me();
        user = profile || {};
        authStore.setUser(profile || null);
      }
      return user.storeId || '';
    },
    fillForm(store) {
      const businessHours = store.businessHours || {};
      const bookingRules = store.bookingRules || {};
      const weekdayRange = this.parseTimeRange(businessHours.weekday || '');
      const weekendRange = this.parseTimeRange(businessHours.weekend || '');
      this.form.name = store.name || '';
      this.form.phone = store.phone || '';
      this.form.address = store.address || '';
      this.form.tagsText = (store.tags || []).join(', ');
      this.form.weekdayStart = weekdayRange.start;
      this.form.weekdayEnd = weekdayRange.end;
      this.form.weekendStart = weekendRange.start;
      this.form.weekendEnd = weekendRange.end;
      this.form.description = store.description || '';
      this.form.notice = bookingRules.notice || '';
      this.form.cancelRule = bookingRules.cancelRule || '';
      this.form.rescheduleRule = bookingRules.rescheduleRule || '';
    },
    parseTimeRange(text) {
      const value = String(text || '').trim();
      const matched = value.match(/^(\d{2}:\d{2})\s*[-~到至]\s*(\d{2}:\d{2})$/);
      if (!matched) {
        return { start: '', end: '' };
      }
      return { start: matched[1], end: matched[2] };
    },
    formatTimeRange(start, end) {
      const safeStart = String(start || '').trim();
      const safeEnd = String(end || '').trim();
      if (!safeStart && !safeEnd) return '';
      if (!safeStart || !safeEnd) return '';
      return `${safeStart}-${safeEnd}`;
    },
    timePickerValue(value) {
      return parseTimeToPickerValue(value);
    },
    openTimePicker(key) {
      this.timePickerKey = key;
      this.tempTimeValue = this.timePickerValue(this.form[key] || '');
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
      this.form[this.timePickerKey] = `${hour}:${minute}`;
      this.cancelTimePicker();
    },
    async loadStoreProfile(options = {}) {
      this.loading = true;
      try {
        const storeId = await this.ensureStoreId();
        if (!storeId) {
          uni.showToast({ title: '当前账号未绑定门店', icon: 'none' });
          return;
        }
        this.storeId = storeId;
        const store = await fetchStoreDetail(storeId, { noCache: !!options.forceRefresh });
        if (!store) {
          uni.showToast({ title: '门店不存在', icon: 'none' });
          return;
        }
        this.fillForm(store);
      } catch (err) {
        uni.showToast({ title: err.message || '加载门店信息失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    async saveStoreProfile() {
      if (!this.storeId) {
        uni.showToast({ title: '门店信息缺失', icon: 'none' });
        return;
      }
      if ((this.form.weekdayStart && !this.form.weekdayEnd) || (!this.form.weekdayStart && this.form.weekdayEnd)) {
        uni.showToast({ title: '请完整设置工作日开始和结束时间', icon: 'none' });
        return;
      }
      if ((this.form.weekendStart && !this.form.weekendEnd) || (!this.form.weekendStart && this.form.weekendEnd)) {
        uni.showToast({ title: '请完整设置周末开始和结束时间', icon: 'none' });
        return;
      }
      this.saving = true;
      try {
        const result = await updateManagedStore({
          name: this.form.name,
          phone: this.form.phone,
          address: this.form.address,
          description: this.form.description,
          tags: splitTags(this.form.tagsText),
          businessHours: {
            weekday: this.formatTimeRange(this.form.weekdayStart, this.form.weekdayEnd),
            weekend: this.formatTimeRange(this.form.weekendStart, this.form.weekendEnd)
          },
          bookingRules: {
            notice: this.form.notice,
            cancelRule: this.form.cancelRule,
            rescheduleRule: this.form.rescheduleRule
          }
        });
        if (result && result.updated === false) {
          uni.showToast({ title: '未检测到更新', icon: 'none' });
        } else {
          uni.showToast({ title: '保存成功', icon: 'success' });
        }
        await this.loadStoreProfile({ forceRefresh: true });
      } catch (err) {
        uni.showToast({ title: err.message || '保存失败', icon: 'none' });
      } finally {
        this.saving = false;
      }
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
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  margin-bottom: 12rpx;
  padding-left: 6rpx;
  line-height: 1.25;
}

.subtitle {
  display: block;
  font-size: $uni-font-size-base;
  color: $uni-text-color-grey;
  margin-bottom: 24rpx;
  padding-left: 6rpx;
  line-height: 1.5;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
  box-shadow: $uni-shadow-base;
}

.hint-card {
  color: $uni-text-color-grey;
  text-align: center;
  font-size: $uni-font-size-base;
}

.field {
  margin-bottom: 24rpx;
}

.label {
  display: block;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  margin-bottom: 12rpx;
  line-height: 1.4;
}

.input {
  width: 100%;
  height: 96rpx;
  border-radius: $uni-border-radius-lg;
  background: $uni-bg-color-grey;
  padding: 0 22rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.time-picker {
  width: 280rpx;
  height: 96rpx;
  border-radius: $uni-border-radius-lg;
  background: $uni-bg-color-grey;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}

.time-sep {
  color: $uni-text-color-grey;
  font-size: 30rpx;
  font-weight: 600;
}

.time-preview {
  display: block;
  margin-top: 10rpx;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.textarea {
  width: 100%;
  min-height: 180rpx;
  border-radius: $uni-border-radius-lg;
  background: $uni-bg-color-grey;
  padding: 18rpx 22rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  box-sizing: border-box;
}

.action-bar {
  position: sticky;
  bottom: 0;
  margin-top: 16rpx;
  padding: 16rpx 0 4rpx;
  background: linear-gradient(to bottom, rgba(246, 247, 251, 0), rgba(246, 247, 251, 0.95) 24%, rgba(246, 247, 251, 1));
}

.save-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  background: $uni-color-primary;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $uni-font-size-base;
  font-weight: 600;
}

.save-btn::after {
  border: none;
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
