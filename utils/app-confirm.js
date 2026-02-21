let seed = 0;
const resolverMap = Object.create(null);
const OPEN_TIMEOUT_MS = 1200;

function nextId() {
  seed += 1;
  return `confirm-${Date.now()}-${seed}`;
}

export function openAppConfirm(options = {}) {
  const id = nextId();
  return new Promise((resolve) => {
    resolverMap[id] = resolve;
    setTimeout(() => {
      if (typeof resolverMap[id] !== 'function') return;
      delete resolverMap[id];
      resolve(null);
    }, OPEN_TIMEOUT_MS);
    setTimeout(() => {
      uni.$emit('app:confirm:open', {
        id,
        title: String(options.title || '').trim(),
        content: String(options.content || '').trim(),
        confirmText: String(options.confirmText || '确定').trim(),
        confirmType: options.confirmType === 'danger' ? 'danger' : 'primary'
      });
    }, 0);
  });
}

export function resolveAppConfirm(id, result) {
  const key = String(id || '').trim();
  if (!key) return;
  const resolver = resolverMap[key];
  if (typeof resolver !== 'function') return;
  delete resolverMap[key];
  resolver(!!result);
}
