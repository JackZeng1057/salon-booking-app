<template>
  <view class="gate-page"></view>
</template>

<script>
/**
 * 角色网关：根据登录态与角色分发到不同首页
 */
import { me } from '../../api/auth';
import { authStore } from '../../store/auth';

export default {
  onLoad() {
    // 作为纯路由网关页：不展示加载 UI，进入即分发
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
      if (!authStore.state.token) {
        uni.reLaunch({ url: '/pages/auth/login' });
        return;
      }

      try {
        const user = await me();
        authStore.setUser(user);
        this.redirectByRole(user && user.role);
      } catch (err) {
        console.error('Bootstrap error', err);
        authStore.clear();
        uni.reLaunch({ url: '/pages/auth/login' });
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
  background-color: #ffffff;
}
</style>
