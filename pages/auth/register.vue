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
              :adjust-position="false"
              cursor-spacing="20"
            />
          </view>

          <view class="input-group">
            <text class="label">角色</text>
            <picker :range="roleOptions" range-key="label" :value="roleIndex" @change="onRoleChange">
              <view class="input-field picker-value">{{ roleOptions[roleIndex].label }}</view>
            </picker>
          </view>

          <view v-if="needStoreName" class="input-group">
            <text class="label">所属门店</text>
            <picker
              v-if="isBarberRole"
              :range="storeOptions"
              range-key="name"
              :value="storeIndex"
              @change="onStoreChange"
            >
              <view class="input-field picker-value">{{ selectedStoreText }}</view>
            </picker>
            <input
              v-else
              class="input-field"
              type="text"
              v-model="storeName"
              :placeholder="storeNamePlaceholder"
              placeholder-class="placeholder"
              :adjust-position="false"
              cursor-spacing="20"
            />
            <text class="help-text" v-if="isBarberRole && loadingStores">正在加载门店列表...</text>
            <text class="help-text" v-else-if="isBarberRole && storeOptions.length === 0">暂无可选门店，请先由店家创建门店</text>
          </view>

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

          <view class="input-group">
            <text class="label">确认密码</text>
            <input
              class="input-field"
              type="password"
              v-model="confirmPassword"
              placeholder="请再次输入密码"
              placeholder-class="placeholder"
              :adjust-position="false"
              cursor-spacing="20"
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
import { fetchStores } from '../../api/store';

export default {
  data() {
    return {
      username: '',
      password: '',
      confirmPassword: '',
      storeName: '',
      roleOptions: [
        { label: '普通用户', value: 'user' },
        { label: '理发师', value: 'barber' },
        { label: '店家', value: 'admin' }
      ],
      roleIndex: 0,
      loading: false,
      loadingStores: false,
      storeOptions: [],
      storeIndex: -1,
      selectedStoreId: ''
    };
  },
  computed: {
    // 管理员/理发师需要填写所属门店名称
    needStoreName() {
      const role = this.roleOptions[this.roleIndex].value;
      return role === 'admin' || role === 'barber';
    },
    isAdminRole() {
      return this.roleOptions[this.roleIndex].value === 'admin';
    },
    isBarberRole() {
      return this.roleOptions[this.roleIndex].value === 'barber';
    },
    selectedStoreText() {
      if (this.loadingStores) return '正在加载门店列表...';
      if (this.storeOptions.length === 0) return '暂无可选门店';
      if (this.storeIndex < 0 || !this.storeOptions[this.storeIndex]) {
        return '请选择门店';
      }
      const item = this.storeOptions[this.storeIndex];
      return `${item.name || ''}${item.address ? `（${item.address}）` : ''}`;
    },
    storeNamePlaceholder() {
      return this.isAdminRole
        ? '请输入门店名称（将自动创建新门店）'
        : '请输入所属门店名称';
    }
  },
  onLoad() {
    if (this.isBarberRole) {
      this.loadStores();
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
      if (this.isBarberRole) {
        this.loadStores();
      } else {
        this.storeOptions = [];
        this.loadingStores = false;
        this.storeIndex = -1;
        this.selectedStoreId = '';
      }
      if (!this.needStoreName) {
        this.storeName = '';
      }
      if (this.isAdminRole) {
        this.storeName = '';
      }
    },
    async loadStores() {
      this.loadingStores = true;
      try {
        const list = await fetchStores({ page: 1, pageSize: 50, noCache: true });
        this.storeOptions = Array.isArray(list) ? list.filter((item) => item && item.name) : [];
        if (this.storeOptions.length > 0) {
          this.storeIndex = 0;
          this.storeName = this.storeOptions[0].name || '';
          this.selectedStoreId = this.storeOptions[0]._id || '';
        } else {
          this.storeIndex = -1;
          this.storeName = '';
          this.selectedStoreId = '';
        }
      } catch (err) {
        this.storeOptions = [];
        this.storeIndex = -1;
        this.storeName = '';
        this.selectedStoreId = '';
      } finally {
        this.loadingStores = false;
      }
    },
    onStoreChange(e) {
      const index = Number(e && e.detail && e.detail.value);
      if (!Number.isFinite(index) || index < 0 || !this.storeOptions[index]) return;
      this.storeIndex = index;
      this.storeName = this.storeOptions[index].name || '';
      this.selectedStoreId = this.storeOptions[index]._id || '';
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
      if (this.isAdminRole && !this.storeName.trim()) {
        uni.showToast({ title: '请填写所属门店名称', icon: 'none' });
        return;
      }
      if (this.isBarberRole && !this.selectedStoreId) {
        uni.showToast({ title: '请选择所属门店', icon: 'none' });
        return;
      }

      this.loading = true;
      try {
        const role = this.roleOptions[this.roleIndex].value;
        await register({
          username: this.username,
          password: this.password,
          role,
          storeName: this.needStoreName ? this.storeName.trim() : '',
          storeId: this.isBarberRole ? this.selectedStoreId : ''
        });
        uni.showToast({
          title: this.isBarberRole ? '申请已提交' : '注册成功',
          icon: 'success'
        });
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
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .help-text {
    margin-top: 10rpx;
    display: block;
    font-size: 24rpx;
    color: $uni-text-color-grey;
    line-height: 1.4;
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
  width: 100%;
  padding: 0;
  border-radius: 50rpx;
  font-size: $uni-font-size-lg;
  font-weight: 600;
  box-shadow: 0 10rpx 20rpx rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;

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
