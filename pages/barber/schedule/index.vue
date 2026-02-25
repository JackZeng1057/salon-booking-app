<template>
  <view class="page">
    <!-- =====================================================
         顶部固定区域：导航栏 + 英雄卡片
         英雄卡片包含：
         - 理发师头像（有图用图、无图显示姓名首字符作为占位符）
         - 理发师姓名 + 所属门店名称
         - 通知铃铛（右上角，有未读消息时显示红点）
         - "自动生成未来7天排班" 开关（generateFuture 控制）
    ===================================================== -->
    <view class="page-header">
      <app-nav :showBack="false" />

      <view class="hero-card">
      <view class="hero-head">
        <view class="hero-user">
          <!-- 头像：有图显示，无图降级为姓名首字符圆形占位符 -->
          <image
            v-if="barberAvatar"
            class="avatar avatar-image"
            :src="barberAvatar"
            mode="aspectFill"
            @error="handleHeaderAvatarError"
          />
          <view v-else class="avatar avatar-fallback">{{ barberInitial }}</view>
          <view class="hero-text">
            <text class="hero-name">{{ barberName }}</text>
            <text class="hero-store">{{ storeName }}</text>
          </view>
        </view>
        <view class="hero-actions">
          <!-- 通知入口：unreadCount > 0 时在铃铛右上角显示红点角标 -->
          <view class="notify-btn" @click="goNotifications">
            <app-icon name="bell" color="#334155" :size="30" :stroke-width="2.1" />
            <text v-if="unreadCount > 0" class="notify-dot"></text>
          </view>
        </view>
      </view>
        <!-- 自动排班开关：开启后点击"保存"时同时生成未来 7 天的时段数据 -->
        <view class="auto-row">
          <view class="auto-left">
            <app-icon name="calendar" color="#059669" :size="18" :stroke-width="2.1" />
            <text class="auto-text">自动生成未来 7 天排班</text>
          </view>
          <switch :checked="generateFuture" @change="onFutureChange" />
        </view>
      </view>
    </view>

    <!-- =====================================================
         主体滚动区
    ===================================================== -->
    <scroll-view class="page-scroll" scroll-y>
      <!-- 日期横向选择器：展示最近 7 天，横向滚动，点击切换排班日期 -->
      <view class="date-strip">
        <scroll-view class="day-scroll" scroll-x>
          <view class="day-row">
            <view
              v-for="item in weekDays"
              :key="item.date"
              class="day-pill"
              :class="{ active: item.date === date }"
              @click="selectDate(item.date)"
            >
              <text class="day-week">{{ item.week }}</text>
              <text class="day-day">{{ item.day }}</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- =====================================================
           排班设置面板
           - 顶部：当前日期标题 + 图例说明（可约/休息/已约）
           - 工作时间区间选择：开始时间 + 结束时间（点击弹出滚轮 picker）
           - 时段预览网格：每格代表一个时间段，颜色区分可约/休息/已约/已过期
             * slot-item 点击可手动切换该时段的状态（AVAILABLE ↔ DISABLED）
             * 右上角绿色三角标记代表"可预约"
           - 保存结果提示区：显示本次生成的可预约时段数
      ===================================================== -->
      <view class="panel">
        <view class="panel-head">
          <text class="panel-title">{{ date }} 排班</text>
          <!-- 图例：三种时段状态的颜色说明 -->
          <view class="legend">
            <view class="legend-item"><text class="dot dot-a"></text><text>可预约</text></view>
            <view class="legend-item"><text class="dot dot-d"></text><text>休息</text></view>
            <view class="legend-item"><text class="dot dot-b"></text><text>已约</text></view>
          </view>
        </view>

        <!-- 工作时间区间：点击 chip 打开时间滚轮，修改工作开始/结束时间 -->
        <view class="time-range">
          <view class="time-chip" @tap="openTimePicker('workStart')">开始 {{ workStart }}</view>
          <view class="time-chip" @tap="openTimePicker('workEnd')">结束 {{ workEnd }}</view>
        </view>

        <view v-if="previewServiceOptions.length > 1" class="service-filter">
          <view
            v-for="item in previewServiceOptions"
            :key="item.id"
            class="service-chip"
            :class="{ active: item.id === activePreviewServiceId }"
            @click="selectPreviewService(item.id)"
          >
            <text>{{ item.name }}</text>
          </view>
        </view>

        <!-- 时段预览网格：每格为一个可切换的时间槽 -->
        <!-- slot-past 样式使已过期（今天的历史时间段）呈灰色只读效果 -->
        <view class="slot-grid">
          <view
            v-for="slot in previewSlots"
            :key="slot.time"
            class="slot-item"
            :class="[slotClass(slot.status), { 'slot-past': isPastSlot(slot) }]"
            @click="togglePreviewSlot(slot)"
          >
            <text>{{ slot.time }}</text>
            <!-- 可预约时段右上角绿色小三角标记 -->
            <view v-if="slot.status === 'AVAILABLE' && !isPastSlot(slot)" class="corner"></view>
          </view>
        </view>

        <!-- 保存结果反馈：显示本次生成/已存在的可预约时段总数 -->
        <view v-if="result" class="result">
          <text class="result-title">{{ Number(result.createdCount || 0) > 0 ? '生成成功' : '已设置排班' }}</text>
          <text class="result-tip">
            当前可预约 {{ Number(result.totalBookableCount || (Number(result.createdCount || 0) + Number(result.existedCount || 0))) }} 段
          </text>
        </view>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>

    <!-- 悬浮保存按钮：提交当前排班设置，调用 barber-schedule-set 云函数 -->
    <button class="submit submit-floating" type="primary" :loading="loading" @click="handleSubmit">
      保存今日排班
    </button>

    <!-- 底部自定义 Tab 栏：排班（当前）/ 订单 / 我的 -->
    <view class="bottom-tab">
      <view class="bar-item active">
        <app-icon name="calendar" color="#10B981" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>排班</text>
      </view>
      <view class="bar-item" @click="goOrders">
        <app-icon name="file" color="#64748B" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>订单</text>
      </view>
      <view class="bar-item" @click="goAccountSettings">
        <app-icon name="user" color="#64748B" :size="25" size-unit="px" :stroke-width="2.25" />
        <text>我的</text>
      </view>
    </view>

    <!-- =====================================================
         时间滚轮选择器弹窗（自底部弹出）
         - showTimePicker 控制显示/隐藏
         - 点击遮罩层（picker-mask）取消选择
         - 双列滚轮：小时（0-23）+ 分钟（0/15/30/45，步长与时段间隔一致）
         - 用于分别修改"工作开始时间"与"工作结束时间"
    ===================================================== -->
    <view v-if="showTimePicker" class="picker-mask" @tap="cancelTimePicker">
      <view class="picker-panel" @tap.stop>
        <view class="picker-toolbar">
          <text class="picker-action picker-cancel" @tap="cancelTimePicker">取消</text>
          <text class="picker-action picker-done" @tap="confirmTimePicker">完成</text>
        </view>
        <view class="picker-wheel-wrap">
          <picker-view class="picker-wheel" :value="tempTimeValue" indicator-class="picker-indicator" @change="onTimePickerChange">
            <!-- 小时列：0-23 小时选项 -->
            <picker-view-column>
              <view v-for="hour in hourOptions" :key="`hour-${hour}`" class="picker-item">{{ hour }}</view>
            </picker-view-column>
            <!-- 分钟列：0/15/30/45，与时段步长保持一致 -->
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
// 页面目标：让理发师在一个页面内完成“排班设置 + 结果校验 + 后续跳转”。
import { setBarberSchedule, fetchBarberSlots } from '../../../api/barber';
import { fetchStoreServices, fetchStoreDetail } from '../../../api/store';
import { me } from '../../../api/auth';
import { getUnreadCount } from '../../../api/notifications';
import { authStore } from '../../../store/auth';
import { syncCriticalSystemNotifications, maybePromptNotificationPermissionOnFirstLogin } from '../../../utils/system-notify';

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

// picker 选项常量：0-23 点、0-59 分。
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => pad2(i));

// 把 HH:mm 解析为 picker 索引 [hourIndex, minuteIndex]，非法值回退到 09:00。
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

function getNameInitial(value, fallback = 'B') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const first = text.charAt(0);
  if (/^[a-z]$/i.test(first)) return first.toUpperCase();
  return first;
}

function normalizeIdList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

// 预览模式标识：综合视图（汇总理发师全部已分配服务的时段状态）
const PREVIEW_ALL_SERVICE_ID = '__all__';

// 多服务时段合并规则：按状态优先级取更严格的结果，避免出现“可约”误判。
function mergePreviewStatus(current, incoming) {
  const priority = {
    DISABLED: 0,
    AVAILABLE: 1,
    EXPIRED: 2,
    UNAVAILABLE: 3,
    BOOKED: 4
  };
  const cur = String(current || 'DISABLED').toUpperCase();
  const next = String(incoming || 'DISABLED').toUpperCase();
  return (priority[next] || 0) > (priority[cur] || 0) ? next : cur;
}

export default {
  data() {
    return {
      currentUser: authStore.state.user || {},
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
      unreadCount: 0,
      previewSlots: [],
      previewServiceOptions: [],
      activePreviewServiceId: PREVIEW_ALL_SERVICE_ID
    };
  },
  computed: {
    barberName() {
      return this.currentUser.username || this.currentUser.name || '理发师';
    },
    barberInitial() {
      return getNameInitial(this.barberName, 'B');
    },
    barberAvatar() {
      const value = String((this.currentUser && this.currentUser.avatar) || '').trim();
      if (!value) return '';
      const lowered = value.toLowerCase();
      if (lowered === 'default' || lowered === 'null' || lowered === 'undefined') return '';
      return value;
    },
    storeName() {
      return this.currentUser.storeName || '所属门店';
    },
    weekDays() {
      const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return {
          date: toDateString(d),
          week: labels[d.getDay()],
          day: d.getDate()
        };
      });
    }
  },
  onShow() {
    setTimeout(() => {
      maybePromptNotificationPermissionOnFirstLogin();
    }, 350);
    setTimeout(() => {
      syncCriticalSystemNotifications({ force: true });
    }, 600);
    this.loadCurrentUser().finally(() => {
      this.loadPreviewSlots();
    });
    this.loadUnreadCount();
  },
  onLoad() {
    uni.$on('user-profile-updated', this.handleUserProfileUpdated);
  },
  onUnload() {
    uni.$off('user-profile-updated', this.handleUserProfileUpdated);
  },
  methods: {
    // 资料保存后实时刷新当前页用户信息（无需手动刷新）
    async handleUserProfileUpdated(user) {
      if (!user || typeof user !== 'object') return;
      const merged = {
        ...(this.currentUser || {}),
        ...user
      };
      this.currentUser = merged;
      authStore.setUser(merged);
      await this.resolveStoreName(merged);
    },
    handleHeaderAvatarError() {
      this.currentUser = {
        ...(this.currentUser || {}),
        avatar: ''
      };
    },
    // 若用户信息缺少 storeName，则按 storeId 主动补齐，避免页面显示“门店ID”。
    async resolveStoreName(user) {
      if (!user) return;
      const rawName = String(user.storeName || '').trim();
      if (rawName) return;
      const storeId = String(user.storeId || '').trim();
      if (!storeId) return;
      try {
        const detail = await fetchStoreDetail(storeId, { noCache: true });
        const name = (detail && detail.name) || (detail && detail.store && detail.store.name) || '';
        if (!name) return;
        const nextUser = { ...user, storeName: name };
        this.currentUser = nextUser;
        authStore.setUser(nextUser);
      } catch (err) {}
    },
    async loadCurrentUser() {
      try {
        const latest = await me();
        if (latest) {
          // 保留已有门店名，避免接口短暂缺少 storeName 时页面闪回占位文案
          const merged = { ...latest };
          if (!merged.storeName && this.currentUser && this.currentUser.storeName) {
            merged.storeName = this.currentUser.storeName;
          }
          this.currentUser = merged;
          authStore.setUser(merged);
          await this.resolveStoreName(merged);
          return merged;
        }
      } catch (err) {}
      await this.resolveStoreName(this.currentUser);
      return this.currentUser;
    },
    // 生成“综合 + 已分配服务”筛选项，用于排班页切换展示口径。
    buildPreviewServiceOptions(services = []) {
      const serviceList = Array.isArray(services) ? services : [];
      if (!serviceList.length) return [];
      const userServiceIds = normalizeIdList(this.currentUser && this.currentUser.serviceIds);
      let assigned = [];
      if (userServiceIds.length > 0) {
        assigned = serviceList.filter((service) => userServiceIds.includes(String((service && service._id) || '')));
      }
      if (assigned.length === 0) {
        assigned = serviceList.slice(0, 1);
      }
      const options = assigned
        .map((service) => ({
          id: String((service && service._id) || ''),
          name: String((service && service.name) || '服务')
        }))
        .filter((item) => !!item.id);
      if (!options.length) return [];
      return [{ id: PREVIEW_ALL_SERVICE_ID, name: '综合' }, ...options];
    },
    // 取当前有效筛选项；当旧值失效时自动回落到首个可用项。
    getActivePreviewServiceId() {
      const currentId = String(this.activePreviewServiceId || '');
      const hasCurrent = this.previewServiceOptions.some((item) => item.id === currentId);
      if (hasCurrent) return currentId;
      const first = this.previewServiceOptions[0];
      return (first && first.id) || PREVIEW_ALL_SERVICE_ID;
    },
    // 切换服务筛选口径后重新拉取对应时段。
    selectPreviewService(serviceId) {
      const id = String(serviceId || '');
      if (!id || id === this.activePreviewServiceId) return;
      this.activePreviewServiceId = id;
      this.loadPreviewSlots();
    },
    // 按“理发师 + 日期 + 服务”读取时段，并转换为页面渲染结构。
    async fetchPreviewSlotsByService(barberId, date, serviceId) {
      const slots = await fetchBarberSlots({
        barberId,
        date,
        serviceId,
        noCache: true
      });
      if (!Array.isArray(slots)) return [];
      return slots.map((item) => ({
        time: item.startTime || '',
        status: String(item.status || 'DISABLED').toUpperCase()
      }));
    },
    // 把多个服务的时段列表合并为“综合视图”结果。
    mergeServicePreviewSlots(slotGroups = []) {
      const merged = new Map();
      slotGroups.forEach((group) => {
        (group || []).forEach((slot) => {
          const time = String((slot && slot.time) || '');
          if (!time) return;
          const prev = merged.get(time) || 'DISABLED';
          merged.set(time, mergePreviewStatus(prev, slot.status));
        });
      });
      return Array.from(merged.entries())
        .map(([time, status]) => ({ time, status }))
        .sort((a, b) => String(a.time).localeCompare(String(b.time)));
    },
    // 加载未读消息数用于头部徽标。
    async loadUnreadCount() {
      try {
        this.unreadCount = await getUnreadCount();
      } catch (err) {
        this.unreadCount = 0;
      }
    },
    goNotifications() {
      syncCriticalSystemNotifications({ force: true });
      uni.navigateTo({ url: '/pages/user/notifications/index' });
    },
    // 日期选择变更
    onDateChange(e) {
      this.date = e.detail.value || '';
      this.loadPreviewSlots();
    },
    selectDate(date) {
      if (!date) return;
      this.date = date;
      this.loadPreviewSlots();
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
      // 时间变化后刷新预览时段，便于实时观察可预约区间。
      this.loadPreviewSlots();
    },
    // 是否生成未来 7 天
    onFutureChange(e) {
      this.generateFuture = !!(e && e.detail && e.detail.value);
    },
    toMinute(value) {
      const m = String(value || '').match(/^(\d{2}):(\d{2})$/);
      if (!m) return 0;
      return Number(m[1]) * 60 + Number(m[2]);
    },
    isPastSlot(slot) {
      if (!slot || !slot.time) return false;
      const today = toDateString(new Date());
      if (this.date !== today) return false;
      const now = new Date();
      const currentMinute = now.getHours() * 60 + now.getMinutes();
      return this.toMinute(slot.time) <= currentMinute;
    },
    buildFallbackSlots() {
      const start = this.toMinute(this.workStart);
      const end = this.toMinute(this.workEnd);
      const list = [];
      for (let h = 9; h <= 21; h += 1) {
        const t = `${String(h).padStart(2, '0')}:00`;
        const minute = h * 60;
        list.push({
          time: t,
          status: minute >= start && minute < end ? 'AVAILABLE' : 'DISABLED'
        });
      }
      return list;
    },
    // 加载排班预览时段：
    // - 服务筛选为“综合”时，合并所有已分配服务的时段状态；
    // - 服务筛选为具体服务时，展示该服务口径下的时段状态；
    // - 无可用服务数据时回退到本地时段占位，保证页面可用。
    async loadPreviewSlots() {
      const barberId = this.currentUser && (this.currentUser._id || this.currentUser.uid || this.currentUser.userId);
      const storeId = this.currentUser && this.currentUser.storeId;
      if (!barberId || !storeId || !this.date) {
        this.previewServiceOptions = [];
        this.previewSlots = this.buildFallbackSlots();
        return;
      }
      try {
        const services = await fetchStoreServices(storeId, { noCache: true });
        this.previewServiceOptions = this.buildPreviewServiceOptions(services);
        if (!this.previewServiceOptions.length) {
          this.activePreviewServiceId = PREVIEW_ALL_SERVICE_ID;
          this.previewSlots = this.buildFallbackSlots();
          return;
        }
        this.activePreviewServiceId = this.getActivePreviewServiceId();
        const activeId = this.activePreviewServiceId;
        let slots = [];
        if (activeId === PREVIEW_ALL_SERVICE_ID) {
          const targetServiceIds = this.previewServiceOptions
            .map((item) => item.id)
            .filter((id) => id && id !== PREVIEW_ALL_SERVICE_ID);
          const groups = await Promise.all(
            targetServiceIds.map((serviceId) => this.fetchPreviewSlotsByService(barberId, this.date, serviceId))
          );
          slots = this.mergeServicePreviewSlots(groups);
        } else {
          slots = await this.fetchPreviewSlotsByService(barberId, this.date, activeId);
        }
        if (!Array.isArray(slots) || slots.length === 0) {
          this.previewSlots = this.buildFallbackSlots();
          return;
        }
        this.previewSlots = slots;
      } catch (err) {
        this.previewServiceOptions = [];
        this.previewSlots = this.buildFallbackSlots();
      }
    },
    togglePreviewSlot(slot) {
      if (!slot || slot.status === 'BOOKED' || this.isPastSlot(slot)) return;
      const target = String(slot.time || '');
      this.previewSlots = (this.previewSlots || []).map((item) => {
        if (item.time !== target) return item;
        return {
          ...item,
          status: item.status === 'AVAILABLE' ? 'DISABLED' : 'AVAILABLE'
        };
      });
    },
    slotClass(status) {
      const s = String(status || '').toUpperCase();
      if (s === 'AVAILABLE') return 'slot-available';
      if (s === 'BOOKED') return 'slot-booked';
      return 'slot-disabled';
    },
    goOrders() {
      uni.navigateTo({ url: '/pages/barber/orders/index' });
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
        // 按“排班实际生成日期”做统计，避免遗漏未来天数。
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
        url: '/pages/account/settings/index',
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
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 108rpx 20rpx 0;
  background: #f8fafc;
  box-sizing: border-box;
}

.page-header {
  flex-shrink: 0;
}

.page-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 12rpx;
  padding-bottom: 340rpx;
}

.hero-card {
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 24rpx;
  padding: 20rpx;
  margin-bottom: 14rpx;
}

.hero-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
}

.hero-user {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  font-weight: 700;
  font-size: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-image {
  background: #e2e8f0;
}

.avatar-fallback {
  background: #0f172a;
  color: #ffffff;
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.hero-name {
  font-size: 26rpx;
  color: #0f172a;
  font-weight: 700;
}

.hero-store {
  font-size: 21rpx;
  color: #64748b;
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

.auto-row {
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 16rpx;
  padding: 14rpx 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.auto-left {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.auto-text {
  font-size: 22rpx;
  color: #334155;
  font-weight: 600;
}

.scroll-bottom-gap {
  height: 24rpx;
}

.title {
  display: none;
}

.date-strip {
  margin-top: 12rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 22rpx;
  padding: 14rpx 0;
}

.day-scroll {
  white-space: nowrap;
}

.day-row {
  display: inline-flex;
  gap: 12rpx;
  padding: 0 16rpx;
}

.day-pill {
  width: 112rpx;
  height: 124rpx;
  border-radius: 20rpx;
  border: 1rpx solid #e2e8f0;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}

.day-pill.active {
  background: #0f172a;
  border-color: #0f172a;
}

.day-week {
  font-size: 22rpx;
  color: #64748b;
  font-weight: 600;
}

.day-day {
  font-size: 44rpx;
  line-height: 1;
  color: #64748b;
  font-weight: 700;
}

.day-pill.active .day-week,
.day-pill.active .day-day {
  color: #ffffff;
}

.panel {
  margin-top: 14rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 22rpx;
  padding: 18rpx;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.panel-title {
  font-size: 38rpx;
  color: #0f172a;
  font-weight: 800;
}

.legend {
  display: flex;
  gap: 12rpx;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  font-size: 20rpx;
  color: #334155;
}

.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 8rpx;
  border: 2rpx solid;
}

.dot-a {
  border-color: #10b981;
  background: #dcfce7;
}

.dot-d {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.dot-b {
  border-color: #f59e0b;
  background: #fef3c7;
}

.time-range {
  display: flex;
  gap: 10rpx;
  margin-bottom: 12rpx;
}

.service-filter {
  display: flex;
  gap: 10rpx;
  flex-wrap: wrap;
  margin-bottom: 12rpx;
}

.service-chip {
  min-width: 92rpx;
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: 26rpx;
  border: 1rpx solid #cbd5e1;
  background: #ffffff;
  color: #64748b;
  font-size: 20rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.service-chip.active {
  border-color: #0f172a;
  background: #0f172a;
  color: #ffffff;
}

.time-chip {
  flex: 1;
  height: 62rpx;
  border-radius: 14rpx;
  border: 1rpx solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
  color: #334155;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10rpx;
}

.slot-item {
  position: relative;
  height: 78rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  font-weight: 700;
}

.slot-available {
  border: 2rpx solid #86efac;
  background: #ffffff;
  color: #047857;
}

.slot-disabled {
  border: 2rpx solid #e2e8f0;
  background: #f8fafc;
  color: #cbd5e1;
}

.slot-booked {
  border: 2rpx solid #fcd34d;
  background: #fffbeb;
  color: #c2410c;
}

.slot-past {
  opacity: 0.55;
}

.corner {
  position: absolute;
  right: 0;
  top: 0;
  width: 22rpx;
  height: 22rpx;
  background: #10b981;
  border-bottom-left-radius: 14rpx;
}

.label {
  display: block;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
  margin-bottom: 12rpx;
}

.picker-value {
  background: #f8fafc;
  border-radius: 14rpx;
  border: 1rpx solid #e2e8f0;
  padding: 18rpx 20rpx;
  font-size: $uni-font-size-base;
  color: #0f172a;
}

.submit {
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 46rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
}

.submit-floating {
  position: fixed;
  left: 20rpx;
  right: 20rpx;
  bottom: 136rpx;
  z-index: 20;
}

.bottom-tab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 96rpx;
  background: #ffffff;
  border-top: 1rpx solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 21;
}

.bar-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  color: #64748b;
  font-size: 22rpx;
}

.bar-item.active {
  color: #10b981;
}

.result {
  margin-top: 24rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  background: #ecfdf5;
  border: 1rpx solid #a7f3d0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  color: $uni-text-color;
  font-size: $uni-font-size-sm;
}

.result-title {
  font-weight: 700;
  color: #065f46;
}

.result-tip {
  color: #047857;
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
