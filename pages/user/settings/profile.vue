<template>
  <!-- 个人资料编辑页根容器 -->
  <view class="page">
    <!-- 固定头部：返回键/标题 + 提示词始终固定在顶部 -->
    <view class="fixed-header">
      <app-nav :showTitle="true" title="修改账号名/头像" :overlay="false" />
      <view class="hero-card">
        <text class="hero-subtitle">昵称按角色规则自动生成</text>
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y>
      <view class="scroll-content">
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
            <!-- 键盘弹起时保持顶部区域稳定，只保证光标可见 -->
            <input
              class="input"
              maxlength="20"
              v-model="username"
              :adjust-position="false"
              :cursor-spacing="140"
              placeholder="请输入账号名（最多20字）"
            />
          </view>

          <!-- 理发师专属：擅长介绍 -->
          <view v-if="isBarberRole" class="field">
            <text class="label">擅长介绍</text>
            <!-- 多行输入与账号名输入采用同一策略，避免整页被键盘上推 -->
            <textarea
              class="textarea"
              maxlength="80"
              v-model="intro"
              :adjust-position="false"
              :cursor-spacing="140"
              placeholder="请输入你的擅长方向（最多80字）"
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
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { me, updateProfile } from '../../../api/auth';
import { authStore } from '../../../store/auth';

/**
 * 个人资料页
 * 页面功能：
 * 1) 修改账号名
 * 2) 上传头像
 * 3) 理发师填写擅长介绍
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
      intro: '',
      originIntro: '',
      // 上传中状态（防止重复选择/上传）
      uploading: false,
      // 保存中状态（防止重复提交）
      saving: false
    };
  },
  computed: {
    // 是否理发师：控制擅长介绍字段显示与提交
    isBarberRole() {
      const role = String((this.user && this.user.role) || authStore.state.role || '').toLowerCase();
      return role === 'barber';
    },
    // 仅当头像或名称发生有效变化时允许提交
    canSave() {
      const name = String(this.username || '').trim();
      const intro = String(this.intro || '').trim();
      const avatarChanged = this.avatar !== this.originAvatar;
      const nameChanged = !!name && name !== this.originUsername;
      const introChanged = this.isBarberRole && intro !== this.originIntro;
      return avatarChanged || nameChanged || introChanged;
    }
  },
  onShow() {
    // 保证键盘弹出时只压缩内容区高度，头部区域保持稳定
    this.ensureSoftinputMode();
    this.loadMe();
  },
  methods: {
    // APP 端设置当前页面软键盘模式为 adjustResize
    // 作用：键盘弹出时缩短可用高度，让固定头部不随页面位移
    ensureSoftinputMode() {
      // #ifdef APP-PLUS
      try {
        const current = plus.webview.currentWebview();
        if (current && typeof current.setStyle === 'function') {
          current.setStyle({ softinputMode: 'adjustResize' });
        }
      } catch (e) {}
      // #endif
    },
    // 拉取最新用户资料并刷新可编辑初始值
    async loadMe() {
      try {
        const data = await me();
        this.user = data || {};
        this.username = (data && (data.username || data.name)) || '';
        this.avatar = (data && data.avatar) || '';
        this.intro = (data && data.intro) || '';
        this.originUsername = this.username;
        this.originAvatar = this.avatar;
        this.originIntro = this.intro;
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
    // 提交资料并同步本地登录态
    async handleSave() {
      if (!this.canSave) return;
      this.saving = true;
      try {
        const submittedName = String(this.username || '').trim();
        const submittedIntro = String(this.intro || '').trim();
        const payload = {
          username: submittedName,
          avatar: this.avatar
        };
        if (this.isBarberRole) payload.intro = submittedIntro;
        const res = await updateProfile(payload);
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
        optimistic.intro = this.isBarberRole ? submittedIntro : (optimistic.intro || '');
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
            this.intro = fresh.intro || '';
          }
        } catch (e) {}
        this.originUsername = this.username;
        this.originAvatar = this.avatar;
        this.originIntro = this.intro;
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
  background: #f8fafc;
  box-sizing: border-box;
  /* 页面根容器不参与滚动，滚动交给内容区处理 */
  overflow: hidden;
  position: relative;
}

.fixed-header {
  /* 顶部区域常驻屏幕顶端：返回键、标题、提示词不参与内容滚动 */
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  z-index: 30;
  padding: 0 28rpx;
  background: #f8fafc;
}

.page-scroll {
  /* 内容区独立滚动：键盘出现时由可视高度变化来容纳输入区域 */
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
  padding: 0 28rpx;
}

.scroll-content {
  /* 预留顶部固定区高度，避免表单内容被固定头部遮挡 */
  padding-top: calc(var(--status-bar-height) + 44px + 18rpx + 132rpx);
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

.textarea {
  width: 100%;
  min-height: 172rpx;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx 24rpx;
  box-sizing: border-box;
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
