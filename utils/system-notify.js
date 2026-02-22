import { authStore } from '../store/auth';
import { fetchNotifications } from '../api/notifications';
import { openAppConfirm } from './app-confirm';

// 轮询冷却：避免高频触发 unread 查询导致性能抖动。
const CHECK_COOLDOWN_MS = 45 * 1000;
// 每个用户单独记录“已推送过”的通知 ID，避免重复弹同一条本地通知。
const STORAGE_KEY_PREFIX = 'systemNotifiedIds:';
// 全局指纹：用于跨账号/跨会话去重同内容通知（兜底）。
const GLOBAL_FINGERPRINT_STORAGE_KEY = 'systemNotifiedFingerprints';
// 引导弹窗展示标记，避免反复打扰用户。
const PERMISSION_GUIDE_SHOWN_KEY = 'notificationPermissionGuideShown';
const HEADS_UP_GUIDE_SHOWN_KEY = 'notificationHeadsUpGuideShown';
// 本地去重数据上限，防止 storage 无限增长。
const STORAGE_LIMIT = 500;
// 单次同步最多触发的系统通知条数，防止批量消息刷屏。
const MAX_PUSH_PER_SYNC = 3;
// 仅推送最近 24h 的关键消息，过期消息只在站内列表查看。
const IMPORTANT_WINDOW_MS = 24 * 60 * 60 * 1000;
// Android 通知渠道 ID（高优先级关键业务提醒）。
const CRITICAL_CHANNEL_ID = 'salon_critical_v1';

// 运行时状态位：控制并发、节流与一次性绑定行为。
let checking = false;
let lastCheckedAt = 0;
let clickHandlerBound = false;
let permissionChecked = false;
let pendingForceSync = false;
let channelReady = false;
let permissionRequesting = false;

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

function hasShownPermissionGuide() {
  return !!uni.getStorageSync(PERMISSION_GUIDE_SHOWN_KEY);
}

function markPermissionGuideShown() {
  uni.setStorageSync(PERMISSION_GUIDE_SHOWN_KEY, 1);
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
    if (typeof plus !== 'undefined' && plus.os && plus.os.name === 'Android' && plus.android) {
      const main = plus.android.runtimeMainActivity();
      const Intent = plus.android.importClass('android.content.Intent');
      const Build = plus.android.importClass('android.os.Build');
      const Uri = plus.android.importClass('android.net.Uri');
      const sdkInt = Number(Build.VERSION.SDK_INT || 0);
      const pkg = main.getPackageName();
      const appUid = main.getApplicationInfo().uid;

      try {
        const intent = new Intent();
        if (sdkInt >= 26) {
          intent.setAction('android.settings.CHANNEL_NOTIFICATION_SETTINGS');
          intent.putExtra('android.provider.extra.APP_PACKAGE', pkg);
          intent.putExtra('android.provider.extra.CHANNEL_ID', CRITICAL_CHANNEL_ID);
        } else {
          intent.setAction('android.settings.APP_NOTIFICATION_SETTINGS');
          intent.putExtra('app_package', pkg);
          intent.putExtra('app_uid', appUid);
        }
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

// Android 13+ 动态申请 POST_NOTIFICATIONS 权限。
// 注意：仅在用户确认后调用，避免无感打断。
function requestAndroidNotificationPermission(onGranted, onDenied) {
  if (permissionRequesting) return;
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || !plus.os || plus.os.name !== 'Android') {
    if (typeof onGranted === 'function') onGranted();
    return;
  }
  if (!plus.android || typeof plus.android.requestPermissions !== 'function') {
    if (typeof onDenied === 'function') onDenied();
    return;
  }
  // #endif

  permissionRequesting = true;
  try {
    const Build = plus.android.importClass('android.os.Build');
    const sdkInt = Number(Build.VERSION.SDK_INT || 0);
    if (sdkInt > 0 && sdkInt < 33) {
      permissionRequesting = false;
      if (typeof onDenied === 'function') onDenied();
      return;
    }
    plus.android.requestPermissions(
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

// 提示用户开启通知权限：
// - 先弹业务引导；
// - 同意后尝试系统授权；
// - 失败时引导手动跳设置页。
async function promptEnableNotificationPermission(forceShow = false) {
  if (!forceShow && hasShownPermissionGuide()) return;
  // 先标记，避免异常情况下重复弹窗循环
  markPermissionGuideShown();
  const confirmed = await openAppConfirm({
    title: '开启通知权限',
    content: '请开启系统通知权限，才能接收预约变更、取消、爽约等重要提醒。',
    confirmText: '去授权'
  });
  if (confirmed === null) return;
  if (!confirmed) return;

  requestAndroidNotificationPermission(
    () => {
      syncCriticalSystemNotifications({ force: true });
    },
    async () => {
      const nextConfirmed = await openAppConfirm({
        title: '未获取通知权限',
        content: '系统未弹出授权框或权限仍未开启，是否前往系统设置手动开启通知权限？',
        confirmText: '去设置'
      });
      if (!nextConfirmed) return;
      openNotificationSettings();
    }
  );
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

// 创建/确保关键通知渠道存在（Android）。
function ensureCriticalPushChannel() {
  // #ifdef APP-PLUS
  if (channelReady) return;
  const manager = getChannelManager();
  if (!manager || typeof manager.setPushChannel !== 'function') return;
  try {
    manager.setPushChannel({
      channelId: CRITICAL_CHANNEL_ID,
      channelDesc: '关键业务提醒',
      enableLights: true,
      enableVibration: true,
      importance: 4,
      lockscreenVisibility: 1
    });
    channelReady = true;
  } catch (err) {
    console.error('set critical push channel failed:', err);
  }
  // #endif
}

function hasShownHeadsUpGuide() {
  return !!uni.getStorageSync(HEADS_UP_GUIDE_SHOWN_KEY);
}

function markHeadsUpGuideShown() {
  uni.setStorageSync(HEADS_UP_GUIDE_SHOWN_KEY, 1);
}

// 横幅提醒引导：针对 Android 机型常见“权限开了但无横幅/无声音”场景。
async function maybeShowHeadsUpGuide(forceShow = false) {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || !plus.os || plus.os.name !== 'Android') return;
  if (!forceShow && hasShownHeadsUpGuide()) return;
  markHeadsUpGuideShown();
  const confirmed = await openAppConfirm({
    title: '开启横幅提醒',
    content: '若仍无横幅/响铃，请在通知设置里开启“横幅(悬浮)通知、声音、震动、锁屏显示”。',
    confirmText: '去开启'
  });
  if (confirmed === null) return;
  if (confirmed) {
    openNotificationSettings();
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
        cover: true
      });
      return;
    } catch (err) {
      console.error('uni createPushMessage failed:', err);
    }
  }

  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || !plus.push || typeof plus.push.createMessage !== 'function') return;
  try {
    plus.push.createMessage(content, payload, {
      title,
      sound: 'system',
      cover: true
    });
  } catch (err) {
    console.error('create system notification failed:', err);
  }
  // #endif
}

// 权限检查入口：
// - 已授权则直接通过；
// - 明确拒绝则触发引导；
// - 未知状态不自动强拉系统授权，保持可控体验。
function ensureNotificationPermission(options = {}) {
  // #ifdef APP-PLUS
  const forcePrompt = !!(options && options.forcePrompt);
  const authStatus = getNotificationAuthStatus();
  if (authStatus === 'authorized') {
    permissionChecked = true;
    return;
  }
  if (authStatus === 'denied') {
    promptEnableNotificationPermission(forcePrompt);
    return;
  }
  if (permissionChecked || permissionRequesting) return;
  if (typeof plus === 'undefined' || !plus.os) return;
  if (plus.os.name !== 'Android') {
    permissionChecked = true;
    return;
  }
  // 未明确授权状态时，不自动发起系统权限请求，统一走用户主动确认流程
  promptEnableNotificationPermission(forcePrompt);
  // #endif
}

// 绑定系统通知点击事件（仅绑定一次）。
function bindSystemNotificationClick() {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || !plus.push || typeof plus.push.addEventListener !== 'function') return;
  if (clickHandlerBound) return;
  clickHandlerBound = true;
  try {
    plus.push.addEventListener('click', (msg) => {
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
  const forcePrompt = !!(options && options.forcePrompt);
  const skipGuides = !!(options && options.skipGuides);
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
    if (!skipGuides) {
      ensureNotificationPermission({ forcePrompt });
    }
    ensureCriticalPushChannel();
    if (!skipGuides) {
      maybeShowHeadsUpGuide(forcePrompt);
    }
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
