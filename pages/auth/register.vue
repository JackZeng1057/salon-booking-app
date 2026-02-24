<template>
  <!-- 注册页根容器 -->
  <view class="register-page">
    <!-- 顶部导航（保留返回按钮，但不使用悬浮布局，避免整体往上顶） -->
    <app-nav :overlay="false" />
    <!-- 顶部装饰性圆形背景图案 -->
    <view class="circle-bg"></view>

    <!-- 内容区滚动容器（解决键盘弹起遮挡表单问题） -->
    <scroll-view class="page-scroll" scroll-y :enable-flex="true">
      <view class="register-container">
        <!-- 页面标题区域 -->
        <view class="header">
          <text class="title">创建账号</text>
          <text class="subtitle">注册后即可预约</text>
        </view>

        <!-- 注册表单卡片 -->
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

          <!-- 角色选择器（user/barber/admin 三种角色） -->
          <view class="input-group">
            <text class="label">角色</text>
            <picker :range="roleOptions" range-key="label" :value="roleIndex" @change="onRoleChange">
              <view class="input-field picker-value">{{ roleOptions[roleIndex].label }}</view>
            </picker>
          </view>

          <!--
            门店关联字段（仅 barber/admin 角色时显示）：
            - 理发师：下拉选已有门店（需等待审核）
            - 店家：输入文本创建新门店
          -->
          <view v-if="needStoreName" class="input-group">
            <text class="label">所属门店</text>
            <!-- 理发师：下拉选已加载的门店列表 -->
            <picker
              v-if="isBarberRole"
              :range="storeOptions"
              range-key="name"
              :value="storeIndex"
              @change="onStoreChange"
            >
              <view class="input-field picker-value">{{ selectedStoreText }}</view>
            </picker>
            <!-- 店家：文本输入门店名称（后端创建新门店文档） -->
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
            <!-- 门店列表加载中/无可用门店提示 -->
            <text class="help-text" v-if="isBarberRole && loadingStores">正在加载门店列表...</text>
            <text class="help-text" v-else-if="isBarberRole && storeOptions.length === 0">暂无可选门店，请先由店家创建门店</text>
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

          <!-- 确认密码（前端二次校验，防止输入错误） -->
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

          <!-- 注册提交按钮（loading 时禁用，防止重复提交） -->
          <button
            class="register-btn"
            :loading="loading"
            @click="handleRegister"
            hover-class="register-btn-hover"
          >
            注 册
          </button>
        </view>

        <!-- 底部已有账号提示 + 跳登录入口 -->
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
// 角色策略：
// - 普通用户：直接注册；
// - 理发师：必须先选择已存在门店（提交审核）；
// - 店家：admin 角色，输入门店名后由后端创建/关联门店。
import { register } from '../../api/auth';
import { fetchStores } from '../../api/store';

export default {
  data() {
    return {
      // 账号与密码输入
      username: '',
      password: '',
      confirmPassword: '',
      // 角色相关门店字段：admin 填门店名，barber 从列表选择
      storeName: '',
      roleOptions: [
        { label: '普通用户', value: 'user' },
        { label: '理发师', value: 'barber' },
        { label: '店家', value: 'admin' }
      ],
      roleIndex: 0,
      // 提交加载态，避免重复点击
      loading: false,
      // 门店列表加载态与候选项（仅 barber 需要）
      loadingStores: false,
      storeOptions: [],
      storeIndex: -1,
      // 理发师最终提交给后端的门店 ID
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
      // admin 输入“待创建/待关联门店名”，barber 显示“所属门店提示”。
      return this.isAdminRole
        ? '请输入门店名称（将自动创建新门店）'
        : '请输入所属门店名称';
    }
  },
  onLoad() {
    // 初始角色若为 barber（默认不是），提前拉取门店数据避免首屏等待。
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
      // barber 切换进来时主动加载门店；切出时清空门店相关状态防止脏值提交。
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
        // admin 不走已有门店选择，强制改为手动填写名称。
        this.storeName = '';
      }
    },
    // 拉取门店列表供理发师选择；失败时清空并保持可重试状态。
    async loadStores() {
      this.loadingStores = true;
      try {
        const list = await fetchStores({ page: 1, pageSize: 50, noCache: true });
        // 仅保留有名称的有效门店数据，避免 picker 展示空项。
        this.storeOptions = Array.isArray(list) ? list.filter((item) => item && item.name) : [];
        if (this.storeOptions.length > 0) {
          // 默认选第一家门店，减少一次点击操作。
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
    // 理发师选择门店后同步 storeName/storeId，确保提交参数一致。
    onStoreChange(e) {
      const index = Number(e && e.detail && e.detail.value);
      if (!Number.isFinite(index) || index < 0 || !this.storeOptions[index]) return;
      this.storeIndex = index;
      this.storeName = this.storeOptions[index].name || '';
      this.selectedStoreId = this.storeOptions[index]._id || '';
    },
    // 处理注册
    async handleRegister() {
      // 前端基础校验：必填项、密码一致性、角色对应门店条件。
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
        // 参数约定：
        // - needStoreName=false 时 storeName 传空；
        // - barber 必须附带 storeId；
        // - admin 不传 storeId，由后端按 storeName 处理门店归属。
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
        // 成功后返回登录页，由登录流程接管后续跳转。
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
    font-size: 48rpx;
    font-weight: bold;
    color: $uni-color-primary;
    display: block;
    margin-bottom: 16rpx;
    text-align: center;
  }

  .subtitle {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: #94a3b8;
    line-height: 1.5;
    text-align: center;
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
