<template>
	<view class="page">
		<!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
		<app-nav />
		<text class="title">门店看板</text>

		<view class="field">
			<text class="label">日期</text>
			<picker mode="date" :value="date" @change="onDateChange">
				<view class="picker-value">{{ date }}</view>
			</picker>
		</view>

		<view v-if="loading" class="hint">加载中...</view>
		<view v-else class="card">
			<view class="grid">
				<view class="grid-item">
					<text class="grid-label">总单量</text>
					<text class="grid-value">{{ counters.total }}</text>
				</view>
				<view class="grid-item">
					<text class="grid-label">到店</text>
					<text class="grid-value">{{ counters.arrived }}</text>
				</view>
				<view class="grid-item">
					<text class="grid-label">已完成</text>
					<text class="grid-value">{{ counters.finished }}</text>
				</view>
				<view class="grid-item">
					<text class="grid-label">已取消</text>
					<text class="grid-value">{{ counters.cancelled }}</text>
				</view>
				<view class="grid-item">
					<text class="grid-label">爽约</text>
					<text class="grid-value">{{ counters.noShow }}</text>
				</view>
			</view>

			<view class="section">
				<text class="section-title">理发师统计</text>
				<view v-if="barberStats.length === 0" class="hint">暂无数据</view>
				<view v-else class="list">
					<view v-for="item in barberStats" :key="item.barberId || item.barberName" class="row">
						<text class="value">{{ item.barberName || '未知' }}</text>
						<text class="meta">完成 {{ item.finished }} / 取消 {{ item.cancelled }} / 爽约 {{ item.noShow }}</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
// 门店看板页：按日期展示经营统计与理发师数据
import { fetchDashboard } from '../../api/admin';

function toDateString(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export default {
	data() {
		return {
			// 当前筛选日期
			date: toDateString(new Date()),
			loading: false,
			// 汇总数据（订单总量、到店、完成等）
			counters: {
				total: 0,
				arrived: 0,
				finished: 0,
				cancelled: 0,
				noShow: 0
			},
			// 理发师维度的完成/取消/爽约统计
			barberStats: []
		};
	},
	onLoad() {
		this.loadDashboard();
	},
	onShow() {
		this.loadDashboard();
	},
	methods: {
		onDateChange(e) {
			this.date = e.detail.value || '';
			this.loadDashboard();
		},
		// 拉取看板数据并更新统计
		async loadDashboard() {
			this.loading = true;
			try {
				const data = await fetchDashboard({ date: this.date });
				this.counters = (data && data.counters) || this.counters;
				this.barberStats = (data && data.barberStats) || [];
			} catch (err) {
				uni.showToast({ title: err.message || '加载失败', icon: 'none' });
			} finally {
				this.loading = false;
			}
		}
	}
};
</script>

<style scoped lang="scss">
.page {
	min-height: 100vh;
	/* 顶部留白稍微加大一些，避免标题紧贴状态栏（在前一次基础上再微调一点高度） */
	padding: 120rpx 30rpx 30rpx;
	background-color: $uni-bg-color-grey;
}

.title {
	font-size: 48rpx;
	font-weight: 700;
	color: $uni-color-primary;
	margin-bottom: 24rpx;
	padding-left: 6rpx;
}

.field {
	margin-bottom: 20rpx;
}

.label {
	display: block;
	font-size: $uni-font-size-sm;
	color: $uni-text-color-grey;
	margin-bottom: 12rpx;
}

.picker-value {
	background: #ffffff;
	border-radius: $uni-border-radius-lg;
	padding: 20rpx 24rpx;
	font-size: $uni-font-size-base;
	color: $uni-text-color;
}


.hint {
	font-size: $uni-font-size-sm;
	color: $uni-text-color-placeholder;
}

.card {
	background: #ffffff;
	border-radius: $uni-border-radius-lg;
	padding: 24rpx;
	box-shadow: $uni-shadow-base;
}

.grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 16rpx;
	margin-bottom: 24rpx;
}

.grid-item {
	background: $uni-bg-color-grey;
	border-radius: $uni-border-radius-lg;
	padding: 20rpx;
	display: flex;
	flex-direction: column;
	gap: 8rpx;
}

.grid-label {
	color: $uni-text-color-grey;
	font-size: $uni-font-size-sm;
}

.grid-value {
	color: $uni-text-color;
	font-size: 36rpx;
	font-weight: 700;
}

.section {
	margin-top: 12rpx;
}

.section-title {
	display: block;
	margin-bottom: 16rpx;
	font-size: $uni-font-size-base;
	color: $uni-text-color;
	font-weight: 600;
}

.list {
	display: flex;
	flex-direction: column;
	gap: 12rpx;
}

.row {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.value {
	color: $uni-text-color;
	font-size: $uni-font-size-base;
}

.meta {
	color: $uni-text-color-grey;
	font-size: $uni-font-size-sm;
}
</style>
