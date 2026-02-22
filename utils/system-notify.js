import { authStore } from '../store/auth';
import { fetchNotifications } from '../api/notifications';
import { openAppConfirm } from './app-confirm';

// 轮询冷却：避免高频触发 unread 查询导致性能抖动。
const CHECK_COOLDOWN_MS = 45 * 1000;
// 每个用户单独记录“已推送过”的通知 ID，避免重复弹同一条本地通知。
const STORAGE_KEY_PREFIX = 'systemNotifiedIds:';
// 全局指纹：用于跨账号/跨会话去重同内容通知（兜底）。
const GLOBAL_FINGERPRINT_STORAGE_KEY = 'systemNotifiedFingerprints';
// 首次登录主界面的通知权限引导标记（全局一次，跨账号/跨角色）。
const FIRST_LOGIN_PERMISSION_PROMPT_DONE_KEY = 'notificationPermissionPromptDoneOnFirstLogin';
// 本地去重数据上限，防止 storage 无限增长。
const STORAGE_LIMIT = 500;
// 单次同步最多触发的系统通知条数，防止批量消息刷屏。
const MAX_PUSH_PER_SYNC = 3;
// 仅推送最近 24h 的关键消息，过期消息只在站内列表查看。
const IMPORTANT_WINDOW_MS = 24 * 60 * 60 * 1000;
// 全量业务通知统一使用高优先级渠道，确保“声音 + 悬浮 + 锁屏可见”具备默认能力。
// 说明：
// 1) Android 8+ 的通知渠道一旦创建，声音/重要级别等关键属性基本不可由应用再次修改；
// 2) 因此渠道 ID 需要稳定且可版本化（后续若用户手动改坏，可升级 ID 触发重建）；
// 3) 当前将所有业务通知收敛到一个渠道，避免“部分通知掉入默认低优先级渠道”。
const CRITICAL_CHANNEL_ID = 'salon_all_critical_v1';
// 渠道修复弹窗的节流存储键：
// 当检测到“业务通知”类别被系统/用户关闭关键能力时，会弹窗引导去设置页修复。
// 为避免频繁打扰，这里记录上次弹窗时间，30 分钟内不重复弹。
const CHANNEL_REPAIR_PROMPT_AT_KEY = 'businessChannelRepairPromptAt';

// 运行时状态位：控制并发、节流与一次性绑定行为。
let checking = false;
let lastCheckedAt = 0;
let clickHandlerBound = false;
let permissionChecked = false;
let pendingForceSync = false;
let channelReady = false;
let permissionRequesting = false;
let firstLoginPrompting = false;
let channelRepairPrompting = false;

function getPlusPushModule() {
  // 某些机型/打包配置下，直接访问 plus.push 会抛“模块未添加”异常。
  try {
    if (typeof plus === 'undefined') return null;
    return plus.push || null;
  } catch (err) {
    console.error('plus.push unavailable:', err);
    return null;
  }
}

function getPlusAndroidModule() {
  try {
    if (typeof plus === 'undefined') return null;
    return plus.android || null;
  } catch (err) {
    console.error('plus.android unavailable:', err);
    return null;
  }
}

function hasDoneFirstLoginPermissionPrompt() {
  return !!uni.getStorageSync(FIRST_LOGIN_PERMISSION_PROMPT_DONE_KEY);
}

function markFirstLoginPermissionPromptDone() {
  uni.setStorageSync(FIRST_LOGIN_PERMISSION_PROMPT_DONE_KEY, 1);
}

function shouldPromptChannelRepair() {
  const last = Number(uni.getStorageSync(CHANNEL_REPAIR_PROMPT_AT_KEY) || 0);
  const now = Date.now();
  // 返回 true 表示“允许再次弹修复引导”：
  // - 从未弹过，或
  // - 距离上次弹窗已超过 30 分钟
  return !(last > 0 && now - last < 30 * 60 * 1000);
}

function markChannelRepairPrompted() {
  // 记录本次弹窗时间，用于节流控制。
  uni.setStorageSync(CHANNEL_REPAIR_PROMPT_AT_KEY, Date.now());
}

// 当前登录用户 ID（兼容不同字段命名）。
function getCurrentUserId() {
  const user = authStore.state.user || {};
  return String(user._id || user.id || user.userId || user.uid || '').trim();
}

// 归一化当前角色：未知角色按普通用户处理，避免误推管理员级提醒。
function getCurrentRole() {
  const role = String(authStore.state.role || (authStore.state.user && authStore.state.user.role) || '').trim();
  if (role === 'admin' || role === 'barber' || role === 'user') return role;
  return 'user';
}

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

// 读取“已通知 ID 列表”，并做字符串化与空值过滤。
function loadNotifiedIdList(userId) {
  const raw = uni.getStorageSync(getStorageKey(userId));
  if (!Array.isArray(raw)) return [];
  return raw
    .map((id) => String(id || '').trim())
    .filter(Boolean);
}

// 保存“已通知 ID 列表”：去重 + 截断，保证本地存储可控。
function saveNotifiedIdList(userId, ids) {
  const list = Array.isArray(ids) ? ids : [];
  const unique = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const id = String(list[i] || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  const sliced = unique.slice(-STORAGE_LIMIT);
  uni.setStorageSync(getStorageKey(userId), sliced);
}

// 读取全局通知指纹列表（用于跨会话去重同内容通知）。
function loadGlobalFingerprintList() {
  const raw = uni.getStorageSync(GLOBAL_FINGERPRINT_STORAGE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((text) => String(text || '').trim())
    .filter(Boolean);
}

// 保存全局通知指纹列表：同样做去重与截断。
function saveGlobalFingerprintList(list) {
  const values = Array.isArray(list) ? list : [];
  const unique = [];
  const seen = new Set();
  for (let i = 0; i < values.length; i += 1) {
    const item = String(values[i] || '').trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
  }
  uni.setStorageSync(GLOBAL_FINGERPRINT_STORAGE_KEY, unique.slice(-STORAGE_LIMIT));
}

// 构造通知指纹：type + relatedId + title + content 组合。
function buildNotificationFingerprint(item) {
  const type = String((item && item.type) || '').trim();
  const title = String((item && item.title) || '').trim();
  const content = String((item && item.content) || '').trim();
  const relatedId = String((item && item.relatedId) || '').trim();
  return `${type}|${relatedId}|${title}|${content}`;
}

// 在通知页内不重复弹系统通知，避免“列表已可见还弹横幅”的打扰。
function isNotificationPageActive() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const top = pages && pages.length > 0 ? pages[pages.length - 1] : null;
  const route = (top && top.route) || '';
  return route === 'pages/user/notifications/index' || route === 'pages/user/notifications/detail';
}

// 安全类通知识别：密码、账号安全、风控异常等关键词。
function isSecurityNotification(mergedText) {
  return /密码|账号安全|安全提醒|绑定手机号|异常|风控/.test(mergedText);
}

// 判断是否“关键通知”：
// - 全角色：取消、爽约、安全；
// - admin/barber/user 额外按职责与标题关键词判定。
function isCriticalNotification(item, role) {
  const type = String((item && item.type) || '').toLowerCase();
  const title = String((item && item.title) || '');
  const content = String((item && item.content) || '');
  const merged = `${title} ${content}`;

  // 全角色通用：爽约、取消、账号安全
  if (type === 'no_show' || type === 'cancel') return true;
  if (isSecurityNotification(merged)) return true;
  if (type === 'reschedule' && /改期失败|改期提醒|改期成功/.test(title)) return true;

  if (role === 'admin') {
    // 门店管理员待办：新预约、理发师审核、售后处理
    if (/新预约提醒|新的理发师申请|售后工单待处理/.test(title)) return true;
    return false;
  }

  if (role === 'barber') {
    // 理发师端：新预约与改期提醒、审核结果、安全类
    if (/新预约提醒|订单改期提醒|订单改期失败/.test(title)) return true;
    if (/理发师申请已通过|理发师申请未通过/.test(title)) return true;
    return false;
  }

  // 普通用户：预约结果、临近到店提醒、售后关键进度、账号审核结果
  if (/预约成功|订单改期成功|订单改期失败/.test(title)) return true;
  if (type === 'arrival_reminder' && /10分钟|5分钟/.test(title)) return true;
  if (/售后状态更新：未通过|售后状态更新：已解决|售后申请已提交/.test(title)) return true;
  if (/理发师申请已通过|理发师申请未通过/.test(title)) return true;
  return false;
}

// 本地通知点击 payload：统一跳转站内通知页。
function buildPushPayload(item) {
  return JSON.stringify({
    type: 'notification',
    notificationId: item && item._id ? String(item._id) : '',
    path: '/pages/user/notifications/index'
  });
}

// 读取系统通知授权状态（uni 原生 API）。
function getNotificationAuthStatus() {
  if (typeof uni.getAppAuthorizeSetting !== 'function') return '';
  try {
    const setting = uni.getAppAuthorizeSetting();
    return String((setting && setting.notificationAuthorized) || '').toLowerCase();
  } catch (err) {
    console.error('get notification auth status failed:', err);
    return '';
  }
}

// 打开系统通知设置页：先走 uni API，失败再走 Android Intent 兜底。
function openNotificationSettings() {
  if (typeof uni.openAppAuthorizeSetting === 'function') {
    let done = false;
    uni.openAppAuthorizeSetting({
      success: () => {
        done = true;
      },
      fail: () => {
        if (!done) openNotificationSettingsByIntent();
      }
    });
    setTimeout(() => {
      if (!done) openNotificationSettingsByIntent();
    }, 500);
    return;
  }
  openNotificationSettingsByIntent();
}

function openNotificationSettingsByIntent() {
  // #ifdef APP-PLUS
  try {
    const android = getPlusAndroidModule();
    if (typeof plus !== 'undefined' && plus.os && plus.os.name === 'Android' && android) {
      const main = android.runtimeMainActivity();
      const Intent = android.importClass('android.content.Intent');
      const Build = android.importClass('android.os.Build');
      const Uri = android.importClass('android.net.Uri');
      const sdkInt = Number(Build.VERSION.SDK_INT || 0);
      const pkg = main.getPackageName();
      const appUid = main.getApplicationInfo().uid;

      try {
        const intent = new Intent();
        intent.setAction('android.settings.APP_NOTIFICATION_SETTINGS');
        intent.putExtra('android.provider.extra.APP_PACKAGE', pkg);
        intent.putExtra('app_package', pkg);
        intent.putExtra('app_uid', appUid);
        main.startActivity(intent);
        return;
      } catch (innerErr) {
        console.error('open notification channel settings failed:', innerErr);
      }

      try {
        const appIntent = new Intent('android.settings.APPLICATION_DETAILS_SETTINGS');
        appIntent.setData(Uri.parse('package:' + pkg));
        main.startActivity(appIntent);
        return;
      } catch (innerErr2) {
        console.error('open application details settings failed:', innerErr2);
      }
    }
    if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.openURL) {
      plus.runtime.openURL('package:' + plus.runtime.appid);
    }
  } catch (err) {
    console.error('open app settings fallback failed:', err);
  }
  // #endif
}

function openCriticalChannelSettingsByIntent() {
  // 直接跳到“业务通知”这个渠道详情页，而不是应用总通知页。
  // 目的：让用户一次到位打开“声音/悬浮/振动/锁屏”等渠道级开关。
  // #ifdef APP-PLUS
  try {
    const android = getPlusAndroidModule();
    if (typeof plus !== 'undefined' && plus.os && plus.os.name === 'Android' && android) {
      const main = android.runtimeMainActivity();
      const Intent = android.importClass('android.content.Intent');
      const Build = android.importClass('android.os.Build');
      const sdkInt = Number(Build.VERSION.SDK_INT || 0);
      const pkg = main.getPackageName();
      const appUid = main.getApplicationInfo().uid;

      const intent = new Intent();
      if (sdkInt >= 26) {
        // Android 8+ 支持直接定位到“指定渠道”的设置页。
        intent.setAction('android.settings.CHANNEL_NOTIFICATION_SETTINGS');
        intent.putExtra('android.provider.extra.APP_PACKAGE', pkg);
        intent.putExtra('android.provider.extra.CHANNEL_ID', CRITICAL_CHANNEL_ID);
      } else {
        // Android 8 以下没有渠道概念，只能进入应用通知总设置页。
        intent.setAction('android.settings.APP_NOTIFICATION_SETTINGS');
        intent.putExtra('android.provider.extra.APP_PACKAGE', pkg);
        intent.putExtra('app_package', pkg);
        intent.putExtra('app_uid', appUid);
      }
      main.startActivity(intent);
      return;
    }
  } catch (err) {
    console.error('open critical channel settings failed:', err);
  }
  // #endif
  // 原生跳转失败时回退到应用总通知设置页，避免用户无路可走。
  openNotificationSettings();
}

// Android 13+ 动态申请 POST_NOTIFICATIONS 权限。
// 注意：仅在用户确认后调用，避免无感打断。
function requestAndroidNotificationPermission(onGranted, onDenied) {
  if (permissionRequesting) {
    if (typeof onDenied === 'function') onDenied();
    return;
  }
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || !plus.os || plus.os.name !== 'Android') {
    if (typeof onGranted === 'function') onGranted();
    return;
  }
  const android = getPlusAndroidModule();
  if (!android || typeof android.requestPermissions !== 'function') {
    if (typeof onDenied === 'function') onDenied();
    return;
  }
  // #endif

  permissionRequesting = true;
  try {
    const Build = android.importClass('android.os.Build');
    const sdkInt = Number(Build.VERSION.SDK_INT || 0);
    if (sdkInt > 0 && sdkInt < 33) {
      permissionRequesting = false;
      // Android 13 以下无运行时通知权限弹窗，视作可继续。
      if (typeof onGranted === 'function') onGranted();
      return;
    }
    android.requestPermissions(
      ['android.permission.POST_NOTIFICATIONS'],
      (result) => {
        permissionRequesting = false;
        const granted = Array.isArray(result && result.granted) ? result.granted : [];
        if (granted.includes('android.permission.POST_NOTIFICATIONS')) {
          permissionChecked = true;
          if (typeof onGranted === 'function') onGranted();
          return;
        }
        if (typeof onDenied === 'function') onDenied();
      },
      () => {
        permissionRequesting = false;
        if (typeof onDenied === 'function') onDenied();
      }
    );
  } catch (err) {
    permissionRequesting = false;
    console.error('request notification permission failed:', err);
    if (typeof onDenied === 'function') onDenied();
  }
}

async function requestSystemNotificationPermission() {
  const granted = await new Promise((resolve) => {
    requestAndroidNotificationPermission(
      () => resolve(true),
      () => resolve(false)
    );
  });
  if (granted) {
    permissionChecked = true;
    // 权限通过后立即确保渠道已创建，避免后续通知落入默认渠道。
    ensureCriticalPushChannel();
    // 创建完渠道后立刻做健康检查：
    // 若“业务通知”类别仍是静音/不悬浮，及时弹窗引导修复。
    await maybePromptChannelRepair();
    // 成功授权后主动触发一次同步，提升首次体验。
    syncCriticalSystemNotifications({ force: true });
    return true;
  }
  return false;
}

// 兼容不同 uni 版本的 PushChannel 管理 API。
function getChannelManager() {
  if (typeof uni.getChannelManager === 'function') {
    return uni.getChannelManager();
  }
  if (typeof uni.getPushChannelManager === 'function') {
    return uni.getPushChannelManager();
  }
  return null;
}

// 创建/确保高优先级业务通知渠道（Android）。
function ensureCriticalPushChannel() {
  // #ifdef APP-PLUS
  if (channelReady) return;
  const manager = getChannelManager();
  try {
    if (manager && typeof manager.setPushChannel === 'function') {
      // uni 通道配置：用于尽早声明渠道属性（高优先级、振动、锁屏可见）。
      // 注意：不同 ROM 仍可能覆盖最终展示行为，因此后面还会有 native 兜底创建。
      manager.setPushChannel({
        channelId: CRITICAL_CHANNEL_ID,
        channelDesc: '业务通知',
        enableLights: true,
        enableVibration: true,
        importance: 4,
        lockscreenVisibility: 1
      });
    }
    // native 兜底创建：
    // 在 Android 8+ 直接使用 NotificationChannel 显式写入系统铃声/振动模式/高优先级。
    ensureCriticalPushChannelNative();
    channelReady = true;
  } catch (err) {
    console.error('set push channel failed:', err);
  }
  // #endif
}

function ensureCriticalPushChannelNative() {
  // #ifdef APP-PLUS
  try {
    if (typeof plus === 'undefined' || !plus.os || plus.os.name !== 'Android') return;
    const android = getPlusAndroidModule();
    if (!android) return;
    const Build = android.importClass('android.os.Build');
    const sdkInt = Number(Build.VERSION.SDK_INT || 0);
    if (sdkInt < 26) return;

    const NotificationManager = android.importClass('android.app.NotificationManager');
    const NotificationChannel = android.importClass('android.app.NotificationChannel');
    const Context = android.importClass('android.content.Context');
    const RingtoneManager = android.importClass('android.media.RingtoneManager');
    const AudioAttributes = android.importClass('android.media.AudioAttributes');
    const AudioAttributesBuilder = android.importClass('android.media.AudioAttributes$Builder');

    const main = android.runtimeMainActivity();
    const nm = main.getSystemService(Context.NOTIFICATION_SERVICE);
    if (!nm) return;

    // 渠道级别必须是 IMPORTANCE_HIGH，才有机会触发悬浮通知（Heads-up）。
    const channel = new NotificationChannel(
      CRITICAL_CHANNEL_ID,
      '业务通知',
      NotificationManager.IMPORTANCE_HIGH
    );
    // 视觉提醒与触觉提醒打开，提升关键消息触达率。
    channel.enableLights(true);
    channel.enableVibration(true);
    channel.setVibrationPattern([0, 260, 180, 260]);
    // 显式指定系统默认通知铃声，避免落成“声音=无”。
    const soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    const attrs = new AudioAttributesBuilder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build();
    channel.setSound(soundUri, attrs);
    nm.createNotificationChannel(channel);
  } catch (err) {
    console.error('ensure native push channel failed:', err);
  }
  // #endif
}

function readCriticalChannelHealth() {
  // 读取“业务通知”渠道当前健康状态：
  // - importance 是否仍为 HIGH
  // - sound 是否存在（非静音）
  // - 振动是否开启
  // - 锁屏可见性是否被设置为完全不显示
  // 说明：这些开关可能被 ROM 默认策略或用户手动修改，因此需要运行时检测。
  // #ifdef APP-PLUS
  try {
    if (typeof plus === 'undefined' || !plus.os || plus.os.name !== 'Android') return null;
    const android = getPlusAndroidModule();
    if (!android) return null;
    const Build = android.importClass('android.os.Build');
    const sdkInt = Number(Build.VERSION.SDK_INT || 0);
    if (sdkInt < 26) return null;

    const Context = android.importClass('android.content.Context');
    const main = android.runtimeMainActivity();
    const nm = main.getSystemService(Context.NOTIFICATION_SERVICE);
    if (!nm || typeof nm.getNotificationChannel !== 'function') return null;
    const channel = nm.getNotificationChannel(CRITICAL_CHANNEL_ID);
    if (!channel) return { bad: true };

    const importance = Number(channel.getImportance ? channel.getImportance() : 0);
    const sound = channel.getSound ? channel.getSound() : null;
    const vibrate = !!(channel.shouldVibrate && channel.shouldVibrate());
    const lockscreenVisibility = Number(channel.getLockscreenVisibility ? channel.getLockscreenVisibility() : 0);

    const bad = importance < 4 || !sound || !vibrate || lockscreenVisibility < 0;
    // bad=true 表示需要引导用户进入渠道页修复。
    return { bad };
  } catch (err) {
    console.error('read channel health failed:', err);
    return null;
  }
  // #endif
  return null;
}

async function maybePromptChannelRepair() {
  // 仅在 Android App 端执行渠道修复提示。
  // #ifdef APP-PLUS
  if (channelRepairPrompting) return;
  // 系统总通知未授权时，先不做渠道修复，避免引导顺序混乱。
  const authStatus = getNotificationAuthStatus();
  if (authStatus !== 'authorized') return;
  // 节流控制：30 分钟内不重复弹窗。
  if (!shouldPromptChannelRepair()) return;
  const health = readCriticalChannelHealth();
  if (!health || !health.bad) return;

  channelRepairPrompting = true;
  markChannelRepairPrompted();
  try {
    const confirmed = await openAppConfirm({
      title: '开启业务通知',
      // 文案明确指出问题与行动路径：去“业务通知”类别开启声音/悬浮。
      content: '检测到“业务通知”类别未开启声音或悬浮提醒，请前往该类别开启声音与悬浮通知。',
      confirmText: '去开启'
    });
    if (confirmed === true) {
      openCriticalChannelSettingsByIntent();
    }
  } finally {
    channelRepairPrompting = false;
  }
  // #endif
}

// 发送系统通知：
// 1) 优先 uni.createPushMessage；
// 2) 失败再回退 plus.push.createMessage。
function sendSystemNotification(item) {
  const title = String((item && item.title) || '系统通知');
  const content = String((item && item.content) || '您有一条重要消息');
  const payload = buildPushPayload(item);

  // 优先使用 uni 的本地推送封装
  if (typeof uni.createPushMessage === 'function') {
    try {
      uni.createPushMessage({
        title,
        content,
        payload,
        channelId: CRITICAL_CHANNEL_ID,
        sound: 'system',
        vibrate: true,
        cover: true
      });
      return;
    } catch (err) {
      console.error('uni createPushMessage failed:', err);
    }
  }

  // #ifdef APP-PLUS
  const push = getPlusPushModule();
  if (!push || typeof push.createMessage !== 'function') return;
  try {
    push.createMessage(content, payload, {
      title,
      sound: 'system',
      vibrate: true,
      cover: true
    });
  } catch (err) {
    console.error('create system notification failed:', err);
  }
  // #endif
}

// 用户主动点击“消息铃铛进入通知页”时调用：
// - 已授权：直接返回；
// - 未授权：尝试拉系统授权框；
// - 系统未弹框/被拒绝：不自动跳系统设置，避免打断。
export async function promptNotificationPermissionByBell() {
  // #ifndef APP-PLUS
  return;
  // #endif
  const authStatus = getNotificationAuthStatus();
  if (authStatus === 'authorized') {
    permissionChecked = true;
    return;
  }
  await requestSystemNotificationPermission();
}

// 首次登录进入三端任一主界面时触发：
// 1) App 内确认弹窗（白底样式）仅显示一次；
// 2) 用户点击“去授权”后再拉起系统通知权限弹窗；
// 3) 后续切换账号/角色不再重复弹 App 引导。
export async function maybePromptNotificationPermissionOnFirstLogin() {
  // #ifndef APP-PLUS
  return;
  // #endif
  if (hasDoneFirstLoginPermissionPrompt()) return;
  if (firstLoginPrompting) return;
  if (!authStore.state.token) return;

  firstLoginPrompting = true;
  try {
    const confirmed = await openAppConfirm({
      title: '开启通知权限',
      content: '请开启系统通知权限，才能接收预约变更、取消、爽约等重要提醒。',
      confirmText: '去授权'
    });
    // Host 未就绪/弹窗未成功显示时，不落盘，后续 onShow 可重试。
    if (confirmed === null) return;
    // 只要成功展示并完成一次用户决策（确认/取消），后续都不再重复弹。
    markFirstLoginPermissionPromptDone();
    if (confirmed !== true) return;
    await requestSystemNotificationPermission();
  } finally {
    firstLoginPrompting = false;
  }
}

// 绑定系统通知点击事件（仅绑定一次）。
function bindSystemNotificationClick() {
  // #ifdef APP-PLUS
  const push = getPlusPushModule();
  if (!push || typeof push.addEventListener !== 'function') return;
  if (clickHandlerBound) return;
  clickHandlerBound = true;
  try {
    push.addEventListener('click', (msg) => {
      try {
        const payload = typeof msg.payload === 'string'
          ? JSON.parse(msg.payload || '{}')
          : (msg.payload || {});
        if (payload && payload.type === 'notification') {
          uni.navigateTo({
            url: '/pages/user/notifications/index'
          });
        }
      } catch (err) {
        console.error('handle system notification click failed:', err);
      }
    });
  } catch (err) {
    console.error('bind notification click failed:', err);
  }
  // #endif
}

// 同步关键系统通知（App 端）：
// - 拉取未读通知；
// - 经过“关键性 + 时效 + 去重”筛选；
// - 触发本地系统通知并持久化去重信息。
export async function syncCriticalSystemNotifications(options = {}) {
  // #ifndef APP-PLUS
  return;
  // #endif

  const now = Date.now();
  const force = !!(options && options.force);
  if (checking) {
    // 正在执行时记录强制重跑意图，等本轮结束后补跑一次。
    if (force) pendingForceSync = true;
    return;
  }
  // 非强制模式下走冷却节流。
  if (!force && now - lastCheckedAt < CHECK_COOLDOWN_MS) return;
  // 用户已在通知页时不再弹系统通知，避免重复干扰。
  if (isNotificationPageActive()) return;

  const userId = getCurrentUserId();
  if (!userId) return;
  const role = getCurrentRole();

  checking = true;
  lastCheckedAt = now;
  try {
    // 每次同步前兜底确保渠道存在，防止应用冷启动/进程重建后渠道未初始化。
    ensureCriticalPushChannel();
    // 同步周期内持续监测渠道健康，若被系统或用户改坏，及时引导修复。
    await maybePromptChannelRepair();
    bindSystemNotificationClick();
    const res = await fetchNotifications({
      unreadOnly: true,
      page: 1,
      pageSize: 30
    });
    const list = (res && res.list) || [];
    if (!list.length) return;

    const oldIds = loadNotifiedIdList(userId);
    const notifiedSet = new Set(oldIds);
    const willPersist = [...oldIds];
    const oldFingerprints = loadGlobalFingerprintList();
    const fingerprintSet = new Set(oldFingerprints);
    const willPersistFingerprints = [...oldFingerprints];

    let pushed = 0;
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i] || {};
      const id = String(item._id || '').trim();
      if (!id) continue;
      // 已推送过相同通知 ID 则跳过。
      if (notifiedSet.has(id)) continue;
      const fingerprint = buildNotificationFingerprint(item);
      if (!fingerprint) continue;
      // 同内容指纹去重：避免后端重复入库导致重复推送。
      if (fingerprintSet.has(fingerprint)) continue;
      // 仅关键通知触发系统级提醒。
      if (!isCriticalNotification(item, role)) continue;
      const createdAt = Number(item.createdAt || 0);
      // 超时消息不走系统通知，仅保留站内查看。
      if (createdAt > 0 && now - createdAt > IMPORTANT_WINDOW_MS) continue;
      if (pushed >= MAX_PUSH_PER_SYNC) break;

      sendSystemNotification(item);
      notifiedSet.add(id);
      willPersist.push(id);
      fingerprintSet.add(fingerprint);
      willPersistFingerprints.push(fingerprint);
      pushed += 1;
    }

    saveNotifiedIdList(userId, willPersist);
    saveGlobalFingerprintList(willPersistFingerprints);
  } catch (err) {
    console.error('sync critical system notifications failed:', err);
  } finally {
    checking = false;
    if (pendingForceSync) {
      pendingForceSync = false;
      // 轻微延迟重跑，避免同步结束瞬间的状态竞争。
      setTimeout(() => {
        syncCriticalSystemNotifications({ force: true });
      }, 200);
    }
  }
}
