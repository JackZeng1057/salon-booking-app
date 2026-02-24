<template>
  <!-- 个人资料编辑页根容器 -->
  <view class="page">
    <!-- 吸顶头部：导航栏 + 副标题提示（昵称规则说明） -->
    <view class="page-header">
      <app-nav :showTitle="true" title="修改账号名/头像" />
      <view class="hero-card">
        <text class="hero-subtitle">昵称按角色规则自动生成</text>
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y>
      <view class="card">
        <!-- 头像选择区：有头像则预览，无头像则显示首字母占位 -->
        <view class="field">
          <text class="label">头像</text>
          <view class="avatar-row">
            <image v-if="avatar" class="avatar" :src="avatar" mode="aspectFill" />
            <view v-else class="avatar avatar-placeholder">{{ (username || 'U').slice(0, 1).toUpperCase() }}</view>
            <button class="pick-btn" :loading="uploading" @click="pickAvatar">选择头像</button>
          </view>
        </view>

        <!-- 账号名输入框（最多20字） -->
        <view class="field">
          <text class="label">账号名</text>
          <input
            class="input"
            maxlength="20"
            v-model="username"
            placeholder="请输入账号名（最多20字）"
          />
        </view>

        <!-- 保存按钮：头像或名称发生变化时方可点击 -->
        <button
          class="submit-btn"
          :class="{ disabled: !canSave }"
          :disabled="!canSave"
          :loading="saving"
          @click="handleSave"
        >
          保存
        </button>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>
  </view>
</template>

<script>
import { me, updateProfile } from '../../../api/auth';
import { authStore } from '../../../store/auth';

/**
 * 个人资料页
 * 当前支持：
 * 1) 修改账号名
 * 2) 上传并更新头像
 */
export default {
  data() {
    return {
      // 当前用户对象（用于上传路径与本地展示）
      user: authStore.state.user || {},
      // 可编辑字段
      username: '',
      avatar: '',
      // 初始值：用于判断是否有改动，控制“保存”按钮可用态
      originUsername: '',
      originAvatar: '',
      // 上传中状态（防止重复选择/上传）
      uploading: false,
      // 保存中状态（防止重复提交）
      saving: false
    };
  },
  computed: {
    // 仅当头像或名称发生有效变化时允许提交
    canSave() {
      const name = String(this.username || '').trim();
      const avatarChanged = this.avatar !== this.originAvatar;
      const nameChanged = !!name && name !== this.originUsername;
      return avatarChanged || nameChanged;
    }
  },
  onShow() {
    this.loadMe();
  },
  methods: {
    // 拉取最新用户资料并刷新可编辑初始值
    async loadMe() {
      try {
        const data = await me();
        this.user = data || {};
        this.username = (data && (data.username || data.name)) || '';
        this.avatar = (data && data.avatar) || '';
        this.originUsername = this.username;
        this.originAvatar = this.avatar;
        authStore.setUser(data || null);
      } catch (err) {
        uni.showToast({ title: err.message || '获取用户失败', icon: 'none' });
      }
    },
    // 选择头像文件（相册/相机）
    pickAvatar() {
      if (this.uploading) return;
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const path = res && res.tempFilePaths && res.tempFilePaths[0];
          if (!path) return;
          this.uploadAvatar(path);
        }
      });
    },
    // 上传头像到云存储并回填 fileID
    async uploadAvatar(filePath) {
      this.uploading = true;
      try {
        const uid = (this.user && this.user._id) || 'user';
        const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
        const cloudPath = `avatars/${uid}_${Date.now()}.${ext}`;
        const uploadRes = await uniCloud.uploadFile({
          cloudPath,
          filePath
        });
        const fileID = (uploadRes && uploadRes.fileID) || '';
        if (!fileID) {
          uni.showToast({ title: '上传头像失败', icon: 'none' });
          return;
        }
        this.avatar = fileID;
      } catch (err) {
        uni.showToast({ title: '上传头像失败', icon: 'none' });
      } finally {
        this.uploading = false;
      }
    },
    // 提交资料更新并同步本地登录态
    async handleSave() {
      if (!this.canSave) return;
      this.saving = true;
      try {
        const submittedName = String(this.username || '').trim();
        const res = await updateProfile({
          username: submittedName,
          avatar: this.avatar
        });
        const latest = (res && res.user) || {};
        // 先用提交值 + 回包做一次本地立即同步，避免返回首页读到旧值
        const optimistic = {
          ...(this.user || {}),
          ...(latest || {})
        };
        if (submittedName) {
          optimistic.username = submittedName;
          // user 端昵称同账号名，保证首页文案与默认头像首字符即时一致
          optimistic.name = submittedName;
        }
        optimistic.avatar = this.avatar || '';
        this.user = optimistic;
        this.username = optimistic.username || this.username;
        this.avatar = optimistic.avatar || this.avatar;
        authStore.setUser(this.user);
        uni.$emit('user-profile-updated', this.user);

        // 保存后回源一次，确保本地登录态与数据库最终一致
        try {
          const fresh = await me();
          if (fresh && typeof fresh === 'object') {
            this.user = fresh;
            this.username = (fresh.username || fresh.name || this.username);
            this.avatar = fresh.avatar || this.avatar;
          }
        } catch (e) {}
        this.originUsername = this.username;
        this.originAvatar = this.avatar;
        authStore.setUser(this.user);
        uni.$emit('user-profile-updated', this.user);
        uni.showToast({ title: '保存成功', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: err.message || '保存失败', icon: 'none' });
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

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 56rpx;
  flex-shrink: 0;
}

.avatar-placeholder {
  background: #e7ecf6;
  color: $uni-color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42rpx;
  font-weight: 700;
}

.pick-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  padding: 0 28rpx;
  background: #ffffff;
  color: $uni-color-primary;
  border: 1rpx solid $uni-color-primary;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pick-btn::after {
  border: none;
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
