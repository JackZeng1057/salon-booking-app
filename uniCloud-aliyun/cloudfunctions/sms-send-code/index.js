// 短信验证码发送：支持阿里云市场 API（AppCode）与演示模式
const fs = require('fs');
const path = require('path');
const { withResponse, ApiError } = require('sb-common');

const BUILD_TAG = '2026-02-20-sms-market-v1';
const CODE_EXPIRE_MS = 5 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;

function readJsonFile(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    return {};
  }
}

// 配置优先级：环境变量 > config.json
function loadConfig() {
  const local = readJsonFile(path.join(__dirname, 'config.json'));

  const modeRaw = String(process.env.SMS_MODE || local.mode || 'auto').trim().toLowerCase();
  const mode = ['demo', 'market', 'auto'].includes(modeRaw) ? modeRaw : 'auto';

  return {
    mode,
    appCode: String(process.env.SMS_MARKET_APPCODE || local.appCode || '').trim(),
    endpoint: String(
      process.env.SMS_MARKET_ENDPOINT ||
        local.endpoint ||
        'https://gyytz.market.alicloudapi.com/sms/smsSend'
    ).trim(),
    method: String(process.env.SMS_MARKET_METHOD || local.method || 'POST').trim().toUpperCase(),
    timeoutMs: Number(process.env.SMS_MARKET_TIMEOUT_MS || local.timeoutMs || 8000),
    smsSignId: String(process.env.SMS_MARKET_SIGN_ID || local.smsSignId || '').trim(),
    templateId: String(process.env.SMS_MARKET_TEMPLATE_ID || local.templateId || '').trim(),
    paramTemplate: String(
      process.env.SMS_MARKET_PARAM_TEMPLATE || local.paramTemplate || '**code**:{code},**minute**:{minute}'
    ).trim(),
    contentTemplate: String(
      process.env.SMS_MARKET_CONTENT_TEMPLATE || local.contentTemplate || '【验证码】您的验证码是{code}，{minute}分钟内有效。'
    ).trim(),
    requireTemplateIds:
      String(
        process.env.SMS_MARKET_REQUIRE_TEMPLATE_IDS != null
          ? process.env.SMS_MARKET_REQUIRE_TEMPLATE_IDS
          : local.requireTemplateIds != null
            ? local.requireTemplateIds
            : true
      )
        .trim()
        .toLowerCase() !== 'false',
    fallbackToDemoOnProviderError:
      String(
        process.env.SMS_MARKET_FALLBACK_TO_DEMO != null
          ? process.env.SMS_MARKET_FALLBACK_TO_DEMO
          : local.fallbackToDemoOnProviderError != null
            ? local.fallbackToDemoOnProviderError
            : true
      )
        .trim()
        .toLowerCase() !== 'false'
  };
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(String(phone || ''));
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function pickType(rawType) {
  const t = String(rawType || '').trim();
  if (t === 'register' || t === 'login' || t === 'reset_password') return t;
  return 'reset_password';
}

function normalizeTimeout(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  if (v < 1000) return fallback;
  return v;
}

function formatWithVars(template, vars) {
  let out = String(template || '');
  Object.keys(vars || {}).forEach((key) => {
    const val = vars[key];
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
  });
  return out;
}

function buildProviderPayload({ phone, code, expireMinutes, config }) {
  // 该市场商品常见入参：mobile / param / smsSignId / templateId
  // 若配置了模板ID和签名ID，则优先走模板发送（推荐）
  const params = new URLSearchParams();
  params.set('mobile', phone);

  const hasTemplate = !!(config.templateId && config.smsSignId);
  const vars = { code, minute: expireMinutes };

  if (hasTemplate) {
    params.set('smsSignId', config.smsSignId);
    params.set('templateId', config.templateId);
    params.set('param', formatWithVars(config.paramTemplate, vars));
  } else {
    params.set('content', formatWithVars(config.contentTemplate, vars));
  }
  return params.toString();
}

function tryParseJson(payload) {
  if (!payload) return null;
  if (typeof payload === 'object') return payload;
  const raw = String(payload).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function isProviderSuccess(statusCode, bodyObj, bodyText) {
  if (statusCode >= 400 || statusCode <= 0) return false;
  if (bodyObj) {
    if (bodyObj.success === true) return true;
    const code = String(bodyObj.code || bodyObj.status || bodyObj.return_code || '').toUpperCase();
    if (code === '0' || code === '200' || code === 'OK' || code === 'SUCCESS' || code === '00000') return true;
    const msg = String(bodyObj.msg || bodyObj.message || bodyObj.info || '');
    if (/成功|已发送|提交成功/.test(msg)) return true;
  }
  return /成功|已发送|提交成功/.test(String(bodyText || ''));
}

async function sendByAliMarket({ phone, code, config }) {
  if (!config.appCode) {
    throw new Error('sms_market_appcode_missing');
  }
  if (!config.endpoint) {
    throw new Error('sms_market_endpoint_missing');
  }
  if (config.requireTemplateIds && (!config.smsSignId || !config.templateId)) {
    throw new Error('sms_market_template_config_missing');
  }

  const timeoutMs = normalizeTimeout(config.timeoutMs, 8000);
  const payload = buildProviderPayload({
    phone,
    code,
    expireMinutes: 5,
    config
  });
  const method = config.method === 'GET' ? 'GET' : 'POST';
  const requestUrl = method === 'GET' ? `${config.endpoint}${config.endpoint.includes('?') ? '&' : '?'}${payload}` : config.endpoint;

  const res = await uniCloud.httpclient.request(requestUrl, {
    method,
    timeout: timeoutMs,
    dataType: 'text',
    headers: {
      Authorization: `APPCODE ${config.appCode}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    data: method === 'GET' ? undefined : payload
  });

  const statusCode = Number((res && (res.status || res.statusCode)) || 0);
  const bodyText = String((res && res.data) || '');
  const bodyObj = tryParseJson(bodyText);
  const ok = isProviderSuccess(statusCode, bodyObj, bodyText);
  const providerRequestId =
    (res && res.headers && (res.headers['x-ca-request-id'] || res.headers['x-request-id'])) || '';

  if (!ok) {
    const err = new Error('sms_market_send_failed');
    err.statusCode = statusCode;
    err.providerRequestId = providerRequestId;
    err.responseText = bodyText.slice(0, 500);
    throw err;
  }

  return {
    providerRequestId,
    statusCode,
    response: bodyObj || bodyText
  };
}

async function saveCode({ db, phone, code, type, now }) {
  return db.collection('sms_codes').add({
    phone,
    code,
    type,
    expiresAt: now + CODE_EXPIRE_MS,
    used: false,
    createdAt: now
  });
}

exports.main = withResponse(async (event) => {
  const phone = String((event && event.phone) || '').trim();
  const type = pickType(event && event.type);
  const config = loadConfig();

  if (!phone) {
    throw new ApiError(400, 'phone is required');
  }
  if (!isValidPhone(phone)) {
    throw new ApiError(400, 'invalid phone number');
  }

  const db = uniCloud.database();
  const now = Date.now();

  // 60 秒频控
  const recentCode = await db
    .collection('sms_codes')
    .where({
      phone,
      type,
      createdAt: db.command.gt(now - RESEND_GAP_MS)
    })
    .limit(1)
    .get();
  if (Array.isArray(recentCode.data) && recentCode.data.length > 0) {
    throw new ApiError(429, '发送过于频繁，请稍后再试');
  }

  const code = genCode();
  const preferMarket = config.mode === 'market' || (config.mode === 'auto' && !!config.appCode);

  if (preferMarket) {
    try {
      const provider = await sendByAliMarket({ phone, code, config });
      await saveCode({ db, phone, code, type, now });

      console.log('sms-send-code summary', {
        buildTag: BUILD_TAG,
        mode: 'market',
        type,
        phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`,
        providerRequestId: provider.providerRequestId || '',
        statusCode: provider.statusCode
      });

      return {
        success: true,
        message: '验证码已发送',
        expiresIn: Math.floor(CODE_EXPIRE_MS / 1000),
        channel: 'market'
      };
    } catch (err) {
      console.error('sms market send failed:', err);
      if (!config.fallbackToDemoOnProviderError) {
        throw new ApiError(500, (err && err.message) || '验证码发送失败，请稍后重试');
      }
    }
  }

  // 演示兜底（可关闭）
  await saveCode({ db, phone, code, type, now });
  console.log('sms-send-code summary', {
    buildTag: BUILD_TAG,
    mode: 'demo',
    type,
    phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`
  });
  return {
    success: true,
    message: '验证码已发送（演示模式）',
    code,
    expiresIn: Math.floor(CODE_EXPIRE_MS / 1000),
    channel: 'demo'
  };
});
