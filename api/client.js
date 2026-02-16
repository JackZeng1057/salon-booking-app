import { authStore } from '../store/auth';

function extractRequestId(text) {
  const m = String(text || '').match(/\[requestId:([^\]]+)\]/);
  return m ? m[1] : '';
}

function stripRequestId(text) {
  return String(text || '').replace(/\s*\[requestId:[^\]]+\]\s*/g, '').trim();
}

function translateErrorMessage(message, code) {
  const pure = stripRequestId(message);
  const lower = pure.toLowerCase();

  const exactMap = {
    'No response': '服务无响应，请稍后重试',
    'Request failed': '请求失败，请稍后重试',
    'Internal Server Error': '服务器开小差了，请稍后重试',
    Unauthorized: '登录已失效，请重新登录',
    Forbidden: '暂无权限执行该操作',
    forbidden: '暂无权限执行该操作',
    'invalid credentials': '用户名或密码错误',
    'username and password required': '请输入用户名和密码',
    'username already exists': '用户名已存在',
    'storeId required': '请填写门店ID',
    'store name required': '请填写所属门店名称',
    'multiple stores matched': '存在同名门店，请在下拉列表中选择具体门店',
    'admin already exists for this store': '该门店已存在店家账号',
    'create store failed': '创建门店失败，请稍后重试',
    'invalid store data': '门店数据异常，请稍后重试',
    'admin storeId required': '当前管理员未绑定门店',
    'services must be array': '服务列表格式错误',
    'service name required': '请填写服务名称',
    'invalid service price': '服务价格格式错误',
    'invalid service duration': '服务时长格式错误',
    'assignments must be array': '理发师项目配置格式错误',
    'invalid barberId': '存在无效的理发师配置，请刷新重试',
    'invalid serviceId': '存在无效的服务项目配置，请刷新重试',
    'service not available for booking': '当前服务暂不可预约',
    'barber not available for selected service': '该理发师暂不提供此服务',
    'phone and code are required': '请输入手机号和验证码',
    'phone is required': '请输入手机号',
    'name or avatar is required': '请填写要保存的资料',
    'username or avatar is required': '请填写账号名或头像',
    'user not found': '未找到用户',
    'phone already bound': '该手机号已被绑定',
    'invalid phone number': '手机号格式不正确',
    'store id required': '缺少门店ID',
    'store not found': '未找到门店信息',
    'userId required': '缺少理发师账号ID',
    'invalid action': '审核操作无效',
    'application not found': '未找到理发师申请记录',
    'order not found': '未找到订单信息',
    'notification not found': '未找到通知',
    'notificationId is required': '缺少通知ID',
    'reviewId is required': '缺少评价ID',
    'review not found': '未找到评价记录',
    'status_not_allowed': '当前状态不允许此操作',
    schedule_not_set: '该日期未设置排班',
    schedule_invalid: '排班配置异常，请联系门店管理员',
    outside_schedule: '所选时段不在排班时间内',
    slot_conflict: '该时段已被占用，请重新选择',
    time_expired: '该时段已过期，请重新选择',
    not_overdue: '当前订单尚未超时',
    review_exists: '该订单已评价',
    'barber not found': '未找到理发师信息',
    'create order failed': '创建订单失败，请稍后重试'
  };
  if (exactMap[pure]) return exactMap[pure];

  if (/network|request:fail|failed to fetch|fetch failed|timeout|timed out|econn|enotfound|dns/i.test(lower)) {
    return '网络连接失败，请检查网络';
  }
  if (/invalid credentials|password|username/i.test(lower) && code === 401) {
    return '用户名或密码错误';
  }
  if (code === 401) return '登录已失效，请重新登录';
  if (code === 403) return '暂无权限执行该操作';
  if (code === 404) return '未找到相关数据';
  if (code >= 500) return '服务器开小差了，请稍后重试';
  if (code === 400 || code === 422) return '请求参数有误，请检查后重试';

  return pure || '请求失败，请稍后重试';
}

// 云函数调用封装：自动携带令牌并统一错误处理
export async function callCloud(name, data = {}) {
  const payload = { ...data };
  if (authStore.state.token) {
    payload.token = authStore.state.token;
  }

  let res;
  try {
    res = await uniCloud.callFunction({
      name,
      data: payload
    });
  } catch (e) {
    const requestId = (e && e.requestId) || extractRequestId(e && e.message);
    const readable = translateErrorMessage(e && e.message, e && e.code);
    const err = new Error(readable);
    err.code = (e && e.code) || -1;
    err.data = (e && e.data) || null;
    err.requestId = requestId || '';
    throw err;
  }

  const result = res && res.result;
  if (!result) {
    throw new Error('服务无响应，请稍后重试');
  }
  if (result.code !== 0) {
    const requestId = result.requestId || '';
    const readable = translateErrorMessage(result.message, result.code);
    const err = new Error(readable);
    err.code = result.code;
    err.data = result.data;
    err.requestId = requestId;
    throw err;
  }

  return result.data;
}
