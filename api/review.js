/**
 * @file api/review.js — 评价相关前端 API 封装
 *
 * 【职责定位】
 * 封装评价的读取、图片链接转换等前端处理逻辑，
 * 供门店评价列表页（pages/store/reviews.vue）和订单详情页使用。
 *
 * 【图片处理流程说明（cloud:// → 临时 URL）】
 * uniCloud 云存储的图片以 cloud:// 协议的 fileID 存储在数据库中，
 * 不能直接用于 <image> 标签展示。本模块通过以下两步处理：
 *   Step 1: normalizeReviewImages(review)
 *           兼容三种历史图片格式（数组、JSON字符串、逗号分隔字符串），
 *           统一返回字符串数组；
 *   Step 2: resolveReviewImageUrls(list)
 *           批量调用 uniCloud.getTempFileURL 将 cloud:// fileID
 *           换取带签名的临时 HTTPS 链接，追加到 review._imageUrls 字段，
 *           不破坏原始 images 字段（保持数据可追溯性）。
 *
 * 【格式兼容设计背景】
 * 早期版本将多张图片以逗号拼接或 JSON 字符串存储，
 * 后期规范化为数组，但历史数据未做迁移，
 * 因此 normalizeReviewImages 需要同时处理三种格式以确保向下兼容。
 *
 * 【错误降级策略】
 * resolveReviewImageUrls 中，若 getTempFileURL 调用失败，
 * 直接返回原始 reviews 列表（不抛错），
 * 保证页面仍能正常渲染文字评价，只是图片无法显示。
 */
import { callCloud } from './client';

/**
 * 获取门店评价列表（分页 + 排序）
 * @param {Object} [params]             - 查询参数
 * @param {string} [params.storeId]     - 门店 ID（不传则查全部）
 * @param {number} [params.page]        - 当前页码，默认 1
 * @param {number} [params.pageSize]    - 每页条数，默认 20
 * @param {string} [params.sortBy]      - 排序方式：'latest'（最新）| 'highest'（最高分）
 * @returns {Promise} 含 list / total / avgRating 的评价数据
 */
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
