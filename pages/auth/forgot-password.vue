<template>
  <view class="forgot-password-page">
    <!-- 自定义顶部导航（仅占位，不显示返回按钮） -->
    <app-nav :overlay="false" :showBack="false" />
    <!-- 顶部装饰 -->
    <view class="circle-bg"></view>

    <view class="content-container">
      <!-- 头部 -->
      <view class="header">
        <text class="title">重置密码</text>
        <text class="subtitle">通过手机验证码重置您的密码</text>
      </view>

      <!-- 表单卡片 -->
      <view class="form-card">
        <!-- 步骤指示器 -->
        <view class="steps">
          <view class="step" :class="{ active: currentStep >= 1, completed: currentStep > 1 }">
            <view class="step-circle">1</view>
            <text class="step-text">验证手机</text>
          </view>
          <view class="step-line" :class="{ active: currentStep > 1 }"></view>
          <view class="step" :class="{ active: currentStep >= 2, completed: currentStep > 2 }">
            <view class="step-circle">2</view>
            <text class="step-text">设置密码</text>
          </view>
        </view>

        <!-- 第一步：验证手机号 -->
        <view v-if="currentStep === 1" class="step-content">
          <!-- 手机号输入 -->
          <view class="input-group">
            <text class="label">手机号</text>
            <input
              class="input-field"
              type="number"
              v-model="phone"
              maxlength="11"
              placeholder="请输入注册时的手机号"
              placeholder-class="placeholder"
            />
          </view>

          <!-- 验证码输入 -->
          <view class="input-group">
            <text class="label">验证码</text>
            <view class="code-input-wrapper">
              <input
                class="input-field code-input"
                type="number"
                v-model="code"
                maxlength="6"
                placeholder="请输入6位验证码"
                placeholder-class="placeholder"
              />
              <button
                class="send-code-btn"
                :disabled="countdown > 0 || !canSendCode"
                @click="sendCode"
              >
                {{ countdown > 0 ? `${countdown}秒后重试` : '发送验证码' }}
              </button>
            </view>
          </view>

          <!-- 演示模式提示 -->
          <view v-if="demoCode" class="demo-tip">
            <app-icon class="demo-icon-svg" name="lightbulb" color="#faad14" :size="30" :stroke-width="2.1" />
            <view class="demo-content">
              <text class="demo-title">演示模式</text>
              <text class="demo-text">验证码：<text class="demo-code">{{ demoCode }}</text></text>
              <text class="demo-hint">（生产环境将通过短信发送）</text>
            </view>
          </view>

          <!-- 下一步按钮 -->
          <button
            class="next-btn"
            type="primary"
            :disabled="!phone || !code"
            :loading="verifying"
            @click="verifyCode"
          >
            下一步
          </button>
        </view>

        <!-- 第二步：设置新密码 -->
        <view v-if="currentStep === 2" class="step-content">
          <!-- 新密码输入 -->
          <view class="input-group">
            <text class="label">新密码</text>
            <input
              class="input-field"
              :type="showPassword ? 'text' : 'password'"
              v-model="newPassword"
              placeholder="请输入新密码（至少6位）"
              placeholder-class="placeholder"
            />
            <view class="eye-icon" @click="showPassword = !showPassword">
              <app-icon :name="showPassword ? 'eye' : 'eye-off'" color="#94A3B8" :size="28" :stroke-width="2.1" />
            </view>
          </view>

          <!-- 确认密码输入 -->
          <view class="input-group">
            <text class="label">确认密码</text>
            <input
              class="input-field"
              :type="showPassword ? 'text' : 'password'"
              v-model="confirmPassword"
              placeholder="请再次输入新密码"
              placeholder-class="placeholder"
            />
          </view>

          <!-- 密码强度提示 -->
          <view class="password-strength">
            <view class="strength-bar">
              <view class="strength-fill" :style="{ width: passwordStrength + '%', backgroundColor: passwordStrengthColor }"></view>
            </view>
            <text class="strength-text" :style="{ color: passwordStrengthColor }">{{ passwordStrengthText }}</text>
          </view>

          <!-- 提交按钮 -->
          <button
            class="submit-btn"
            type="primary"
            :disabled="!canSubmit"
            :loading="resetting"
            @click="resetPassword"
          >
            确认重置
          </button>

          <!-- 返回按钮 -->
          <button class="back-btn" @click="currentStep = 1">
            返回上一步
          </button>
        </view>
      </view>

      <!-- 返回登录 -->
      <view class="footer">
        <text class="footer-text">想起密码了？</text>
        <text class="login-link" @click="goLogin">返回登录</text>
      </view>
    </view>
  </view>
</template>

<script>
// 忘记密码页：短信验证码校验 + 重置密码流程
import { callCloud } from '../../api/client';

export default {
  data() {
    return {
      currentStep: 1, // 当前步骤：1-验证手机，2-设置密码
      phone: '',
      code: '',
      demoCode: '', // 演示模式下的验证码
      newPassword: '',
      confirmPassword: '',
      showPassword: false,
      countdown: 0, // 倒计时
      countdownTimer: null,
      verifying: false,
      resetting: false
    };
  },
  computed: {
    // 是否可以发送验证码
    canSendCode() {
      return /^1[3-9]\d{9}$/.test(this.phone);
    },
    // 密码强度
    passwordStrength() {
      const pwd = this.newPassword;
      if (!pwd) return 0;
      if (pwd.length < 6) return 20;
      if (pwd.length < 8) return 40;
      if (/^[0-9]+$/.test(pwd)) return 40; // 纯数字
      if (/^[a-zA-Z]+$/.test(pwd)) return 60; // 纯字母
      if (/[0-9]/.test(pwd) && /[a-zA-Z]/.test(pwd)) return 80; // 字母+数字
      if (/[!@#$%^&*]/.test(pwd)) return 100; // 包含特殊字符
      return 60;
    },
    passwordStrengthColor() {
      const strength = this.passwordStrength;
      if (strength < 40) return '#ff4d4f';
      if (strength < 60) return '#faad14';
      if (strength < 80) return '#52c41a';
      return '#1890ff';
    },
    passwordStrengthText() {
      const strength = this.passwordStrength;
      if (strength < 40) return '弱';
      if (strength < 60) return '中';
      if (strength < 80) return '强';
      return '非常强';
    },
    // 是否可以提交
    canSubmit() {
      return this.newPassword.length >= 6 && 
             this.newPassword === this.confirmPassword;
    }
  },
  methods: {
    // 发送验证码并开启倒计时
    async sendCode() {
      if (!this.canSendCode) {
        uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }

      try {
        const res = await callCloud('sms-send-code', {
          phone: this.phone,
          type: 'reset_password'
        });

        // 演示模式：显示验证码
        if (res.code) {
          this.demoCode = res.code;
        }

        uni.showToast({ title: '验证码已发送', icon: 'success' });

        // 开始倒计时，避免重复发送
        this.countdown = 60;
        this.countdownTimer = setInterval(() => {
          this.countdown--;
          if (this.countdown <= 0) {
            clearInterval(this.countdownTimer);
          }
        }, 1000);
      } catch (err) {
        uni.showToast({
          title: err.message || '发送失败',
          icon: 'none'
        });
      }
    },
    // 验证验证码（通过后进入下一步）
    async verifyCode() {
      if (!this.phone || !this.code) {
        uni.showToast({ title: '请填写完整信息', icon: 'none' });
        return;
      }

      if (this.code.length !== 6) {
        uni.showToast({ title: '请输入6位验证码', icon: 'none' });
        return;
      }

      this.verifying = true;
      try {
        // 调用云函数验证验证码
        await callCloud('sms-verify-code', {
          phone: this.phone,
          code: this.code,
          type: 'reset_password'
        });

        // 验证通过，进入设置新密码
        this.currentStep = 2;
      } catch (err) {
        uni.showToast({
          title: err.message || '验证码错误或已过期',
          icon: 'none'
        });
      } finally {
        this.verifying = false;
      }
    },
    // 重置密码：校验后提交新密码
    async resetPassword() {
      if (!this.canSubmit) {
        return;
      }

      if (this.newPassword !== this.confirmPassword) {
        uni.showToast({ title: '两次密码输入不一致', icon: 'none' });
        return;
      }

      this.resetting = true;
      try {
        await callCloud('password-reset', {
          phone: this.phone,
          code: this.code,
          newPassword: this.newPassword
        });

        uni.showToast({ title: '密码重置成功', icon: 'success' });

        // 延迟跳转到登录页
        setTimeout(() => {
          uni.redirectTo({ url: '/pages/auth/login' });
        }, 1500);
      } catch (err) {
        uni.showToast({
          title: err.message || '重置失败',
          icon: 'none'
        });
      } finally {
        this.resetting = false;
      }
    },
    // 返回登录
    goLogin() {
      uni.navigateBack();
    }
  },
  onUnload() {
    // 清除定时器
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }
};
</script>

<style scoped lang="scss">
.forgot-password-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: relative;
  overflow: hidden;
}

.circle-bg {
  position: absolute;
  width: 600rpx;
  height: 600rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  top: -200rpx;
  right: -100rpx;
}

.content-container {
  position: relative;
  z-index: 1;
  padding: 80rpx 40rpx 40rpx;
}

.header {
  margin-bottom: 60rpx;
  
  .title {
    display: block;
    font-size: 48rpx;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 16rpx;
    text-align: center;
  }
  
  .subtitle {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.5;
    text-align: center;
  }
}

.form-card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 40rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.3);
}

/* 步骤指示器 */
.steps {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 50rpx;
  
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    
    .step-circle {
      width: 60rpx;
      height: 60rpx;
      border-radius: 50%;
      background-color: #e8e8e8;
      color: #999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28rpx;
      font-weight: 600;
      margin-bottom: 8rpx;
      transition: all 0.3s;
    }
    
    .step-text {
      font-size: 24rpx;
      color: #999999;
      transition: all 0.3s;
    }
    
    &.active {
      .step-circle {
        background: linear-gradient(135deg, $uni-color-primary, #52c41a);
        color: #ffffff;
      }
      
      .step-text {
        color: $uni-color-primary;
        font-weight: 600;
      }
    }
    
    &.completed {
      .step-circle {
        background-color: #52c41a;
        color: #ffffff;
      }
    }
  }
  
  .step-line {
    width: 120rpx;
    height: 4rpx;
    background-color: #e8e8e8;
    margin: 0 20rpx 34rpx;
    transition: all 0.3s;
    
    &.active {
      background-color: #52c41a;
    }
  }
}

/* 表单 */
.step-content {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.input-group {
  margin-bottom: 30rpx;
  position: relative;
  
  .label {
    display: block;
    font-size: $uni-font-size-base;
    font-weight: 600;
    color: $uni-text-color;
    margin-bottom: 12rpx;
  }
  
  .input-field {
    width: 100%;
    height: 88rpx;
    padding: 0 24rpx;
    background-color: $uni-bg-color-grey;
    border-radius: $uni-border-radius-lg;
    font-size: $uni-font-size-base;
    border: 2rpx solid transparent;
    transition: all 0.3s;
    
    &:focus {
      background-color: #ffffff;
      border-color: $uni-color-primary;
    }
  }
  
  .eye-icon {
    position: absolute;
    right: 24rpx;
    bottom: 22rpx;
    width: 40rpx;
    height: 40rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
}

.code-input-wrapper {
  display: flex;
  gap: 16rpx;
  
  .code-input {
    flex: 1;
  }
  
  .send-code-btn {
    width: 200rpx;
    height: 88rpx;
    line-height: 1;
    padding: 0;
    background: linear-gradient(135deg, $uni-color-primary, #52c41a);
    color: #ffffff;
    font-size: 24rpx;
    border-radius: 44rpx;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    
    &:disabled {
      background: #e8e8e8;
      color: #999999;
    }
  }
}

/* 演示提示 */
.demo-tip {
  display: flex;
  gap: 16rpx;
  padding: 20rpx;
  background: linear-gradient(135deg, #fff7e6, #fffbe6);
  border: 2rpx solid #ffd591;
  border-radius: $uni-border-radius-lg;
  margin-bottom: 30rpx;
  
  .demo-icon-svg {
    flex-shrink: 0;
  }
  
  .demo-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }
  
  .demo-title {
    font-size: 26rpx;
    font-weight: 600;
    color: #d46b08;
  }
  
  .demo-text {
    font-size: 24rpx;
    color: #ad6800;
  }
  
  .demo-code {
    font-size: 32rpx;
    font-weight: 700;
    color: #d46b08;
    letter-spacing: 4rpx;
  }
  
  .demo-hint {
    font-size: 22rpx;
    color: #ad6800;
    opacity: 0.8;
  }
}

/* 密码强度 */
.password-strength {
  margin-bottom: 30rpx;
  
  .strength-bar {
    width: 100%;
    height: 8rpx;
    background-color: #e8e8e8;
    border-radius: 4rpx;
    overflow: hidden;
    margin-bottom: 8rpx;
    
    .strength-fill {
      height: 100%;
      transition: all 0.3s;
      border-radius: 4rpx;
    }
  }
  
  .strength-text {
    font-size: 22rpx;
    font-weight: 600;
  }
}

/* 按钮 */
.next-btn,
.submit-btn {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  margin-bottom: 20rpx;
  background: linear-gradient(135deg, $uni-color-primary, #52c41a);
  border: none;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-btn {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  background-color: transparent;
  color: $uni-text-color-grey;
  border: 2rpx solid $uni-border-color;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-code-btn::after,
.next-btn::after,
.submit-btn::after,
.back-btn::after {
  border: none;
}

/* 底部 */
.footer {
  margin-top: 40rpx;
  text-align: center;
  
  .footer-text {
    color: rgba(255, 255, 255, 0.8);
    font-size: $uni-font-size-base;
  }
  
  .login-link {
    color: #ffffff;
    font-weight: 600;
    font-size: $uni-font-size-base;
    margin-left: 8rpx;
  }
}
</style>
