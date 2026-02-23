<template>
  <view class="page">
    <view class="page-header">
      <app-nav :showTitle="true" title="修改密码" />
      <view class="hero-card">
        <text class="hero-subtitle">通过绑定手机号验证码完成修改</text>
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y>
      <view class="card">
      <view class="field">
        <text class="label">当前绑定手机号</text>
        <text class="phone-text">{{ user.phone || '未绑定手机号' }}</text>
      </view>

      <view v-if="!user.phone" class="empty-tip">
        请先到“绑定/修改手机号”页面绑定手机号
      </view>

      <template v-else>
        <view class="field">
          <text class="label">验证码</text>
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
              :class="{ disabled: countdown > 0 }"
              :disabled="countdown > 0"
              @click="sendCode"
            >
              {{ countdown > 0 ? countdown + 's' : '发送验证码' }}
            </button>
          </view>
        </view>

        <view v-if="demoCode" class="demo-tip">演示验证码：{{ demoCode }}</view>

        <view class="field">
          <text class="label">新密码</text>
          <input
            class="input"
            password
            maxlength="32"
            v-model="newPassword"
            placeholder="请输入新密码（至少6位）"
          />
        </view>

        <view class="field">
          <text class="label">确认新密码</text>
          <input
            class="input"
            password
            maxlength="32"
            v-model="confirmPassword"
            placeholder="请再次输入新密码"
          />
        </view>

        <button
          class="submit-btn"
          :class="{ disabled: !canSubmit }"
          :disabled="!canSubmit"
          :loading="saving"
          @click="handleSubmit"
        >
          更新密码
        </button>
      </template>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>
  </view>
</template>

<script>
import { me } from '../../../api/auth';
import { authStore } from '../../../store/auth';
import { callCloud } from '../../../api/client';
import { syncCriticalSystemNotifications } from '../../../utils/system-notify';

/**
 * 修改密码页面
 * 安全策略：
 * 1) 必须先绑定手机号
 * 2) 通过短信验证码校验身份
 * 3) 新密码需满足基础长度校验
 */
export default {
  data() {
    return {
      // 用户信息（主要读取绑定手机号）
      user: authStore.state.user || {},
      // 验证码相关
      code: '',
      demoCode: '',
      countdown: 0,
      timer: null,
      // 密码输入
      newPassword: '',
      confirmPassword: '',
      // 提交中状态
      saving: false
    };
  },
  computed: {
    // 提交前置校验：手机号、验证码、密码长度与二次输入一致
    canSubmit() {
      if (!this.user.phone) return false;
      if (!/^\d{6}$/.test(this.code)) return false;
      if (!this.newPassword || !this.confirmPassword) return false;
      if (this.newPassword.length < 6) return false;
      if (this.newPassword !== this.confirmPassword) return false;
      return true;
    }
  },
  onShow() {
    this.loadMe();
  },
  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },
  methods: {
    // 拉取最新用户信息，确保手机号状态准确
    async loadMe() {
      try {
        const data = await me();
        this.user = data || {};
        authStore.setUser(data || null);
      } catch (err) {
        uni.showToast({ title: err.message || '获取用户失败', icon: 'none' });
      }
    },
    // 使用当前绑定手机号发送“重置密码”验证码
    async sendCode() {
      if (!this.user.phone) {
        uni.showToast({ title: '请先绑定手机号', icon: 'none' });
        return;
      }
      try {
        const res = await callCloud('sms-send-code', {
          phone: this.user.phone,
          type: 'reset_password'
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
    // 调用后端重置密码接口，成功后清空表单并刷新关键通知
    async handleSubmit() {
      if (!this.canSubmit) return;
      this.saving = true;
      try {
        await callCloud('password-reset', {
          phone: this.user.phone,
          code: this.code,
          newPassword: this.newPassword
        });
        uni.showToast({ title: '密码已更新', icon: 'success' });
        this.code = '';
        this.demoCode = '';
        this.newPassword = '';
        this.confirmPassword = '';
        syncCriticalSystemNotifications({ force: true });
      } catch (err) {
        uni.showToast({ title: err.message || '更新密码失败', icon: 'none' });
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: calc(118rpx + 20px) 28rpx 0;
  background: #f8fafc;
  box-sizing: border-box;
}

.page-header {
  flex-shrink: 0;
}

.page-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 18rpx;
}

.hero-card {
  border-radius: 28rpx;
  padding: 24rpx 26rpx;
  background: linear-gradient(140deg, #0f172a, #1e293b);
  box-shadow: 0 14rpx 30rpx rgba(15, 23, 42, 0.16);
  margin-bottom: 18rpx;
}

.hero-subtitle {
  display: block;
  color: rgba(255, 255, 255, 0.82);
  font-size: 24rpx;
  line-height: 1.5;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  box-shadow: $uni-shadow-base;
  padding: 28rpx;
}

.field {
  margin-bottom: 24rpx;
}

.label {
  display: block;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  margin-bottom: 12rpx;
}

.phone-text {
  display: block;
  font-size: 34rpx;
  color: $uni-text-color;
  font-weight: 600;
}

.empty-tip {
  color: #7a4f00;
  background: rgba(240, 180, 41, 0.12);
  border: 1rpx solid rgba(240, 180, 41, 0.36);
  border-radius: $uni-border-radius-base;
  padding: 16rpx 18rpx;
  font-size: 24rpx;
}

.code-row {
  display: flex;
  gap: 14rpx;
  align-items: center;
}

.input {
  width: 100%;
  height: 96rpx;
  border-radius: $uni-border-radius-lg;
  padding: 0 24rpx;
  background: $uni-bg-color-grey;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
}

.code-input {
  flex: 1;
}

.code-btn {
  width: 220rpx;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  padding: 0;
  background: #ffffff;
  color: $uni-color-primary;
  border: 1rpx solid $uni-color-primary;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-btn::after {
  border: none;
}

.submit-btn.disabled {
  background: #c7ced9;
  color: rgba(255, 255, 255, 0.82);
}

.scroll-bottom-gap {
  height: 24rpx;
}
</style>
