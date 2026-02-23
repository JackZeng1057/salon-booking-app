<template>
  <view class="page">
    <view class="page-header">
      <app-nav :showTitle="true" title="绑定/修改手机号" />
      <view class="hero-card">
        <text class="hero-subtitle">手机号将用于账号安全验证</text>
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y>
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
        保存手机号
      </button>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>
  </view>
</template>

<script>
import { me, bindPhone } from '../../../api/auth';
import { authStore } from '../../../store/auth';
import { callCloud } from '../../../api/client';
import { syncCriticalSystemNotifications } from '../../../utils/system-notify';

/**
 * 绑定/修改手机号页面
 * 关键流程：
 * 1) 输入手机号并发送短信验证码
 * 2) 提交验证码绑定手机号
 * 3) 成功后同步用户信息与系统关键通知
 */
export default {
  data() {
    return {
      // 当前用户资料（用于展示与绑定后回写）
      user: authStore.state.user || {},
      // 表单字段
      phone: '',
      code: '',
      // 演示环境返回的验证码（生产可隐藏）
      demoCode: '',
      // 发送验证码倒计时（秒）
      countdown: 0,
      timer: null,
      // 保存中状态，防止重复提交
      saving: false
    };
  },
  computed: {
    // 手机号是否满足大陆手机号规则
    canSend() {
      return /^1[3-9]\d{9}$/.test(this.phone);
    },
    // 绑定提交条件：手机号合法 + 6 位验证码
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
    // 拉取并同步最新用户信息
    async loadMe() {
      try {
        const data = await me();
        this.user = data || {};
        this.phone = (data && data.phone) || '';
        authStore.setUser(data || null);
      } catch (err) {
        uni.showToast({ title: err.message || '获取用户失败', icon: 'none' });
      }
    },
    // 发送短信验证码，并开启 60 秒防抖倒计时
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
    // 提交手机号绑定，成功后刷新用户资料并触发关键通知同步
    async handleBind() {
      if (!this.canSubmit) return;
      this.saving = true;
      try {
        const res = await bindPhone({
          phone: this.phone,
          code: this.code,
          type: 'login'
        });
        const boundPhone = (res && res.phone) || this.phone;
        this.user = { ...this.user, phone: boundPhone };
        authStore.setUser(this.user);
        uni.showToast({ title: '保存成功', icon: 'success' });
        this.code = '';
        this.demoCode = '';
        await this.loadMe();
        syncCriticalSystemNotifications({ force: true });
      } catch (err) {
        const msg = err.code === 409 ? '手机号已被其他账号绑定' : (err.message || '保存失败');
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

.field {
  margin-bottom: 24rpx;
}

.field-label {
  display: block;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
  margin-bottom: 12rpx;
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
