<template>
  <view class="page">
    <!-- 吸顶头部：导航栏 + 功能说明 Banner -->
    <view class="page-header">
      <app-nav :showTitle="true" title="理发师项目设置" />
      <!-- 页面说明 Banner -->
      <view class="hero-card">
        <text class="hero-subtitle">为门店理发师配置可承接的服务项目</text>
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y>
      <!-- 加载中占位 -->
      <view v-if="loading" class="hint">加载中...</view>
      <!-- 无服务项目提示（需先在门店设置中新增） -->
      <view v-else-if="services.length === 0" class="hint">当前门店暂无服务项目，请先到门店设置里新增服务</view>
      <!-- 无理发师提示 -->
      <view v-else-if="barbers.length === 0" class="hint">当前门店暂无理发师</view>

      <!-- 理发师卡片列表：每张卡片对应一位理发师，包含服务项目多选标签 -->
      <view v-else class="list">
        <view v-for="barber in barbers" :key="barber._id" class="card">
          <!-- 理发师信息行：头像 + 名称 + 账号 + 清空按钮 -->
          <view class="header">
            <view class="identity">
              <image
                v-if="normalizeAvatar(barber.avatar)"
                class="avatar"
                :src="normalizeAvatar(barber.avatar)"
                mode="aspectFill"
                @error="onAvatarError(barber._id)"
              />
              <view v-else class="avatar avatar-fallback">
                <text class="avatar-text">{{ avatarInitial(barber) }}</text>
              </view>
              <view class="meta">
                <text class="name">{{ barber.username || barber.name || '理发师' }}</text>
                <text class="sub">账号：{{ barber.username || '-' }}</text>
              </view>
            </view>
            <text class="clear" @click="clearBarber(barber._id)">清空</text>
          </view>

          <!-- 服务项目标签组：已选中的标签高亮，点击切换选中状态 -->
          <view class="chips">
            <view
              v-for="service in services"
              :key="service._id"
              class="chip"
              :class="{ active: hasService(barber._id, service._id) }"
              @click="toggleService(barber._id, service._id)"
            >
              {{ service.name }}
            </view>
          </view>
        </view>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>

    <!-- 底部操作栏：统一提交所有理发师的服务配置 -->
    <view class="action-bar">
      <button class="save-btn" :loading="saving" @click="saveAssignments">保存配置</button>
    </view>
  </view>
</template>

<script>
import { fetchStoreServices, fetchStoreBarbers, setStoreBarberServices } from '../../../api/store';
import { me } from '../../../api/auth';
import { authStore } from '../../../store/auth';

// 归一化 ID 数组：去空、去重、转字符串
function normalizeIds(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach((item) => {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

/**
 * 理发师服务绑定页（管理员）
 * 用于为每位理发师配置“可承接服务项目”。
 */
export default {
  data() {
    return {
      // 页面加载态
      loading: false,
      // 保存提交态
      saving: false,
      // 当前管理员所属门店 ID
      storeId: '',
      // 门店服务列表
      services: [],
      // 门店理发师列表
      barbers: [],
      // 选中关系映射：{ barberId: serviceIds[] }
      selectedMap: {}
    };
  },
  onShow() {
    this.loadData();
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
      const text = this.avatarName(item);
      const first = text.slice(0, 1);
      return /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
    },
    onAvatarError(barberId) {
      const id = String(barberId || '');
      if (!id) return;
      this.barbers = (this.barbers || []).map((item) => {
        if (String(item && item._id) !== id) return item;
        return { ...item, avatar: '' };
      });
    },
    // 获取并确保当前账号的 storeId
    async ensureStoreId() {
      let user = authStore.state.user || {};
      if (!user.storeId) {
        const profile = await me();
        user = profile || {};
        authStore.setUser(profile || null);
      }
      return user.storeId || '';
    },
    // 加载服务与理发师数据，并初始化已选关系
    async loadData() {
      this.loading = true;
      try {
        const storeId = await this.ensureStoreId();
        if (!storeId) {
          uni.showToast({ title: '当前账号未绑定门店', icon: 'none' });
          this.services = [];
          this.barbers = [];
          return;
        }
        this.storeId = storeId;
        const [services, barbers] = await Promise.all([
          fetchStoreServices(storeId, { noCache: true }),
          fetchStoreBarbers(storeId, { noCache: true })
        ]);

        this.services = Array.isArray(services) ? services : [];
        this.barbers = (Array.isArray(barbers) ? barbers : []).map((item) => ({
          ...item,
          serviceIds: normalizeIds(item && item.serviceIds)
        }));

        const validServiceSet = new Set(this.services.map((item) => item && item._id).filter((id) => !!id));
        const selectedMap = {};
        this.barbers.forEach((barber) => {
          const ids = normalizeIds(barber.serviceIds).filter((id) => validServiceSet.has(id));
          selectedMap[barber._id] = ids;
        });
        this.selectedMap = selectedMap;
      } catch (err) {
        this.services = [];
        this.barbers = [];
        this.selectedMap = {};
        uni.showToast({ title: err.message || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    // 判断某理发师是否已绑定某服务
    hasService(barberId, serviceId) {
      const ids = this.selectedMap[barberId] || [];
      return ids.includes(serviceId);
    },
    // 切换服务选中状态
    toggleService(barberId, serviceId) {
      const list = normalizeIds(this.selectedMap[barberId] || []);
      const idx = list.findIndex((id) => id === serviceId);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push(serviceId);
      }
      this.selectedMap = {
        ...this.selectedMap,
        [barberId]: list
      };
    },
    // 清空某理发师的全部服务绑定
    clearBarber(barberId) {
      this.selectedMap = {
        ...this.selectedMap,
        [barberId]: []
      };
    },
    // 构建提交参数
    buildAssignments() {
      return this.barbers.map((barber) => ({
        barberId: barber._id,
        serviceIds: normalizeIds(this.selectedMap[barber._id] || [])
      }));
    },
    // 保存绑定关系到后端
    async saveAssignments() {
      if (this.saving) return;
      if (!this.storeId) {
        uni.showToast({ title: '门店信息缺失', icon: 'none' });
        return;
      }
      this.saving = true;
      try {
        const assignments = this.buildAssignments();
        await setStoreBarberServices(assignments, { overwriteAll: true });
        uni.showToast({ title: '保存成功', icon: 'success' });
        await this.loadData();
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
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.82);
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

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.identity {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.avatar {
  width: 84rpx;
  height: 84rpx;
  border-radius: 42rpx;
  background: #f2f4f8;
  flex-shrink: 0;
}

.avatar-fallback {
  background: #0f172a;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-text {
  font-size: 34rpx;
  font-weight: 700;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 700;
  color: $uni-text-color;
}

.sub {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
}

.clear {
  color: $uni-color-error;
  font-size: $uni-font-size-sm;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.chip {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
  background: #f5f7fb;
  border: 1rpx solid #d9deea;
}

.chip.active {
  color: #1b5e20;
  background: #f0f9eb;
  border-color: #7ac943;
}

.action-bar {
  flex-shrink: 0;
  padding: 14rpx 0 10rpx;
  background: linear-gradient(to bottom, rgba(246, 247, 251, 0), rgba(246, 247, 251, 1) 30%);
}

.scroll-bottom-gap {
  height: 24rpx;
}

.save-btn {
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 46rpx;
  background: $uni-color-primary;
  color: #ffffff;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.save-btn::after {
  border: none;
}
</style>
