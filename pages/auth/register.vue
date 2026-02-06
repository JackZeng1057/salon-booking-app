<template>
  <view class="register-page">
    <!-- 自定义顶部导航（注册页保留返回按钮，但不使用悬浮布局，避免整体往上顶） -->
    <app-nav :overlay="false" />
    <view class="circle-bg"></view>

    <!-- 仅允许内容区上下滚动，避免左右滚动 -->
    <scroll-view class="page-scroll" scroll-y :enable-flex="true">
      <view class="register-container">
        <view class="header">
          <text class="title">创建账号</text>
          <text class="subtitle">注册后即可预约</text>
        </view>

        <view class="form-card">
          <view class="input-group">
            <text class="label">用户名</text>
            <input
              class="input-field"
              type="text"
              v-model="username"
              placeholder="请输入用户名"
              placeholder-class="placeholder"
            />
          </view>

          <view class="input-group">
            <text class="label">角色</text>
            <picker :range="roleOptions" range-key="label" :value="roleIndex" @change="onRoleChange">
              <view class="input-field picker-value">{{ roleOptions[roleIndex].label }}</view>
            </picker>
          </view>

          <view v-if="needStoreId" class="input-group">
            <text class="label">店铺ID</text>
            <input
              class="input-field"
              type="text"
              v-model="storeId"
              placeholder="请输入店铺ID"
              placeholder-class="placeholder"
            />
          </view>

          <view class="input-group">
            <text class="label">密码</text>
            <input
              class="input-field"
              type="password"
              v-model="password"
              placeholder="请输入密码"
              placeholder-class="placeholder"
            />
          </view>

          <view class="input-group">
            <text class="label">确认密码</text>
            <input
              class="input-field"
              type="password"
              v-model="confirmPassword"
              placeholder="请再次输入密码"
              placeholder-class="placeholder"
            />
          </view>

          <button
            class="register-btn"
            :loading="loading"
            @click="handleRegister"
            hover-class="register-btn-hover"
          >
            注 册
          </button>
        </view>

        <view class="footer">
          <text class="footer-text">已有账号？</text>
          <text class="signup-link" @click="goLogin">去登录</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
// 注册页面：选择角色、校验输入并提交注册
import { register } from '../../api/auth';

export default {
  data() {
    return {
      username: '',
      password: '',
      confirmPassword: '',
      storeId: '',
      roleOptions: [
        { label: '普通用户', value: 'user' },
        { label: '理发师', value: 'barber' },
        { label: '店家', value: 'admin' }
      ],
      roleIndex: 0,
      loading: false
    };
  },
  computed: {
    // 管理员/理发师需要绑定店铺ID
    needStoreId() {
      const role = this.roleOptions[this.roleIndex].value;
      return role === 'admin' || role === 'barber';
    }
  },
  methods: {
    // 跳转到登录页
    goLogin() {
      uni.navigateBack();
    },
    // 角色选择变更
    onRoleChange(e) {
      this.roleIndex = Number(e.detail.value || 0);
    },
    // 处理注册
    async handleRegister() {
      if (!this.username.trim() || !this.password.trim()) {
        uni.showToast({ title: '请输入用户名和密码', icon: 'none' });
        return;
      }
      if (this.password !== this.confirmPassword) {
        uni.showToast({ title: '两次密码不一致', icon: 'none' });
        return;
      }
      if (this.needStoreId && !this.storeId.trim()) {
        uni.showToast({ title: '请输入店铺ID', icon: 'none' });
        return;
      }

      this.loading = true;
      try {
        const role = this.roleOptions[this.roleIndex].value;
        await register({
          username: this.username,
          password: this.password,
          role,
          storeId: this.needStoreId ? this.storeId.trim() : ''
        });
        uni.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => {
          uni.navigateBack();
        }, 500);
      } catch (err) {
        uni.showToast({ title: err.message || '注册失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped lang="scss">
.register-page {
  height: 100vh;
  position: relative;
  background-color: $uni-bg-color-grey;
  /* 禁止页面左右/上下滚动，滚动交给内部滚动容器 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 内容滚动区：只允许上下滚动 */
.page-scroll {
  flex: 1;
  width: 100%;
}

.circle-bg {
  position: absolute;
  top: -200rpx;
  right: -100rpx;
  width: 600rpx;
  height: 600rpx;
  background: linear-gradient(135deg, $uni-color-primary, $uni-color-primary-light);
  border-radius: 50%;
  opacity: 0.1;
  z-index: 0;
}

.register-container {
  position: relative;
  z-index: 1;
  padding: 100rpx 40rpx;
  display: flex;
  flex-direction: column;
}

.header {
  margin-bottom: 60rpx;

  .title {
    font-size: 60rpx;
    font-weight: bold;
    color: $uni-color-primary;
    display: block;
    margin-bottom: 16rpx;
  }

  .subtitle {
    font-size: $uni-font-size-base;
    color: $uni-text-color-grey;
  }
}

.form-card {
  background-color: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 60rpx 40rpx;
  box-shadow: $uni-shadow-lg;
}

.input-group {
  margin-bottom: 40rpx;

  .label {
    font-size: $uni-font-size-sm;
    color: $uni-text-color-grey;
    font-weight: 600;
    margin-bottom: 16rpx;
    display: block;
    text-transform: uppercase;
    letter-spacing: 1rpx;
  }

  .input-field {
    width: 100%;
    height: 100rpx;
    background-color: #f9f9f9;
    border: 2rpx solid transparent;
    border-radius: $uni-border-radius-base;
    padding: 0 30rpx;
    font-size: $uni-font-size-base;
    color: $uni-text-color;
    transition: all 0.3s;

    &:focus {
      background-color: #fff;
      border-color: $uni-color-primary;
    }
  }

  .picker-value {
    height: 100rpx;
    line-height: 100rpx;
    display: flex;
    align-items: center;
  }
}

.placeholder {
  color: $uni-text-color-placeholder;
}

.register-btn {
  background-color: $uni-color-primary;
  color: #ffffff;
  height: 100rpx;
  line-height: 100rpx;
  border-radius: 50rpx;
  font-size: $uni-font-size-lg;
  font-weight: 600;
  box-shadow: 0 10rpx 20rpx rgba(0, 0, 0, 0.15);

  &::after {
    border: none;
  }
}

.register-btn-hover {
  background-color: $uni-color-primary-light;
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 10rpx rgba(0, 0, 0, 0.1);
}

.footer {
  margin-top: 60rpx;
  text-align: center;

  .footer-text {
    color: $uni-text-color-grey;
    font-size: $uni-font-size-base;
  }

  .signup-link {
    color: $uni-color-primary;
    font-weight: 600;
    margin-left: 10rpx;
    font-size: $uni-font-size-base;
  }
}
</style>
