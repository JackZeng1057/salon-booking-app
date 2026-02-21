import { authStore } from '../store/auth';
import { fetchNotifications } from '../api/notifications';
import { openAppConfirm } from './app-confirm';

const CHECK_COOLDOWN_MS = 45 * 1000;
const STORAGE_KEY_PREFIX = 'systemNotifiedIds:';
const GLOBAL_FINGERPRINT_STORAGE_KEY = 'systemNotifiedFingerprints';
const PERMISSION_GUIDE_SHOWN_KEY = 'notificationPermissionGuideShown';
const HEADS_UP_GUIDE_SHOWN_KEY = 'notificationHeadsUpGuideShown';
const STORAGE_LIMIT = 500;
const MAX_PUSH_PER_SYNC = 3;
const IMPORTANT_WINDOW_MS = 24 * 60 * 60 * 1000;
const CRITICAL_CHANNEL_ID = 'salon_critical_v1';

let checking = false;
let lastCheckedAt = 0;
let clickHandlerBound = false;
let permissionChecked = false;
let pendingForceSync = false;
let channelReady = false;
let permissionRequesting = false;

function getCurrentUserId() {
  const user = authStore.state.user || {};
  return String(user._id || user.id || user.userId || user.uid || '').trim();
}

function getCurrentRole() {
  const role = String(authStore.state.role || (authStore.state.user && authStore.state.user.role) || '').trim();
  if (role === 'admin' || role === 'barber' || role === 'user') return role;
  return 'user';
}

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function loadNotifiedIdList(userId) {
  const raw = uni.getStorageSync(getStorageKey(userId));
  if (!Array.isArray(raw)) return [];
  return raw
    .map((id) => String(id || '').trim())
    .filter(Boolean);
}

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

function loadGlobalFingerprintList() {
  const raw = uni.getStorageSync(GLOBAL_FINGERPRINT_STORAGE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((text) => String(text || '').trim())
    .filter(Boolean);
}

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

function buildNotificationFingerprint(item) {
  const type = String((item && item.type) || '').trim();
  const title = String((item && item.title) || '').trim();
  const content = String((item && item.content) || '').trim();
  const relatedId = String((item && item.relatedId) || '').trim();
  return `${type}|${relatedId}|${title}|${content}`;
}

function isNotificationPageActive() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const top = pages && pages.length > 0 ? pages[pages.length - 1] : null;
  const route = (top && top.route) || '';
  return route === 'pages/user/notifications/index' || route === 'pages/user/notifications/detail';
}

function isSecurityNotification(mergedText) {
  return /密码|账号安全|安全提醒|绑定手机号|异常|风控/.test(mergedText);
}

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

function buildPushPayload(item) {
  return JSON.stringify({
    type: 'notification',
    notificationId: item && item._id ? String(item._id) : '',
    path: '/pages/user/notifications/index'
  });
}

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

function getChannelManager() {
  if (typeof uni.getChannelManager === 'function') {
    return uni.getChannelManager();
  }
  if (typeof uni.getPushChannelManager === 'function') {
    return uni.getPushChannelManager();
  }
  return null;
}

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

export async function syncCriticalSystemNotifications(options = {}) {
  // #ifndef APP-PLUS
  return;
  // #endif

  const now = Date.now();
  const force = !!(options && options.force);
  const forcePrompt = !!(options && options.forcePrompt);
  const skipGuides = !!(options && options.skipGuides);
  if (checking) {
    if (force) pendingForceSync = true;
    return;
  }
  if (!force && now - lastCheckedAt < CHECK_COOLDOWN_MS) return;
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
      if (notifiedSet.has(id)) continue;
      const fingerprint = buildNotificationFingerprint(item);
      if (!fingerprint) continue;
      if (fingerprintSet.has(fingerprint)) continue;
      if (!isCriticalNotification(item, role)) continue;
      const createdAt = Number(item.createdAt || 0);
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
      setTimeout(() => {
        syncCriticalSystemNotifications({ force: true });
      }, 200);
    }
  }
}
