/**
 * stores-services 云函数 —— 获取门店服务列表
 *
 * 【业务说明】
 * 返回指定门店的全部服务项目列表，
 * 主要给预约创建页面的“选择服务”步骤提供数据。
 *
 * 【权限】
 * 公开接口：无需登录
 */
// 引入统一响应包装、错误类型与错误码常量
const { withResponse, ApiError, ERROR_CODES } = require('sb-common');

// 获取门店服务列表（根据门店 id 过滤服务）
exports.main = withResponse(async (event, context) => {
  // 从入参中读取门店 id，若不存在则使用空字符串兜底
  const storeId = (event && event.id) || '';
  // 如果没有传入门店 id，则直接报参数错误
  if (!storeId) {
    // 抛出统一错误：参数不可处理（缺少门店 id）
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'store id required');
  }

  // 获取数据库操作实例
  const db = uniCloud.database();
  // 基于数据库实例构建查询条件并执行
  const res = await db
    // 指定要查询的集合：services
    .collection('services')
    // 仅查询当前门店的服务记录
    .where({ storeId })
    .field({
      _id: true,
      name: true,
      price: true,
      duration: true,
      description: true
    })
    // 按创建时间倒序排列，最新的服务在前
    .orderBy('createdAt', 'desc')
    // 执行查询并返回结果
    .get();

  // 返回服务列表数据，若无结果则返回空数组
  return res.data || [];
});
