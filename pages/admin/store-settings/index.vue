<template>
  <view class="page">
    <app-nav />
    <text class="title">门店信息设置</text>
    <text class="subtitle">管理员可维护地址、标签、服务、营业时间和预约规则</text>

    <view v-if="loading" class="card hint-card">加载中...</view>

    <view v-else class="card">
      <view class="field">
        <text class="label">门店名称</text>
        <input class="input" v-model="form.name" placeholder="请输入门店名称" />
      </view>

      <view class="field">
        <text class="label">门店封面</text>
        <view class="cover-row">
          <image class="cover-preview" :src="form.cover || defaultCover" mode="aspectFill" />
          <button class="cover-btn" :loading="uploadingCover" @click="pickCover">
            {{ uploadingCover ? '上传中...' : '上传封面' }}
          </button>
        </view>
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
        <view class="field-head">
          <text class="label">服务项目设置</text>
          <button class="mini-btn" @click="addService">新增服务</button>
        </view>
        <view v-if="form.services.length === 0" class="service-empty">暂无服务，请点击“新增服务”</view>
        <view v-for="(item, idx) in form.services" :key="item.localId" class="service-item">
          <view class="service-row-top">
            <text class="service-index">服务 {{ idx + 1 }}</text>
            <text class="service-remove" @click="removeService(idx)">删除</text>
          </view>
          <input class="input" v-model="item.name" placeholder="服务名称，例如：男士剪发" />
          <view class="service-grid">
            <view class="service-cell">
              <text class="sub-label">价格（元）</text>
              <input class="input input-small" type="digit" v-model="item.price" placeholder="68" />
            </view>
            <view class="service-cell">
              <text class="sub-label">时长（分钟）</text>
              <input class="input input-small" type="number" v-model="item.duration" placeholder="45" />
            </view>
          </view>
        </view>
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
import { fetchStoreDetail, fetchStoreServices, updateManagedStore } from '../../../api/store';
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

function createEmptyService() {
  return {
    localId: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    _id: '',
    name: '',
    price: '',
    duration: ''
  };
}

export default {
  data() {
    return {
      loading: false,
      saving: false,
      uploadingCover: false,
      storeId: '',
      defaultCover: 'https://dummyimage.com/600x400/efefef/333&text=Store',
      hourOptions: HOUR_OPTIONS,
      minuteOptions: MINUTE_OPTIONS,
      showTimePicker: false,
      timePickerKey: '',
      tempTimeValue: [9, 0],
      form: {
        name: '',
        cover: '',
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
        rescheduleRule: '',
        services: []
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
    fillForm(store, services) {
      const businessHours = store.businessHours || {};
      const bookingRules = store.bookingRules || {};
      const weekdayRange = this.parseTimeRange(businessHours.weekday || '');
      const weekendRange = this.parseTimeRange(businessHours.weekend || '');
      const serviceList = Array.isArray(services) ? services : [];
      this.form.name = store.name || '';
      this.form.cover = store.cover || '';
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
      this.form.services = serviceList.length > 0
        ? serviceList.map((item) => ({
          localId: `${item._id || 'svc'}_${Math.random().toString(16).slice(2, 8)}`,
          _id: item._id || '',
          name: item.name || '',
          price: item.price !== undefined && item.price !== null ? String(item.price) : '',
          duration: item.duration !== undefined && item.duration !== null ? String(item.duration) : ''
        }))
        : [createEmptyService()];
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
    addService() {
      this.form.services.push(createEmptyService());
    },
    removeService(index) {
      const list = Array.isArray(this.form.services) ? this.form.services : [];
      if (index < 0 || index >= list.length) return;
      this.form.services.splice(index, 1);
    },
    buildServicesPayload() {
      const list = Array.isArray(this.form.services) ? this.form.services : [];
      const result = [];
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i] || {};
        const name = String(item.name || '').trim();
        const priceText = String(item.price || '').trim();
        const durationText = String(item.duration || '').trim();
        const hasAny = !!(name || priceText || durationText);
        if (!hasAny) continue;

        if (!name) {
          throw new Error(`第${i + 1}项服务名称不能为空`);
        }
        const price = Number(item.price);
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`第${i + 1}项服务价格格式错误`);
        }
        const duration = Math.round(Number(item.duration));
        if (!Number.isFinite(duration) || duration <= 0 || duration > 600) {
          throw new Error(`第${i + 1}项服务时长格式错误`);
        }

        result.push({
          _id: item._id || '',
          name,
          price: Number(price.toFixed(2)),
          duration
        });
      }
      if (result.length === 0) {
        throw new Error('请至少配置1个服务项目');
      }
      return result;
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
        const [store, services] = await Promise.all([
          fetchStoreDetail(storeId, { noCache: !!options.forceRefresh }),
          fetchStoreServices(storeId, { noCache: !!options.forceRefresh })
        ]);
        if (!store) {
          uni.showToast({ title: '门店不存在', icon: 'none' });
          return;
        }
        this.fillForm(store, services);
      } catch (err) {
        uni.showToast({ title: err.message || '加载门店信息失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    pickCover() {
      if (this.uploadingCover) return;
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const path = res && res.tempFilePaths && res.tempFilePaths[0];
          if (!path) return;
          this.uploadCover(path);
        }
      });
    },
    async uploadCover(filePath) {
      this.uploadingCover = true;
      try {
        const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
        const cloudPath = `store-covers/${this.storeId || 'store'}_${Date.now()}.${ext}`;
        const uploadRes = await uniCloud.uploadFile({
          cloudPath,
          filePath
        });
        const fileID = (uploadRes && uploadRes.fileID) || '';
        if (!fileID) {
          uni.showToast({ title: '上传封面失败', icon: 'none' });
          return;
        }
        this.form.cover = fileID;
      } catch (err) {
        uni.showToast({ title: '上传封面失败', icon: 'none' });
      } finally {
        this.uploadingCover = false;
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
        const servicesPayload = this.buildServicesPayload();
        const result = await updateManagedStore({
          name: this.form.name,
          cover: this.form.cover,
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
          },
          services: servicesPayload
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

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.label {
  display: block;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  margin-bottom: 12rpx;
  line-height: 1.4;
}

.mini-btn {
  height: 64rpx;
  line-height: 64rpx;
  border-radius: 32rpx;
  padding: 0 22rpx;
  background: #ffffff;
  color: $uni-color-primary;
  border: 1rpx solid $uni-color-primary;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-btn::after {
  border: none;
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

.service-empty {
  color: $uni-text-color-placeholder;
  font-size: $uni-font-size-sm;
  padding: 16rpx 0;
}

.service-item {
  background: #f8f9fc;
  border-radius: $uni-border-radius-lg;
  padding: 18rpx;
  margin-bottom: 14rpx;
}

.service-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.service-index {
  color: $uni-text-color;
  font-size: $uni-font-size-sm;
  font-weight: 600;
}

.service-remove {
  color: $uni-color-error;
  font-size: $uni-font-size-sm;
}

.service-grid {
  display: flex;
  gap: 12rpx;
  margin-top: 12rpx;
}

.service-cell {
  flex: 1;
}

.sub-label {
  display: block;
  color: $uni-text-color-grey;
  font-size: 24rpx;
  margin-bottom: 8rpx;
}

.input-small {
  height: 84rpx;
  font-size: $uni-font-size-sm;
}

.cover-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.cover-preview {
  width: 220rpx;
  height: 132rpx;
  border-radius: $uni-border-radius-lg;
  background: #eef1f6;
  flex-shrink: 0;
}

.cover-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  padding: 0 28rpx;
  background: #ffffff;
  color: $uni-color-primary;
  border: 1rpx solid $uni-color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-btn::after {
  border: none;
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
