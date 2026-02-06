<template>
  <view class="page-wrapper">
    <!-- 加载状态 -->
    <loading-spinner 
      v-if="loading && !data" 
      :text="loadingText"
      :fullscreen="fullscreen"
    />
    
    <!-- 错误状态 -->
    <error-state 
      v-else-if="error"
      :title="errorTitle"
      :description="errorDescription"
      @retry="handleRetry"
    />
    
    <!-- 空状态 -->
    <empty-state 
      v-else-if="empty"
      :icon="emptyIcon"
      :title="emptyTitle"
      :description="emptyDescription"
      :buttonText="emptyButtonText"
      @click="handleEmptyClick"
    />
    
    <!-- 内容区域 -->
    <slot v-else></slot>
  </view>
</template>

<script>
// 页面状态容器：统一处理加载/错误/空态占位
import LoadingSpinner from '../loading-spinner/loading-spinner.vue';
import ErrorState from '../error-state/error-state.vue';
import EmptyState from '../empty-state/empty-state.vue';

export default {
  name: 'PageWrapper',
  components: {
    LoadingSpinner,
    ErrorState,
    EmptyState
  },
  props: {
    // 是否加载中
    loading: {
      type: Boolean,
      default: false
    },
    // 是否有错误
    error: {
      type: Boolean,
      default: false
    },
    // 是否为空
    empty: {
      type: Boolean,
      default: false
    },
    // 数据（用于判断是否显示内容）
    data: {
      type: [Object, Array],
      default: null
    },
    // 是否全屏加载
    fullscreen: {
      type: Boolean,
      default: false
    },
    // 加载文字
    loadingText: {
      type: String,
      default: '加载中...'
    },
    // 错误标题
    errorTitle: {
      type: String,
      default: '加载失败'
    },
    // 错误描述
    errorDescription: {
      type: String,
      default: '请检查网络连接'
    },
    // 空状态图标
    emptyIcon: {
      type: String,
      default: '📭'
    },
    // 空状态标题
    emptyTitle: {
      type: String,
      default: '暂无数据'
    },
    // 空状态描述
    emptyDescription: {
      type: String,
      default: ''
    },
    // 空状态按钮文字
    emptyButtonText: {
      type: String,
      default: ''
    }
  },
  methods: {
    handleRetry() {
      this.$emit('retry');
    },
    handleEmptyClick() {
      this.$emit('empty-click');
    }
  }
};
</script>

<style scoped lang="scss">
.page-wrapper {
  min-height: 100vh;
}
</style>
