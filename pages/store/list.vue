<template>
  <view class="store-list-page">
    <!-- 自定义顶部导航：门店列表需要返回按钮，采用浮层样式更贴近设计稿 -->
    <app-nav />
    <!-- 头部区域：标题与简介 -->
    <view class="header-section">
      <text class="page-title">精选沙龙</text>
      <text class="page-subtitle">专业服务，从“头”开始</text>
    </view>

    <!-- 筛选 -->
    <view class="filter-bar">
      <view class="filter-btn" @click="toggleFilter">
        <text class="filter-icon">⚙</text>
        <text>筛选</text>
      </view>
    </view>

    <!-- 筛选面板：排序/评分/距离/价格 -->
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

    <!-- 状态展示：加载中/空数据 -->
    <view v-if="loading" class="status-box">
      <view class="spinner"></view>
      <text>正在寻找附近的门店...</text>
    </view>

    <view v-else-if="!loaded" class="status-box">
      <text class="empty-text">正在自动加载门店</text>
    </view>
    
    <view v-else-if="stores.length === 0" class="status-box">
      <text class="empty-text">暂时没有找到相关门店</text>
    </view>

    <!-- 门店列表区域 -->
    <view v-else class="list-container">
      <view
        v-for="store in stores"
        :key="store._id"
        class="store-card"
        @click="goDetail(store._id)"
        hover-class="store-card-hover"
      >
        <!-- 封面图区域 -->
        <view class="image-wrapper">
          <image 
            class="store-cover" 
            :src="store.cover || defaultCover" 
            mode="aspectFill"
            lazy-load
          />
          <!-- 标签：评分/距离/价格 -->
          <view class="badge-status">
            <text
              class="status-dot"
              :class="{
                closed: getBusinessStatus(store) === 'closed',
                unknown: getBusinessStatus(store) === 'unknown'
              }"
            ></text>
            {{ getBusinessStatusText(store) }}
          </view>
          <view class="badge-rating">
            ★ {{ formatRating(store) }}
          </view>
          <view v-if="store.distance !== null && store.distance !== undefined" class="badge-distance">
            📍 {{ formatDistance(store.distance) }}
          </view>
        </view>
        
        <!-- 内容区域 -->
        <view class="info-content">
          <view class="main-info">
            <text class="store-name">{{ store.name }}</text>
            
            <!-- 标签展示 -->
            <view v-if="store.tags && store.tags.length > 0" class="store-tags">
              <text v-for="(tag, idx) in store.tags.slice(0, 3)" :key="idx" class="tag">
                {{ tag }}
              </text>
            </view>
            
            <text class="store-address">{{ store.address || '地址暂无' }}</text>
            <view class="store-hours">
              <text class="hours-icon">🕒</text>
              <text class="hours-text">今日 {{ getTodayHours(store) }}</text>
            </view>
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
/**
 * 门店列表页
 * 展示所有可用门店，支持搜索、筛选、排序
 */
import { fetchStores } from '../../api/store';

export default {
  data() {
    return {
      stores: [],
      loading: false,
      loaded: false,
      // 搜索关键词
      keyword: '',
      // 筛选面板显示状态
      showFilter: false,
      // 排序方式
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
      // 筛选条件
      minRating: null,
      maxDistance: null,
      maxPrice: null,
      // 用户位置
      userLat: null,
      userLng: null,
      // 使用更美观的占位图
      defaultCover: 'https://images.unsplash.com/photo-1521590832896-7ea20ade7336?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
    };
  },
  onPullDownRefresh() {
    this.loadStores({ noCache: true }).then(() => {
      uni.stopPullDownRefresh();
    });
  },
  onLoad() {
    // 获取用户位置
    this.getUserLocation();
    this.loadStores();
  },
  onShow() {
    this.loadStores({ noCache: true });
  },
  methods: {
    /**
     * 获取用户位置
     */
    getUserLocation() {
      uni.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.userLat = res.latitude;
          this.userLng = res.longitude;
          // 获取到位置后重新加载门店
          this.loadStores();
        },
        fail: () => {
          // 位置失败时仍可浏览门店，但不显示距离
          console.log('获取位置失败，将不显示距离信息');
        }
      });
    },
    /**
     * 搜索
     */
    handleSearch() {
      this.loadStores();
    },
    /**
     * 清空搜索
     */
    clearSearch() {
      this.keyword = '';
      this.loadStores();
    },
    /**
     * 切换筛选面板
     */
    toggleFilter() {
      this.showFilter = !this.showFilter;
    },
    /**
     * 选择排序方式
     */
    selectSort(value) {
      this.sortBy = value;
    },
    /**
     * 选择评分
     */
    selectRating(rating) {
      this.minRating = rating;
    },
    /**
     * 选择距离
     */
    selectDistance(distance) {
      this.maxDistance = distance;
    },
    /**
     * 选择价格
     */
    selectPrice(price) {
      this.maxPrice = price;
    },
    /**
     * 重置筛选
     */
    resetFilters() {
      this.sortBy = 'default';
      this.minRating = null;
      this.maxDistance = null;
      this.maxPrice = null;
    },
    /**
     * 应用筛选
     */
    applyFilters() {
      this.showFilter = false;
      this.loadStores();
    },
    /**
     * 获取门店数据
     */
    async loadStores(options = {}) {
      this.loading = true;
      try {
        const params = {
          keyword: this.keyword,
          sortBy: this.sortBy,
          minRating: this.minRating,
          maxDistance: this.maxDistance,
          maxPrice: this.maxPrice,
          userLat: this.userLat,
          userLng: this.userLng,
          noCache: !!options.noCache
        };
        const data = await fetchStores(params);
        let list = Array.isArray(data) ? data : [];
        if (this.sortBy === 'default') {
          // 默认排序使用名称拼音顺序，保持列表稳定
          list = list.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        }
        this.stores = list;
        this.loaded = true;
      } catch (err) {
        uni.showToast({
          title: err.message || '加载门店失败',
          icon: 'none'
        });
        this.loaded = true;
      } finally {
        this.loading = false;
      }
    },
    /**
     * 格式化评分
     */
    formatRating(store) {
      if (!store.rating || !store.rating.overall) return '5.0';
      return store.rating.overall.toFixed(1);
    },
    /**
     * 格式化距离
     */
    formatDistance(distance) {
      if (distance === null || distance === undefined) return '';
      if (distance < 1) return `${Math.round(distance * 1000)}米`;
      return `${distance.toFixed(1)}公里`;
    },
    /**
     * 格式化评价数量
     */
    formatReviewCount(store) {
      if (!store.rating || !store.rating.count) return '暂无评价';
      const count = store.rating.count;
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k条评价`;
      return `${count}条评价`;
    },
    /**
     * 获取今日营业时段
     */
    getTodayHours(store) {
      if (!store || !store.businessHours) return '未设置';
      const day = new Date().getDay();
      const source = day === 0 || day === 6
        ? store.businessHours.weekend
        : store.businessHours.weekday;
      return source || '未设置';
    },
    /**
     * 解析营业时段（如 09:00-21:00）
     */
    parseBusinessRange(rangeText) {
      const text = String(rangeText || '').trim();
      if (!text) return null;
      const matched = text.match(/(\d{1,2}):(\d{2})\s*[-~到至]\s*(\d{1,2}):(\d{2})/);
      if (!matched) return null;
      const startHour = Number(matched[1]);
      const startMinute = Number(matched[2]);
      const endHour = Number(matched[3]);
      const endMinute = Number(matched[4]);
      if (
        startHour > 23 || endHour > 23 ||
        startMinute > 59 || endMinute > 59
      ) {
        return null;
      }
      return {
        start: startHour * 60 + startMinute,
        end: endHour * 60 + endMinute
      };
    },
    /**
     * 判断营业状态：open/closed/unknown
     */
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
    /**
     * 营业状态文本
     */
    getBusinessStatusText(store) {
      const status = this.getBusinessStatus(store);
      if (status === 'open') return '营业中';
      if (status === 'closed') return '休息中';
      return '待设置';
    },
    /**
     * 跳转到门店详情
     */
    goDetail(id) {
      if (!id) return;
      uni.navigateTo({ url: `/pages/store/detail?id=${id}` });
    }
  }
};
</script>

<style scoped lang="scss">
.store-list-page {
  min-height: 100vh;
  /* 顶部留白再增加一点点，让标题与返回按钮之间更舒适 */
  padding: 120rpx 30rpx 30rpx;
  background-color: $uni-bg-color-grey;
}

/* 头部样式 */
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

/* 筛选栏样式 */
.filter-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20rpx;

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 8rpx;
    background-color: #ffffff;
    border-radius: $uni-border-radius-lg;
    padding: 16rpx 24rpx;
    font-size: $uni-font-size-base;
    box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.06);

    .filter-icon {
      font-size: 20rpx;
    }
  }
}

/* 筛选面板样式 */
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

/* 状态样式 */
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
  
  .empty-hint {
    margin-top: 12rpx;
    color: $uni-text-color-placeholder;
    font-size: $uni-font-size-sm;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 门店卡片样式 */
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
  transform: translateZ(0); /* 开启硬件加速 */
  transition: transform 0.2s;
  
  /* 封面区域 */
  .image-wrapper {
    position: relative;
    width: 100%;
    height: 320rpx;
    
    .store-cover {
      width: 100%;
      height: 100%;
    }
    
    /* 徽章覆层 */
      .badge-status {
        position: absolute;
        top: 20rpx;
        left: 20rpx;
        background-color: rgba(0, 0, 0, 0.6);
      color: #fff;
      font-size: 20rpx;
      padding: 6rpx 16rpx;
      border-radius: 30rpx;
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      
      .status-dot {
        width: 10rpx;
        height: 10rpx;
        background-color: $uni-color-success;
        border-radius: 50%;
        margin-right: 8rpx;
      }

      .status-dot.closed {
        background-color: $uni-color-error;
      }

      .status-dot.unknown {
        background-color: #b0b8c6;
      }
    }
    
    .badge-rating {
      position: absolute;
      top: 20rpx;
      right: 20rpx;
      background-color: #ffffff;
      color: $uni-color-warning;
      font-size: 22rpx;
      font-weight: bold;
      padding: 6rpx 16rpx;
      border-radius: 10rpx;
      box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.1);
    }
    
    .badge-distance {
      position: absolute;
      top: 60rpx;
      right: 20rpx;
      background-color: rgba(0, 0, 0, 0.6);
      color: #fff;
      font-size: 20rpx;
      padding: 6rpx 16rpx;
      border-radius: 10rpx;
      backdrop-filter: blur(4px);
    }
  }
  
  /* 内容区域 */
  .info-content {
    padding: 24rpx;
    
    .main-info {
      margin-bottom: 20rpx;
    }
    
    .store-name {
      font-size: 34rpx;
      font-weight: 600;
      color: $uni-color-primary;
      margin-bottom: 8rpx;
      display: block;
    }
    
    .store-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8rpx;
      margin-bottom: 8rpx;
      
      .tag {
        background-color: rgba(82, 196, 26, 0.1);
        color: $uni-color-success;
        font-size: 20rpx;
        padding: 4rpx 12rpx;
        border-radius: 8rpx;
      }
    }
    
    .store-address {
      font-size: 24rpx;
      color: $uni-text-color-grey;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1; 
      overflow: hidden;
    }

    .store-hours {
      margin-top: 8rpx;
      display: flex;
      align-items: center;
      gap: 6rpx;

      .hours-icon {
        font-size: 20rpx;
      }

      .hours-text {
        font-size: 22rpx;
        color: #7a8393;
      }
    }
    
    .footer-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1rpx solid $uni-border-color;
      padding-top: 20rpx;
      
      .price-info {
        display: flex;
        flex-direction: column;
        gap: 4rpx;
        
        .price {
          font-size: 28rpx;
          color: $uni-color-error;
          font-weight: 600;
        }
        
        .review-count {
          font-size: 22rpx;
          color: $uni-text-color-grey;
        }
      }
      
      .book-btn {
        background-color: $uni-color-primary;
        color: #fff;
        font-size: 24rpx;
        padding: 10rpx 24rpx;
        border-radius: 30rpx;
        font-weight: 500;
      }
    }
  }
}

.store-card-hover {
  transform: scale(0.98);
}
</style>
