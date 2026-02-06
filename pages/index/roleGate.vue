<template>
  <view class="gate-page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏（此页通常不需要返回按钮） -->
    <app-nav />
    <view class="content">
      <!-- 简单的加载动效 -->
      <view class="spinner"></view>
      <text class="loading-text">{{ statusText }}</text>
    </view>
  </view>
</template>

<script>
/**
 * 角色网关：根据登录态与角色分发到不同首页
 */
import { me } from '../../api/auth';
import { authStore } from '../../store/auth';

const ME_CACHE_KEY = 'me_cache_ts';
const ME_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export default {
  data() {
    return {
      statusText: '正在验证登录状态...' // 验证会话中...
    };
  },
  onLoad() {
    // 页面加载即检查登录态
    this.bootstrap();
  },
  methods: {
    /**
     * 引导流程
    * 1. 检查本地是否有令牌
     * 2. 如果有，请求用户信息刷新角色
     * 3. 根据角色跳转
     */
    async bootstrap() {
      // 检查令牌
      if (!authStore.state.token) {
        // 无令牌，直接去登录
        this.statusText = '即将跳转登录...';
        setTimeout(() => {
           uni.reLaunch({ url: '/pages/auth/login' });
        }, 300); // 稍微延迟一点避免闪屏太快
        return;
      }

      try {
        const cachedUser = authStore.state.user;
        const lastMeAt = Number(uni.getStorageSync(ME_CACHE_KEY) || 0);
        const isFresh = cachedUser && Date.now() - lastMeAt < ME_CACHE_TTL;

        let user = cachedUser;
        if (!isFresh) {
          this.statusText = '正在获取用户信息...';
          user = await me();
          authStore.setUser(user);
          uni.setStorageSync(ME_CACHE_KEY, Date.now());
        }
        
        this.statusText = `欢迎回来, ${user.nickname || user.username}`;
        
        // 延迟跳转体验更好
        setTimeout(() => {
            this.redirectByRole(user.role);
        }, 500);
        
      } catch (err) {
        console.error('Bootstrap error', err);
        authStore.clear();
        this.statusText = '会话已过期，请重新登录';
        setTimeout(() => {
           uni.reLaunch({ url: '/pages/auth/login' });
        }, 1000);
      }
    },
    
    // 按角色跳不同首页
    redirectByRole(role) {
      if (role === 'barber') {
        uni.reLaunch({ url: '/pages/barber/schedule/index' });
        return;
      }
      if (role === 'admin') {
        uni.reLaunch({ url: '/pages/admin/manage/index' });
        return;
      }
      // 默认用户端
      uni.switchTab({ url: '/pages/user/home/index' });
    }
  }
};
</script>

<style scoped lang="scss">
.gate-page {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #ffffff;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.spinner {
  width: 60rpx;
  height: 60rpx;
  border: 6rpx solid $uni-bg-color-grey;
  border-top: 6rpx solid $uni-color-primary; /* 使用主题色 */
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 30rpx;
}

.loading-text {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-base;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
