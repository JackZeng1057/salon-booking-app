<template>
  <view v-if="visible" class="app-modal-mask" @click="onMaskTap">
    <view class="app-modal-card" @click.stop>
      <view v-if="title || subtitle || showClose" class="app-modal-head">
        <view class="app-modal-title-wrap">
          <text v-if="title" class="app-modal-title">{{ title }}</text>
          <text v-if="subtitle" class="app-modal-subtitle">{{ subtitle }}</text>
        </view>
        <view v-if="showClose" class="app-modal-close" @click="onCloseTap">×</view>
      </view>

      <view class="app-modal-body">
        <slot />
      </view>

      <view v-if="showFooter || hasFooterSlot" class="app-modal-footer">
        <slot name="footer">
          <button
            v-if="showCancel"
            class="app-modal-btn app-modal-btn-cancel"
            @click="onCancelTap"
          >
            {{ cancelText }}
          </button>
          <button
            class="app-modal-btn"
            :class="confirmType === 'danger' ? 'app-modal-btn-danger' : 'app-modal-btn-primary'"
            :disabled="confirmDisabled || confirmLoading"
            :loading="confirmLoading"
            @click="onConfirmTap"
          >
            {{ confirmText }}
          </button>
        </slot>
      </view>
    </view>
  </view>
</template>

<script>
/**
 * 通用模态框组件
 * 通过 props 控制展示、按钮文案、危险态按钮样式与是否允许点击遮罩关闭。
 */
export default {
  name: 'AppModal',
  props: {
    // 是否显示弹窗
    visible: {
      type: Boolean,
      default: false
    },
    // 标题文案
    title: {
      type: String,
      default: ''
    },
    // 副标题文案
    subtitle: {
      type: String,
      default: ''
    },
    // 是否显示右上角关闭按钮
    showClose: {
      type: Boolean,
      default: false
    },
    // 是否显示底部按钮区（或由 footer 插槽自定义）
    showFooter: {
      type: Boolean,
      default: true
    },
    // 是否显示取消按钮
    showCancel: {
      type: Boolean,
      default: true
    },
    cancelText: {
      type: String,
      default: '取消'
    },
    confirmText: {
      type: String,
      default: '确定'
    },
    confirmType: {
      type: String,
      default: 'primary'
    },
    confirmDisabled: {
      type: Boolean,
      default: false
    },
    confirmLoading: {
      type: Boolean,
      default: false
    },
    // 点击遮罩是否关闭
    maskClosable: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    // 是否传入了 footer 插槽（传入后可覆盖默认按钮区）
    hasFooterSlot() {
      return !!this.$slots.footer;
    }
  },
  methods: {
    // 遮罩点击回调
    onMaskTap() {
      if (!this.maskClosable) return;
      this.$emit('close');
    },
    // 关闭按钮回调
    onCloseTap() {
      this.$emit('close');
    },
    // 取消按钮回调
    onCancelTap() {
      this.$emit('cancel');
    },
    // 确认按钮回调
    onConfirmTap() {
      this.$emit('confirm');
    }
  }
};
</script>

<style scoped lang="scss">
.app-modal-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  background: rgba(15, 23, 42, 0.46);
}

.app-modal-card {
  width: 100%;
  max-width: 620rpx;
  border-radius: 30rpx;
  overflow: hidden;
  background: #ffffff;
  border: 1rpx solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 26rpx 56rpx rgba(15, 23, 42, 0.24);
}

.app-modal-head {
  position: relative;
  padding: 28rpx 30rpx 18rpx;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.app-modal-head::after {
  content: '';
  position: absolute;
  left: 30rpx;
  right: 30rpx;
  bottom: 0;
  height: 1rpx;
  background: rgba(148, 163, 184, 0.26);
}

.app-modal-title-wrap {
  padding-right: 44rpx;
}

.app-modal-title {
  display: block;
  color: #0f172a;
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.35;
}

.app-modal-subtitle {
  display: block;
  margin-top: 8rpx;
  color: #64748b;
  font-size: 24rpx;
  line-height: 1.5;
}

.app-modal-close {
  position: absolute;
  right: 22rpx;
  top: 20rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: 22rpx;
  color: #94a3b8;
  font-size: 36rpx;
  line-height: 44rpx;
  text-align: center;
  background: rgba(148, 163, 184, 0.12);
}

.app-modal-body {
  padding: 24rpx 30rpx 8rpx;
}

.app-modal-footer {
  display: flex;
  gap: 14rpx;
  padding: 20rpx 30rpx 30rpx;
}

.app-modal-btn {
  flex: 1;
  height: 82rpx;
  line-height: 82rpx;
  border-radius: 41rpx;
  font-size: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-modal-btn-cancel {
  color: #475569;
  border: 1rpx solid #dbe2ea;
  background: #f8fafc;
}

.app-modal-btn-primary {
  color: #ffffff;
  border: 1rpx solid transparent;
  background: linear-gradient(135deg, #1f2a44 0%, #2f3e5c 100%);
}

.app-modal-btn-danger {
  color: #ffffff;
  border: 1rpx solid transparent;
  background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
}
</style>
