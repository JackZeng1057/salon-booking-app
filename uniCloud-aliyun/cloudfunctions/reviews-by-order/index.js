/**
 * reviews-by-order 云函数 —— 查询订单评价
 *
 * 【业务说明】
 * 返回指定订单的评价记录（reviews 集合）。
 * 订单详情页底部展示“我的评价”时调用。
 * 一个订单最多有一条评价（限制 limit(1)）。
 *
 * 【权限】
 * - 需要登录（requireLogin）
 * - user 只能查询自己订单的评价
 */
const { withResponse, ApiError, ERROR_CODES, requireLogin } = require('sb-common');

// 获取订单评价：按订单查询并做权限校验
exports.main = withResponse(async (event, context) => {
  const user = await requireLogin(event, context);
  const orderId = (event && event.orderId) || '';
  if (!orderId) {
    throw new ApiError(400, 'orderId required');
  }

  const db = uniCloud.database();
  const orderRes = await db
    .collection('orders')
    .doc(orderId)
    .field({
      userId: true
    })
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    throw new ApiError(404, 'order not found');
  }

  // 用户角色仅允许查看自己的订单评价
  const role = user.role || user.type || '';
  const userId = user._id || user.uid || user.userId;
  if (role === 'user' && order.userId !== userId) {
    throw new ApiError(ERROR_CODES.FORBIDDEN, 'forbidden');
  }

  // 一个订单最多返回一条评价记录
  const res = await db.collection('reviews').where({ orderId }).limit(1).get();
  return { review: res.data && res.data[0] };
});
