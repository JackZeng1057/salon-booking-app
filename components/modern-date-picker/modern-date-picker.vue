<template>
  <view class="mdp-root">
    <view class="mdp-trigger" @tap="openPicker">
      <slot>
        <view class="mdp-trigger-default">{{ displayText }}</view>
      </slot>
    </view>

    <view v-if="visible" class="mdp-mask" @tap="cancel">
      <view class="mdp-panel" @tap.stop>
        <view class="mdp-head">
          <text class="mdp-title">{{ panelTitle }}</text>
          <text class="mdp-subtitle">{{ tempValue || value || '请选择日期' }}</text>
        </view>

        <view class="mdp-month-bar">
          <view class="mdp-nav-btn" :class="{ disabled: !canPrevMonth }" @tap="toPrevMonth">‹</view>
          <text class="mdp-month-text">{{ panelYear }}年{{ panelMonth }}月</text>
          <view class="mdp-nav-btn" :class="{ disabled: !canNextMonth }" @tap="toNextMonth">›</view>
        </view>

        <view class="mdp-week-row">
          <text v-for="day in weekLabels" :key="day" class="mdp-week-cell">{{ day }}</text>
        </view>

        <view class="mdp-grid">
          <view
            v-for="(cell, idx) in monthCells"
            :key="idx"
            class="mdp-day-cell"
            :class="dayClass(cell)"
            @tap="pickDay(cell)"
          >
            <text v-if="cell.day" class="mdp-day-text">{{ cell.day }}</text>
            <text v-else class="mdp-day-text mdp-day-empty"> </text>
          </view>
        </view>

        <view class="mdp-actions">
          <view class="mdp-btn ghost" @tap="cancel">取消</view>
          <view class="mdp-btn primary" @tap="confirm">确定</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
/**
 * 现代风格日期选择器
 * 特性：
 * 1) 支持 start/end 范围限制
 * 2) 支持面板月份切换与禁用日期样式
 * 3) 通过 input/change 事件对外输出日期值
 */

// 补零：1 -> "01"
function pad2(n) {
  return String(n).padStart(2, '0');
}

// 将年月日拼接为 YYYY-MM-DD
function toDateString(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// 解析 YYYY-MM-DD 字符串
function parseDateString(text) {
  const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mon) || !Number.isFinite(day)) return null;
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return { y, m: mon, d: day };
}

// 生成今天日期字符串
function todayString() {
  const now = new Date();
  return toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// 日期键值：用于范围比较（按字符串比较即可）
function dateKey(text) {
  const parsed = parseDateString(text);
  if (!parsed) return '';
  return `${parsed.y}${pad2(parsed.m)}${pad2(parsed.d)}`;
}

// 获取某年某月天数
function monthDayCount(year, month) {
  return new Date(year, month, 0).getDate();
}

export default {
  name: 'ModernDatePicker',
  props: {
    value: {
      type: String,
      default: ''
    },
    start: {
      type: String,
      default: ''
    },
    end: {
      type: String,
      default: ''
    },
    placeholder: {
      type: String,
      default: '请选择日期'
    },
    title: {
      type: String,
      default: '选择日期'
    }
  },
  data() {
    return {
      visible: false,
      // 面板当前显示的年/月
      panelYear: 0,
      panelMonth: 0,
      // 弹窗内暂存值，点击“确定”后才真正写回外部
      tempValue: '',
      weekLabels: ['日', '一', '二', '三', '四', '五', '六']
    };
  },
  computed: {
    // 触发器显示文案
    displayText() {
      return this.value || this.placeholder;
    },
    // 面板标题
    panelTitle() {
      return this.title || '选择日期';
    },
    // 起始日期键值
    minKey() {
      return dateKey(this.start);
    },
    // 结束日期键值
    maxKey() {
      return dateKey(this.end);
    },
    // 当前月份日历格子（6 行 x 7 列，共 42 格）
    monthCells() {
      const firstWeekDay = new Date(this.panelYear, this.panelMonth - 1, 1).getDay();
      const total = monthDayCount(this.panelYear, this.panelMonth);
      const cells = [];
      for (let i = 0; i < firstWeekDay; i += 1) {
        cells.push({ day: 0, date: '', disabled: true });
      }
      for (let d = 1; d <= total; d += 1) {
        const date = toDateString(this.panelYear, this.panelMonth, d);
        cells.push({
          day: d,
          date,
          disabled: !this.isDateEnabled(date)
        });
      }
      while (cells.length < 42) {
        cells.push({ day: 0, date: '', disabled: true });
      }
      return cells;
    },
    // 是否允许切到上个月
    canPrevMonth() {
      return this.monthHasEnabledDay(this.panelYear, this.panelMonth - 1);
    },
    // 是否允许切到下个月
    canNextMonth() {
      return this.monthHasEnabledDay(this.panelYear, this.panelMonth + 1);
    }
  },
  methods: {
    // 判断日期是否落在可选范围内
    isDateEnabled(date) {
      if (!date) return false;
      const key = dateKey(date);
      if (!key) return false;
      if (this.minKey && key < this.minKey) return false;
      if (this.maxKey && key > this.maxKey) return false;
      return true;
    },
    // 判断指定月份是否至少存在 1 个可选日期
    monthHasEnabledDay(year, month) {
      let y = year;
      let m = month;
      if (m <= 0) {
        y -= 1;
        m = 12;
      } else if (m >= 13) {
        y += 1;
        m = 1;
      }
      const total = monthDayCount(y, m);
      for (let d = 1; d <= total; d += 1) {
        if (this.isDateEnabled(toDateString(y, m, d))) return true;
      }
      return false;
    },
    // 打开面板时确定初始选中日期
    resolveInitDate() {
      const candidate = this.value || this.start || todayString();
      if (this.isDateEnabled(candidate)) return candidate;
      const fallback = this.start || this.end || todayString();
      if (this.isDateEnabled(fallback)) return fallback;
      return todayString();
    },
    // 根据日期定位面板当前年月
    setPanelByDate(date) {
      const parsed = parseDateString(date);
      if (!parsed) return;
      this.panelYear = parsed.y;
      this.panelMonth = parsed.m;
    },
    // 打开日期选择器
    openPicker() {
      const initDate = this.resolveInitDate();
      this.tempValue = this.isDateEnabled(this.value) ? this.value : initDate;
      this.setPanelByDate(this.tempValue);
      this.visible = true;
    },
    // 取消选择并关闭面板
    cancel() {
      this.visible = false;
      this.tempValue = '';
    },
    // 点击某日：仅更新临时值，不立即对外提交
    pickDay(cell) {
      if (!cell || !cell.day || cell.disabled) return;
      this.tempValue = cell.date;
    },
    // 切换到上个月
    toPrevMonth() {
      if (!this.canPrevMonth) return;
      if (this.panelMonth === 1) {
        this.panelYear -= 1;
        this.panelMonth = 12;
      } else {
        this.panelMonth -= 1;
      }
    },
    // 切换到下个月
    toNextMonth() {
      if (!this.canNextMonth) return;
      if (this.panelMonth === 12) {
        this.panelYear += 1;
        this.panelMonth = 1;
      } else {
        this.panelMonth += 1;
      }
    },
    // 判断是否今天
    isToday(date) {
      return date === todayString();
    },
    // 生成日期格子的样式 class
    dayClass(cell) {
      if (!cell || !cell.day) return 'empty';
      const classes = [];
      if (cell.disabled) classes.push('disabled');
      if (this.isToday(cell.date)) classes.push('today');
      const selected = this.tempValue || this.value;
      if (selected && cell.date === selected) classes.push('selected');
      return classes.join(' ');
    },
    // 点击确定：校验并通过 input/change 输出结果
    confirm() {
      const val = this.tempValue || this.value || '';
      if (!val || !this.isDateEnabled(val)) {
        uni.showToast({ title: '请选择有效日期', icon: 'none' });
        return;
      }
      this.$emit('input', val);
      this.$emit('change', { detail: { value: val } });
      this.visible = false;
      this.tempValue = '';
    }
  }
};
</script>

<style scoped>
.mdp-trigger-default {
  height: 88rpx;
  border-radius: 20rpx;
  border: 2rpx solid #dbe3ef;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  padding: 0 24rpx;
  display: flex;
  align-items: center;
  color: #0f172a;
  font-size: 28rpx;
}

.mdp-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
}

.mdp-panel {
  width: 100%;
  background: #ffffff;
  border-top-left-radius: 36rpx;
  border-top-right-radius: 36rpx;
  padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -10rpx 32rpx rgba(15, 23, 42, 0.18);
}

.mdp-head {
  border-radius: 24rpx;
  padding: 20rpx 24rpx;
  background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
  color: #ffffff;
}

.mdp-title {
  font-size: 24rpx;
  opacity: 0.9;
}

.mdp-subtitle {
  margin-top: 8rpx;
  font-size: 40rpx;
  font-weight: 700;
}

.mdp-month-bar {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mdp-month-text {
  font-size: 32rpx;
  color: #0f172a;
  font-weight: 700;
}

.mdp-nav-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 18rpx;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0f172a;
  font-size: 42rpx;
}

.mdp-nav-btn.disabled {
  color: #cbd5e1;
  background: #f8fafc;
}

.mdp-week-row {
  margin-top: 18rpx;
  display: flex;
}

.mdp-week-cell {
  width: 14.285%;
  text-align: center;
  font-size: 24rpx;
  color: #64748b;
}

.mdp-grid {
  margin-top: 6rpx;
  display: flex;
  flex-wrap: wrap;
}

.mdp-day-cell {
  width: 14.285%;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mdp-day-text {
  width: 64rpx;
  height: 64rpx;
  border-radius: 32rpx;
  text-align: center;
  line-height: 64rpx;
  font-size: 28rpx;
  color: #1e293b;
}

.mdp-day-empty {
  color: transparent;
}

.mdp-day-cell.disabled .mdp-day-text {
  color: #cbd5e1;
}

.mdp-day-cell.today .mdp-day-text {
  color: #0ea5e9;
  font-weight: 700;
}

.mdp-day-cell.selected .mdp-day-text {
  background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 8rpx 18rpx rgba(14, 165, 233, 0.28);
}

.mdp-actions {
  margin-top: 18rpx;
  display: flex;
  justify-content: flex-end;
  gap: 18rpx;
}

.mdp-btn {
  min-width: 160rpx;
  height: 74rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
}

.mdp-btn.ghost {
  background: #eef2f7;
  color: #334155;
}

.mdp-btn.primary {
  background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
  color: #ffffff;
}
</style>
