<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <text class="title">创建预约</text>
    
    <!-- 规则提示 -->
    <view class="rules-notice">
      <view class="rules-header">
        <text class="rules-icon">💡</text>
        <text class="rules-title">预约须知</text>
        <text class="rules-action" @click="openRules">查看</text>
      </view>
      <text class="rules-text">{{ displayRules }}</text>
    </view>

    <view class="form">
      <view class="field">
        <text class="label">选择门店</text>
        <picker :range="storeOptions" range-key="name" :value="storeIndex" @change="onStoreChange">
          <view class="picker-value">{{ currentStoreName }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">选择服务</text>
        <picker :range="serviceOptions" range-key="name" :value="serviceIndex" @change="onServiceChange">
          <view class="picker-value">{{ currentServiceName }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">选择理发师</text>
        <picker v-if="barberOptions.length > 0" :range="barberOptions" range-key="name" :value="barberIndex" @change="onBarberChange">
          <view class="picker-value">{{ currentBarberName }}</view>
        </picker>
        <view v-else class="picker-value">当前服务暂无可用理发师</view>
        <text v-if="usingAdminBarberServices" class="hint">当前已按门店配置过滤可选理发师</text>
      </view>

      <view class="field">
        <text class="label">选择日期</text>
        <picker mode="date" :value="date" :start="minDate" @change="onDateChange">
          <view class="picker-value">{{ date || '请选择日期' }}</view>
        </picker>
      </view>

      <view class="field">
        <text class="label">可预约时段</text>
        <view v-if="slotsLoading" class="hint">加载时段中...</view>
        <view v-else-if="slots.length === 0" class="hint">暂无可用时段，请先设置排班或切换日期</view>
        <view v-else class="slots-grid">
          <view
            v-for="slot in slots"
            :key="slot.startTime"
            class="slot-item"
            :class="slotClass(slot)"
            @click="selectSlot(slot)"
          >
            <text class="slot-time">{{ slot.startTime }}-{{ slot.endTime }}</text>
            <text class="slot-status">{{ formatSlotStatus(slot.status) }}</text>
          </view>
        </view>
      </view>

      <button
        class="submit"
        type="primary"
        :disabled="!selectedStartTime"
        @click="confirmSelection"
      >
        确认预约
      </button>

      <view v-if="selectedStartTime" class="selected-info">
        已选时段：{{ selectedStartTime }}
      </view>
    </view>

    <view v-if="showConfirm" class="modal-mask" @click="closeConfirm">
      <view class="modal-card" @click.stop>
        <text class="modal-title">确认预约</text>
        <view class="modal-content">
          <text class="modal-row">门店：{{ confirmData.store }}</text>
          <text class="modal-row">服务：{{ confirmData.service }}</text>
          <text class="modal-row">理发师：{{ confirmData.barber }}</text>
          <text class="modal-row">时间：{{ confirmData.time }}</text>
        </view>
        <view class="modal-actions">
          <button class="modal-btn ghost" @click="closeConfirm">再看看</button>
          <button class="modal-btn primary" @click="confirmSubmit">确认预约</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
// 创建预约页：
// - 门店/服务/理发师/日期联动
// - 依据服务时长展示可预约窗口
// - 本地标记过期/不可预约状态
import { fetchStores, fetchStoreServices, fetchStoreBarbers, fetchStoreDetail } from '../../api/store';
import { fetchBarberSlots } from '../../api/barber';
import { createOrder } from '../../api/order';
import { formatSlotStatus } from '../../utils/status';

// 日期格式化为 YYYY-MM-DD
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default {
  data() {
    return {
      // 门店列表与选中索引
      storeOptions: [],
      storeIndex: -1,
      // 服务列表与选中索引
      serviceOptions: [],
      serviceIndex: -1,
      // 理发师列表与选中索引
      allBarbers: [],
      barberOptions: [],
      barberIndex: -1,
      // 日期与可预约时段
      date: toDateString(new Date()),
      minDate: toDateString(new Date()),
      slots: [],
      slotsLoading: false,
      // 选中的开始时间
      selectedStartTime: '',
      // 上一次的查询键，避免重复请求
      lastSlotsKey: '',
      // 门店规则
      storeRules: null,
      // 当前步骤 (1-4)
      currentStep: 1,
      // 确认弹窗
      showConfirm: false,
      confirmData: {
        store: '',
        service: '',
        barber: '',
        time: ''
      },
      pendingPayload: null,
      // true: 使用管理员配置的理发师项目；false: 回退历史一一配对策略
      usingAdminBarberServices: false
    };
  },
  computed: {
    displayRules() {
      return (this.storeRules && this.storeRules.notice) || '请按时到店，如需取消请提前联系门店；改期请至少提前2小时。';
    },
    // 当前门店名称
    currentStoreName() {
      if (this.storeIndex < 0 || !this.storeOptions[this.storeIndex]) return '请选择门店';
      return this.storeOptions[this.storeIndex].name || '未命名门店';
    },
    // 当前服务名称
    currentServiceName() {
      if (this.serviceIndex < 0 || !this.serviceOptions[this.serviceIndex]) return '请选择服务';
      return this.serviceOptions[this.serviceIndex].name || '未命名服务';
    },
    // 当前理发师名称
    currentBarberName() {
      if (this.barberIndex < 0 || !this.barberOptions[this.barberIndex]) return '当前服务暂无可用理发师';
      return this.barberOptions[this.barberIndex].name || this.barberOptions[this.barberIndex].username || '未命名理发师';
    }
  },
  onLoad(options) {
    // 若从门店详情带入 storeId，则先预选门店
    const presetStoreId = (options && options.storeId) || '';
    this.loadStores(presetStoreId);
  },
  onShow() {
    this.minDate = toDateString(new Date());
    this.lastSlotsKey = '';
    if (this.storeIndex >= 0 && this.serviceIndex >= 0 && this.barberIndex >= 0) {
      this.tryLoadSlots();
    }
  },
  methods: {
    formatSlotStatus,
    openRules() {
      uni.showModal({
        title: '预约规则',
        content: this.displayRules,
        showCancel: false
      });
    },
    // 拉取门店列表并处理预选
    async loadStores(presetStoreId) {
      try {
        const stores = await fetchStores();
        this.storeOptions = Array.isArray(stores) ? stores : [];
        if (presetStoreId) {
          const index = this.storeOptions.findIndex((item) => item._id === presetStoreId);
          if (index >= 0) {
            this.storeIndex = index;
            await this.loadStoreRelated();
            return;
          }
        }
        // 若未传入门店，默认选择第一个门店
        if (this.storeOptions.length > 0) {
          this.storeIndex = 0;
          await this.loadStoreRelated();
        }
      } catch (err) {
        uni.showToast({ title: err.message || '加载门店失败', icon: 'none' });
      }
    },
    // 选择门店
    async onStoreChange(e) {
      this.storeIndex = Number(e.detail.value || 0);
      this.currentStep = 1;
      await this.loadStoreRelated();
    },
    // 拉取服务与理发师
    async loadStoreRelated() {
      this.serviceOptions = [];
      this.allBarbers = [];
      this.barberOptions = [];
      this.serviceIndex = -1;
      this.barberIndex = -1;
      this.slots = [];
      this.selectedStartTime = '';
      this.storeRules = null;
      this.usingAdminBarberServices = false;
      const store = this.storeOptions[this.storeIndex];
      if (!store || !store._id) return;
      try {
        const [services, barbers, storeDetail] = await Promise.all([
          fetchStoreServices(store._id),
          fetchStoreBarbers(store._id, { noCache: true }),
          fetchStoreDetail(store._id)
        ]);
        const serviceList = Array.isArray(services) ? services : [];
        // 兼容理发师显示名为空的情况
        const barberList = Array.isArray(barbers)
          ? barbers.map((item) => ({
              ...item,
              name: item.name || item.username || '理发师',
              serviceIds: Array.isArray(item.serviceIds) ? item.serviceIds : []
            }))
          : [];

        // 优先使用管理员配置（store-level 开关）；若未启用则回退历史一一配对
        const hasExplicitConfig = !!(storeDetail && storeDetail.barberServiceAssignmentEnabled);
        this.usingAdminBarberServices = hasExplicitConfig;

        if (hasExplicitConfig) {
          this.serviceOptions = serviceList;
          const validServiceIdSet = new Set(serviceList.map((item) => item && item._id).filter((id) => !!id));
          this.allBarbers = barberList.map((item) => ({
            ...item,
            supportedServiceIds: (item.serviceIds || [])
              .map((id) => String(id || '').trim())
              .filter((id) => !!id && validServiceIdSet.has(id))
          }));
        } else {
          const pairCount = Math.min(serviceList.length, barberList.length);
          const pairedServices = serviceList.slice(0, pairCount);
          const pairedBarbers = barberList.slice(0, pairCount);
          this.serviceOptions = pairedServices;
          this.allBarbers = pairedBarbers.map((item, idx) => ({
            ...item,
            supportedServiceIds: pairedServices[idx] && pairedServices[idx]._id ? [pairedServices[idx]._id] : []
          }));
        }

        // 加载门店规则
        if (storeDetail && storeDetail.bookingRules) {
          this.storeRules = storeDetail.bookingRules;
        }
        // 默认选中第一个服务，并按服务过滤理发师
        if (this.serviceOptions.length > 0) {
          this.serviceIndex = 0;
          this.currentStep = 2;
          this.rebuildBarberOptions();
        }
        if (this.barberOptions.length > 0) {
          this.currentStep = 3;
        }
        this.tryLoadSlots();
      } catch (err) {
        uni.showToast({ title: err.message || '加载门店信息失败', icon: 'none' });
      }
    },
    rebuildBarberOptions() {
      const service = this.serviceOptions[this.serviceIndex];
      if (!service || !service._id) {
        this.barberOptions = [];
        this.barberIndex = -1;
        return;
      }
      const serviceId = service._id;
      const prevBarber = this.barberOptions[this.barberIndex];
      const prevBarberId = prevBarber && prevBarber._id ? prevBarber._id : '';
      const list = this.allBarbers.filter((item) => {
        const supported = Array.isArray(item.supportedServiceIds) ? item.supportedServiceIds : [];
        return supported.includes(serviceId);
      });
      this.barberOptions = list;
      const nextIndex = list.findIndex((item) => item && item._id === prevBarberId);
      this.barberIndex = nextIndex >= 0 ? nextIndex : list.length > 0 ? 0 : -1;
    },
    // 选择服务
    onServiceChange(e) {
      this.serviceIndex = Number(e.detail.value || 0);
      this.rebuildBarberOptions();
      this.currentStep = Math.max(this.currentStep, 2);
      // serviceId 仅透传，不影响查询逻辑
      this.tryLoadSlots();
    },
    // 选择理发师
    onBarberChange(e) {
      this.barberIndex = Number(e.detail.value || 0);
      this.currentStep = Math.max(this.currentStep, 3);
      this.tryLoadSlots();
    },
    // 选择日期
    onDateChange(e) {
      this.date = e.detail.value || '';
      this.currentStep = Math.max(this.currentStep, 4);
      this.tryLoadSlots();
    },
    // 满足条件后拉取可预约时段
    tryLoadSlots() {
      if (!this.date) {
        // 日期为空时给出明确提示
        uni.showToast({ title: '请先选择日期', icon: 'none' });
        return;
      }
      if (this.serviceIndex >= 0 && this.barberIndex >= 0) {
        this.currentStep = Math.max(this.currentStep, 4);
      }
      const barber = this.barberOptions[this.barberIndex];
      if (!barber || !barber._id) return;
      this.loadSlots();
    },
    // 调用云函数获取时段（包含服务时长窗口与不可预约状态）
    async loadSlots() {
      const barber = this.barberOptions[this.barberIndex];
      if (!barber || !barber._id) return;
      const service = this.serviceOptions[this.serviceIndex];
      const key = `${barber._id}:${this.date}:${service ? service._id : ''}`;
      if (key === this.lastSlotsKey && this.slots.length > 0) {
        // 查询条件未变化且已有缓存结果时直接复用
        return;
      }
      this.lastSlotsKey = key;
      this.slotsLoading = true;
      this.slots = [];
      this.selectedStartTime = '';
      try {
        // 按理发师 + 日期 + 服务查询可预约窗口
        const data = await fetchBarberSlots({
          barberId: barber._id,
          date: this.date,
          serviceId: service ? service._id : '',
          noCache: true
        });
        const list = Array.isArray(data) ? data : [];
        this.slots = this.applySlotExpiration(list);
      } catch (err) {
        uni.showToast({ title: err.message || '加载时段失败', icon: 'none' });
      } finally {
        this.slotsLoading = false;
      }
    },
    // 前端兜底：对“当天且已过去”的时段标记为过期
    applySlotExpiration(list) {
      const today = toDateString(new Date());
      if (!this.date) return list;
      if (this.date < today) {
        return list.map((slot) => ({ ...slot, status: slot.status === 'BOOKED' ? 'BOOKED' : 'EXPIRED' }));
      }
      if (this.date !== today) return list;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      return list.map((slot) => {
        if (slot.status === 'BOOKED' || slot.status === 'EXPIRED' || slot.status === 'UNAVAILABLE') return slot;
        const [h, m] = String(slot.startTime || '').split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return slot;
        const startMin = h * 60 + m;
        if (startMin <= nowMin) {
          return { ...slot, status: 'EXPIRED' };
        }
        return slot;
      });
    },
    // 根据状态设置样式
    slotClass(slot) {
      if (slot.status === 'BOOKED') return 'slot-booked';
      if (slot.status === 'EXPIRED') return 'slot-expired';
      if (slot.status === 'UNAVAILABLE') return 'slot-unavailable';
      if (slot.startTime === this.selectedStartTime) return 'slot-selected';
      return 'slot-available';
    },
    // 选择时段：过滤不可预约/过期/已预约
    selectSlot(slot) {
      if (!slot || slot.status === 'BOOKED' || slot.status === 'EXPIRED' || slot.status === 'UNAVAILABLE') return;
      this.selectedStartTime = slot.startTime;
    },
    // 确认预约：二次校验时段是否过期，并弹出确认弹窗
    async confirmSelection() {
      if (!this.selectedStartTime) return;
      const targetSlot = this.slots.find((s) => s.startTime === this.selectedStartTime);
      if (!targetSlot || targetSlot.status === 'EXPIRED') {
        this.selectedStartTime = '';
        uni.showToast({ title: '该时段已过期，请重新选择', icon: 'none' });
        this.loadSlots();
        return;
      }
      const store = this.storeOptions[this.storeIndex];
      const service = this.serviceOptions[this.serviceIndex];
      const barber = this.barberOptions[this.barberIndex];
      if (!store || !service || !barber) {
        uni.showToast({ title: '请先选择门店/服务/理发师', icon: 'none' });
        return;
      }
      const endTime = (() => {
        const slot = this.slots.find((s) => s.startTime === this.selectedStartTime);
        return slot && slot.endTime ? slot.endTime : '';
      })();
      const timeText = endTime ? `${this.selectedStartTime}-${endTime}` : this.selectedStartTime;
      // 组装展示信息与提交入参
      this.confirmData = {
        store: store.name || '',
        service: service.name || '',
        barber: barber.name || barber.username || '',
        time: `${this.date} ${timeText}`
      };
      this.pendingPayload = {
        storeId: store._id,
        serviceId: service._id,
        barberId: barber._id,
        date: this.date,
        startTime: this.selectedStartTime
      };
      this.showConfirm = true;
    },
    closeConfirm() {
      this.showConfirm = false;
      this.pendingPayload = null;
    },
    // 提交预约：失败时提示冲突/不可预约
    async confirmSubmit() {
      if (!this.pendingPayload) return;
      try {
        const res = await createOrder(this.pendingPayload);
        const orderId = res && res.orderId;
        if (orderId) {
          uni.navigateTo({ url: `/pages/order/detail?id=${orderId}` });
          return;
        }
        uni.showToast({ title: '预约成功', icon: 'success' });
      } catch (err) {
        if (err && err.code === 409) {
          uni.showToast({ title: '该时段已被预约，请选择其他时段', icon: 'none' });
          return;
        }
        uni.showToast({ title: (err && err.message) || '预约失败', icon: 'none' });
      } finally {
        this.showConfirm = false;
        this.pendingPayload = null;
      }
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  /* 顶部留白稍微加大一些，避免标题紧贴状态栏（在前一次基础上再微调一点高度） */
  padding: 120rpx 30rpx 30rpx;
  background-color: $uni-bg-color-grey;
}


.title {
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  margin-bottom: 20rpx;
  padding-left: 6rpx;
}

.rules-notice {
  background: linear-gradient(135deg, #fff7e6, #ffffff);
  border: 2rpx solid #ffd591;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx 24rpx;
  margin-bottom: 24rpx;
  
  .rules-header {
    display: flex;
    align-items: center;
    margin-bottom: 12rpx;
    
    .rules-icon {
      font-size: 32rpx;
      margin-right: 8rpx;
    }
    
    .rules-title {
      font-size: 28rpx;
      font-weight: 600;
      color: #d46b08;
    }

    .rules-action {
      margin-left: auto;
      font-size: 24rpx;
      color: $uni-color-primary;
      padding: 6rpx 12rpx;
      border-radius: 20rpx;
      background: rgba(31, 42, 68, 0.08);
    }
  }
  
  .rules-text {
    font-size: 24rpx;
    color: #ad6800;
    line-height: 1.6;
    display: block;
  }
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

.hint {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-placeholder;
}

.slots-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
}

.slot-item {
  padding: 18rpx 16rpx;
  border-radius: $uni-border-radius-lg;
  background: #ffffff;
  border: 2rpx solid transparent;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.04);
}

.slot-time {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: $uni-text-color;
}

.slot-status {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $uni-text-color-grey;
}

.slot-available {
  border-color: rgba(82, 196, 26, 0.3);
}

.slot-booked {
  background: #f0f0f0;
  color: $uni-text-color-placeholder;
}

.slot-expired {
  background: #f5f5f5;
  color: $uni-text-color-placeholder;
  border-color: #d9d9d9;
  opacity: 0.8;
}

.slot-expired .slot-time,
.slot-expired .slot-status {
  color: $uni-text-color-placeholder;
}

.slot-unavailable {
  background: #f7f7f7;
  color: $uni-text-color-placeholder;
  border-color: #e5e5e5;
  opacity: 0.75;
}

.slot-unavailable .slot-time,
.slot-unavailable .slot-status {
  color: $uni-text-color-placeholder;
}

.slot-selected {
  border-color: $uni-color-success;
  background: rgba(82, 196, 26, 0.12);
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

.selected-info {
  margin-top: 16rpx;
  font-size: $uni-font-size-sm;
  color: $uni-text-color;
}

.modal-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.modal-card {
  width: 80%;
  background: #ffffff;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.18);
}

.modal-title {
  font-size: 34rpx;
  font-weight: 700;
  color: $uni-text-color;
  margin-bottom: 16rpx;
}

.modal-content {
  background: $uni-bg-color-grey;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
}

.modal-row {
  display: block;
  font-size: 26rpx;
  color: $uni-text-color;
  margin-bottom: 8rpx;
}

.modal-actions {
  display: flex;
  gap: 16rpx;
}

.modal-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-btn.ghost {
  background: #ffffff;
  color: $uni-text-color-grey;
  border: 2rpx solid $uni-border-color;
}

.modal-btn.primary {
  background: $uni-color-primary;
  color: #ffffff;
}
</style>
