<template>
  <!-- 预约创建页根容器，paddingTop 由系统状态栏高度动态计算（适配刘海屏/异形屏） -->
  <view class="page" :style="{ paddingTop: pagePaddingTop + 'px' }">
    <!-- 顶部导航栏 -->
    <app-nav :showTitle="true" title="创建预约" />

    <!-- 吸顶区域：Banner 提示 + 预约须知，scroll 时保持固定不滚走 -->
    <view class="top-fixed">
      <!-- 页面 Banner 卡片：简要说明操作流程 -->
      <view class="hero-card">
        <text class="hero-subtitle">确认门店服务和时段后提交预约</text>
      </view>

      <!-- 预约须知折叠行：显示首条规则，完整内容在弹窗中展示 -->
      <view class="rules-notice">
        <view class="rules-header">
          <!-- 灯泡图标，视觉提示这是注意事项 -->
          <app-icon class="rules-icon-svg" name="lightbulb" color="#faad14" :size="24" :stroke-width="2.1" />
          <text class="rules-title">预约须知</text>
          <!-- 点击"查看"展开规则弹窗 -->
          <text class="rules-action" @click="openRules">查看</text>
        </view>
        <!-- 显示第一条规则文字（截断），引导用户阅读完整规则 -->
        <text class="rules-text">{{ displayRules }}</text>
      </view>
    </view>

    <!-- 可滚动表单内容区：避免键盘弹起时内容被遮挡 -->
    <scroll-view class="content-scroll" scroll-y>
      <view class="form">
        <!-- 步骤1：选择门店（Picker 下拉，自动加载服务/理发师/规则） -->
        <view class="field">
          <text class="label">选择门店</text>
          <picker :range="storeOptions" range-key="name" :value="storeIndex" @change="onStoreChange">
            <view class="picker-value">{{ currentStoreName }}</view>
          </picker>
        </view>

        <!-- 步骤2：选择服务（变更后联动过滤可用理发师列表） -->
        <view class="field">
          <text class="label">选择服务</text>
          <picker :range="serviceOptions" range-key="name" :value="serviceIndex" @change="onServiceChange">
            <view class="picker-value">{{ currentServiceName }}</view>
          </picker>
        </view>

        <!-- 步骤3：选择理发师（列表由门店+服务联合过滤；无可选时显示提示） -->
        <view class="field">
          <text class="label">选择理发师</text>
          <picker v-if="barberOptions.length > 0" :range="barberOptions" range-key="name" :value="barberIndex" @change="onBarberChange">
            <view class="picker-value">{{ currentBarberName }}</view>
          </picker>
          <!-- 当前服务没有关联的理发师时的兜底提示 -->
          <view v-else class="picker-value">当前服务暂无可用理发师</view>
          <!-- 显式绑定模式提示：管理员已配置理发师可做服务项目 -->
          <text v-if="usingAdminBarberServices" class="hint">当前已按门店配置过滤可选理发师</text>
        </view>

        <!-- 步骤4：选择日期（通过 modern-date-picker 组件选取）-->
        <view class="field">
          <text class="label">选择日期</text>
          <modern-date-picker :value="date" :start="minDate" @change="onDateChange">
            <view class="picker-value">{{ date || '请选择日期' }}</view>
          </modern-date-picker>
        </view>

        <!-- 步骤5：选择可预约时段 -->
        <view class="field">
          <text class="label">可预约时段</text>
          <!-- 时段加载中状态 -->
          <view v-if="slotsLoading" class="hint">加载时段中...</view>
          <!-- 暂无可用时段（未设置排班或当日已满） -->
          <view v-else-if="slots.length === 0" class="hint">暂无可用时段，请先设置排班或切换日期</view>
          <view v-else>
            <!-- 智能推荐时段卡片：算法选出最优空闲窗口 + 一键选中 -->
            <view v-if="recommendedStartTime" class="recommend-box">
              <view class="recommend-main">
                <text class="recommend-title">智能推荐</text>
                <text class="recommend-time">{{ recommendedStartTime }}-{{ recommendedEndTime }}</text>
                <!-- 推荐原因文案（根据当日占用率动态生成：紧张/充足/弹性） -->
                <text class="recommend-reason">{{ recommendedReason }}</text>
              </view>
              <!-- 一键将推荐时段写入 selectedStartTime -->
              <view class="recommend-action" @click="applyRecommendedSlot">一键选中</view>
            </view>
            <!-- 全部可预约时段网格，点击选中对应时段 -->
            <view class="slots-grid">
              <view
                v-for="slot in slots"
                :key="slot.startTime"
                class="slot-item"
                :class="slotClass(slot)"
                @click="selectSlot(slot)"
              >
                <!-- 时段起止时间显示 -->
                <text class="slot-time">{{ slot.startTime }}-{{ slot.endTime }}</text>
                <!-- 时段状态（可预约/已预约/已过期） -->
                <text class="slot-status">{{ formatSlotStatus(slot.status) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 备注输入区域（可选）：AI顾问跳转时会自动预填 aiRemark -->
        <view class="field">
          <view class="remark-header">
            <text class="label">预约备注（可选）</text>
            <!-- AI顾问来源标记标签 -->
            <text v-if="fromAiAdvisor" class="remark-tag">来自AI顾问</text>
          </view>
          <textarea
            v-model="remark"
            class="remark-input"
            maxlength="120"
            placeholder="例：发质偏硬，避免漂染，想要层次感和好打理。"
          />
          <!-- 实时字数计数 -->
          <text class="remark-count">{{ remark.length }}/120</text>
        </view>

        <!-- 提交按钮：未选时段时禁用，防止空提交 -->
        <button
          class="submit"
          type="primary"
          :disabled="!selectedStartTime"
          @click="confirmSelection"
        >
          确认预约
        </button>

        <!-- 当前已选时段回显，给用户即时反馈 -->
        <view v-if="selectedStartTime" class="selected-info">
          已选时段：{{ selectedStartTime }}
        </view>
      </view>
      <!-- 底部安全边距，防止内容被 Tab Bar 遮挡 -->
      <view class="scroll-bottom-safe"></view>
    </scroll-view>

    <!-- 预约信息确认弹窗：展示门店/服务/理发师/时间/备注摘要，用户二次确认后提交 -->
    <app-modal
      :visible="showConfirm"
      title="确认预约信息"
      subtitle="请确认以下预约信息无误后提交"
      cancel-text="再看看"
      confirm-text="确认预约"
      @close="closeConfirm"
      @cancel="closeConfirm"
      @confirm="confirmSubmit"
    >
      <!-- 预约摘要信息列表 -->
      <view class="confirm-summary">
        <view class="confirm-row">
          <text class="confirm-label">门店</text>
          <text class="confirm-value">{{ confirmData.store }}</text>
        </view>
        <view class="confirm-row">
          <text class="confirm-label">服务</text>
          <text class="confirm-value">{{ confirmData.service }}</text>
        </view>
        <view class="confirm-row">
          <text class="confirm-label">理发师</text>
          <text class="confirm-value">{{ confirmData.barber }}</text>
        </view>
        <view class="confirm-row">
          <text class="confirm-label">时间</text>
          <text class="confirm-value">{{ confirmData.time }}</text>
        </view>
        <!-- 仅有备注时才展示此行 -->
        <view v-if="confirmData.remark" class="confirm-row">
          <text class="confirm-label">备注</text>
          <text class="confirm-value multiline">{{ confirmData.remark }}</text>
        </view>
      </view>
    </app-modal>

    <!-- 完整预约规则弹窗（仅关闭按钮，无取消选项） -->
    <app-modal
      :visible="showRulesModal"
      title="预约规则"
      :show-cancel="false"
      confirm-text="我知道了"
      @close="closeRulesModal"
      @confirm="closeRulesModal"
    >
      <view class="rules-dialog-content">{{ displayRules }}</view>
    </app-modal>
  </view>
</template>

<script>
/**
 * @page pages/order/create.vue — 预约创建页
 *
 * 【页面职责】
 * 引导用户完成 4 步预约选择流程：
 *   Step 1: 选择门店 → 自动加载服务列表、理发师列表、门店规则
 *   Step 2: 选择服务 → 根据当前服务过滤可执行该服务的理发师（rebuildBarberOptions）
 *   Step 3: 选择理发师 + 日期
 *   Step 4: 选择时段 → 加载 barber-slots-get 返回的时段列表
 * 最终弹出确认弹窗提交给 orders-create 云函数。
 *
 * 【联动逻辑】
 * 门店/服务/理发师/日期四个选择器相互联动：
 *   - 切换门店 → 清空服务/理发师/时段，重新加载
 *   - 切换服务 → 根据 supportedServiceIds 过滤理发师（rebuildBarberOptions）
 *   - 切换理发师或日期 → 重新请求 barber-slots-get
 *
 * 【服务-理发师绑定模式（双策略）】
 * 由 stores.barberServiceAssignmentEnabled 开关决定：
 * - 显式绑定（true）：每个理发师在 users.serviceIds 中声明可做的服务；
 * - 旧配对模式（false）：serviceList[i] ↔ barberList[i]，一一对应（历史兼容）。
 * hasExplicitConfig 变量控制 usingAdminBarberServices 展示提示文字。
 *
 * 【时段数据流】
 * barber-slots-get 返回 { startTime, endTime, status } 列表，
 * applySlotExpiration() 在前端做二次判定（当天已过去的时段标记 EXPIRED），
 * 与云函数的判定双保险，防止时段请求后到提交前的情况下时段过期但未刷新。
 *
 * 【智能推荐时段（refreshRecommendedSlot）】
 * 从可用时段中用打分算法挑选"最优"时段推荐给用户：
 * - 优先选前后有空档的时段（不易因相邻理发师被占用引发尴尬）；
 * - 对靠近午休和营业结束的时段施加边缘惩罚；
 * - 偏移 14:00 中间时段的时间距离作为均衡项。
 * 推荐文案根据当日占用率动态生成（紧张/充足/弹性文案三档）。
 *
 * 【AI 顾问入口（fromAiAdvisor）】
 * AI 顾问页推荐服务后，通过 navigateTo 携带 storeId/serviceId/aiRemark 参数跳转此页，
 * 页面 onLoad 读取后自动预填服务和备注，fromAiAdvisor 标记在 UI 中展示"来自AI顾问"标签。
 *
 * 【提交防重设计】
 * confirmSelection() 提交前再次检查 targetSlot.status（防止弹窗打开后时段被他人抢占），
 * 提交成功后跳转订单详情页，并通过 clearOrderCaches() 使本地缓存失效。
 */
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

function decodeQueryText(value) {
  // 路由参数通过 navigateTo URL 拼接时会被 encodeURIComponent 编码，
  // 此函数将其还原为原始文字；解码失败时直接使用原始字符串，避免异常阻断渲染。
  const raw = String(value || '');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch (e) {
    return raw;
  }
}

// 统一页面内 ID 对比与透传：兼容 string/ObjectId/{$oid}
function normalizeId(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (!text || text === '[object Object]') return '';
    return text;
  }
  if (typeof value === 'object') {
    if (value.$oid) return String(value.$oid).trim();
    if (value.id) return String(value.id).trim();
    if (typeof value.toString === 'function') {
      const text = String(value.toString()).trim();
      if (text && text !== '[object Object]') return text;
    }
  }
  return '';
}

function timeToMinutes(text) {
  // 将 "HH:MM" 格式的时间字符串转为从 0:00 起的分钟数，用于智能推荐算法中的数值比较。
  // 解析失败（格式非法或非数字）时返回 NaN，调用方需用 Number.isNaN 做防御。
  const matched = String(text || '').match(/^(\d{2}):(\d{2})$/);
  if (!matched) return NaN;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
  return hour * 60 + minute;
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\u4e00-\u9fa5]/g, '');
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
      showRulesModal: false,
      confirmData: {
        store: '',
        service: '',
        barber: '',
        time: '',
        remark: ''
      },
      pendingPayload: null,
      // true: 使用管理员配置的理发师项目；false: 回退历史一一配对策略
      usingAdminBarberServices: false,
      // 预约备注（可由 AI 顾问预填）
      remark: '',
      fromAiAdvisor: false,
      presetServiceId: '',
      presetServiceName: '',
      presetBarberId: '',
      // 智能推荐时段
      recommendedStartTime: '',
      recommendedEndTime: '',
      recommendedReason: '',
      pagePaddingTop: 0
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
      return this.barberOptions[this.barberIndex].username || this.barberOptions[this.barberIndex].name || '未命名理发师';
    }
  },
  onLoad(options) {
    this.updatePagePaddingTop();
    // 支持从门店详情或 AI 顾问带入门店/服务/理发师/备注
    const presetStoreId = normalizeId(options && options.storeId);
    const presetServiceId = normalizeId(options && options.serviceId);
    const presetBarberId = normalizeId(options && options.barberId);
    const presetServiceName = decodeQueryText(options && options.serviceName);
    const aiRemark = decodeQueryText(options && options.aiRemark);
    this.presetServiceId = normalizeId(presetServiceId);
    this.presetServiceName = String(presetServiceName || '').trim();
    this.presetBarberId = normalizeId(presetBarberId);
    this.remark = String(aiRemark || '').slice(0, 120);
    this.fromAiAdvisor = !!this.remark;
    this.loadStores(presetStoreId, this.presetServiceId, this.presetBarberId);
  },
  onShow() {
    this.updatePagePaddingTop();
    this.minDate = toDateString(new Date());
    this.lastSlotsKey = '';
    if (this.storeIndex >= 0 && this.serviceIndex >= 0 && this.barberIndex >= 0) {
      this.tryLoadSlots();
    }
  },
  methods: {
    updatePagePaddingTop() {
      try {
        const sys = uni.getSystemInfoSync();
        const statusBarHeight = Number(sys && sys.statusBarHeight) || 0;
        // 与 app-nav 保持一致：状态栏 + 44px 导航内容 + 12px 视觉间距
        this.pagePaddingTop = statusBarHeight + 56;
      } catch (e) {
        this.pagePaddingTop = 76;
      }
    },
    formatSlotStatus,
    openRules() {
      this.showRulesModal = true;
    },
    closeRulesModal() {
      this.showRulesModal = false;
    },
    // 拉取门店列表并处理预选
    async loadStores(presetStoreId, presetServiceId = '', presetBarberId = '') {
      try {
        const stores = await fetchStores({ noCache: true });
        this.storeOptions = Array.isArray(stores) ? stores : [];
        const targetStoreId = normalizeId(presetStoreId);
        const targetServiceId = normalizeId(presetServiceId || this.presetServiceId);
        const targetServiceName = normalizeName(this.presetServiceName);
        if (targetStoreId) {
          const index = this.storeOptions.findIndex((item) => normalizeId(item && item._id) === targetStoreId);
          if (index >= 0) {
            this.storeIndex = index;
            await this.loadStoreRelated(presetServiceId, presetBarberId);
            // storeId 可命中但 serviceId 不属于该门店时，按 serviceId 真实归属店纠偏，避免服务回退到第一个。
            if (targetServiceId) {
              const currentServiceId = normalizeId(this.serviceOptions[this.serviceIndex] && this.serviceOptions[this.serviceIndex]._id);
              if (currentServiceId !== targetServiceId) {
                const serviceStoreIndex = await this.findStoreIndexByServiceId(targetServiceId);
                if (serviceStoreIndex >= 0 && serviceStoreIndex !== index) {
                  this.storeIndex = serviceStoreIndex;
                  await this.loadStoreRelated(presetServiceId, presetBarberId);
                }
              }
            }
            return;
          }
        }
        // storeId 无法命中时，按 serviceId 反查归属门店，避免落到默认门店导致服务错位。
        if (targetServiceId) {
          const serviceStoreIndex = await this.findStoreIndexByServiceId(targetServiceId);
          if (serviceStoreIndex >= 0) {
            this.storeIndex = serviceStoreIndex;
            await this.loadStoreRelated(presetServiceId, presetBarberId);
            return;
          }
        }
        if (!targetServiceId && targetServiceName) {
          const serviceStoreIndex = await this.findStoreIndexByServiceName(targetServiceName);
          if (serviceStoreIndex >= 0) {
            this.storeIndex = serviceStoreIndex;
            await this.loadStoreRelated(presetServiceId, presetBarberId);
            return;
          }
        }
        // 若未传入门店，默认选择第一个门店
        if (this.storeOptions.length > 0) {
          this.storeIndex = 0;
          await this.loadStoreRelated(presetServiceId, presetBarberId);
        }
      } catch (err) {
        uni.showToast({ title: err.message || '加载门店失败', icon: 'none' });
      }
    },
    // 选择门店
    async onStoreChange(e) {
      this.storeIndex = Number(e.detail.value || 0);
      this.currentStep = 1;
      await this.loadStoreRelated('');
    },
    async findStoreIndexByServiceId(serviceId) {
      const targetServiceId = normalizeId(serviceId);
      if (!targetServiceId || this.storeOptions.length === 0) return -1;
      for (let i = 0; i < this.storeOptions.length; i += 1) {
        const storeId = normalizeId(this.storeOptions[i] && this.storeOptions[i]._id);
        if (!storeId) continue;
        try {
          const services = await fetchStoreServices(storeId, { noCache: true });
          const list = Array.isArray(services) ? services : [];
          const hit = list.some((item) => normalizeId(item && item._id) === targetServiceId);
          if (hit) return i;
        } catch (e) {}
      }
      return -1;
    },
    async findStoreIndexByServiceName(serviceName) {
      const targetServiceName = normalizeName(serviceName);
      if (!targetServiceName || this.storeOptions.length === 0) return -1;
      for (let i = 0; i < this.storeOptions.length; i += 1) {
        const storeId = normalizeId(this.storeOptions[i] && this.storeOptions[i]._id);
        if (!storeId) continue;
        try {
          const services = await fetchStoreServices(storeId, { noCache: true });
          const list = Array.isArray(services) ? services : [];
          const hit = list.some((item) => normalizeName(item && item.name) === targetServiceName);
          if (hit) return i;
        } catch (e) {}
      }
      return -1;
    },
    // 拉取服务与理发师（并发加载 services/barbers/storeDetail，减少等待时间）
    // 同时读取门店预约规则并写入 storeRules，供"预约须知"展示。
    // 根据 barberServiceAssignmentEnabled 开关决定使用"显式绑定"还是"历史一一配对"策略：
    //   显式绑定（hasExplicitConfig=true）：reads.serviceIds from users collection
    //   历史配对（hasExplicitConfig=false）：serviceList[i] ↔ barberList[i]
    async loadStoreRelated(presetServiceId = '', presetBarberId = '') {
      this.serviceOptions = [];
      this.allBarbers = [];
      this.barberOptions = [];
      this.serviceIndex = -1;
      this.barberIndex = -1;
      this.slots = [];
      this.selectedStartTime = '';
      this.storeRules = null;
      this.usingAdminBarberServices = false;
      this.recommendedStartTime = '';
      this.recommendedEndTime = '';
      this.recommendedReason = '';
      const store = this.storeOptions[this.storeIndex];
      const storeId = normalizeId(store && store._id);
      if (!storeId) return;
      try {
        const [services, barbers, storeDetail] = await Promise.all([
          fetchStoreServices(storeId, { noCache: true }),
          fetchStoreBarbers(storeId, { noCache: true }),
          fetchStoreDetail(storeId, { noCache: true })
        ]);
        const serviceList = Array.isArray(services) ? services : [];
        // 兼容理发师显示名为空的情况
        const barberList = Array.isArray(barbers)
          ? barbers.map((item) => ({
              ...item,
              name: item.username || item.name || '理发师',
              serviceIds: Array.isArray(item.serviceIds) ? item.serviceIds : []
            }))
          : [];

        // 优先使用管理员配置（store-level 开关）；若未启用则回退历史一一配对
        const hasExplicitConfig = !!(storeDetail && storeDetail.barberServiceAssignmentEnabled);
        this.usingAdminBarberServices = hasExplicitConfig;

        if (hasExplicitConfig) {
          this.serviceOptions = serviceList;
          const validServiceIdSet = new Set(serviceList.map((item) => normalizeId(item && item._id)).filter((id) => !!id));
          this.allBarbers = barberList.map((item) => ({
            ...item,
            supportedServiceIds: (item.serviceIds || [])
              .map((id) => normalizeId(id))
              .filter((id) => !!id && validServiceIdSet.has(id))
          }));
        } else {
          const pairCount = Math.min(serviceList.length, barberList.length);
          const pairedServices = serviceList.slice(0, pairCount);
          const pairedBarbers = barberList.slice(0, pairCount);
          this.serviceOptions = pairedServices;
          this.allBarbers = pairedBarbers.map((item, idx) => ({
            ...item,
            supportedServiceIds: pairedServices[idx] && pairedServices[idx]._id ? [normalizeId(pairedServices[idx]._id)] : []
          }));
        }

        // 加载门店规则
        if (storeDetail && storeDetail.bookingRules) {
          this.storeRules = storeDetail.bookingRules;
        }
        // 默认选中第一个服务，并按服务过滤理发师
        if (this.serviceOptions.length > 0) {
          const targetBarberId = normalizeId(presetBarberId || this.presetBarberId);
          const targetServiceId = normalizeId(presetServiceId || this.presetServiceId);
          const targetServiceName = normalizeName(this.presetServiceName);
          const isServicePreset = !!(targetServiceId || targetServiceName);
          let targetIndex = targetServiceId
            ? this.serviceOptions.findIndex((item) => normalizeId(item && item._id) === targetServiceId)
            : -1;
          if (targetIndex < 0 && targetServiceName) {
            targetIndex = this.serviceOptions.findIndex((item) => normalizeName(item && item.name) === targetServiceName);
          }
          // 从理发师入口进入且未指定服务时，自动切到该理发师可做的服务，确保理发师可命中。
          if (targetIndex < 0 && targetBarberId && !isServicePreset) {
            const targetBarber = this.allBarbers.find((item) => normalizeId(item && item._id) === targetBarberId);
            const supportedServiceIds = Array.isArray(targetBarber && targetBarber.supportedServiceIds)
              ? targetBarber.supportedServiceIds
              : [];
            const preferredServiceId = supportedServiceIds.find((id) => !!id);
            if (preferredServiceId) {
              targetIndex = this.serviceOptions.findIndex((item) => normalizeId(item && item._id) === preferredServiceId);
            }
          }
          this.serviceIndex = targetIndex >= 0 ? targetIndex : 0;
          this.presetServiceId = '';
          this.presetServiceName = '';
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
    // 根据当前选中服务重建可选理发师列表
    // 遍历 allBarbers，筛选 supportedServiceIds 中包含当前 serviceId 的理发师。
    // 同时尝试保留上次选中的理发师（prevBarberId），保证切换服务时不丢失已选状态；
    // 找不到则默认选中新列表第 0 项；列表为空则清空选中。
    rebuildBarberOptions() {
      const service = this.serviceOptions[this.serviceIndex];
      const serviceId = normalizeId(service && service._id);
      if (!serviceId) {
        this.barberOptions = [];
        this.barberIndex = -1;
        return;
      }
      const prevBarber = this.barberOptions[this.barberIndex];
      const prevBarberId = normalizeId(prevBarber && prevBarber._id);
      const targetBarberId = normalizeId(this.presetBarberId);
      const list = this.allBarbers.filter((item) => {
        const supported = Array.isArray(item.supportedServiceIds) ? item.supportedServiceIds : [];
        return supported.includes(serviceId);
      });
      this.barberOptions = list;
      const preferredBarberId = targetBarberId || prevBarberId;
      const nextIndex = list.findIndex((item) => normalizeId(item && item._id) === preferredBarberId);
      this.barberIndex = nextIndex >= 0 ? nextIndex : list.length > 0 ? 0 : -1;
      this.presetBarberId = '';
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
      if (!normalizeId(barber && barber._id)) return;
      this.loadSlots();
    },
    // 调用云函数获取时段（包含服务时长窗口与不可预约状态）
    async loadSlots() {
      const barber = this.barberOptions[this.barberIndex];
      const barberId = normalizeId(barber && barber._id);
      if (!barberId) return;
      const service = this.serviceOptions[this.serviceIndex];
      const serviceId = normalizeId(service && service._id);
      const key = `${barberId}:${this.date}:${serviceId}`;
      if (key === this.lastSlotsKey && this.slots.length > 0) {
        // 查询条件未变化且已有缓存结果时直接复用
        return;
      }
      this.lastSlotsKey = key;
      this.slotsLoading = true;
      this.slots = [];
      this.selectedStartTime = '';
      this.recommendedStartTime = '';
      this.recommendedEndTime = '';
      this.recommendedReason = '';
      try {
        // 按理发师 + 日期 + 服务查询可预约窗口
        const data = await fetchBarberSlots({
          barberId,
          date: this.date,
          serviceId,
          noCache: true
        });
        const list = Array.isArray(data) ? data : [];
        this.slots = this.applySlotExpiration(list);
        this.refreshRecommendedSlot();
      } catch (err) {
        uni.showToast({ title: err.message || '加载时段失败', icon: 'none' });
      } finally {
        this.slotsLoading = false;
      }
    },
    // 前端兜底过期判定，与云函数双保险：
    // 1) 若选择日期早于今天，所有非 BOOKED 时段直接标为 EXPIRED；
    // 2) 若选择日期为今天，逐槽比对当前分钟数，startTime <= 当前时间的标为 EXPIRED；
    // 目的：防止时段请求返回后到用户提交前出现状态滞后的问题。
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
    // 智能推荐算法：对全部 AVAILABLE 时段打分，score 越小越优先。评分维度：
    // ① 周边堵塞度（前后各 2 格内 BOOKED/UNAVAILABLE 数 ×2.5）：拥挤时段环境反而更高效
    // ② 与 14:00 的中心偏差（偏离每小时加 1 分）：友好时段优先
    // ③ 边缘时段惩罚（10:00 前或 20:00 后 +0.8）：避免推荐过早/过晚时段
    // 推荐原因文案根据当日占用率动态生成（紧张/充足/弹性）
    refreshRecommendedSlot() {
      const allSlots = Array.isArray(this.slots) ? this.slots : [];
      const availableSlots = allSlots.filter((slot) => slot && slot.status === 'AVAILABLE');
      if (availableSlots.length === 0) {
        this.recommendedStartTime = '';
        this.recommendedEndTime = '';
        this.recommendedReason = '';
        return;
      }

      const orderedSlots = [...allSlots].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const indexByStartTime = new Map(orderedSlots.map((slot, index) => [slot.startTime, index]));
      const targetMinute = 14 * 60;
      let best = null;

      availableSlots.forEach((slot) => {
        const slotMinute = timeToMinutes(slot.startTime);
        const index = indexByStartTime.get(slot.startTime);
        let blockedAround = 0;
        let availableAround = 0;
        [-2, -1, 1, 2].forEach((offset) => {
          const near = orderedSlots[index + offset];
          if (!near) return;
          if (near.status === 'AVAILABLE') availableAround += 1;
          if (near.status === 'BOOKED' || near.status === 'UNAVAILABLE') blockedAround += 1;
        });
        const centerPenalty = Number.isFinite(slotMinute) ? Math.abs(slotMinute - targetMinute) / 60 : 3;
        const edgePenalty = Number.isFinite(slotMinute) && (slotMinute < 10 * 60 || slotMinute > 20 * 60) ? 0.8 : 0;
        const score = blockedAround * 2.5 + centerPenalty + edgePenalty - availableAround * 0.8;

        if (!best || score < best.score || (score === best.score && slotMinute < best.slotMinute)) {
          best = {
            slot,
            score,
            slotMinute,
            availableAround
          };
        }
      });

      if (!best || !best.slot) {
        this.recommendedStartTime = '';
        this.recommendedEndTime = '';
        this.recommendedReason = '';
        return;
      }

      const activeSlotCount = allSlots.filter((slot) => slot && slot.status !== 'EXPIRED').length;
      const busySlotCount = allSlots.filter((slot) => slot && (slot.status === 'BOOKED' || slot.status === 'UNAVAILABLE')).length;
      const busyRate = activeSlotCount > 0 ? busySlotCount / activeSlotCount : 0;

      this.recommendedStartTime = best.slot.startTime || '';
      this.recommendedEndTime = best.slot.endTime || '';
      if (availableSlots.length <= 2) {
        this.recommendedReason = '可选时段较少，建议优先锁定该时段。';
      } else if (busyRate >= 0.6) {
        this.recommendedReason = '当日预约较紧张，推荐优先选择该时段避免冲突。';
      } else if (best.availableAround >= 2) {
        this.recommendedReason = '该时段前后空档更充足，改期与调整更灵活。';
      } else {
        this.recommendedReason = '综合时段分布与可预约性，推荐该时间。';
      }
    },
    // 根据状态设置样式
    slotClass(slot) {
      if (slot.status === 'BOOKED') return 'slot-booked';
      if (slot.status === 'EXPIRED') return 'slot-expired';
      if (slot.status === 'UNAVAILABLE') return 'slot-unavailable';
      if (slot.startTime === this.selectedStartTime) return 'slot-selected';
      if (slot.status === 'AVAILABLE' && slot.startTime === this.recommendedStartTime) return 'slot-recommended';
      return 'slot-available';
    },
    applyRecommendedSlot() {
      if (!this.recommendedStartTime) return;
      this.selectedStartTime = this.recommendedStartTime;
      uni.showToast({ title: '已选中推荐时段', icon: 'none' });
    },
    // 选择时段：过滤不可预约/过期/已预约
    selectSlot(slot) {
      if (!slot || slot.status === 'BOOKED' || slot.status === 'EXPIRED' || slot.status === 'UNAVAILABLE') return;
      this.selectedStartTime = slot.startTime;
    },
    // 确认预约前二次校验：
    // 1) 判断 selectedStartTime 对应时段是否仍为 AVAILABLE（防止弹窗打开后时段被他人抢占）；
    // 2) 组装确认弹窗展示数据（confirmData）与提交参数（pendingPayload），打开确认弹窗。
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
        barber: barber.username || barber.name || '',
        time: `${this.date} ${timeText}`,
        remark: String(this.remark || '').trim()
      };
      this.pendingPayload = {
        storeId: normalizeId(store && store._id),
        serviceId: normalizeId(service && service._id),
        barberId: normalizeId(barber && barber._id),
        date: this.date,
        startTime: this.selectedStartTime,
        remark: String(this.remark || '').trim()
      };
      this.showConfirm = true;
    },
    closeConfirm() {
      this.showConfirm = false;
      this.pendingPayload = null;
    },
    // 提交预约：调用 orders-create，成功后跳转订单详情页；
    // 出现 409 冲突（时段被抢占）时提示用户重新选择，不直接关闭弹窗；
    // finally 保证弹窗无论成功/失败都会关闭，避免页面锁死。
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
  height: 100vh;
  padding: 0 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #f8fafc;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.top-fixed {
  flex-shrink: 0;
}

.content-scroll {
  flex: 1;
  min-height: 0;
}

.scroll-bottom-safe {
  height: 36rpx;
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
    
    .rules-icon-svg {
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

.remark-header {
  display: flex;
  align-items: center;
}

.remark-tag {
  margin-left: 10rpx;
  font-size: 20rpx;
  color: #175cd3;
  background: rgba(23, 92, 211, 0.08);
  border-radius: 18rpx;
  padding: 4rpx 12rpx;
}

.picker-value {
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx 24rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}

.remark-input {
  width: 100%;
  min-height: 150rpx;
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 18rpx 20rpx;
  box-sizing: border-box;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}

.remark-count {
  display: block;
  margin-top: 8rpx;
  text-align: right;
  font-size: 22rpx;
  color: $uni-text-color-placeholder;
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

.recommend-box {
  margin-bottom: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: $uni-border-radius-lg;
  background: linear-gradient(135deg, rgba(24, 144, 255, 0.1), rgba(82, 196, 26, 0.08));
  border: 2rpx solid rgba(24, 144, 255, 0.24);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
}

.recommend-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.recommend-title {
  font-size: 24rpx;
  color: #175cd3;
  font-weight: 600;
}

.recommend-time {
  font-size: 30rpx;
  color: $uni-text-color;
  font-weight: 700;
}

.recommend-reason {
  font-size: 22rpx;
  color: $uni-text-color-grey;
  line-height: 1.5;
}

.recommend-action {
  flex-shrink: 0;
  min-width: 140rpx;
  text-align: center;
  padding: 12rpx 16rpx;
  border-radius: 30rpx;
  font-size: 24rpx;
  color: #ffffff;
  background: $uni-color-primary;
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

.slot-recommended {
  border-color: rgba(24, 144, 255, 0.45);
  background: rgba(24, 144, 255, 0.08);
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

.confirm-summary {
  border-radius: 20rpx;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  border: 1rpx solid #e2e8f0;
  padding: 10rpx 18rpx;
}

.confirm-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #edf2f7;
}

.confirm-row:last-child {
  border-bottom: 0;
}

.confirm-label {
  flex-shrink: 0;
  color: #64748b;
  font-size: 24rpx;
}

.confirm-value {
  text-align: right;
  color: #0f172a;
  font-size: 26rpx;
  font-weight: 600;
}

.confirm-value.multiline {
  max-width: 380rpx;
  text-align: left;
  line-height: 1.45;
}

.rules-dialog-content {
  color: #334155;
  font-size: 27rpx;
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
