<template>
  <view class="gate-page"></view>
</template>

<script>
/**
 * @page pages/index/roleGate.vue — 角色路由网关页
 *
 * 【设计意图】
 * App 启动后的第一个逻辑页面（pages.json 中注册为首页），
 * 页面本身不渲染任何 UI（仅有一个空白 view 防止白屏闪烁），
 * 唯一职责是根据登录态 + 用户角色将用户"重定向"到正确的首页。
 *
 * 【分发规则】
 * ┌──────────────┬────────────────────────────────────────────────┐
 * │ 登录状态      │ 目标页面                                         │
 * ├──────────────┼────────────────────────────────────────────────┤
 * │ 未登录        │ /pages/auth/login（reLaunch 清栈）               │
 * │ barber 角色   │ /pages/barber/schedule/index（reLaunch）         │
 * │ admin 角色    │ /pages/admin/manage/index（reLaunch）            │
 * │ user / 其他   │ /pages/user/home/index（switchTab）             │
 * └──────────────┴────────────────────────────────────────────────┘
 *
 * 【为什么要调用 me() 刷新】
 * authStore 中的 role 来自上次本地缓存，可能已过期：
 * 如 barber 账号被管理员审核为"已拒绝"后，本地仍缓存 role='barber'，
 * 调用 me() 从云端拉取最新状态，确保角色路由决策的准确性。
 * 失败则强制退回到登录页。
 *
 * 【异常策略】
 * me() 失败（如 Token 过期/无网）时，清空 authStore 并 reLaunch 到登录页，
 * 防止用户以失效 Token 进入功能页面触发一连串 401 错误。
 */
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
