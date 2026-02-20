<script>
	// 应用入口：负责初始化登录态与基础生命周期钩子
	import { authStore } from './store/auth'
	import { syncCriticalSystemNotifications } from './utils/system-notify'
	const SYSTEM_NOTIFY_POLL_MS = 30000

	export default {
		data() {
			return {
				systemNotifyTimer: null
			}
		},
		onLaunch: function() {
			// 启动时恢复登录态，避免重复登录造成读操作升高
			authStore.init()
			syncCriticalSystemNotifications({ force: true })
			console.log('App Launch')
		},
		onShow: function() {
			syncCriticalSystemNotifications({ force: true })
			this.startSystemNotifyPolling()
			console.log('App Show')
		},
		onHide: function() {
			this.stopSystemNotifyPolling()
			console.log('App Hide')
		},
		methods: {
			startSystemNotifyPolling() {
				if (this.systemNotifyTimer) return
				this.systemNotifyTimer = setInterval(() => {
					syncCriticalSystemNotifications()
				}, SYSTEM_NOTIFY_POLL_MS)
			},
			stopSystemNotifyPolling() {
				if (!this.systemNotifyTimer) return
				clearInterval(this.systemNotifyTimer)
				this.systemNotifyTimer = null
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
		background-color: #F5F7FA;
		font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Segoe UI, Arial, Roboto, 'PingFang SC', 'miui', 'Hiragino Sans GB', 'Microsoft Yahei', sans-serif;
		color: #333333;
		font-size: 28rpx;
		line-height: 1.5;
		/* 禁止页面出现左右滚动（常见于某些容器宽度溢出） */
		overflow-x: hidden;
	}

	/* 细腻动画与交互过渡 */
	@keyframes fadeUp {
		from { opacity: 0; transform: translateY(12rpx); }
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
		transform: scale(0.98);
		box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.12);
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
