<script>
	/**
	 * @file App.vue — 应用全局入口
	 *
	 * 【职责定位】
	 * uni-app 应用的根组件，处理 App 级别的生命周期事件：
	 *   - onLaunch : App 首次启动（冷启动）
	 *   - onShow   : App 从后台切回前台
	 *   - onHide   : App 切入后台
	 *
	 * 【登录态恢复（authStore.init）】
	 * App 启动第一步：从 uni.getStorageSync(STORAGE_KEY) 读取持久化的 token + user + role，
	 * 恢复 authStore.state，确保后续所有 callCloud 能自动携带 token。
	 * 无需每次启动重新登录，提升用户体验。
	 *
	 * 【系统通知轮询（syncCriticalSystemNotifications）】
	 * 由于 uniCloud 不支持服务端主动推送（无 WebSocket），
	 * 采用前台高频（30 秒）+ 后台低频（90 秒）的轮询策略，
	 * 拉取 notifications 集合中的"关键通知"（如订单改期/取消/审核结果），
	 * 并通过系统悬浮窗展示，尽量保证用户在不主动打开 App 时也能感知重要消息变化。
	 * iOS 后台 App 冻结机制可能导致轮询中断，服务端推送是理想的备选方案。
	 *
	 * 【样式全局重置（<style>）】
	 * page 根选择器定义全局字体族、颜色、溢出规则，
	 * 统一 box-sizing: border-box，消除移动端常见布局偏差。
	 */
	// 应用入口：负责初始化登录态与基础生命周期钩子
	import { authStore } from './store/auth'
	import { syncCriticalSystemNotifications } from './utils/system-notify'
	const SYSTEM_NOTIFY_FOREGROUND_POLL_MS = 30000
	const SYSTEM_NOTIFY_BACKGROUND_POLL_MS = 90000

	export default {
		data() {
			return {
				systemNotifyTimer: null,
				systemNotifyPollMs: 0
			}
		},
		onLaunch: function() {
			// 启动时恢复登录态，避免重复登录造成读操作升高
			authStore.init()
			syncCriticalSystemNotifications({ force: true, skipGuides: true })
			this.startSystemNotifyPolling(SYSTEM_NOTIFY_FOREGROUND_POLL_MS)
		},
		onShow: function() {
			syncCriticalSystemNotifications({ force: true, skipGuides: true })
			this.startSystemNotifyPolling(SYSTEM_NOTIFY_FOREGROUND_POLL_MS)
		},
		onHide: function() {
			// 进入后台后仍维持低频轮询，尽量保证后台也能触发系统悬浮通知。
			// 注意：若系统冻结/杀进程（尤其 iOS），仅靠本地轮询无法保证触达，需服务端推送兜底。
			syncCriticalSystemNotifications({ force: true, skipGuides: true })
			this.startSystemNotifyPolling(SYSTEM_NOTIFY_BACKGROUND_POLL_MS)
		},
		methods: {
			startSystemNotifyPolling(intervalMs) {
				const nextMs = Number(intervalMs) > 0 ? Number(intervalMs) : SYSTEM_NOTIFY_FOREGROUND_POLL_MS
				if (this.systemNotifyTimer && this.systemNotifyPollMs === nextMs) return
				this.stopSystemNotifyPolling()
				this.systemNotifyPollMs = nextMs
				this.systemNotifyTimer = setInterval(() => {
					syncCriticalSystemNotifications({ skipGuides: true })
				}, nextMs)
			},
			stopSystemNotifyPolling() {
				if (!this.systemNotifyTimer) return
				clearInterval(this.systemNotifyTimer)
				this.systemNotifyTimer = null
				this.systemNotifyPollMs = 0
			}
		}
	}
</script>

<style>
	/* 每个页面的公共样式入口 */
	/* 全局盒子模型重置 */
	view, text, image, input, button, scroll-view, textarea {
		box-sizing: border-box;
	}

	/* 页面基础样式 */
	page {
		background-color: #f8fafc;
		font-family: 'PingFang SC', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Segoe UI, Arial, Roboto, 'Microsoft Yahei', sans-serif;
		color: #0f172a;
		font-size: 28rpx;
		line-height: 1.5;
		/* 禁止页面出现左右滚动（常见于某些容器宽度溢出） */
		overflow-x: hidden;
	}

	/* 细腻动画与交互过渡 */
	@keyframes fadeUp {
		from { opacity: 0; transform: translateY(14rpx); }
		to { opacity: 1; transform: translateY(0); }
	}

	.fade-up {
		animation: fadeUp 220ms ease-out;
	}

	.card,
	.store-card,
	.service-item,
	.barber-item,
	.panel {
		transition: transform 180ms ease, box-shadow 180ms ease;
		animation: fadeUp 220ms ease-out;
	}

	.card:active,
	.store-card:active,
	.service-item:active,
	.barber-item:active {
		transform: scale(0.985);
		box-shadow: 0 10rpx 28rpx rgba(15, 23, 42, 0.16);
	}

	button {
		transition: transform 120ms ease, opacity 120ms ease;
		padding: 18rpx 24rpx;
		font-size: 30rpx;
	}
	button:active {
		transform: scale(0.98);
		opacity: 0.92;
	}

	/* 隐藏滚动条 (可选) */
	::-webkit-scrollbar {
		display: none;
		width: 0;
		height: 0;
	}

	/* 通用布局类 */
	.container {
		width: 100%;
		padding: 30rpx;
	}

	/* Flex 工具类 */
	.flex-row { display: flex; flex-direction: row; }
	.flex-col { display: flex; flex-direction: column; }
	.flex-1 { flex: 1; }
	.items-center { align-items: center; }
	.justify-center { justify-content: center; }
	.justify-between { justify-content: space-between; }
</style>
