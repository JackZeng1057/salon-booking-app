<template>
	<view class="page">
		<!-- 自定义顶部导航占位：去掉原生白色导航栏，同时提供返回按钮 -->
		<app-nav />
		<text class="title">门店看板</text>

		<view class="field">
			<text class="label">{{ mode === 'week' ? '锚点日期（统计近7天）' : '日期' }}</text>
			<picker mode="date" :value="date" @change="onDateChange">
				<view class="picker-value">{{ date }}</view>
			</picker>
		</view>

		<view class="mode-tabs">
			<view class="mode-tab" :class="{ active: mode === 'day' }" @click="switchMode('day')">日看板</view>
			<view class="mode-tab" :class="{ active: mode === 'week' }" @click="switchMode('week')">周看板</view>
		</view>
		<text class="range-tip">统计范围：{{ rangeText }}</text>

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

			<view class="kpi-grid">
				<view class="kpi-item">
					<text class="kpi-label">完成率</text>
					<text class="kpi-value">{{ formatRate(rates.finishRate) }}</text>
				</view>
				<view class="kpi-item">
					<text class="kpi-label">取消率</text>
					<text class="kpi-value">{{ formatRate(rates.cancelRate) }}</text>
				</view>
				<view class="kpi-item">
					<text class="kpi-label">爽约率</text>
					<text class="kpi-value">{{ formatRate(rates.noShowRate) }}</text>
				</view>
				<view class="kpi-item">
					<text class="kpi-label">评价均分</text>
					<text class="kpi-value">{{ reviewSummaryText }}</text>
				</view>
			</view>

			<view class="section">
				<text class="section-title">{{ mode === 'week' ? '近7天趋势' : '当日趋势' }}</text>
				<view v-if="mergedTrend.length === 0" class="hint">暂无数据</view>
				<view v-else class="trend-list">
					<view v-for="item in mergedTrend" :key="item.date" class="trend-row">
						<text class="trend-date">{{ item.date }}</text>
						<text class="trend-meta">预约 {{ item.total }} · 完成 {{ item.finished }} · 取消 {{ item.cancelled }} · 爽约 {{ item.noShow }}</text>
						<text class="trend-meta trend-sub">
							完成率 {{ formatRate(item.finishRate) }} · 评分 {{ formatReview(item.reviewAvg, item.reviewCount) }}
						</text>
					</view>
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
// 门店看板页：按日/周展示经营统计、理发师表现与评价趋势
import { fetchDashboard } from '../../api/admin';

function toDateString(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function emptyCounters() {
	return {
		total: 0,
		arrived: 0,
		finished: 0,
		cancelled: 0,
		noShow: 0
	};
}

function emptyRates() {
	return {
		finishRate: 0,
		cancelRate: 0,
		noShowRate: 0
	};
}

export default {
	data() {
		return {
			// 当前筛选日期（周模式下作为锚点日期）
			date: toDateString(new Date()),
			mode: 'day',
			loading: false,
			// 汇总数据（订单总量、到店、完成等）
			counters: emptyCounters(),
			rates: emptyRates(),
			range: {
				startDate: '',
				endDate: '',
				dates: []
			},
			// 理发师维度的完成/取消/爽约统计
			barberStats: [],
			// 趋势数据
			orderTrend: [],
			reviewTrend: []
		};
	},
	computed: {
		rangeText() {
			const startDate = this.range && this.range.startDate ? this.range.startDate : '';
			const endDate = this.range && this.range.endDate ? this.range.endDate : '';
			if (!startDate) return '未设置';
			if (!endDate || startDate === endDate) return startDate;
			return `${startDate} 至 ${endDate}`;
		},
		mergedTrend() {
			const reviewMap = {};
			(this.reviewTrend || []).forEach((item) => {
				if (item && item.date) {
					reviewMap[item.date] = item;
				}
			});
			return (this.orderTrend || []).map((item) => {
				const review = reviewMap[item.date] || {};
				return {
					...item,
					reviewAvg: review.avg,
					reviewCount: Number(review.count || 0)
				};
			});
		},
		reviewSummaryText() {
			const list = this.reviewTrend || [];
			let count = 0;
			let sum = 0;
			list.forEach((item) => {
				const c = Number(item && item.count);
				const avg = Number(item && item.avg);
				if (!Number.isFinite(c) || c <= 0) return;
				if (!Number.isFinite(avg) || avg <= 0) return;
				count += c;
				sum += avg * c;
			});
			if (count === 0) return '暂无';
			return (sum / count).toFixed(1);
		}
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
		switchMode(mode) {
			if (mode === this.mode) return;
			this.mode = mode;
			this.loadDashboard();
		},
		formatRate(rate) {
			const value = Number(rate || 0);
			return `${(value * 100).toFixed(1)}%`;
		},
		formatReview(avg, count) {
			const reviewCount = Number(count || 0);
			if (!reviewCount) return '暂无';
			const reviewAvg = Number(avg || 0);
			return `${reviewAvg.toFixed(1)}（${reviewCount}条）`;
		},
		// 拉取看板数据并更新统计
		async loadDashboard() {
			this.loading = true;
			try {
				const data = await fetchDashboard({ date: this.date, mode: this.mode });
				this.counters = (data && data.counters) || emptyCounters();
				this.rates = (data && data.rates) || emptyRates();
				this.range = (data && data.range) || { startDate: '', endDate: '', dates: [] };
				this.barberStats = (data && data.barberStats) || [];
				this.orderTrend = (data && data.orderTrend) || [];
				this.reviewTrend = (data && data.reviewTrend) || [];
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
	margin-bottom: 16rpx;
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

.mode-tabs {
	display: flex;
	gap: 12rpx;
	margin-bottom: 8rpx;
}

.mode-tab {
	padding: 10rpx 24rpx;
	border-radius: 30rpx;
	font-size: $uni-font-size-sm;
	color: $uni-text-color-grey;
	background: #ffffff;
	border: 2rpx solid $uni-border-color;
}

.mode-tab.active {
	color: #ffffff;
	background: $uni-color-primary;
	border-color: $uni-color-primary;
}

.range-tip {
	display: block;
	margin-bottom: 16rpx;
	font-size: 24rpx;
	color: $uni-text-color-grey;
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

.kpi-grid {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 12rpx;
	margin-bottom: 20rpx;
}

.kpi-item {
	background: rgba(31, 42, 68, 0.06);
	border-radius: 14rpx;
	padding: 16rpx;
	display: flex;
	flex-direction: column;
	gap: 6rpx;
}

.kpi-label {
	font-size: 22rpx;
	color: $uni-text-color-grey;
}

.kpi-value {
	font-size: 30rpx;
	font-weight: 700;
	color: $uni-text-color;
}

.section {
	margin-top: 16rpx;
}

.section-title {
	display: block;
	margin-bottom: 16rpx;
	font-size: $uni-font-size-base;
	color: $uni-text-color;
	font-weight: 600;
}

.trend-list {
	display: flex;
	flex-direction: column;
	gap: 10rpx;
}

.trend-row {
	background: $uni-bg-color-grey;
	border-radius: 14rpx;
	padding: 14rpx 16rpx;
}

.trend-date {
	display: block;
	font-size: 24rpx;
	color: $uni-text-color;
	font-weight: 600;
	margin-bottom: 6rpx;
}

.trend-meta {
	display: block;
	font-size: 22rpx;
	color: $uni-text-color-grey;
	line-height: 1.5;
}

.trend-sub {
	color: $uni-text-color-placeholder;
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
