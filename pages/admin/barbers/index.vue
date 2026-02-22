<template>
  <view class="page">
    <app-nav :showTitle="true" title="理发师管理" />
    <view class="hero-card">
      <text class="hero-subtitle">可统一管理门店理发师账号名与在店状态</text>
    </view>

    <view v-if="loading" class="hint">加载中...</view>
    <view v-else-if="list.length === 0" class="hint">当前门店暂无理发师</view>

    <view v-else class="list">
      <view v-for="item in list" :key="item._id" class="card">
        <view class="header-row">
          <image
            v-if="normalizeAvatar(item.avatar)"
            class="avatar"
            :src="normalizeAvatar(item.avatar)"
            mode="aspectFill"
            @error="onAvatarError(item._id)"
          />
          <view v-else class="avatar avatar-fallback" :style="avatarStyle(item)">
            <text class="avatar-text">{{ avatarInitial(item) }}</text>
          </view>
          <view class="meta">
            <text class="name">{{ item.username || item.name || '理发师' }}</text>
            <text class="sub">手机号：{{ item.phone || '未绑定' }}</text>
          </view>
        </view>

        <view class="edit-row">
          <input
            class="name-input"
            :value="draftMap[item._id] || ''"
            maxlength="20"
            placeholder="请输入师傅名（账号名）"
            @input="onDraftInput(item._id, $event)"
          />
          <button
            class="save-btn"
            size="mini"
            :loading="!!savingMap[item._id]"
            @click="renameBarber(item)"
          >
            改名
          </button>
        </view>

        <view class="action-row">
          <button
            class="remove-btn"
            size="mini"
            :loading="!!removingMap[item._id]"
            @click="removeBarber(item)"
          >
            移出门店
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { fetchManagedBarbers, renameManagedBarber, removeManagedBarber } from '../../../api/barberManage';

export default {
  data() {
    return {
      loading: false,
      list: [],
      draftMap: {},
      savingMap: {},
      removingMap: {}
    };
  },
  onShow() {
    this.loadList();
  },
  methods: {
    normalizeAvatar(avatar) {
      const value = String(avatar || '').trim();
      if (!value) return '';
      const lowered = value.toLowerCase();
      if (lowered === 'default' || lowered === 'null' || lowered === 'undefined') return '';
      return value;
    },
    avatarName(item) {
      return String((item && (item.username || item.name)) || '理发师').trim();
    },
    avatarInitial(item) {
      return this.avatarName(item).slice(0, 1).toUpperCase();
    },
    avatarStyle(item) {
      const seed = this.avatarName(item);
      let hash = 0;
      for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
      }
      const palettes = [
        { bg: '#E0E7FF', fg: '#3730A3' },
        { bg: '#DBEAFE', fg: '#1D4ED8' },
        { bg: '#D1FAE5', fg: '#047857' },
        { bg: '#FCE7F3', fg: '#BE185D' },
        { bg: '#FEF3C7', fg: '#B45309' },
        { bg: '#E2E8F0', fg: '#334155' }
      ];
      const picked = palettes[hash % palettes.length];
      return { backgroundColor: picked.bg, color: picked.fg };
    },
    onAvatarError(barberId) {
      const id = String(barberId || '');
      if (!id) return;
      this.list = (this.list || []).map((item) => {
        if (String(item && item._id) !== id) return item;
        return { ...item, avatar: '' };
      });
    },
    onDraftInput(barberId, e) {
      const value = String((e && e.detail && e.detail.value) || '').slice(0, 20);
      this.draftMap = {
        ...this.draftMap,
        [barberId]: value
      };
    },
    async loadList() {
      this.loading = true;
      try {
        const data = await fetchManagedBarbers();
        this.list = Array.isArray(data) ? data : [];
        const draft = {};
        this.list.forEach((item) => {
          draft[item._id] = String((item && item.username) || '').trim();
        });
        this.draftMap = draft;
      } catch (err) {
        this.list = [];
        this.draftMap = {};
        uni.showToast({ title: err.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    async renameBarber(item) {
      const barberId = item && item._id;
      const nextName = String(this.draftMap[barberId] || '').trim();
      const oldName = String((item && item.username) || '').trim();
      if (!barberId) return;
      if (!nextName) {
        uni.showToast({ title: '请输入师傅名', icon: 'none' });
        return;
      }
      if (nextName === oldName) {
        uni.showToast({ title: '未修改', icon: 'none' });
        return;
      }
      this.savingMap = { ...this.savingMap, [barberId]: true };
      try {
        await renameManagedBarber(barberId, nextName);
        this.list = this.list.map((row) => {
          if (row._id !== barberId) return row;
          return {
            ...row,
            username: nextName,
            name: nextName
          };
        });
        uni.showToast({ title: '改名成功', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: err.message || '改名失败', icon: 'none' });
      } finally {
        this.savingMap = { ...this.savingMap, [barberId]: false };
      }
    },
    removeBarber(item) {
      const barberId = item && item._id;
      if (!barberId) return;
      uni.showModal({
        title: '移出理发师',
        content: `确认将“${item.username || item.name || '理发师'}”移出当前门店吗？`,
        success: async (res) => {
          if (!res.confirm) return;
          this.removingMap = { ...this.removingMap, [barberId]: true };
          try {
            await removeManagedBarber(barberId);
            this.list = this.list.filter((row) => row._id !== barberId);
            const nextDraft = { ...this.draftMap };
            delete nextDraft[barberId];
            this.draftMap = nextDraft;
            uni.showToast({ title: '已移出', icon: 'success' });
          } catch (err) {
            uni.showToast({ title: err.message || '移出失败', icon: 'none' });
          } finally {
            this.removingMap = { ...this.removingMap, [barberId]: false };
          }
        }
      });
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: calc(118rpx + 20px) 28rpx 30rpx;
  background: #f8fafc;
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

.hint {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-placeholder;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 24rpx;
  box-shadow: $uni-shadow-base;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.avatar {
  width: 84rpx;
  height: 84rpx;
  border-radius: 42rpx;
  flex-shrink: 0;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-text {
  font-size: 34rpx;
  font-weight: 700;
}

.meta {
  flex: 1;
  min-width: 0;
}

.name {
  display: block;
  font-size: 30rpx;
  color: $uni-text-color;
  font-weight: 700;
}

.sub {
  margin-top: 6rpx;
  display: block;
  font-size: 22rpx;
  color: $uni-text-color-grey;
}

.edit-row {
  margin-top: 14rpx;
  display: flex;
  gap: 10rpx;
  align-items: center;
}

.name-input {
  flex: 1;
  height: 82rpx;
  border-radius: 14rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  padding: 0 18rpx;
  font-size: 26rpx;
  color: #0f172a;
}

.save-btn {
  height: 74rpx;
  line-height: 74rpx;
  border-radius: 999rpx;
  padding: 0 22rpx;
  background: #0f172a;
  color: #ffffff;
}

.save-btn::after {
  border: none;
}

.action-row {
  margin-top: 10rpx;
  display: flex;
  justify-content: flex-end;
}

.remove-btn {
  height: 62rpx;
  line-height: 62rpx;
  border-radius: 999rpx;
  padding: 0 20rpx;
  color: #dc2626;
  border: 1rpx solid #fecaca;
  background: #fff1f2;
}
</style>

