import { callCloud } from './client';

// 获取门店评价列表
// 入参示例：{ storeId, page, pageSize, sortBy }
export function fetchStoreReviews(params = {}) {
  return callCloud('reviews-list', params || {});
}

// 兼容多种图片字段格式，统一返回字符串数组
// 兼容来源：
// 1) 新结构：review._imageUrls（前端已解析）；
// 2) 原始数组：review.images = []；
// 3) 历史字符串：JSON 字符串或逗号拼接字符串。
export function normalizeReviewImages(review) {
  if (!review) return [];
  if (Array.isArray(review._imageUrls)) {
    return review._imageUrls.map((item) => String(item || '').trim()).filter((item) => !!item);
  }
  const raw = review.images;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter((item) => !!item);
  }
  if (!raw) return [];
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter((item) => !!item);
      }
    } catch (e) {}
    return text
      .split(',')
      .map((item) => item.trim())
      .filter((item) => !!item);
  }
  return [];
}

// 将 cloud:// 图片转换成可预览临时链接
// 返回值约定：在每条 review 上追加 `_imageUrls`，不破坏原始 `images` 字段。
export async function resolveReviewImageUrls(list) {
  const reviews = Array.isArray(list) ? list : [];
  const cloudIds = [];
  reviews.forEach((review) => {
    normalizeReviewImages(review).forEach((img) => {
      if (String(img).startsWith('cloud://')) cloudIds.push(String(img));
    });
  });
  if (cloudIds.length === 0) return reviews;
  // 去重后批量换取临时 URL，减少重复请求。
  const uniqueCloudIds = Array.from(new Set(cloudIds));
  const urlMap = {};
  try {
    const res = await uniCloud.getTempFileURL({ fileList: uniqueCloudIds });
    const fileList = (res && res.fileList) || [];
    fileList.forEach((item) => {
      const key = String(item.fileID || '');
      const url = String(item.tempFileURL || '');
      if (key && url) urlMap[key] = url;
    });
  } catch (e) {
    // 链接转换失败时保持原数据可用，避免页面渲染中断。
    return reviews;
  }
  return reviews.map((review) => {
    const original = normalizeReviewImages(review);
    const converted = original.map((img) => (String(img).startsWith('cloud://') ? (urlMap[img] || img) : img));
    return {
      ...review,
      _imageUrls: converted
    };
  });
}
