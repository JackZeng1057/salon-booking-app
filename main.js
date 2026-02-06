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
