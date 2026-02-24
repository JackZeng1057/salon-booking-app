/**
 * stores-detail 云函数 —— 获取门店详情
 *
 * 【业务说明】
 * 根据门店 ID 精确查询并返回门店的完整展示信息，
 * 包括名称、地址、联系方式、封面、标签、评分、来和预约规则等。
 *
 * 【权限】
 * 公开接口：无需登录
 */
// 引入统一响应包装、错误类型与错误码常量
const { withResponse, ApiError, ERROR_CODES } = require('sb-common');

// 获取门店详情（根据门店 id 精确查询）
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
  // 通过门店 id 查询 stores 集合中的对应文档
  const res = await db
    .collection('stores')
    .doc(storeId)
    .field({
      name: true,
      description: true,
      address: true,
      phone: true,
      cover: true,
      images: true,
      tags: true,
      businessHours: true,
      bookingRules: true,
      location: true,
      rating: true,
      minPrice: true,
      barberServiceAssignmentEnabled: true
    })
    .get();
  // 从查询结果中取出第一条门店记录
  const store = res.data && res.data[0];
  // 如果没有查到门店记录，则抛出未找到错误
  if (!store) {
    // 抛出统一错误：门店不存在
    throw new ApiError(ERROR_CODES.UNPROCESSABLE, 'store not found');
  }

  // 返回门店详情数据给调用方
  return store;
});
