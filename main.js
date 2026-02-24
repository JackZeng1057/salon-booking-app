/**
 * @file main.js — 应用入口，Vue2 / Vue3 双端适配引导
 *
 * 【双端编译说明】
 * uni-app 支持同时编译为 Vue2（旧版 App/H5/小程序）和 Vue3（新版 App/H5/VUE3 小程序）。
 * 通过条件编译宏 #ifndef VUE3 / #ifdef VUE3 区分两套启动方式，保证同一份代码在两端均可运行。
 *
 * 【Vue2 启动路径】
 * 使用 new Vue({ ...App }) 的经典挂载方式，同时引入 uni.promisify.adaptor
 * 使 uni.xxx 系列 API 支持 Promise 调用风格（uni-app 官方适配层）。
 *
 * 【Vue3 启动路径】
 * 导出 createApp 工厂函数，由 uni-app 框架在运行时调用，使用 createSSRApp 启动，
 * 兼容 SSR 与纯客户端两种渲染模式。
 *
 * 【authStore 全局挂载】
 * 将 authStore 挂载到 Vue 原型（Vue2: this.$auth）/ 全局属性（Vue3: globalProperties.$auth），
 * 使所有 Options API 组件可在不单独 import 的情况下直接访问登录态。
 */
import App from './App'
import { authStore } from './store/auth'

// #ifndef VUE3
import Vue from 'vue'
// 兼容 uni-app API 的 Promise 形式
import './uni.promisify.adaptor'
Vue.config.productionTip = false
// 统一挂载 authStore，页面可通过 this.$auth 访问
Vue.prototype.$auth = authStore
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
export function createApp() {
  const app = createSSRApp(App)
  // Vue3 全局属性挂载
  app.config.globalProperties.$auth = authStore
  return {
    app
  }
}
// #endif
