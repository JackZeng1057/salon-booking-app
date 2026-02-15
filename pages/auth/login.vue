<template>
  <view class="login-page">
    <!-- 自定义顶部导航（登录页不需要返回按钮且不使用悬浮布局，保留原有上方留白） -->
    <app-nav :showBack="false" :overlay="false" />
    <!-- 顶部装饰背景圆 -->
    <view class="circle-bg"></view>

    <!--
      仅允许“内容区”上下滚动：
      - 外层页面禁用滚动，避免出现左右滚动/穿透
      - 内层 scroll-view 负责表单内容滚动，解决键盘遮挡
    -->
    <scroll-view class="page-scroll" scroll-y :enable-flex="true">
      <view class="login-container">
        <!-- 头部标题区域 -->
        <view class="header">
          <text class="title">欢迎回来</text>
          <text class="subtitle">请登录您的账号</text>
        </view>

        <!-- 登录表单区域 -->
        <view class="form-card">
          <!-- 用户名输入 -->
          <view class="input-group">
            <text class="label">用户名</text>
            <input
              class="input-field"
              type="text"
              v-model="username"
              placeholder="请输入用户名"
              placeholder-class="placeholder"
              :adjust-position="false"
              cursor-spacing="20"
            />
          </view>

          <!-- 密码输入 -->
          <view class="input-group">
            <text class="label">密码</text>
            <input
              class="input-field"
              type="password"
              v-model="password"
              placeholder="请输入密码"
              placeholder-class="placeholder"
              :adjust-position="false"
              cursor-spacing="20"
            />
          </view>

          <!-- 忘记密码链接 -->
          <view class="forgot-pwd" @click="goForgotPassword">
            <text>忘记密码？</text>
          </view>

          <!-- 登录按钮 -->
          <button
            class="login-btn"
            :loading="loading"
            @click="handleLogin"
            hover-class="login-btn-hover"
          >
            登 录
          </button>
        </view>

        <!-- 底部注册提示 -->
        <view class="footer">
          <text class="footer-text">还没有账号？</text>
          <text class="signup-link" @click="goRegister">立即注册</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
/**
 * 登录页面逻辑：表单校验、登录请求与登录态写入
 */
import { login } from '../../api/auth';
import { authStore } from '../../store/auth';

export default {
  data() {
    return {
      username: '', // 用户名
      password: '', // 密码
      loading: false // 登录按钮加载状态
    };
  },
  methods: {
    // 跳转到注册页面
    goRegister() {
      uni.navigateTo({ url: '/pages/auth/register' });
    },
    // 跳转到忘记密码页面
    goForgotPassword() {
      uni.navigateTo({ url: '/pages/auth/forgot-password' });
    },
    /**
     * 处理登录点击事件
     * 1. 校验非空
     * 2. 调用 API
     * 3. 存储 Token 和用户信息
     * 4. 跳转到角色网关页 (RoleGate)
     */
    async handleLogin() {
      // 简单非空校验
      if (!this.username.trim() || !this.password.trim()) {
        uni.showToast({
          title: '请输入用户名和密码',
          icon: 'none'
        });
        return;
      }

      this.loading = true;
      try {
        // 调用后端登录接口
        const res = await login({
          username: this.username,
          password: this.password
        });
        
        // 存储登录信息到全局状态仓库
        authStore.setAuth({
          token: res.token,
          user: res.user,
          role: res.user && res.user.role
        });

        // 登录成功提示
        const isBarberPending =
          res &&
          res.user &&
          res.user.pendingRole === 'barber' &&
          res.user.approvalStatus === 'PENDING';
        const isBarberRejected =
          res &&
          res.user &&
          res.user.pendingRole === 'barber' &&
          res.user.approvalStatus === 'REJECTED';
        uni.showToast({
          title: isBarberPending
            ? '理发师申请审核中，先进入用户端'
            : (isBarberRejected ? '理发师申请未通过，请联系店家' : '登录成功'),
          icon: (isBarberPending || isBarberRejected) ? 'none' : 'success'
        });

        // 延迟跳转，提升体验
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/index/roleGate' });
        }, 500);

      } catch (err) {
        // 错误处理
        uni.showToast({
          title: err.message || '登录失败',
          icon: 'none'
        });
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped lang="scss">
/* 页面容器 - 撑满屏幕，使用浅灰背景 */
.login-page {
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

/* 装饰大圆背景 - 增加层次感 */
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

/* 内容容器 - 相对定位以浮于背景之上 */
.login-container {
  position: relative;
  z-index: 1;
  padding: 100rpx 40rpx;
  display: flex;
  flex-direction: column;
}

/* 头部标题样式 */
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

/* 表单卡片样式 - 白底圆角阴影 */
.form-card {
  background-color: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 60rpx 40rpx;
  box-shadow: $uni-shadow-lg;
}

/* 输入框组样式 */
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
}

.placeholder {
  color: $uni-text-color-placeholder;
}

.forgot-pwd {
  text-align: right;
  margin-bottom: 60rpx;
  font-size: $uni-font-size-sm;
  color: $uni-color-primary;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
  
  &:active {
    opacity: 0.7;
  }
}

/* 登录按钮样式 */
.login-btn {
  background-color: $uni-color-primary;
  color: #ffffff;
  height: 100rpx;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50rpx; /* 全圆角 */
  font-size: $uni-font-size-lg;
  font-weight: 600;
  box-shadow: 0 10rpx 20rpx rgba(0, 0, 0, 0.15);
  
  &::after {
    border: none;
  }
}

.login-btn-hover {
  background-color: $uni-color-primary-light;
  transform: translateY(2rpx);
  box-shadow: 0 5rpx 10rpx rgba(0, 0, 0, 0.1);
}

/* 底部区域样式 */
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
