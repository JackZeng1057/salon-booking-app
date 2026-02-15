<template>
  <view class="page">
    <!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
    <app-nav />
    <view v-if="loading" class="hint">加载中...</view>
    <view v-else-if="!store" class="hint">暂无门店信息</view>

    <view v-else>
      <!-- 封面图 -->
      <image class="hero" :src="store.cover || defaultCover" mode="aspectFill" />
      
      <!-- 基本信息 -->
      <view class="section">
        <view class="header-row">
          <text class="name">{{ store.name }}</text>
          <view class="rating-box">
            <text class="rating-score">{{ formatRating(store) }}</text>
            <text class="rating-star">★</text>
          </view>
        </view>
        
        <!-- 标签 -->
        <view class="tags-row">
          <text
            v-for="(tag, idx) in (store.tags || [])"
            :key="idx"
            class="tag"
          >{{ tag }}</text>
          <text v-if="!store.tags || store.tags.length === 0" class="tag tag-empty">暂无标签</text>
        </view>
        
        <text class="desc">{{ store.description || '暂无简介' }}</text>
        
        <!-- 地址与导航 -->
        <view class="meta-row address-row">
          <text class="meta-icon">📍</text>
          <text class="meta address-text">{{ store.address }}</text>
          <view v-if="store.location && store.location.lat && store.location.lng" class="nav-btn" @click="openNavigation">
            <text class="nav-icon">🧭</text>
            <text class="nav-text">导航</text>
          </view>
        </view>
        
        <!-- 距离显示 -->
        <view v-if="distance !== null" class="meta-row">
          <text class="meta-icon">🚶</text>
          <text class="meta">距离您 {{ formatDistance(distance) }}</text>
        </view>
        
        <view class="meta-row phone-row">
          <text class="meta-icon">📞</text>
          <text class="meta phone-text">{{ store.phone }}</text>
          <view class="call-btn" @click="makePhoneCall">
            <text class="call-icon">📱</text>
            <text class="call-text">拨打</text>
          </view>
        </view>
        
        <!-- 营业时间 -->
        <view class="business-hours">
          <text class="label">营业时间</text>
          <view class="hours-row">
            <text class="hours-label">工作日：</text>
            <text class="hours-value">{{ getBusinessHoursText('weekday') }}</text>
          </view>
          <view class="hours-row">
            <text class="hours-label">周末：</text>
            <text class="hours-value">{{ getBusinessHoursText('weekend') }}</text>
          </view>
        </view>
      </view>
      
      <!-- 门店相册 -->
      <view v-if="store.images && store.images.length > 0" class="section">
        <text class="section-title">门店相册</text>
        <view class="gallery">
          <view 
            v-for="(img, idx) in store.images" 
            :key="idx" 
            class="gallery-item"
            @click="previewImage(idx)"
          >
            <image 
              class="gallery-img" 
              :src="img.url" 
              mode="aspectFill"
            />
            <text v-if="img.type" class="gallery-label">{{ formatImageType(img.type) }}</text>
          </view>
        </view>
      </view>
      
      <!-- 预约规则 -->
      <view class="section rules-section">
        <text class="section-title">预约须知</text>
        <view class="rules-content">
          <view class="rule-item">
            <text class="rule-icon">📋</text>
            <view class="rule-text">
              <text class="rule-title">预约须知</text>
              <text class="rule-desc">{{ getBookingRuleText('notice') }}</text>
            </view>
          </view>
          <view class="rule-item">
            <text class="rule-icon">❌</text>
            <view class="rule-text">
              <text class="rule-title">取消规则</text>
              <text class="rule-desc">{{ getBookingRuleText('cancelRule') }}</text>
            </view>
          </view>
          <view class="rule-item">
            <text class="rule-icon">🔄</text>
            <view class="rule-text">
              <text class="rule-title">改期规则</text>
              <text class="rule-desc">{{ getBookingRuleText('rescheduleRule') }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="section">
        <text class="section-title">服务项目</text>
        <view v-if="services.length === 0" class="hint">暂无服务</view>
        <view v-else class="service-list">
          <view v-for="service in services" :key="service._id" class="service-item">
            <text class="service-name">{{ service.name }}</text>
            <text class="service-meta">¥{{ service.price }} · {{ service.duration }} 分钟</text>
          </view>
        </view>
      </view>

      <view class="section">
        <text class="section-title">理发师</text>
        <view v-if="barbers.length === 0" class="hint">暂无理发师</view>
        <view v-else class="barber-list">
          <view v-for="barber in barbers" :key="barber._id" class="barber-item">
            <image
              class="avatar"
              :src="barber.avatar || defaultAvatar"
              mode="aspectFill"
            />
            <text class="barber-name">{{ barber.name || barber.username }}</text>
          </view>
        </view>
      </view>

      <!-- 用户评价 -->
      <view class="section">
        <view class="review-header">
          <text class="section-title">用户评价</text>
          <view class="filter-tabs">
            <text 
              v-for="filter in reviewFilters" 
              :key="filter.value"
              class="filter-tab"
              :class="{ active: reviewFilter === filter.value }"
              @click="changeReviewFilter(filter.value)"
            >
              {{ filter.label }}
            </text>
          </view>
        </view>
        
        <view v-if="reviewsLoading" class="hint">加载中...</view>
        <view v-else-if="reviews.length === 0" class="hint">暂无评价</view>
        <view v-else class="review-list">
          <view v-for="review in reviews" :key="review._id" class="review-item">
            <view class="review-user">
              <text class="user-name">{{ review.userName || '匿名用户' }}</text>
              <view class="review-rating">
                <text class="rating-num">{{ review.rating.overall }}</text>
                <text class="rating-star">★</text>
              </view>
            </view>
            
            <view class="review-scores">
              <text class="score-item">服务: {{ review.rating.service }}分</text>
              <text class="score-item">环境: {{ review.rating.environment }}分</text>
              <text class="score-item">技师: {{ review.rating.barber }}分</text>
            </view>
            
            <text class="review-content">{{ review.content }}</text>
            
            <view v-if="review.images && review.images.length > 0" class="review-images">
              <image 
                v-for="(img, idx) in review.images" 
                :key="idx"
                class="review-img"
                :src="img"
                mode="aspectFill"
                @click="previewReviewImage(review.images, idx)"
              />
            </view>
            
            <text class="review-time">{{ formatReviewTime(review.createdAt) }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <button class="book-btn" type="primary" @click="goCreateOrder">去预约</button>
      </view>
    </view>
  </view>
</template>

<script>
// 门店详情页：展示门店信息、服务/理发师与评价
import { fetchStoreDetail, fetchStoreServices, fetchStoreBarbers } from '../../api/store';
import { callCloud } from '../../api/client';

export default {
  data() {
    return {
      storeId: '',
      store: null,
      services: [],
      barbers: [],
      reviews: [],
      loading: false,
      reviewsLoading: false,
      reviewFilter: 'all',
      reviewFilters: [
        { label: '全部', value: 'all' },
        { label: '好评', value: 'good' },
        { label: '差评', value: 'bad' },
        { label: '有图', value: 'withImages' }
      ],
      distance: null,
      userLat: null,
      userLng: null,
      defaultCover: 'https://dummyimage.com/600x400/efefef/333&text=Salon',
      defaultAvatar: 'https://dummyimage.com/120x120/ddd/333&text=Barber'
    };
  },
  onLoad(options) {
    // 从路由参数读取门店 ID
    this.storeId = (options && options.id) || '';
    if (!this.storeId) {
      return;
    }
    // 获取用户位置
    this.getUserLocation();
    this.loadDetail();
  },
  onShow() {
    if (this.storeId) {
      this.loadDetail({ forceRefresh: true });
    }
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
          // 如果门店信息已加载，计算距离
          if (this.store && this.store.location) {
            this.calculateDistance();
          }
        },
        fail: () => {
          console.log('获取位置失败');
        }
      });
    },
    /**
     * 计算距离
     */
    calculateDistance() {
      if (!this.store || !this.store.location || !this.userLat || !this.userLng) {
        return;
      }
      const storeLat = this.store.location.lat;
      const storeLng = this.store.location.lng;
      if (!storeLat || !storeLng) {
        return;
      }
      
      // 使用球面距离公式计算距离
      const R = 6371; // 地球半径(公里)
      const dLat = (storeLat - this.userLat) * Math.PI / 180;
      const dLng = (storeLng - this.userLng) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.userLat * Math.PI / 180) * Math.cos(storeLat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      this.distance = R * c;
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
     * 打开导航
     */
    openNavigation() {
      if (!this.store || !this.store.location) {
        uni.showToast({
          title: '门店位置信息不完整',
          icon: 'none'
        });
        return;
      }
      
      const lat = this.store.location.lat;
      const lng = this.store.location.lng;
      const name = this.store.name || '目的地';
      const address = this.store.address || '';
      
      uni.openLocation({
        latitude: lat,
        longitude: lng,
        name: name,
        address: address,
        scale: 15
      });
    },
    /**
     * 拨打电话
     */
    makePhoneCall() {
      if (!this.store || !this.store.phone) {
        uni.showToast({
          title: '电话号码不存在',
          icon: 'none'
        });
        return;
      }
      
      uni.makePhoneCall({
        phoneNumber: this.store.phone
      });
    },
    // 同时拉取门店详情、服务、理发师
    async loadDetail(options = {}) {
      this.loading = true;
      try {
        const [store, services, barbers] = await Promise.all([
          fetchStoreDetail(this.storeId, { noCache: !!options.forceRefresh }),
          fetchStoreServices(this.storeId, { noCache: !!options.forceRefresh }),
          fetchStoreBarbers(this.storeId, { noCache: true })
        ]);
        this.store = store || null;
        this.services = Array.isArray(services) ? services : [];
        this.barbers = Array.isArray(barbers) ? barbers : [];
        
        // 计算距离
        if (this.userLat && this.userLng) {
          this.calculateDistance();
        }
        
        // 加载评价
        this.loadReviews();
      } catch (err) {
        uni.showToast({
          title: err.message || '加载门店失败',
          icon: 'none'
        });
      } finally {
        this.loading = false;
      }
    },
    // 加载评价列表（按筛选类型）
    async loadReviews() {
      this.reviewsLoading = true;
      try {
        const res = await callCloud('reviews-list', {
          storeId: this.storeId,
          filterType: this.reviewFilter,
          page: 1,
          pageSize: 10
        });
        this.reviews = (res && res.list) || [];
      } catch (err) {
        // 评价加载失败不影响主流程
        console.error('loadReviews error:', err);
      } finally {
        this.reviewsLoading = false;
      }
    },
    // 切换评价筛选
    changeReviewFilter(filter) {
      this.reviewFilter = filter;
      this.loadReviews();
    },
    // 格式化评价时间
    formatReviewTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      
      if (days === 0) return '今天';
      if (days === 1) return '昨天';
      if (days < 30) return `${days}天前`;
      
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },
    // 预览评价图片
    previewReviewImage(images, index) {
      uni.previewImage({
        current: index,
        urls: images
      });
    },
    // 格式化评分
    formatRating(store) {
      if (!store.rating || !store.rating.overall) return '5.0';
      return store.rating.overall.toFixed(1);
    },
    // 读取营业时间（缺省显示未设置）
    getBusinessHoursText(key) {
      const businessHours = (this.store && this.store.businessHours) || {};
      return businessHours[key] || '未设置';
    },
    // 读取预约规则（缺省显示未设置）
    getBookingRuleText(key) {
      const bookingRules = (this.store && this.store.bookingRules) || {};
      return bookingRules[key] || '未设置';
    },
    // 格式化图片类型
    formatImageType(type) {
      const typeMap = {
        'environment': '环境',
        'service': '服务',
        'storefront': '门头'
      };
      return typeMap[type] || '图片';
    },
    // 预览图片
    previewImage(index) {
      if (!this.store.images || this.store.images.length === 0) return;
      const urls = this.store.images.map(img => img.url);
      uni.previewImage({
        current: index,
        urls: urls
      });
    },
    // 跳转到创建预约页面并带上门店 ID
    goCreateOrder() {
      if (!this.storeId) return;
      uni.navigateTo({ url: `/pages/order/create?storeId=${this.storeId}` });
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  /* 由于使用悬浮导航，这里增加少量顶部 padding，避免封面图被状态栏/返回按钮压住 */
  padding-top: 80rpx;
  background-color: #f7f7f7;
}

.hint {
  color: #999999;
  font-size: 28rpx;
  padding: 24rpx 32rpx;
}

.hero {
  width: 100%;
  height: 420rpx;
  background-color: #f0f0f0;
}

.section {
  padding: 32rpx;
  background-color: #ffffff;
  margin-bottom: 16rpx;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16rpx;
}

.name {
  flex: 1;
  font-size: 40rpx;
  font-weight: 700;
  color: #111111;
  line-height: 1.3;
}

.rating-box {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  
  .rating-score {
    font-size: 30rpx;
    font-weight: 700;
    color: #ffffff;
    margin-right: 4rpx;
  }
  
  .rating-star {
    font-size: 28rpx;
    color: #ffffff;
  }
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
  
  .tag {
    background: linear-gradient(135deg, rgba(82, 196, 26, 0.15), rgba(82, 196, 26, 0.08));
    color: #52c41a;
    font-size: 22rpx;
    padding: 6rpx 16rpx;
    border-radius: 12rpx;
    border: 1rpx solid rgba(82, 196, 26, 0.3);
  }

  .tag-empty {
    color: #8b95a7;
    background: #f3f5f8;
    border-color: #dfe4ea;
  }
}

.desc {
  display: block;
  margin-bottom: 16rpx;
  color: #666666;
  font-size: 28rpx;
  line-height: 1.6;
}

.meta-row {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
  
  .meta-icon {
    font-size: 28rpx;
    margin-right: 8rpx;
  }
  
  .meta {
    flex: 1;
    color: #777777;
    font-size: 26rpx;
    line-height: 1.5;
  }
  
  &.address-row {
    .address-text {
      flex: 1;
      margin-right: 12rpx;
    }
    
    .nav-btn {
      display: flex;
      align-items: center;
      background: linear-gradient(135deg, $uni-color-primary, #52c41a);
      color: #ffffff;
      padding: 8rpx 20rpx;
      border-radius: 30rpx;
      font-size: 24rpx;
      
      .nav-icon {
        margin-right: 4rpx;
      }
    }
  }
  
  &.phone-row {
    .phone-text {
      flex: 1;
      margin-right: 12rpx;
    }
    
    .call-btn {
      display: flex;
      align-items: center;
      background: linear-gradient(135deg, #1890ff, #096dd9);
      color: #ffffff;
      padding: 8rpx 20rpx;
      border-radius: 30rpx;
      font-size: 24rpx;
      
      .call-icon {
        margin-right: 4rpx;
      }
    }
  }
}

.business-hours {
  margin-top: 24rpx;
  padding: 20rpx;
  background-color: #f8f9fa;
  border-radius: 12rpx;
  
  .label {
    display: block;
    font-size: 28rpx;
    font-weight: 600;
    color: #333333;
    margin-bottom: 12rpx;
  }
  
  .hours-row {
    display: flex;
    align-items: center;
    margin-top: 8rpx;
    
    .hours-label {
      font-size: 26rpx;
      color: #666666;
      min-width: 120rpx;
    }
    
    .hours-value {
      font-size: 26rpx;
      color: #333333;
      font-weight: 500;
    }
  }
}

.section-title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #111111;
  margin-bottom: 20rpx;
  padding-left: 16rpx;
  border-left: 6rpx solid #52c41a;
}

.gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
  
  .gallery-item {
    position: relative;
    width: 100%;
    height: 200rpx;
    border-radius: 12rpx;
    overflow: hidden;
    
    .gallery-img {
      width: 100%;
      height: 100%;
      background-color: #f0f0f0;
    }
    
    .gallery-label {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
      color: #ffffff;
      font-size: 20rpx;
      padding: 16rpx 8rpx 8rpx;
      text-align: center;
    }
  }
}

.rules-section {
  .rules-content {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
    
    .rule-item {
      display: flex;
      align-items: flex-start;
      padding: 20rpx;
      background: linear-gradient(135deg, #f8f9fa, #ffffff);
      border-radius: 12rpx;
      border: 1rpx solid #e8e8e8;
      
      .rule-icon {
        font-size: 32rpx;
        margin-right: 16rpx;
        flex-shrink: 0;
      }
      
      .rule-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        
        .rule-title {
          font-size: 28rpx;
          font-weight: 600;
          color: #333333;
          margin-bottom: 8rpx;
        }
        
        .rule-desc {
          font-size: 26rpx;
          color: #666666;
          line-height: 1.6;
        }
      }
    }
  }
}

.service-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.service-item {
  padding: 16rpx;
  background-color: #f8f8f8;
  border-radius: 12rpx;
}

.service-name {
  font-size: 28rpx;
  color: #111111;
  font-weight: 600;
}

.service-meta {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #666666;
}

.barber-list {
  display: flex;
  gap: 20rpx;
  flex-wrap: wrap;
}

.barber-item {
  width: 160rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background-color: #f0f0f0;
}

.barber-name {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #333333;
}

.book-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.filter-tabs {
  display: flex;
  gap: 16rpx;
  
  .filter-tab {
    font-size: 24rpx;
    color: #666666;
    padding: 8rpx 16rpx;
    border-radius: 20rpx;
    background-color: #f5f5f5;
    transition: all 0.3s;
    
    &.active {
      background-color: #52c41a;
      color: #ffffff;
    }
  }
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.review-item {
  padding: 24rpx;
  background-color: #f8f9fa;
  border-radius: 12rpx;
  
  .review-user {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12rpx;
    
    .user-name {
      font-size: 28rpx;
      font-weight: 600;
      color: #333333;
    }
    
    .review-rating {
      display: flex;
      align-items: center;
      
      .rating-num {
        font-size: 32rpx;
        font-weight: 700;
        color: #FFD700;
        margin-right: 4rpx;
      }
      
      .rating-star {
        font-size: 28rpx;
        color: #FFD700;
      }
    }
  }
  
  .review-scores {
    display: flex;
    gap: 16rpx;
    margin-bottom: 12rpx;
    
    .score-item {
      font-size: 22rpx;
      color: #666666;
      padding: 4rpx 12rpx;
      background-color: rgba(82, 196, 26, 0.1);
      border-radius: 8rpx;
    }
  }
  
  .review-content {
    display: block;
    font-size: 26rpx;
    color: #333333;
    line-height: 1.6;
    margin-bottom: 12rpx;
  }
  
  .review-images {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12rpx;
    margin-bottom: 12rpx;
    
    .review-img {
      width: 100%;
      height: 160rpx;
      border-radius: 8rpx;
      background-color: #f0f0f0;
    }
  }
  
  .review-time {
    display: block;
    font-size: 22rpx;
    color: #999999;
  }
}
</style>
