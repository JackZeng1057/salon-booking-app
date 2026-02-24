/**
 * @file api/agent.js — AI 服务顾问前端 API 封装
 *
 * 【职责定位】
 * 封装 ai-service-advisor 云函数的调用，供 AI 推荐页面使用。
 *
 * 【超时配置（30 秒）】
 * 由于 ai-service-advisor 需要调用阿里云 Qwen 大模型（含视觉场景需多模态推理），
 * 响应时间远超普通业务接口，故通过 options.timeout=30000 覆盖 client.js 的默认 15 秒，
 * 为 AI 推理预留充足时间（目标 P95 < 15 秒，极端场景 < 30 秒）。
 *
 * 【入参说明】
 * text          : 顾客需求文字描述（最多 300 字，由云函数侧强制截断）
 * imageFileIds  : 云存储 fileID 数组（最多 3 张，用于多模态发型参考图识别）
 * storeId       : 可选，指定推荐范围；不传时从全部门店服务中匹配
 *
 * 【返回值】
 * recommendations : 推荐服务列表（1-3 条，每条含 serviceId/name/reason/remark）
 * summary         : 总体建议文字，供 UI 展示在推荐卡片上方
 */
import { callCloud } from './client';

// AI 服务顾问：根据用户描述和可选图片推荐 1-3 个真实服务
// 入参：{ text, imageFileIds, storeId? }；当不传 storeId 时走全门店推荐
export function adviseServices(payload) {
  return callCloud('ai-service-advisor', payload || {}, { timeout: 30000 });
}
