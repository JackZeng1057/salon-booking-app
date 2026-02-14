<template>
  <view class="page">
    <app-nav />

    <view class="header">
      <text class="title">修改账号名/头像</text>
      <text class="subtitle">账号名与昵称保持一致</text>
    </view>

    <view class="card">
      <view class="field">
        <text class="label">头像</text>
        <view class="avatar-row">
          <image v-if="avatar" class="avatar" :src="avatar" mode="aspectFill" />
          <view v-else class="avatar avatar-placeholder">{{ (username || 'U').slice(0, 1).toUpperCase() }}</view>
          <button class="pick-btn" :loading="uploading" @click="pickAvatar">选择头像</button>
        </view>
      </view>

      <view class="field">
        <text class="label">账号名</text>
        <input
          class="input"
          maxlength="20"
          v-model="username"
          placeholder="请输入账号名（最多20字）"
        />
      </view>

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
  </view>
</template>

<script>
import { me, updateProfile } from '../../../api/auth';
import { authStore } from '../../../store/auth';

export default {
  data() {
    return {
      user: authStore.state.user || {},
      username: '',
      avatar: '',
      originUsername: '',
      originAvatar: '',
      uploading: false,
      saving: false
    };
  },
  computed: {
    canSave() {
      const name = String(this.username || '').trim();
      if (!name) return false;
      return name !== this.originUsername || this.avatar !== this.originAvatar;
    }
  },
  onShow() {
    this.loadMe();
  },
  methods: {
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
    async handleSave() {
      if (!this.canSave) return;
      this.saving = true;
      try {
        const res = await updateProfile({
          username: String(this.username || '').trim(),
          avatar: this.avatar
        });
        const latest = (res && res.user) || {};
        this.user = { ...this.user, ...latest };
        this.username = latest.username || this.username;
        this.avatar = latest.avatar || this.avatar;
        this.originUsername = this.username;
        this.originAvatar = this.avatar;
        authStore.setUser(this.user);
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
  min-height: 100vh;
  padding: 120rpx 30rpx 30rpx;
  background: $uni-bg-color-grey;
}

.header {
  margin-bottom: 24rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: 700;
  color: $uni-color-primary;
  line-height: 1.25;
  padding-left: 6rpx;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  color: $uni-text-color-grey;
  font-size: $uni-font-size-base;
  padding-left: 6rpx;
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
</style>

