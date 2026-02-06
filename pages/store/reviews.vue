<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <view class="header">
      <text class="title">顾客评价</text>
      <view v-if="storeRating" class="rating-summary">
        <view class="score-box">
          <text class="score">{{ storeRating.overall || 5.0 }}</text>
          <text class="score-label">综合评分</text>
          <view class="stars">
            <text v-for="n in 5" :key="n" class="star">★</text>
          </view>
          <text class="count">{{ storeRating.count || 0 }}条评价</text>
        </view>
        <view class="rating-details">
          <view class="rating-item">
            <text class="rating-label">服务</text>
            <text class="rating-value">{{ storeRating.service || 5.0 }}</text>
          </view>
          <view class="rating-item">
            <text class="rating-label">环境</text>
            <text class="rating-value">{{ storeRating.environment || 5.0 }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 筛选标签 -->
    <view class="filter-tabs">
      <view 
        v-for="tab in filterTabs" 
        :key="tab.value"
        class="filter-tab"
        :class="{ active: filterType === tab.value }"
        @click="selectFilter(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- 评价列表 -->
    <view v-if="loading && reviews.length === 0" class="status-box">
      <view class="spinner"></view>
      <text>加载中...</text>
    </view>

    <view v-else-if="reviews.length === 0" class="status-box">
      <text class="empty-text">暂无评价</text>
    </view>

    <view v-else class="reviews-list">
      <view v-for="review in reviews" :key="review._id" class="review-card">
        <!-- 用户信息 -->
        <view class="review-header">
          <view class="user-info">
            <view class="avatar">{{ getAvatarText(review.userName) }}</view>
            <view class="user-details">
              <text class="user-name">{{ review.userName || '匿名用户' }}</text>
              <text class="review-time">{{ formatTime(review.createdAt) }}</text>
            </view>
          </view>
          <view class="rating-badge">
            <text class="rating-score">{{ review.rating.overall }}</text>
            <text class="rating-star">★</text>
          </view>
        </view>

        <!-- 评分详情 -->
        <view class="rating-breakdown">
          <view class="rating-tag">服务 {{ review.rating.service }}</view>
          <view class="rating-tag">环境 {{ review.rating.environment }}</view>
          <view class="rating-tag">技师 {{ review.rating.barber }}</view>
        </view>

        <!-- 评价内容 -->
        <text class="review-content">{{ review.content }}</text>

        <!-- 评价图片 -->
        <view v-if="review.images && review.images.length > 0" class="review-images">
          <image 
            v-for="(img, idx) in review.images" 
            :key="idx"
            class="review-img"
            :src="img"
            mode="aspectFill"
            @click="previewImages(review.images, idx)"
          />
        </view>

        <!-- 商家回复 -->
        <view v-if="review.reply" class="merchant-reply">
          <text class="reply-label">商家回复：</text>
          <text class="reply-content">{{ review.reply.content }}</text>
          <text class="reply-time">{{ formatTime(review.reply.repliedAt) }}</text>
        </view>

        <!-- 操作区 -->
        <view class="review-actions">
          <view class="action-btn" @click="toggleHelpful(review)">
            <text class="action-icon">👍</text>
            <text class="action-text">有用 {{ review.helpful || 0 }}</text>
          </view>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="hasMore" class="load-more" @click="loadMore">
        <text>{{ loadingMore ? '加载中...' : '加载更多' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
// 门店评价页：展示评分概览与评价列表
import { callCloud } from '../../api/client';

export default {
  data() {
    return {
      storeId: '',
      storeRating: null,
      reviews: [],
      loading: false,
      loadingMore: false,
      filterType: 'all',
      filterTabs: [
        { label: '全部', value: 'all' },
        { label: '好评', value: 'good' },
        { label: '差评', value: 'bad' },
        { label: '有图', value: 'withImages' }
      ],
      page: 1,
      pageSize: 10,
      hasMore: true
    };
  },
  onLoad(options) {
    this.storeId = (options && options.storeId) || '';
    if (this.storeId) {
      this.loadStoreInfo();
      this.loadReviews();
    }
  },
  methods: {
    // 加载门店信息：用于展示评分概览
    async loadStoreInfo() {
      try {
        const store = await callCloud('stores-detail', { id: this.storeId });
        if (store && store.rating) {
          this.storeRating = store.rating;
        }
      } catch (err) {
        console.error('loadStoreInfo error:', err);
      }
    },
    // 加载评价列表：支持刷新与分页追加
    async loadReviews(refresh = false) {
      if (refresh) {
        this.page = 1;
        this.reviews = [];
        this.hasMore = true;
      }

      this.loading = true;
      try {
        const res = await callCloud('reviews-list', {
          storeId: this.storeId,
          filterType: this.filterType,
          page: this.page,
          pageSize: this.pageSize
        });

        const newReviews = res.list || [];
        if (refresh) {
          this.reviews = newReviews;
        } else {
          this.reviews = [...this.reviews, ...newReviews];
        }

        this.hasMore = newReviews.length >= this.pageSize;
      } catch (err) {
        uni.showToast({
          title: err.message || '加载评价失败',
          icon: 'none'
        });
      } finally {
        this.loading = false;
      }
    },
    // 选择筛选项
    selectFilter(type) {
      if (this.filterType === type) return;
      this.filterType = type;
      this.loadReviews(true);
    },
    // 加载更多：分页追加
    loadMore() {
      if (this.loadingMore || !this.hasMore) return;
      this.loadingMore = true;
      this.page++;
      this.loadReviews().finally(() => {
        this.loadingMore = false;
      });
    },
    // 获取头像文字
    getAvatarText(name) {
      if (!name) return '匿';
      return name.charAt(0);
    },
    // 格式化时间
    formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      // 一分钟内
      if (diff < 60000) return '刚刚';
      // 一小时内
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
      // 一天内
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
      // 一周内
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
      
      // 超过一周显示日期
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    // 预览图片
    previewImages(urls, current) {
      uni.previewImage({
        current: current,
        urls: urls
      });
    },
    // 点赞评价：演示用交互，后续可接入云函数
    toggleHelpful(review) {
      // 此处可以调用云函数记录点赞
      uni.showToast({ title: '感谢您的反馈', icon: 'success' });
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding-top: 80rpx;
  background-color: $uni-bg-color-grey;
}

.header {
  background: #ffffff;
  padding: 32rpx;
  margin-bottom: 16rpx;
  
  .title {
    font-size: 40rpx;
    font-weight: 700;
    color: $uni-color-primary;
    margin-bottom: 24rpx;
    display: block;
  }
  
  .rating-summary {
    display: flex;
    align-items: center;
    gap: 40rpx;
    
    .score-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      
      .score {
        font-size: 80rpx;
        font-weight: 700;
        color: #FFD700;
        line-height: 1;
      }
      
      .score-label {
        font-size: 24rpx;
        color: $uni-text-color-grey;
        margin-top: 8rpx;
      }
      
      .stars {
        display: flex;
        margin-top: 8rpx;
        
        .star {
          font-size: 24rpx;
          color: #FFD700;
        }
      }
      
      .count {
        font-size: 22rpx;
        color: $uni-text-color-grey;
        margin-top: 8rpx;
      }
    }
    
    .rating-details {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16rpx;
      
      .rating-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12rpx 20rpx;
        background-color: $uni-bg-color-grey;
        border-radius: $uni-border-radius-lg;
        
        .rating-label {
          font-size: 26rpx;
          color: $uni-text-color;
        }
        
        .rating-value {
          font-size: 28rpx;
          font-weight: 600;
          color: #FFD700;
        }
      }
    }
  }
}

.filter-tabs {
  display: flex;
  background: #ffffff;
  padding: 16rpx 32rpx;
  margin-bottom: 16rpx;
  gap: 24rpx;
  
  .filter-tab {
    font-size: 28rpx;
    color: $uni-text-color-grey;
    padding: 12rpx 24rpx;
    border-radius: 20rpx;
    transition: all 0.3s;
    
    &.active {
      background-color: $uni-color-primary;
      color: #ffffff;
      font-weight: 600;
    }
  }
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
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.reviews-list {
  padding: 0 32rpx 32rpx;
}

.review-card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 28rpx;
  margin-bottom: 16rpx;
  box-shadow: $uni-shadow-base;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16rpx;
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 16rpx;
    
    .avatar {
      width: 72rpx;
      height: 72rpx;
      border-radius: 50%;
      background: linear-gradient(135deg, $uni-color-primary, #52c41a);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28rpx;
      font-weight: 600;
    }
    
    .user-details {
      display: flex;
      flex-direction: column;
      gap: 6rpx;
      
      .user-name {
        font-size: 28rpx;
        font-weight: 600;
        color: $uni-text-color;
      }
      
      .review-time {
        font-size: 22rpx;
        color: $uni-text-color-grey;
      }
    }
  }
  
  .rating-badge {
    display: flex;
    align-items: center;
    background: linear-gradient(135deg, #FFD700, #FFA500);
    padding: 8rpx 16rpx;
    border-radius: 20rpx;
    
    .rating-score {
      font-size: 28rpx;
      font-weight: 700;
      color: #ffffff;
      margin-right: 4rpx;
    }
    
    .rating-star {
      font-size: 24rpx;
      color: #ffffff;
    }
  }
}

.rating-breakdown {
  display: flex;
  gap: 12rpx;
  margin-bottom: 16rpx;
  
  .rating-tag {
    background-color: rgba(82, 196, 26, 0.1);
    color: #52c41a;
    font-size: 22rpx;
    padding: 6rpx 16rpx;
    border-radius: 12rpx;
  }
}

.review-content {
  font-size: 28rpx;
  color: $uni-text-color;
  line-height: 1.6;
  display: block;
  margin-bottom: 16rpx;
}

.review-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-bottom: 16rpx;
  
  .review-img {
    width: 100%;
    height: 200rpx;
    border-radius: $uni-border-radius-lg;
    background-color: #f0f0f0;
  }
}

.merchant-reply {
  background-color: $uni-bg-color-grey;
  padding: 20rpx;
  border-radius: $uni-border-radius-lg;
  margin-bottom: 16rpx;
  
  .reply-label {
    font-size: 24rpx;
    font-weight: 600;
    color: $uni-color-primary;
    display: block;
    margin-bottom: 8rpx;
  }
  
  .reply-content {
    font-size: 26rpx;
    color: $uni-text-color;
    line-height: 1.6;
    display: block;
    margin-bottom: 8rpx;
  }
  
  .reply-time {
    font-size: 22rpx;
    color: $uni-text-color-grey;
    display: block;
  }
}

.review-actions {
  display: flex;
  align-items: center;
  padding-top: 16rpx;
  border-top: 1rpx solid $uni-border-color;
  
  .action-btn {
    display: flex;
    align-items: center;
    gap: 8rpx;
    padding: 8rpx 16rpx;
    border-radius: 20rpx;
    background-color: $uni-bg-color-grey;
    
    .action-icon {
      font-size: 24rpx;
    }
    
    .action-text {
      font-size: 24rpx;
      color: $uni-text-color-grey;
    }
  }
}

.load-more {
  text-align: center;
  padding: 32rpx;
  font-size: 28rpx;
  color: $uni-text-color-grey;
}
</style>
