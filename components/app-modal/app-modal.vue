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
export default {
  name: 'AppModal',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: ''
    },
    subtitle: {
      type: String,
      default: ''
    },
    showClose: {
      type: Boolean,
      default: false
    },
    showFooter: {
      type: Boolean,
      default: true
    },
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
    maskClosable: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    hasFooterSlot() {
      return !!this.$slots.footer;
    }
  },
  methods: {
    onMaskTap() {
      if (!this.maskClosable) return;
      this.$emit('close');
    },
    onCloseTap() {
      this.$emit('close');
    },
    onCancelTap() {
      this.$emit('cancel');
    },
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
