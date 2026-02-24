/**
 * auth-me 云函数 —— 获取当前登录用户信息
 *
 * 【职责定位】
 * 本函数是 App 启动时的"身份探针"：前端在完成登录后（或 App 冷启动恢复 token 时），
 * 调用此函数判断当前用户的角色，从而决定跳转到哪个首页：
 *   - user   → 用户首页（预约、订单、评价）
 *   - barber → 理发师工作台（订单处理、排班管理）
 *   - admin  → 门店管理后台（看板、审核、设置）
 *
 * 【双源合并设计 —— 为何不直接返回 context.auth？】
 * uniCloud 平台在解析 token 后会把轻量用户对象注入到 context.auth 中，
 * 该对象只包含 token 签发时的快照，若后来账号信息发生变更（如理发师审核通过、
 * storeId 被绑定），context.auth 中的数据不会自动更新。
 * 因此本函数额外做一次数据库查询，取得最新记录后再返回给前端，
 * 保证前端拿到的信息始终与数据库一致。
 * 查询失败时回退到 context.auth 注入的对象，确保函数不会因 DB 异常而完全不可用。
 *
 * 【返回字段说明】
 *   _id            : 用户文档 ID，全局唯一标识符，前端用于标识当前登录会话
 *   username       : 账号名；理发师端同时作为"师傅名"在订单和排班中展示
 *   role           : 当前生效角色（user / barber / admin），应用层据此决定底部导航结构
 *   storeId        : 所属门店 ID；理发师和管理员均须有此字段才能执行营业相关操作
 *   phone          : 绑定手机号；密码找回时用于接收短信验证码
 *   name           : 显示名称；admin 注册时写入的是门店名称，barber/user 写的是账号名
 *   avatar         : 头像 URL；前端直接渲染，为空字符串时显示首字母占位符
 *   pendingRole    : 申请中的目标角色（仅 barber 入驻审核期间非空），配合 approvalStatus 使用
 *   approvalStatus : PENDING = 审核中（等待 admin 操作）
 *                    APPROVED = 已通过（role 已切换为 barber）
 *                    REJECTED = 已拒绝（role 仍为 user）
 */
const { withResponse, requireLogin } = require('sb-common');

exports.main = withResponse(async (event, context) => {
  // Step 1：鉴权。
  // requireLogin 内部执行双通道检查：
  //   ① 优先读 context.auth（uniCloud 平台根据请求头中的 token 注入）
  //   ② 若 context.auth 不存在，则从 event.token 查询 auth_tokens 集合完成验证
  // 任何一个通道验证通过即可，两者均失败则抛出 401。
  const user = await requireLogin(event, context);

  // Step 2：统一 userId。
  // 平台注入的用户对象字段名为 uid，数据库用户文档字段名为 _id，
  // 为了兼容两种来源，依次尝试三个字段名。
  const userId = user._id || user.uid || user.userId || '';
  const db = uniCloud.database();

  // Step 3：查询最新用户信息。
  // 使用 .field() 投影只取所需字段，避免拉取头像 base64、订单历史等大字段，
  // 降低云函数的数据读取费用与响应时延。
  let latest = null;
  if (userId) {
    const userRes = await db.collection('users').doc(userId).field({
      _id: true,
      username: true,
      role: true,
      storeId: true,
      phone: true,
      name: true,
      avatar: true,
      pendingRole: true,
      approvalStatus: true
    }).get();
    latest = userRes.data && userRes.data[0];
  }

  // Step 4：双源合并——数据库记录优先，查询失败时回退到鉴权阶段的用户对象。
  const target = latest || user;

  // Step 5：组装返回值，对每字段做空字符串兜底，
  // 防止前端因字段缺失导致渲染时的 undefined 访问异常。
  return {
    _id: target._id || target.uid || target.userId || userId,
    username: target.username || '',
    role: target.role || 'user',
    storeId: target.storeId || '',     // 理发师和管理员后续所有门店操作的关键外键
    phone: target.phone || '',         // 密码找回短信验证码的接收号码
    name: target.name || '',
    avatar: target.avatar || '',
    pendingRole: target.pendingRole || '',         // 待审核目标角色（申请入驻期间为 'barber'）
    approvalStatus: target.approvalStatus || ''   // PENDING=审核中 / APPROVED=通过 / REJECTED=拒绝
  };
});
