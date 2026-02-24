<template>
  <!-- 订单评价页：对已完成服务从三个维度（服务/环境/技师）进行评分并上传图片 -->
  <view class="page">
    <!-- 顶部导航 + 提示文案 -->
    <app-nav :showTitle="true" title="评价订单" />

    <view class="review-top">
      <view class="hero-card">
        <text class="hero-subtitle">从服务、环境、体验维度进行评价</text>
      </view>
    </view>

    <!-- =====================================================
         评价表单滚动区
         结构：
         - 三维度评分区（服务/环境/技师）：5 星点击评分
         - 综合评分展示（三维度均值，精确到 0.1）
         - 评价内容文本域（最多 500 字）
         - 图片上传区（最多 6 张，支持添加/删除）
         - 提交按钮：先上传图片到云存储，再调用 reviews-create
    ===================================================== -->
    <scroll-view class="review-scroll" scroll-y>
      <view class="review-scroll-content">
        <view class="card">
          <!-- 三维度评分区：每行 5 颗星，点击设置对应维度分数 -->
          <!-- 多维评分 -->
          <view class="rating-section">
            <text class="section-label">服务评分</text>
            <view class="rating-row">
              <view
                v-for="n in 5"
                :key="n"
                class="star"
                :class="{ active: serviceRating >= n }"
                @click="serviceRating = n"
              >★</view>
              <text class="rating-text">{{ ratingText(serviceRating) }}</text>
            </view>
          </view>

          <view class="rating-section">
            <text class="section-label">环境评分</text>
            <view class="rating-row">
              <view
                v-for="n in 5"
                :key="n"
                class="star"
                :class="{ active: environmentRating >= n }"
                @click="environmentRating = n"
              >★</view>
              <text class="rating-text">{{ ratingText(environmentRating) }}</text>
            </view>
          </view>

          <view class="rating-section">
            <text class="section-label">技师评分</text>
            <view class="rating-row">
              <view
                v-for="n in 5"
                :key="n"
                class="star"
                :class="{ active: barberRating >= n }"
                @click="barberRating = n"
              >★</view>
              <text class="rating-text">{{ ratingText(barberRating) }}</text>
            </view>
          </view>

          <!-- 综合评分显示 -->
          <view class="overall-rating">
            <text class="overall-label">综合评分</text>
            <text class="overall-score">{{ overallRating }}</text>
            <text class="overall-star">★</text>
          </view>

          <!-- 评价内容 -->
          <text class="label">评价内容</text>
          <textarea 
            class="textarea" 
            v-model="content" 
            placeholder="分享您的使用体验，帮助更多人做出选择~"
            maxlength="500"
          ></textarea>
          <text class="char-count">{{ content.length }}/500</text>

          <!-- 图片上传 -->
          <text class="label">添加图片（可选）</text>
          <view class="image-upload">
            <view v-for="(img, idx) in images" :key="idx" class="image-item">
              <image class="uploaded-img" :src="img" mode="aspectFill" />
              <view class="delete-btn" @click="removeImage(idx)">✕</view>
            </view>
            <view v-if="images.length < 6" class="upload-btn" @click="chooseImage">
              <text class="upload-icon">+</text>
              <text class="upload-text">添加图片</text>
            </view>
          </view>

          <button class="submit" type="primary" :loading="loading" @click="handleSubmit">提交评价</button>
        </view>
        <view class="scroll-bottom-safe"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
// 订单评价页：多维评分、文本与图片
// 提交流程：
// 1) 本地校验内容与订单号；
// 2) 先上传本地图片到云存储；
// 3) 调用创建评价接口一次性提交评分/文本/图片地址。
import { createReview } from '../../api/order';

export default {
  data() {
    return {
      // 路由传入的订单 ID
      orderId: '',
      // 三个维度评分，默认 5 星
      serviceRating: 5,
      environmentRating: 5,
      barberRating: 5,
      // 评价文本和图片（支持本地临时路径 + 云文件 ID）
      content: '',
      images: [],
      // 防重复提交
      loading: false
    };
  },
  computed: {
    // 计算综合评分
    overallRating() {
      const avg = (this.serviceRating + this.environmentRating + this.barberRating) / 3;
      return avg.toFixed(1);
    }
  },
  onLoad(options) {
    // 从页面参数读取 orderId，缺失时后续提交会被拦截。
    this.orderId = (options && options.orderId) || '';
  },
  methods: {
    // 评分文本
    ratingText(score) {
      const texts = ['', '很差', '较差', '一般', '满意', '非常满意'];
      return texts[score] || '';
    },
    // 选择图片
    chooseImage() {
      uni.chooseImage({
        // 最多 6 张，减去当前已选数量
        count: 6 - this.images.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          // 追加已选图片，支持多次选择
          this.images = [...this.images, ...res.tempFilePaths];
        }
      });
    },
    // 移除图片
    removeImage(index) {
      this.images.splice(index, 1);
    },
    // 提交评价
    async handleSubmit() {
      if (!this.orderId) return;
      
      // 文本必填校验：避免空评价污染评分体系
      if (!this.content.trim()) {
        uni.showToast({ title: '请填写评价内容', icon: 'none' });
        return;
      }

      this.loading = true;
      try {
        // 先上传图片，拿到可持久化的 URL/云文件 ID 再提交评价。
        const uploadedImages = await this.uploadReviewImages();
        await createReview({
          orderId: this.orderId,
          rating: {
            service: this.serviceRating,
            environment: this.environmentRating,
            barber: this.barberRating
          },
          content: this.content.trim(),
          images: uploadedImages
        });
        uni.showToast({ title: '评价成功', icon: 'success' });
        setTimeout(() => {
          uni.navigateBack();
        }, 500);
      } catch (err) {
        // 409 表示该订单已评价，前端给出可理解提示避免重复提交。
        if (err && err.code === 409) {
          uni.showToast({ title: '已评价过该订单', icon: 'none' });
          return;
        }
        uni.showToast({ title: err.message || '评价失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    // 上传评价图片：
    // - cloud/http(s) 地址直接复用；
    // - 本地临时路径上传到 uniCloud 后转成 fileID。
    async uploadReviewImages() {
      const source = Array.isArray(this.images) ? this.images : [];
      if (source.length === 0) return [];
      const uploaded = [];
      for (let i = 0; i < source.length; i += 1) {
        const item = String(source[i] || '').trim();
        if (!item) continue;
        if (item.startsWith('cloud://') || item.startsWith('http://') || item.startsWith('https://')) {
          uploaded.push(item);
          continue;
        }
        // 根据原图后缀构造云端路径，便于后续排查资源类型。
        const extMatch = item.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
        const cloudPath = `reviews/${this.orderId}_${Date.now()}_${i}.${ext}`;
        const res = await uniCloud.uploadFile({
          cloudPath,
          filePath: item
        });
        const fileId = (res && res.fileID) || '';
        if (fileId) uploaded.push(fileId);
      }
      return uploaded;
    }
  }
};
</script>

<style scoped lang="scss">
.page {
  height: 100vh;
  padding: calc(118rpx + 20px) 28rpx 0;
  background: #f8fafc;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.review-top {
  flex-shrink: 0;
}

.review-scroll {
  flex: 1;
  min-height: 0;
}

.review-scroll-content {
  display: flex;
  flex-direction: column;
}

.scroll-bottom-safe {
  height: 30rpx;
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

.card {
  background: #ffffff;
  border-radius: $uni-border-radius-lg;
  padding: 32rpx;
  box-shadow: $uni-shadow-base;
}

.rating-section {
  margin-bottom: 28rpx;
  padding-bottom: 28rpx;
  border-bottom: 1rpx solid $uni-border-color;
  
  &:last-of-type {
    border-bottom: none;
  }
  
  .section-label {
    display: block;
    font-size: $uni-font-size-base;
    font-weight: 600;
    color: $uni-text-color;
    margin-bottom: 16rpx;
  }
  
  .rating-row {
    display: flex;
    align-items: center;
    gap: 8rpx;
  }
  
  .star {
    font-size: 52rpx;
    color: #e8e8e8;
    transition: all 0.2s;
    
    &.active {
      color: #FFD700;
      animation: scaleIn 0.2s ease;
    }
  }
  
  .rating-text {
    margin-left: 12rpx;
    font-size: $uni-font-size-base;
    color: $uni-color-primary;
    font-weight: 600;
  }
}

@keyframes scaleIn {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.overall-rating {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24rpx;
  background: linear-gradient(135deg, #fff7e6, #fffbe6);
  border-radius: $uni-border-radius-lg;
  margin-bottom: 32rpx;
  
  .overall-label {
    font-size: $uni-font-size-base;
    color: #ad6800;
    margin-right: 16rpx;
  }
  
  .overall-score {
    font-size: 56rpx;
    font-weight: 700;
    color: #d46b08;
  }
  
  .overall-star {
    font-size: 42rpx;
    color: #FFD700;
    margin-left: 8rpx;
  }
}

.label {
  display: block;
  font-size: $uni-font-size-base;
  font-weight: 600;
  color: $uni-text-color;
  margin-bottom: 16rpx;
  margin-top: 24rpx;
}

.textarea {
  min-height: 240rpx;
  background: $uni-bg-color-grey;
  border-radius: $uni-border-radius-lg;
  padding: 20rpx;
  font-size: $uni-font-size-base;
  color: $uni-text-color;
  line-height: 1.6;
  width: 100%;
  box-sizing: border-box;
}

.char-count {
  display: block;
  text-align: right;
  font-size: $uni-font-size-sm;
  color: $uni-text-color-grey;
  margin-top: 8rpx;
}

.image-upload {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
  margin-top: 16rpx;
  margin-bottom: 32rpx;
  
  .image-item {
    position: relative;
    width: 100%;
    padding-bottom: 100%;
    
    .uploaded-img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: $uni-border-radius-lg;
      background-color: #f0f0f0;
    }
    
    .delete-btn {
      position: absolute;
      top: -10rpx;
      right: -10rpx;
      width: 44rpx;
      height: 44rpx;
      border-radius: 50%;
      background-color: rgba(0, 0, 0, 0.6);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24rpx;
    }
  }
  
  .upload-btn {
    width: 100%;
    padding-bottom: 100%;
    position: relative;
    background-color: $uni-bg-color-grey;
    border: 2rpx dashed $uni-border-color;
    border-radius: $uni-border-radius-lg;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    
    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .upload-icon {
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 60rpx;
      color: $uni-text-color-grey;
    }
    
    .upload-text {
      position: absolute;
      top: 65%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: $uni-font-size-sm;
      color: $uni-text-color-grey;
    }
  }
}

.submit {
  margin-top: 16rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: $uni-font-size-base;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
