<template>
  <view class="home-page">
    <!-- 自定义顶部导航（首页不展示返回按钮，只保留状态栏占位和后续扩展能力） -->
    <app-nav :showBack="false" />
    <!-- 顶部状态栏占位（处理刘海屏逻辑，uni-app 通常自动处理，但有时需要额外 padding-top） -->
    
    <!-- 头部欢迎区 -->
    <view class="header-section">
      <view class="text-container">
        <text class="greeting">你好, {{ displayName }} 👋</text>
        <text class="sub-greeting">换个新造型，遇见全新自己</text>
      </view>
      <view class="header-actions">
        <view class="notify-btn" @click="goNotifications">
          <text class="notify-icon">🔔</text>
          <text v-if="unreadCount > 0" class="notify-dot"></text>
        </view>
        <!-- 头像 -->
        <view class="avatar-container">
          <image v-if="currentUser.avatar" class="avatar-placeholder" :src="currentUser.avatar" mode="aspectFill" />
          <view v-else class="avatar-placeholder">{{ displayName.slice(0, 1).toUpperCase() }}</view>
        </view>
      </view>
    </view>

    <!-- 搜索栏 -->
    <view class="search-bar" @click="goSearch">
      <view class="search-input-mock">
        <text class="uni-icon">🔍</text> 
        <text class="search-text">搜索门店、发型师...</text>
      </view>
    </view>

    <!-- 营销横幅区域 -->
    <view class="banner-section">
      <view class="banner-card">
        <view class="banner-content">
          <text class="banner-title">夏季特惠</text>
          <text class="banner-desc">所有护理项目 8 折优惠</text>
          <view class="banner-btn" @click="goStores">立即预约</view>
        </view>
        <!-- 装饰圆 -->
        <view class="banner-decoration"></view>
      </view>
    </view>

    <!-- 分类入口（网格） -->
    <view class="section-header">
      <text class="section-title">热门服务</text>
      <text class="section-more" @click="goStores">查看全部</text>
    </view>

    <view class="category-grid">
      <view 
        class="category-item" 
        v-for="(item, index) in categories" 
        :key="index"
        @click="goStores"
        hover-class="category-item-hover"
      >
        <view class="icon-box" :style="{ backgroundColor: item.color }">
          <text class="category-icon">{{ item.icon }}</text>
        </view>
        <text class="category-name">{{ item.name }}</text>
      </view>
    </view>

    <!-- 推荐门店快速入口 -->
    <view class="action-card" @click="goStores">
      <view class="action-text">
        <text class="action-title">浏览所有门店</text>
        <text class="action-desc">发现您身边的高分好店</text>
      </view>
      <view class="action-arrow">→</view>
    </view>

    <view class="logout-card">
      <text class="logout-label">账号</text>
      <view class="logout-actions">
        <button class="logout-btn" type="default" @click="goSettings">账号设置</button>
        <button class="logout-btn" type="default" @click="handleLogout">退出登录</button>
      </view>
    </view>
  </view>
</template>

<script>
/**
 * 用户主页
 * 展示欢迎信息、营销活动、分类入口
 */
import { authStore } from '../../../store/auth';
import { getUnreadCount } from '../../../api/notifications';

export default {
  data() {
    return {
      // 模拟分类数据
      categories: [
        { name: '精剪', icon: '✂️', color: '#E8F3FF' }, // 浅蓝
        { name: '染发', icon: '🎨', color: '#FFF0F6' }, // 浅粉
        { name: '按摩', icon: '💆', color: '#F6FFED' }, // 浅绿
        { name: '美甲', icon: '💅', color: '#FFF7E6' } // 浅黄
      ],
      unreadCount: 0
    };
  },
  onShow() {
    this.loadUnreadCount();
  },
  computed: {
    // 从状态仓库获取用户信息
    currentUser() {
      return authStore.state.user || { nickname: 'Guest' };
    },
    displayName() {
      const user = this.currentUser || {};
      return user.username || user.name || user.nickname || '新朋友';
    }
  },
  methods: {
    async loadUnreadCount() {
      try {
        this.unreadCount = await getUnreadCount();
      } catch (err) {
        this.unreadCount = 0;
      }
    },
    goNotifications() {
      uni.navigateTo({ url: '/pages/user/notifications/index' });
    },
    // 跳转到搜索/门店列表
    goSearch() {
      // 统一跳转到独立搜索页，避免首页承载筛选逻辑
      uni.navigateTo({ url: '/pages/search/index' });
    },
    // 跳转到门店列表
    goStores() {
      uni.navigateTo({ url: '/pages/store/list' });
    },
    // 退出登录
    handleLogout() {
      authStore.clear();
      uni.reLaunch({ url: '/pages/auth/login' });
    },
    // 账号设置
    goSettings() {
      uni.navigateTo({ url: '/pages/user/settings/index' });
    }
  }
};
</script>

<style scoped lang="scss">
.home-page {
  min-height: 100vh;
  /* 顶部额外增加一点 padding，让内容离状态栏更远，看起来不那么“顶” */
  padding: 82rpx 40rpx 100rpx;
  background-color: #ffffff; /* 纯白背景显得干净 */
}

/* 头部样式 */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20rpx;
  margin-bottom: 40rpx;

  .text-container {
    display: flex;
    flex-direction: column;
  }

  .greeting {
    font-size: 40rpx;
    font-weight: bold;
    color: $uni-text-color;
    margin-bottom: 8rpx;
  }

  .sub-greeting {
    font-size: $uni-font-size-base;
    color: $uni-text-color-grey;
  }

  .avatar-placeholder {
    width: 100rpx;
    height: 100rpx;
    border-radius: 50%;
    background-color: $uni-color-primary;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    font-weight: bold;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.notify-btn {
  width: 72rpx;
  height: 72rpx;
  border-radius: 36rpx;
  background: #ffffff;
  box-shadow: 0 6rpx 16rpx rgba(15, 23, 42, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.notify-icon {
  font-size: 34rpx;
}

.notify-dot {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
  background: #ff4d4f;
}

/* 搜索栏样式 */
.search-bar {
  margin-bottom: 40rpx;
  cursor: pointer;
}

.search-input-mock {
  background-color: $uni-bg-color-grey;
  height: 88rpx;
  border-radius: $uni-border-radius-lg;
  display: flex;
  align-items: center;
  padding: 0 30rpx;
  transition: all 0.3s;
  
  &:active {
    background-color: $uni-bg-color-hover;
    transform: scale(0.98);
  }
  
  .uni-icon {
    margin-right: 20rpx;
    font-size: 32rpx;
  }
  
  .search-text {
    color: $uni-text-color-placeholder;
    font-size: $uni-font-size-base;
  }
}

/* 横幅样式 */
.banner-section {
  margin-bottom: 50rpx;
}

.banner-card {
  background-color: $uni-color-primary; /* 黑金风格 */
  border-radius: $uni-border-radius-lg;
  padding: 40rpx;
  position: relative;
  overflow: hidden;
  box-shadow: $uni-shadow-base;
  
  .banner-content {
    position: relative;
    z-index: 2;
  }

  .banner-title {
    display: block;
    color: $uni-color-accent; /* 金色文字 */
    font-size: 44rpx;
    font-weight: bold;
    margin-bottom: 12rpx;
  }
  
  .banner-desc {
    display: block;
    color: rgba(255, 255, 255, 0.8);
    font-size: $uni-font-size-sm;
    margin-bottom: 30rpx;
  }
  
  .banner-btn {
    display: inline-block;
    background-color: #ffffff;
    color: $uni-color-primary;
    padding: 12rpx 30rpx;
    border-radius: 30rpx;
    font-size: $uni-font-size-sm;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    
    &:active {
      transform: scale(0.95);
      opacity: 0.9;
    }
  }
  
  /* 横幅装饰背景 */
  .banner-decoration {
    position: absolute;
    right: -20rpx;
    bottom: -50rpx;
    width: 200rpx;
    height: 200rpx;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    z-index: 1;
  }
}

/* 分类栅格 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30rpx;

  .section-title {
    font-size: 36rpx;
    font-weight: 700;
    color: $uni-text-color;
  }
  
  .section-more {
    font-size: $uni-font-size-sm;
    color: $uni-text-color-grey;
    cursor: pointer;
    
    &:active {
      color: $uni-color-primary;
    }
  }
}

.category-grid {
  display: flex;
  justify-content: space-between;
  margin-bottom: 50rpx;
}

.category-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s;

  .icon-box {
    width: 120rpx;
    height: 120rpx;
    border-radius: 40rpx; /* 方形圆角 */
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16rpx;
    transition: all 0.2s;
  }
  
  .category-icon {
    font-size: 50rpx;
  }
  
  .category-name {
    font-size: $uni-font-size-sm;
    color: $uni-text-color;
    font-weight: 500;
  }
}

.category-item-hover {
  transform: scale(0.95);
  
  .icon-box {
    opacity: 0.8;
  }
}

/* 底部行动卡片 */
.action-card {
  background-color: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 30rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  
  &:active {
    background-color: $uni-bg-color-hover;
    transform: scale(0.98);
  }

  .action-title {
    display: block;
    font-size: $uni-font-size-lg;
    font-weight: 600;
    margin-bottom: 6rpx;
  }
  
  .action-desc {
    font-size: $uni-font-size-sm;
    color: $uni-text-color-grey;
  }
  
  .action-arrow {
    font-size: 40rpx;
    color: $uni-text-color-placeholder;
  }
}

.logout-card {
  margin-top: 24rpx;
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 24rpx;
  box-shadow: $uni-shadow-base;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logout-actions {
  display: flex;
  gap: 12rpx;
}

.logout-label {
  color: $uni-text-color-grey;
  font-size: $uni-font-size-sm;
}

.logout-btn {
  padding: 0 36rpx;
}
</style>
