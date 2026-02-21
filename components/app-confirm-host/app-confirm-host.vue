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

export default {
  name: 'AppConfirmHost',
  data() {
    return {
      visible: false,
      currentId: '',
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
    closeWith(result) {
      const id = this.currentId;
      this.visible = false;
      this.currentId = '';
      resolveAppConfirm(id, result);
    },
    onCancel() {
      this.closeWith(false);
    },
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
