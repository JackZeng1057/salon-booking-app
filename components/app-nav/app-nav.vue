<template>
  <!--
    App 顶部导航（自定义）
    目标：
    1) 去掉系统原生白色导航栏区域
    2) 保留“返回上一步”按钮，并与页面背景融合（透明/半透明）
    说明：
    - 组件会占位出状态栏 + 导航高度，避免内容顶到状态栏
    - 默认不显示标题，仅显示返回按钮（更贴近“融入背景”的需求）
  -->
  <view
    class="app-nav"
    :class="{ 'app-nav--overlay': overlay }"
    :style="{ height: navHeight + 'px', paddingTop: statusBarHeight + 'px' }"
  >
    <view class="nav-inner">
      <!-- 返回按钮：仅在需要时显示（支持强制隐藏） -->
      <view v-if="shouldShowBack" class="back-btn" @click="handleBack">
        <text class="back-icon">‹</text>
      </view>

      <!-- 标题：默认不显示（可按需打开） -->
      <text v-if="showTitle" class="nav-title">{{ title }}</text>
    </view>
  </view>
  <app-confirm-host />
</template>

<script>
import AppConfirmHost from '../app-confirm-host/app-confirm-host.vue';

export default {
  name: 'AppNav',
  components: {
    AppConfirmHost
  },
  props: {
    // 标题（可选）
    title: {
      type: String,
      default: ''
    },
    // 是否显示标题（默认不显示，避免“顶端白条标题感”）
    showTitle: {
      type: Boolean,
      default: false
    },
    // 是否显示返回按钮（登录页可以传 false 来彻底隐藏返回）
    showBack: {
      type: Boolean,
      default: true
    },
    // 是否强制显示返回按钮（默认自动判断页面栈）
    forceBack: {
      type: Boolean,
      default: false
    },
    // 是否使用浮层模式：盖在页面上，而不是占用文档流高度
    // 这样可以减少顶部“空白感”，让内容更靠近状态栏
    overlay: {
      type: Boolean,
      default: true
    }
  },
  data() {
    const sys = uni.getSystemInfoSync();
    const statusBarHeight = Number(sys.statusBarHeight || 0);
    // 统一用 44px 作为导航内容高度（接近常见 App 导航栏高度）
    const navHeight = statusBarHeight + 44;
    return {
      statusBarHeight,
      navHeight
    };
  },
  computed: {
    // 是否实际展示返回按钮：
    // 1) showBack 为 false 时，一律不展示（用于登录等入口页）
    // 2) 其他页面：页面栈长度>1 或 开启 forceBack
    shouldShowBack() {
      if (!this.showBack) return false;
      try {
        const pages = getCurrentPages();
        return this.forceBack || (pages && pages.length > 1);
      } catch (e) {
        // 兜底：获取失败时不显示返回按钮，避免误操作
        return false;
      }
    }
  },
  methods: {
    // 返回上一页（保持行为简单、可预期）
    handleBack() {
      if (!this.shouldShowBack) return;
      uni.navigateBack({ delta: 1 });
    }
  }
};
</script>

<style scoped lang="scss">
.app-nav {
  /* 透明占位：不再出现“系统白色导航栏块” */
  background: transparent;
  width: 100%;
}

/* 浮层模式：导航栏悬浮在页面顶部，不额外占用布局高度 */
.app-nav--overlay {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 99;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 24rpx;
  position: relative;
  /* 外层 fixed 时，需要让内部可以正常点击 */
  pointer-events: auto;
}

.back-btn {
  /* 按钮适当缩小，减少与页面标题的视觉冲突 */
  width: 56rpx;
  height: 56rpx;
  border-radius: 28rpx;
  /* 使用轻微毛玻璃 + 阴影，让返回按钮更精致、融入背景（同时保持点击区域足够大） */
  background: rgba(255, 255, 255, 0.7);
  border: 1rpx solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 8rpx 20rpx rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-icon {
  /* 图标略微缩小并下移一点，让视觉更柔和 */
  font-size: 40rpx;
  line-height: 40rpx;
  color: #111;
  font-weight: 700;
  transform: translateY(-1rpx);
}

.nav-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 32rpx;
  font-weight: 600;
  color: #111;
}
</style>
