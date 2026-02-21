<template>
  <view class="search-page">
    <app-nav />
    <view class="header-section">
      <text class="page-title">搜索门店</text>
      <text class="page-subtitle">支持关键词与筛选条件</text>
    </view>

    <view class="search-bar">
      <view class="search-input-wrapper">
        <app-icon class="search-icon-svg" name="search" color="#94A3B8" :size="28" :stroke-width="2.1" />
        <input
          class="search-input"
          v-model="keyword"
          placeholder="搜索门店、发型师..."
          confirm-type="search"
          @focus="onFocus"
          @blur="onBlur"
          @input="onKeywordInput"
          @confirm="handleSearch"
        />
        <text v-if="keyword" class="clear-icon" @click="clearSearch">✕</text>
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

      <view class="filter-section">
        <text class="filter-label">距离</text>
        <view class="filter-options">
          <view
            v-for="item in distanceOptions"
            :key="item"
            class="filter-option"
            :class="{ active: maxDistance === item }"
            @click="selectDistance(item)"
          >
            {{ item }}km内
          </view>
        </view>
      </view>

      <view class="filter-section">
        <text class="filter-label">价格</text>
        <view class="filter-options">
          <view
            v-for="item in priceOptions"
            :key="item"
            class="filter-option"
            :class="{ active: maxPrice === item }"
            @click="selectPrice(item)"
          >
            ¥{{ item }}以内
          </view>
        </view>
      </view>

      <view class="filter-actions">
        <button class="reset-btn" @click="resetFilters">重置</button>
        <button type="primary" @click="applyFilters">应用</button>
      </view>
    </view>

    <view v-if="showHistory" class="history-box">
      <view class="history-header">
        <text class="history-title">搜索历史</text>
        <text class="history-clear" @click="clearHistory">清空</text>
      </view>
      <view class="history-tags">
        <view
          v-for="item in history"
          :key="item"
          class="history-tag"
          @click="useHistory(item)"
        >
          {{ item }}
        </view>
      </view>
    </view>

    <view v-if="loading" class="status-box">
      <view class="spinner"></view>
      <text>搜索中...</text>
    </view>

    <view v-else-if="searched && stores.length === 0" class="status-box">
      <text class="empty-text">没有找到相关门店</text>
    </view>

    <view v-else-if="stores.length > 0" class="list-container">
      <view
        v-for="store in stores"
        :key="store._id"
        class="store-card"
        @click="goDetail(store._id)"
        hover-class="store-card-hover"
      >
        <view class="image-wrapper">
          <image
            class="store-cover"
            :src="store.cover || defaultCover"
            mode="aspectFill"
            lazy-load
          />
          <view class="badge-status">
            <text class="status-dot"></text> 营业中
          </view>
          <view v-if="isRecommendMode" class="badge-recommend">推荐</view>
          <view class="badge-rating">★ {{ formatRating(store) }}</view>
          <view v-if="store.distance !== null && store.distance !== undefined" class="badge-distance">
            <app-icon name="map-pin" color="#FFFFFF" :size="17" :stroke-width="2.2" />
            <text>{{ formatDistance(store.distance) }}</text>
          </view>
        </view>

        <view class="info-content">
          <view class="main-info">
            <text class="store-name">{{ store.name }}</text>
            <view v-if="store.tags && store.tags.length > 0" class="store-tags">
              <text v-for="(tag, idx) in store.tags.slice(0, 3)" :key="idx" class="tag">
                {{ tag }}
              </text>
            </view>
            <text class="store-address">{{ store.address || '地址暂无' }}</text>
          </view>
          <view class="footer-info">
            <view class="price-info">
              <text v-if="store.minPrice" class="price">¥{{ store.minPrice }}起</text>
              <text class="review-count">{{ formatReviewCount(store) }}</text>
            </view>
            <view class="book-btn">预订</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
// 门店搜索页：
// - 空关键词时展示推荐列表
// - 输入时展示历史记录与筛选
// - 支持排序/评分/距离/价格过滤
import { fetchStores } from '../../api/store';

export default {
  data() {
    return {
      stores: [],
      loading: false,
      searched: false,
      // 是否处于“推荐模式”（无关键词）
      isRecommendMode: true,
      // 搜索关键词（输入框）
      keyword: '',
      // 历史记录（本地缓存）
      history: [],
      // 输入框聚焦态：控制历史记录显示
      focused: false,
      showFilter: false,
      sortBy: 'default',
      sortOptions: [
        { label: '默认排序', value: 'default' },
        { label: '距离最近', value: 'distance' },
        { label: '评分最高', value: 'rating' },
        { label: '价格优先', value: 'price' }
      ],
      ratingOptions: [5, 4, 3],
      distanceOptions: [1, 3, 5],
      priceOptions: [50, 100, 200],
      minRating: null,
      maxDistance: null,
      maxPrice: null,
      userLat: null,
      userLng: null,
      defaultCover: 'https://images.unsplash.com/photo-1521590832896-7ea20ade7336?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    };
  },
  onLoad(options) {
    if (options && options.keyword) {
      this.keyword = options.keyword;
      this.handleSearch();
    }
    this.getUserLocation();
    this.loadHistory();
    if (!this.keyword) {
      this.loadStores();
    }
  },
  methods: {
    // 获取用户位置，用于距离筛选与展示
    getUserLocation() {
      uni.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.userLat = res.latitude;
          this.userLng = res.longitude;
        },
        fail: () => {
          console.log('获取位置失败，将不显示距离信息');
        }
      });
    },
    // 执行搜索：保存历史并触发加载
    handleSearch() {
      const kw = (this.keyword || '').trim();
      if (kw) {
        this.saveHistory(kw);
      }
      this.loadStores();
    },
    // 清空搜索：回到推荐模式
    clearSearch() {
      this.keyword = '';
      this.searched = false;
      this.isRecommendMode = true;
      this.stores = [];
      this.loadStores();
    },
    // 输入监听：有关键词时清空列表等待搜索
    onKeywordInput(e) {
      const value = (e && e.detail && e.detail.value) || '';
      this.keyword = value;
      if (value) {
        this.isRecommendMode = false;
        this.searched = false;
        this.stores = [];
      } else {
        this.clearSearch();
      }
    },
    // 记录聚焦状态，显示历史
    onFocus() {
      this.focused = true;
    },
    // 失焦时隐藏历史
    onBlur() {
      this.focused = false;
    },
    // 读取本地缓存的搜索历史
    loadHistory() {
      const cached = uni.getStorageSync('search_history');
      this.history = Array.isArray(cached) ? cached : [];
    },
    // 保存历史记录，去重并控制数量
    saveHistory(keyword) {
      const list = this.history.filter((item) => item !== keyword);
      list.unshift(keyword);
      this.history = list.slice(0, 10);
      uni.setStorageSync('search_history', this.history);
    },
    // 清空历史记录
    clearHistory() {
      this.history = [];
      uni.setStorageSync('search_history', []);
    },
    // 点击历史项触发搜索
    useHistory(keyword) {
      this.keyword = keyword;
      this.handleSearch();
    },
    // 切换筛选面板
    toggleFilter() {
      this.showFilter = !this.showFilter;
    },
    selectSort(value) {
      this.sortBy = value;
    },
    selectRating(rating) {
      this.minRating = rating;
    },
    selectDistance(distance) {
      this.maxDistance = distance;
    },
    selectPrice(price) {
      this.maxPrice = price;
    },
    resetFilters() {
      this.sortBy = 'default';
      this.minRating = null;
      this.maxDistance = null;
      this.maxPrice = null;
    },
    applyFilters() {
      this.showFilter = false;
      this.loadStores();
    },
    // 拉取门店列表：无关键词时走推荐逻辑
    async loadStores() {
      this.loading = true;
      try {
        const hasKeyword = !!this.keyword;
        this.isRecommendMode = !hasKeyword;
        const params = {
          keyword: hasKeyword ? this.keyword : '',
          sortBy: hasKeyword ? this.sortBy : 'default',
          minRating: hasKeyword ? this.minRating : null,
          maxDistance: hasKeyword ? this.maxDistance : null,
          maxPrice: hasKeyword ? this.maxPrice : null,
          userLat: this.userLat,
          userLng: this.userLng
        };
        const data = await fetchStores(params);
        let list = Array.isArray(data) ? data : [];
        if (!hasKeyword) {
          // 推荐模式下默认按名称排序
          list = list.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        }
        this.stores = list;
        this.searched = true;
      } catch (err) {
        uni.showToast({
          title: err.message || '搜索失败',
          icon: 'none'
        });
        this.searched = true;
      } finally {
        this.loading = false;
      }
    },
    formatRating(store) {
      if (!store.rating || !store.rating.overall) return '5.0';
      return store.rating.overall.toFixed(1);
    },
    formatDistance(distance) {
      if (distance === null || distance === undefined) return '';
      if (distance < 1) return `${Math.round(distance * 1000)}m`;
      return `${distance.toFixed(1)}km`;
    },
    formatReviewCount(store) {
      if (!store.rating || !store.rating.count) return '暂无评价';
      const count = store.rating.count;
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k条评价`;
      return `${count}条评价`;
    },
    goDetail(id) {
      if (!id) return;
      uni.navigateTo({ url: `/pages/store/detail?id=${id}` });
    }
  }
};
</script>

<style scoped lang="scss">
.search-page {
  min-height: 100vh;
  padding: 120rpx 30rpx 30rpx;
  background-color: $uni-bg-color-grey;
}

.header-section {
  margin-bottom: 20rpx;
  padding-left: 10rpx;

  .page-title {
    display: block;
    font-size: 48rpx;
    font-weight: 700;
    color: $uni-color-primary;
    margin-bottom: 8rpx;
  }

  .page-subtitle {
    display: block;
    color: $uni-text-color-grey;
    font-size: $uni-font-size-base;
  }
}

.search-bar {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;

  .search-input-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    background-color: #ffffff;
    border-radius: $uni-border-radius-lg;
    padding: 16rpx 24rpx;
    box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.06);

    .search-icon-svg {
      margin-right: 12rpx;
    }

    .search-input {
      flex: 1;
      font-size: $uni-font-size-base;
      border: none;
    }

    .clear-icon {
      font-size: 28rpx;
      color: $uni-text-color-grey;
      padding: 0 8rpx;
    }
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 8rpx;
    background-color: #ffffff;
    border-radius: $uni-border-radius-lg;
    padding: 16rpx 24rpx;
    font-size: $uni-font-size-base;
    box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.06);

    .filter-icon-svg {
      margin-right: 2rpx;
    }
  }
}

.filter-panel {
  background-color: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.08);

  .filter-section {
    margin-bottom: 24rpx;

    &:last-of-type {
      margin-bottom: 0;
    }

    .filter-label {
      display: block;
      font-size: $uni-font-size-base;
      font-weight: 600;
      color: $uni-text-color;
      margin-bottom: 16rpx;
    }

    .filter-options {
      display: flex;
      flex-wrap: wrap;
      gap: 12rpx;

      .filter-option {
        padding: 12rpx 24rpx;
        background-color: $uni-bg-color-grey;
        border-radius: $uni-border-radius-lg;
        font-size: $uni-font-size-sm;
        color: $uni-text-color-grey;
        border: 2rpx solid transparent;
        transition: all 0.2s;

        &.active {
          background-color: rgba(82, 196, 26, 0.1);
          color: $uni-color-success;
          border-color: $uni-color-success;
        }
      }
    }
  }

  .filter-actions {
    display: flex;
    gap: 16rpx;
    margin-top: 24rpx;

    button {
      flex: 1;
      font-size: $uni-font-size-base;
      height: 80rpx;
      line-height: 80rpx;
      border-radius: 40rpx;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .reset-btn {
      background-color: #ffffff;
      color: $uni-text-color-grey;
      border: 2rpx solid $uni-border-color;
    }
  }
}

.history-box {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.06);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.history-title {
  font-size: $uni-font-size-base;
  font-weight: 600;
  color: $uni-text-color;
}

.history-clear {
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
}

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.history-tag {
  background: $uni-bg-color-grey;
  color: $uni-text-color;
  font-size: $uni-font-size-sm;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
}

.status-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100rpx 0;

  .spinner {
    width: 40rpx;
    height: 40rpx;
    border: 4rpx solid #ddd;
    border-top-color: $uni-color-primary;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 20rpx;
  }

  .empty-text {
    color: $uni-text-color-grey;
    font-size: $uni-font-size-base;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.list-container {
  display: flex;
  flex-direction: column;
  gap: 30rpx;
}

.store-card {
  background-color: #ffffff;
  border-radius: $uni-border-radius-lg;
  overflow: hidden;
  box-shadow: $uni-shadow-base;
  transform: translateZ(0);
  transition: transform 0.2s;

  .image-wrapper {
    position: relative;
    width: 100%;
    height: 320rpx;

    .store-cover {
      width: 100%;
      height: 100%;
    }

    .badge-status {
      position: absolute;
      left: 16rpx;
      top: 16rpx;
      background: rgba(0, 0, 0, 0.6);
      color: #ffffff;
      font-size: 22rpx;
      padding: 6rpx 12rpx;
      border-radius: 16rpx;
      display: flex;
      align-items: center;
      gap: 6rpx;

      .status-dot {
        width: 8rpx;
        height: 8rpx;
        border-radius: 50%;
        background-color: #52c41a;
      }
    }

    .badge-rating {
      position: absolute;
      right: 16rpx;
      top: 16rpx;
      background: rgba(255, 255, 255, 0.85);
      color: #fa8c16;
      font-size: 22rpx;
      padding: 6rpx 12rpx;
      border-radius: 16rpx;
    }

    .badge-recommend {
      position: absolute;
      right: 16rpx;
      top: 60rpx;
      background: rgba(82, 196, 26, 0.9);
      color: #ffffff;
      font-size: 22rpx;
      padding: 6rpx 12rpx;
      border-radius: 16rpx;
    }

    .badge-distance {
      position: absolute;
      right: 16rpx;
      bottom: 16rpx;
      background: rgba(0, 0, 0, 0.6);
      color: #ffffff;
      font-size: 22rpx;
      padding: 6rpx 12rpx;
      border-radius: 16rpx;
      display: inline-flex;
      align-items: center;
      gap: 6rpx;
    }
  }

  .info-content {
    padding: 20rpx 24rpx;

    .main-info {
      .store-name {
        font-size: 34rpx;
        font-weight: 700;
        color: $uni-text-color;
        display: block;
      }

      .store-tags {
        display: flex;
        gap: 8rpx;
        margin: 10rpx 0;

        .tag {
          background: #f5f5f5;
          color: $uni-text-color-grey;
          font-size: 22rpx;
          padding: 4rpx 12rpx;
          border-radius: 14rpx;
        }
      }

      .store-address {
        font-size: 24rpx;
        color: $uni-text-color-grey;
        margin-top: 4rpx;
      }
    }

    .footer-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 16rpx;

      .price-info {
        display: flex;
        align-items: center;
        gap: 12rpx;

        .price {
          font-size: 28rpx;
          color: $uni-color-primary;
          font-weight: 700;
        }

        .review-count {
          font-size: 22rpx;
          color: $uni-text-color-grey;
        }
      }

      .book-btn {
        background: $uni-color-primary;
        color: #ffffff;
        font-size: 24rpx;
        padding: 8rpx 18rpx;
        border-radius: 20rpx;
      }
    }
  }
}
</style>
