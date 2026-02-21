import { callCloud } from './client';

// 获取门店评价列表
export function fetchStoreReviews(params = {}) {
  return callCloud('reviews-list', params || {});
}

// 兼容多种图片字段格式，统一返回字符串数组
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
export async function resolveReviewImageUrls(list) {
  const reviews = Array.isArray(list) ? list : [];
  const cloudIds = [];
  reviews.forEach((review) => {
    normalizeReviewImages(review).forEach((img) => {
      if (String(img).startsWith('cloud://')) cloudIds.push(String(img));
    });
  });
  if (cloudIds.length === 0) return reviews;
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
