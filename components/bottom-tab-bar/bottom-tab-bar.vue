<template>
  <view class="tabbar-shell">
    <view class="tabbar-row">
      <view
        v-for="item in tabs"
        :key="item.key"
        class="tab-item"
        :class="{ active: currentKey === item.key }"
        @click="switchTab(item)"
      >
        <app-icon
          class="tab-icon"
          :name="item.icon"
          :color="currentKey === item.key ? selectedColor : defaultColor"
          :size="25"
          size-unit="px"
          :stroke-width="currentKey === item.key ? 2.4 : 2.25"
        />
        <text class="tab-label">{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import AppIcon from '../app-icon/app-icon.vue';

// 用户端底部导航配置：key 用于高亮判断，path 对应 tabBar 页面路径
const TABS = [
  { key: 'home', label: '首页', icon: 'home', path: '/pages/user/home/index' },
  { key: 'agent', label: 'AI顾问', icon: 'sparkles', path: '/pages/user/agent/index' },
  { key: 'orders', label: '预约', icon: 'calendar', path: '/pages/user/orders/index' },
  { key: 'settings', label: '我的', icon: 'user', path: '/pages/user/settings/index' }
];

/**
 * 自定义底部导航栏
 * 说明：项目采用自定义视觉样式，因此页面中主动隐藏系统 tabbar 并挂载本组件。
 */
export default {
  name: 'BottomTabBar',
  components: {
    AppIcon
  },
  props: {
    // 当前激活 tab 的 key
    current: {
      type: String,
      default: 'home'
    }
  },
  data() {
    return {
      tabs: TABS,
      defaultColor: '#94A3B8',
      selectedColor: '#0F172A'
    };
  },
  computed: {
    // 统一清洗当前 key，避免空白字符导致高亮异常
    currentKey() {
      return String(this.current || '').trim();
    }
  },
  methods: {
    // 切换 tab（当前页重复点击不触发跳转）
    switchTab(item) {
      if (!item || !item.path) return;
      if (item.key === this.currentKey) return;
      uni.switchTab({ url: item.path });
    }
  }
};
</script>

<style scoped>
.tabbar-shell {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 92;
  border-top: 1rpx solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(8px);
}

.tabbar-row {
  height: 112rpx;
  padding-top: 12rpx;
  padding-bottom: calc(env(safe-area-inset-bottom) + 8rpx);
  display: flex;
  align-items: flex-start;
}

.tab-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 8rpx;
}

.tab-item:active {
  opacity: 0.82;
}

.tab-label {
  font-size: 22rpx;
  line-height: 1;
  font-weight: 500;
  color: #94a3b8;
}

.tab-item.active .tab-label {
  color: #0f172a;
  font-weight: 600;
}
</style>
