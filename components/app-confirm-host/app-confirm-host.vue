<template>
  <app-modal
    :visible="visible"
    :title="title"
    :confirm-text="confirmText"
    :confirm-type="confirmType"
    @close="onCancel"
    @cancel="onCancel"
    @confirm="onConfirm"
  >
    <view class="confirm-content">{{ content }}</view>
  </app-modal>
</template>

<script>
import { resolveAppConfirm } from '../../utils/app-confirm';

/**
 * 全局确认弹窗宿主组件
 * 监听 `app:confirm:open` 事件并展示弹窗，用户操作后回写 Promise 结果。
 */
export default {
  name: 'AppConfirmHost',
  data() {
    return {
      // 当前弹窗展示态
      visible: false,
      // 当前确认会话 ID（用于回写结果）
      currentId: '',
      // 弹窗文案与样式参数
      title: '',
      content: '',
      confirmText: '确定',
      confirmType: 'primary'
    };
  },
  created() {
    uni.$on('app:confirm:open', this.onOpen);
  },
  beforeUnmount() {
    uni.$off('app:confirm:open', this.onOpen);
  },
  beforeDestroy() {
    uni.$off('app:confirm:open', this.onOpen);
  },
  methods: {
    // 收到全局事件后打开弹窗并写入上下文
    onOpen(payload) {
      const id = String((payload && payload.id) || '').trim();
      if (!id) return;
      this.currentId = id;
      this.title = String((payload && payload.title) || '').trim();
      this.content = String((payload && payload.content) || '').trim();
      this.confirmText = String((payload && payload.confirmText) || '确定').trim();
      this.confirmType = payload && payload.confirmType === 'danger' ? 'danger' : 'primary';
      this.visible = true;
    },
    // 关闭弹窗并将结果回传给工具层 Promise
    closeWith(result) {
      const id = this.currentId;
      this.visible = false;
      this.currentId = '';
      resolveAppConfirm(id, result);
    },
    // 点击取消
    onCancel() {
      this.closeWith(false);
    },
    // 点击确认
    onConfirm() {
      this.closeWith(true);
    }
  }
};
</script>

<style scoped lang="scss">
.confirm-content {
  color: #334155;
  font-size: 27rpx;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
