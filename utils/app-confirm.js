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

/**
 * 打开全局确认弹窗
 * 通过 uni.$emit 驱动 app-confirm-host 组件渲染弹窗 UI，
 * 调用方只需 await 即可得到用户操作结果，无需手动管理弹窗状态。
 *
 * @param {Object}  options                - 弹窗配置
 * @param {string}  options.title          - 弹窗标题
 * @param {string}  options.content        - 弹窗正文内容
 * @param {string}  [options.confirmText]  - 确认按钮文案，默认 '确定'
 * @param {string}  [options.confirmType]  - 按钮类型：'primary'（默认蓝色）| 'danger'（危险操作红色）
 * @returns {Promise<boolean>} 用户点击确认返回 true，点击取消返回 false
 */
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

/**
 * 由 app-confirm-host 组件在用户操作后回写弹窗结果
 * 本函数为内部通信接口，仅供 Host 组件调用，业务页面不应直接调用。
 *
 * @param {string}  id     - 弹窗唯一标识（由 openAppConfirm 内部生成并随事件传出）
 * @param {boolean} result - 用户操作结果：true=点击确认，false/falsy=点击取消
 * @returns {void}
 */
export function resolveAppConfirm(id, result) {
  const key = String(id || '').trim();
  if (!key) return;
  const resolver = resolverMap[key];
  if (typeof resolver !== 'function') return;
  delete resolverMap[key];
  resolver(!!result);
}
