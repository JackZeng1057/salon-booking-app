<template>
  <view class="page">
    <app-nav />
    <view class="container">
      <view class="header">
        <text class="title">账号设置</text>
        <text class="subtitle">绑定手机号后可用于找回密码与账号验证</text>
      </view>

      <view class="profile-card">
        <view class="profile-row">
          <text class="profile-label">当前账号</text>
          <text class="profile-value">{{ user.username || '-' }}</text>
        </view>
        <view class="profile-row">
          <text class="profile-label">已绑定手机号</text>
          <text class="profile-value">{{ user.phone || '未绑定' }}</text>
        </view>
      </view>

      <view class="form-card">
        <text class="section-title">绑定手机号</text>

        <view class="field">
          <text class="field-label">手机号</text>
          <input
            class="input"
            type="number"
            maxlength="11"
            v-model="phone"
            placeholder="请输入手机号"
          />
        </view>

        <view class="field">
          <text class="field-label">验证码</text>
          <view class="code-row">
            <input
              class="input code-input"
              type="number"
              maxlength="6"
              v-model="code"
              placeholder="请输入6位验证码"
            />
            <button
              class="code-btn"
              :class="{ disabled: countdown > 0 || !canSend }"
              :disabled="countdown > 0 || !canSend"
              @click="sendCode"
            >
              {{ countdown > 0 ? countdown + 's' : '发送验证码' }}
            </button>
          </view>
        </view>

        <view v-if="demoCode" class="demo-tip">演示验证码：{{ demoCode }}</view>

        <button
          class="submit-btn"
          :class="{ disabled: !canSubmit }"
          :loading="saving"
          :disabled="!canSubmit"
          @click="handleBind"
        >
          绑定手机号
        </button>
      </view>
    </view>
  </view>
</template>

<script>
import { me, bindPhone } from '../../../api/auth';
import { authStore } from '../../../store/auth';
import { callCloud } from '../../../api/client';

export default {
  data() {
    return {
      user: authStore.state.user || {},
      phone: '',
      code: '',
      demoCode: '',
      countdown: 0,
      timer: null,
      saving: false
    };
  },
  computed: {
    canSend() {
      return /^1[3-9]\d{9}$/.test(this.phone);
    },
    canSubmit() {
      return this.canSend && /^\d{6}$/.test(this.code);
    }
  },
  onShow() {
    this.loadMe();
  },
  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },
  methods: {
    async loadMe() {
      try {
        const data = await me();
        this.user = data || {};
        authStore.setUser(data || null);
      } catch (err) {
        uni.showToast({ title: err.message || '获取用户失败', icon: 'none' });
      }
    },
    async sendCode() {
      if (!this.canSend) {
        uni.showToast({ title: '请输入正确手机号', icon: 'none' });
        return;
      }
      try {
        const res = await callCloud('sms-send-code', {
          phone: this.phone,
          type: 'login'
        });
        this.demoCode = (res && res.code) || '';
        uni.showToast({ title: '验证码已发送', icon: 'success' });
        this.countdown = 60;
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
          this.countdown -= 1;
          if (this.countdown <= 0) {
            clearInterval(this.timer);
            this.timer = null;
          }
        }, 1000);
      } catch (err) {
        uni.showToast({ title: err.message || '发送失败', icon: 'none' });
      }
    },
    async handleBind() {
      if (!this.canSubmit) return;
      this.saving = true;
      try {
        await bindPhone({
          phone: this.phone,
          code: this.code,
          type: 'login'
        });
        uni.showToast({ title: '绑定成功', icon: 'success' });
        this.code = '';
        this.demoCode = '';
        await this.loadMe();
      } catch (err) {
        const msg = err.code === 409 ? '手机号已被其他账号绑定' : (err.message || '绑定失败');
        uni.showToast({ title: msg, icon: 'none' });
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 120rpx 30rpx 30rpx;
  background: $uni-bg-color-grey;
}

.container {
  padding: 0;
}

.header {
  margin-bottom: 24rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  padding-left: 6rpx;
  line-height: 1.25;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-base;
  padding-left: 6rpx;
  line-height: 1.5;
}

.profile-card {
  background: linear-gradient(145deg, $uni-color-primary, $uni-color-primary-light);
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
  box-shadow: $uni-shadow-base;
  margin-bottom: 24rpx;
}

.profile-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14rpx;
}

.profile-row:last-child {
  margin-bottom: 0;
}

.profile-label {
  color: rgba(255, 255, 255, 0.72);
  font-size: $uni-font-size-sm;
}

.profile-value {
  color: #ffffff;
  font-size: $uni-font-size-base;
  font-weight: 600;
}

.form-card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  box-shadow: $uni-shadow-base;
  padding: 28rpx;
}

.section-title {
  display: block;
  margin-bottom: 20rpx;
  font-size: 34rpx;
  color: $uni-text-color;
  font-weight: 700;
  line-height: 1.3;
}

.field {
  margin-bottom: 24rpx;
}

.field-label {
  display: block;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  margin-bottom: 12rpx;
  line-height: 1.4;
}

.input {
  width: 100%;
  height: 96rpx;
  border-radius: $uni-border-radius-lg;
  padding: 0 24rpx;
  background: $uni-bg-color-grey;
  border: 1rpx solid transparent;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}

.code-row {
  display: flex;
  gap: 14rpx;
  align-items: center;
}

.code-input {
  flex: 1;
}

.code-btn {
  width: 220rpx;
  height: 96rpx;
  line-height: 96rpx;
  padding: 0;
  border-radius: 48rpx;
  background: #ffffff;
  border: 1rpx solid $uni-color-primary;
  color: $uni-color-primary;
  font-size: $uni-font-size-sm;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.code-btn::after {
  border: none;
}

.code-btn.disabled {
  color: $uni-text-color-disable;
  border-color: $uni-border-color;
  background: #f8f9fb;
}

.demo-tip {
  margin: 8rpx 0 24rpx;
  color: #7a4f00;
  background: rgba(240, 180, 41, 0.12);
  border: 1rpx solid rgba(240, 180, 41, 0.36);
  border-radius: $uni-border-radius-base;
  padding: 14rpx 18rpx;
  font-size: 24rpx;
}

.submit-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  background: $uni-color-primary;
  color: #ffffff;
  font-size: $uni-font-size-base;
  font-weight: 600;
  margin-top: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-btn::after {
  border: none;
}

.submit-btn.disabled {
  background: #c7ced9;
  color: rgba(255, 255, 255, 0.8);
}
</style>
