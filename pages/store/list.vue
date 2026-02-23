<template>
  <view class="store-list-page">
    <view class="page-header">
      <app-nav :showTitle="true" title="选择门店" />

      <view class="tools-wrap">
      <view class="search-box">
        <app-icon class="search-icon-svg" name="search" color="#94A3B8" :size="30" :stroke-width="2.1" />
        <input
          v-model.trim="keyword"
          class="search-input"
          type="text"
          confirm-type="search"
          placeholder="输入店名或地址"
          placeholder-class="search-placeholder"
          @confirm="handleSearch"
        />
      </view>

      <view class="filter-btn" @click="toggleFilter">
        <app-icon class="filter-icon-svg" name="sliders" color="#475569" :size="24" :stroke-width="2.1" />
        <text>筛选</text>
      </view>
    </view>

      <view v-if="showFilter" class="filter-panel">
      <view class="filter-section">
        <text class="filter-label">排序</text>
        <view class="filter-options">
        <view
            v-for="item in sortOptions"
            :key="item.value"
            class="filter-option"
            :class="{ active: sortBy === item.value }"
            @click="selectSort(item.value)"
          >
            {{ item.label }}
          </view>
        </view>
      </view>

      <view class="filter-section">
        <text class="filter-label">评分</text>
        <view class="filter-options">
          <view
            v-for="item in ratingOptions"
            :key="item"
            class="filter-option"
            :class="{ active: minRating === item }"
            @click="selectRating(item)"
          >
            {{ item }}分以上
          </view>
        </view>
      </view>

        <view class="filter-actions">
          <button class="reset-btn" @click="resetFilters">重置</button>
          <button class="apply-btn" @click="applyFilters">应用</button>
        </view>
      </view>
    </view>

    <scroll-view class="page-scroll" scroll-y>
      <view v-if="loading && stores.length === 0" class="status-box">
      <view class="spinner"></view>
      <text>正在加载门店...</text>
    </view>

    <view v-else-if="loaded && stores.length === 0" class="status-box">
      <text class="empty-text">暂时没有找到相关门店</text>
    </view>

      <view v-else class="list-container">
      <view
        v-for="store in stores"
        :key="store._id"
        class="store-card"
        hover-class="store-card-hover"
        @click="goDetail(store._id)"
      >
        <view class="cover-wrap">
          <image class="cover" :src="store.cover || defaultCover" mode="aspectFill" lazy-load />
        </view>

        <view class="card-main">
          <view class="name-row">
            <text class="store-name">{{ store.name || '未命名门店' }}</text>
            <view class="rating-wrap">
              <text class="rating-star">★</text>
              <text class="rating-score">{{ formatRating(store) }}</text>
            </view>
          </view>

          <view class="meta-row">
            <text class="meta-text">{{ formatReviewCount(store) }}</text>
            <text class="meta-text">{{ getBusinessStatusText(store) }}</text>
          </view>

          <text class="address">{{ store.address || '地址暂无' }}</text>

          <view class="tag-row">
            <text v-for="tag in getCardTags(store)" :key="tag" class="tag">{{ tag }}</text>
          </view>
        </view>
      </view>
      </view>
      <view class="scroll-bottom-gap"></view>
    </scroll-view>
  </view>
</template>

<script>
import { fetchStores } from '../../api/store';

/**
 * 门店列表页
 * 功能：
 * 1) 搜索门店
 * 2) 排序/评分筛选
 * 3) 展示营业状态、评分与基础信息
 */
export default {
  data() {
    return {
      // 门店列表数据
      stores: [],
      // 首次/刷新加载状态
      loading: false,
      loaded: false,
      // 搜索关键词
      keyword: '',
      // 筛选面板展开状态
      showFilter: false,
      // 当前排序方式
      sortBy: 'default',
      // 排序配置项
      sortOptions: [
        { label: '默认排序', value: 'default' },
        { label: '评分最高', value: 'rating' },
        { label: '价格优先', value: 'price' }
      ],
      // 筛选项配置
      ratingOptions: [5, 4, 3],
      // 当前筛选值
      minRating: null,
      // 门店封面兜底图
      defaultCover:
        'https://images.unsplash.com/photo-1521590832896-7ea20ade7336?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    };
  },
  onPullDownRefresh() {
    this.loadStores({ noCache: true }).then(() => {
      uni.stopPullDownRefresh();
    });
  },
  onLoad() {
    this.loadStores();
  },
  onShow() {
    this.loadStores({ noCache: true });
  },
  methods: {
    // 搜索框回车触发查询
    handleSearch() {
      this.loadStores();
    },
    // 切换筛选面板显隐
    toggleFilter() {
      this.showFilter = !this.showFilter;
    },
    // 选择排序方式
    selectSort(value) {
      this.sortBy = value;
    },
    // 设置最小评分筛选
    selectRating(rating) {
      this.minRating = rating;
    },
    // 重置筛选条件为默认值
    resetFilters() {
      this.sortBy = 'default';
      this.minRating = null;
    },
    // 应用筛选并刷新列表
    applyFilters() {
      this.showFilter = false;
      this.loadStores();
    },
    // 拉取门店数据并按规则排序展示
    async loadStores(options = {}) {
      this.loading = true;
      try {
        const params = {
          keyword: this.keyword,
          sortBy: this.sortBy,
          minRating: this.minRating,
          noCache: !!options.noCache
        };
        const data = await fetchStores(params);
        let list = Array.isArray(data) ? data : [];
        if (this.sortBy === 'default') {
          list = list.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        }
        this.stores = list;
        this.loaded = true;
      } catch (err) {
        this.loaded = true;
        uni.showToast({ title: err.message || '加载门店失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    // 评分格式化
    formatRating(store) {
      if (!store.rating || !store.rating.overall) return '5.0';
      return Number(store.rating.overall).toFixed(1);
    },
    // 评价数量格式化（大于千用 k）
    formatReviewCount(store) {
      if (!store.rating || !store.rating.count) return '暂无评价';
      const count = Number(store.rating.count || 0);
      if (count >= 1000) return `评价 ${(count / 1000).toFixed(1)}k`;
      return `评价 ${count}`;
    },
    // 获取今天营业时间文本（工作日/周末）
    getTodayHours(store) {
      if (!store || !store.businessHours) return '未设置';
      const day = new Date().getDay();
      const source = day === 0 || day === 6 ? store.businessHours.weekend : store.businessHours.weekday;
      return source || '未设置';
    },
    // 将营业时间文本解析为分钟区间
    parseBusinessRange(rangeText) {
      const text = String(rangeText || '').trim();
      if (!text) return null;
      const matched = text.match(/(\d{1,2}):(\d{2})\s*[-~到至]\s*(\d{1,2}):(\d{2})/);
      if (!matched) return null;
      const startHour = Number(matched[1]);
      const startMinute = Number(matched[2]);
      const endHour = Number(matched[3]);
      const endMinute = Number(matched[4]);
      if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) {
        return null;
      }
      return {
        start: startHour * 60 + startMinute,
        end: endHour * 60 + endMinute
      };
    },
    // 根据当前时间判断门店营业状态
    getBusinessStatus(store) {
      const todayHours = this.getTodayHours(store);
      const range = this.parseBusinessRange(todayHours);
      if (!range) return 'unknown';
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (range.end < range.start) {
        return minutes >= range.start || minutes <= range.end ? 'open' : 'closed';
      }
      return minutes >= range.start && minutes <= range.end ? 'open' : 'closed';
    },
    // 营业状态文案
    getBusinessStatusText(store) {
      const status = this.getBusinessStatus(store);
      if (status === 'open') return '营业中';
      if (status === 'closed') return '休息中';
      return '待设置';
    },
    // 卡片标签：优先使用门店 tags，否则回退为状态 + 起价
    getCardTags(store) {
      const tags = Array.isArray(store && store.tags) ? store.tags.filter((t) => !!t).slice(0, 2) : [];
      if (tags.length > 0) return tags;
      return [this.getBusinessStatusText(store), `¥${Number((store && store.minPrice) || 0) || '面议'}起`];
    },
    // 跳转门店详情
    goDetail(id) {
      if (!id) return;
      uni.navigateTo({ url: `/pages/store/detail?id=${id}` });
    }
  }
};
</script>

<style scoped lang="scss">
.store-list-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  box-sizing: border-box;
}

.page-header {
  flex-shrink: 0;
  padding: calc(112rpx + 20px) 20rpx 0;
}

.tools-wrap {
  display: flex;
  gap: 12rpx;
  padding: 8rpx 8rpx 14rpx;
  background: #f8fafc;
}

.page-scroll {
  flex: 1;
  min-height: 0;
}

.search-box {
  flex: 1;
  height: 80rpx;
  background: #ffffff;
  border: 1rpx solid #e2e8f0;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  padding: 0 18rpx;
}

.search-icon-svg {
  margin-right: 8rpx;
}

.search-input {
  flex: 1;
  min-width: 0;
  font-size: 25rpx;
  color: #334155;
}

.search-placeholder {
  color: #94a3b8;
}

.filter-btn {
  height: 80rpx;
  padding: 0 20rpx;
  border-radius: 18rpx;
  border: 1rpx solid #e2e8f0;
  background: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  font-size: 24rpx;
  color: #475569;
}

.filter-panel {
  background: #ffffff;
  border-radius: 20rpx;
  border: 1rpx solid #e2e8f0;
  box-shadow: 0 10rpx 24rpx rgba(15, 23, 42, 0.06);
  padding: 18rpx;
  margin: 0 8rpx 14rpx;
}

.filter-section {
  margin-bottom: 16rpx;
}

.filter-section:last-of-type {
  margin-bottom: 0;
}

.filter-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 24rpx;
  color: #334155;
  font-weight: 600;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.filter-option {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  border: 1rpx solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  font-size: 22rpx;
}

.filter-option.active {
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
}

.filter-actions {
  margin-top: 16rpx;
  display: flex;
  gap: 10rpx;
}

.reset-btn,
.apply-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 14rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reset-btn {
  background: #f8fafc;
  color: #475569;
}

.apply-btn {
  background: #0f172a;
  color: #ffffff;
}

.status-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
  color: #94a3b8;
  font-size: 24rpx;
}

.spinner {
  width: 38rpx;
  height: 38rpx;
  border: 4rpx solid #e2e8f0;
  border-top-color: #0f172a;
  border-radius: 999rpx;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16rpx;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.list-container {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 0 8rpx;
}

.store-card {
  background: #ffffff;
  border-radius: 22rpx;
  border: 1rpx solid #e2e8f0;
  box-shadow: 0 6rpx 16rpx rgba(15, 23, 42, 0.04);
  display: flex;
  gap: 12rpx;
  padding: 12rpx;
}

.store-card-hover {
  transform: scale(0.99);
}

.cover-wrap {
  width: 188rpx;
  height: 188rpx;
  border-radius: 16rpx;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  background: #f1f5f9;
}

.cover {
  width: 100%;
  height: 100%;
}

.card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 2rpx 0;
}

.name-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8rpx;
}

.store-name {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  color: #0f172a;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rating-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2rpx;
}

.rating-star {
  color: #f59e0b;
  font-size: 20rpx;
}

.rating-score {
  color: #0f172a;
  font-size: 22rpx;
  font-weight: 700;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 6rpx;
}

.meta-text {
  font-size: 20rpx;
  color: #94a3b8;
}

.address {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-row {
  margin-top: 10rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 6rpx;
}

.tag {
  font-size: 18rpx;
  color: #0f766e;
  background: #ecfdf5;
  border: 1rpx solid #d1fae5;
  border-radius: 999rpx;
  padding: 4rpx 10rpx;
}

.scroll-bottom-gap {
  height: 24rpx;
}
</style>
