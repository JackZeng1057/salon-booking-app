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

      <view class="pricing-list">
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
export default {
  data() {
    return {
      activeCategory: 'all',
      categories: [
        { key: 'all', label: '全部' },
        { key: 'haircut', label: '剪发' },
        { key: 'color', label: '染发' },
        { key: 'perm', label: '烫发' },
        { key: 'care', label: '护理' }
      ],
      services: [
        {
          id: 'svc-1',
          category: 'haircut',
          name: '精致剪发',
          desc: '针对脸型与发质设计，含基础造型建议',
          duration: 60,
          price: 88,
          tags: ['热门', '新客推荐']
        },
        {
          id: 'svc-2',
          category: 'haircut',
          name: '总监剪发',
          desc: '总监级别设计，适合需要明显风格变化',
          duration: 75,
          price: 158,
          tags: ['总监', '造型定制']
        },
        {
          id: 'svc-3',
          category: 'color',
          name: '单色染发',
          desc: '通勤与日常友好，颜色自然不夸张',
          duration: 150,
          price: 288,
          tags: ['显白', '质感']
        },
        {
          id: 'svc-4',
          category: 'color',
          name: '高光挑染',
          desc: '提升层次感，适合中长发和卷发造型',
          duration: 180,
          price: 398,
          tags: ['层次感', '潮流']
        },
        {
          id: 'svc-5',
          category: 'perm',
          name: '纹理烫',
          desc: '提升蓬松度，打造自然空气感',
          duration: 180,
          price: 368,
          tags: ['男生推荐', '蓬松']
        },
        {
          id: 'svc-6',
          category: 'perm',
          name: '韩系烫发',
          desc: '适合中长发，打造轻盈弧度和轮廓感',
          duration: 210,
          price: 468,
          tags: ['韩系', '中长发']
        },
        {
          id: 'svc-7',
          category: 'care',
          name: '头皮净化护理',
          desc: '深层清洁头皮，缓解油脂和闷痒问题',
          duration: 45,
          price: 128,
          tags: ['头皮护理', '舒缓']
        },
        {
          id: 'svc-8',
          category: 'care',
          name: '发丝修护护理',
          desc: '改善干枯毛躁，提升光泽度和顺滑度',
          duration: 60,
          price: 168,
          tags: ['修护', '烫染后建议']
        }
      ]
    };
  },
  computed: {
    filteredServices() {
      if (this.activeCategory === 'all') return this.services;
      return this.services.filter((item) => item.category === this.activeCategory);
    }
  },
  methods: {
    goCreateOrder(item) {
      const serviceName = encodeURIComponent((item && item.name) || '');
      const price = Number((item && item.price) || 0);
      uni.navigateTo({
        url: `/pages/order/create?serviceName=${serviceName}&price=${price}`
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
