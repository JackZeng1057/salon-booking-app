/**
 * 全局确认弹窗通信工具
 * 设计目标：
 * 1) 任意页面可通过 Promise 方式发起确认弹窗
 * 2) 由统一 Host 组件展示 UI，工具层只负责请求/响应关联
 */

let seed = 0;
// 以 confirmId 为键缓存 Promise 的 resolve，用于在用户点击后回填结果
const resolverMap = Object.create(null);
// 生成本次确认弹窗的唯一标识
function nextId() {
  seed += 1;
  return `confirm-${Date.now()}-${seed}`;
}

// 打开确认弹窗，返回 Promise<boolean|null>
export function openAppConfirm(options = {}) {
  const id = nextId();
  return new Promise((resolve) => {
    resolverMap[id] = resolve;
    // 下一个事件循环触发，避免与当前渲染周期冲突
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

// 由 Host 在“取消/确认”时回写结果
export function resolveAppConfirm(id, result) {
  const key = String(id || '').trim();
  if (!key) return;
  const resolver = resolverMap[key];
  if (typeof resolver !== 'function') return;
  delete resolverMap[key];
  resolver(!!result);
}
