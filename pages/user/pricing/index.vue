<template>
  <view class="pricing-page">
    <app-nav :showTitle="true" title="价目表" />

    <view class="pricing-content">
      <view class="hero-card">
        <text class="hero-title">透明报价</text>
        <text class="hero-subtitle">所有项目明码标价，预约前先看清楚价格与时长</text>
      </view>

      <scroll-view class="category-scroll" scroll-x>
        <view class="category-row">
          <view
            v-for="tab in categories"
            :key="tab.key"
            class="category-pill"
            :class="{ active: activeCategory === tab.key }"
            @click="activeCategory = tab.key"
          >
            {{ tab.label }}
          </view>
        </view>
      </scroll-view>

      <view v-if="loading" class="hint">加载中...</view>
      <view v-else-if="filteredServices.length === 0" class="hint">暂无价目数据</view>

      <view v-else class="pricing-list">
        <view v-for="item in filteredServices" :key="item.id" class="service-card">
          <view class="service-main">
            <text class="service-name">{{ item.name }}</text>
            <text class="service-desc">{{ item.desc }}</text>

            <view class="service-tags">
              <text v-for="tag in item.tags" :key="tag" class="service-tag">{{ tag }}</text>
            </view>
          </view>

          <view class="service-side">
            <text class="service-price">¥{{ item.price }}</text>
            <text class="service-duration">{{ item.duration }}分钟</text>
            <view class="book-btn" @click="goCreateOrder(item)">去预约</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { fetchStores, fetchStoreServices } from '../../../api/store';

function inferCategory(serviceName = '') {
  const name = String(serviceName || '').toLowerCase();
  if (/剪|cut|trim/.test(name)) return 'haircut';
  if (/染|color/.test(name)) return 'color';
  if (/烫|perm/.test(name)) return 'perm';
  if (/护|养|头皮|care|spa/.test(name)) return 'care';
  return 'all';
}

export default {
  data() {
    return {
      loading: false,
      activeCategory: 'all',
      categories: [
        { key: 'all', label: '全部' },
        { key: 'haircut', label: '剪发' },
        { key: 'color', label: '染发' },
        { key: 'perm', label: '烫发' },
        { key: 'care', label: '护理' }
      ],
      services: []
    };
  },
  onShow() {
    this.loadPricing();
  },
  computed: {
    filteredServices() {
      if (this.activeCategory === 'all') return this.services;
      return this.services.filter((item) => item.category === this.activeCategory);
    }
  },
  methods: {
    async loadPricing() {
      this.loading = true;
      try {
        const stores = await fetchStores({ page: 1, pageSize: 50, noCache: true });
        const listByStore = await Promise.all(
          (Array.isArray(stores) ? stores : []).map(async (store) => {
            const storeId = (store && store._id) || '';
            if (!storeId) return [];
            const rows = await fetchStoreServices(storeId, { noCache: true });
            const storeName = (store && store.name) || '门店';
            return (Array.isArray(rows) ? rows : []).map((svc) => ({
              id: svc._id || '',
              storeId,
              category: inferCategory(svc.name),
              name: svc.name || '未命名服务',
              desc: svc.description || '服务详情请到门店咨询',
              duration: Number(svc.duration || 0),
              price: Number(svc.price || 0),
              tags: [storeName]
            }));
          })
        );
        const merged = listByStore.flat();
        this.services = merged
          .filter((item) => item.id && item.storeId)
          .sort((a, b) => a.price - b.price);
      } catch (err) {
        this.services = [];
        uni.showToast({ title: err.message || '加载价目失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    goCreateOrder(item) {
      if (!item || !item.storeId || !item.id) return;
      uni.navigateTo({
        url: `/pages/order/create?storeId=${item.storeId}&serviceId=${item.id}`
      });
    }
  }
};
</script>

<style scoped lang="scss">
.pricing-page {
  min-height: 100vh;
  background: #f8fafc;
}

.pricing-content {
  padding: calc(118rpx + 20px) 28rpx 32rpx;
}

.hero-card {
  border-radius: 28rpx;
  padding: 26rpx;
  background: linear-gradient(140deg, #0f172a, #1e293b);
  box-shadow: 0 18rpx 40rpx rgba(15, 23, 42, 0.2);
}

.hero-title {
  display: block;
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 800;
}

.hero-subtitle {
  display: block;
  margin-top: 10rpx;
  color: rgba(255, 255, 255, 0.82);
  font-size: 24rpx;
  line-height: 1.55;
}

.category-scroll {
  margin-top: 20rpx;
  white-space: nowrap;
}

.category-row {
  display: inline-flex;
  gap: 10rpx;
  padding-right: 20rpx;
}

.category-pill {
  min-width: 96rpx;
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  border: 1rpx solid rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  text-align: center;
  font-size: 22rpx;
  font-weight: 600;
}

.category-pill.active {
  color: #0f172a;
  border-color: #cbd5e1;
  background: #ffffff;
  box-shadow: 0 6rpx 16rpx rgba(15, 23, 42, 0.08);
}

.pricing-list {
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.hint {
  margin-top: 20rpx;
  text-align: center;
  color: #94a3b8;
  font-size: 24rpx;
  padding: 36rpx 0;
}

.service-card {
  background: #ffffff;
  border-radius: 24rpx;
  border: 1rpx solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 10rpx 24rpx rgba(15, 23, 42, 0.06);
  padding: 20rpx;
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
}

.service-main {
  flex: 1;
  min-width: 0;
}

.service-name {
  display: block;
  font-size: 30rpx;
  color: #0f172a;
  font-weight: 700;
}

.service-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #64748b;
  line-height: 1.5;
}

.service-tags {
  margin-top: 12rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.service-tag {
  font-size: 20rpx;
  color: #475569;
  background: #f1f5f9;
  border-radius: 999rpx;
  padding: 6rpx 14rpx;
}

.service-side {
  width: 164rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.service-price {
  font-size: 36rpx;
  line-height: 1.2;
  color: #0f172a;
  font-weight: 800;
}

.service-duration {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #94a3b8;
}

.book-btn {
  margin-top: auto;
  min-width: 122rpx;
  height: 56rpx;
  border-radius: 999rpx;
  background: #0f172a;
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
