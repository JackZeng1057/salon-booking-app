<template>
  <view class="agent-page">
    <view class="top-nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="top-inner">
        <view class="nav-left">
          <view class="nav-brand">
            <view class="nav-brand-logo-wrap">
              <view class="nav-brand-logo">AI</view>
            </view>
            <text class="nav-brand-title">AI小顾问</text>
          </view>
        </view>
        <view class="nav-right">
          <view class="nav-mini-btn" @click="startNewChat">
            <text class="nav-mini-icon">⊕</text>
          </view>
          <view class="nav-mini-btn" @click="openHistory">
            <text class="nav-mini-icon">⋯</text>
          </view>
        </view>
      </view>
    </view>

    <scroll-view
      class="content"
      scroll-y
      :scroll-top="contentScrollTop"
      :scroll-into-view="scrollAnchor"
      :style="{ paddingTop: contentTopPadding + 'px', paddingBottom: contentBottomPadding }"
    >
      <view class="chat-list">
        <view v-if="chatItems.length === 0" class="prompt-list">
          <view class="hero-wrap">
            <view class="hero-logo-wrap">
              <view class="hero-logo">AI</view>
            </view>
            <text class="hero-title">你好，想做点什么？</text>
            <text class="hero-subtitle">输入需求或上传参考图，获取跨门店推荐</text>
          </view>
          <view
            v-for="(item, idx) in quickPrompts"
            :key="idx"
            class="prompt-item"
            @click="usePrompt(item)"
          >
            <text class="prompt-text">{{ item }}</text>
          </view>
        </view>

        <view
          v-for="item in chatItems"
          :key="item.id"
          class="msg-row"
          :class="item.role === 'user' ? 'msg-user' : 'msg-assistant'"
        >
          <view v-if="item.role === 'user'" class="msg-bubble msg-bubble-user">
            <text v-if="item.text" class="msg-text">{{ item.text }}</text>
            <view v-if="item.images && item.images.length > 0" class="msg-media-grid">
              <image
                v-for="(img, imgIdx) in item.images"
                :key="(img.fileId || img.preview || '') + '_' + imgIdx"
                class="msg-media-image"
                :src="(img && (img.preview || img.url)) || img"
                mode="aspectFill"
                @click="previewChatImage(item.images, imgIdx)"
              />
            </view>
          </view>

          <view v-else-if="item.type === 'loading'" class="loading-bubble">
            <view class="typing-dot dot1"></view>
            <view class="typing-dot dot2"></view>
            <view class="typing-dot dot3"></view>
            <text class="loading-text">AI正在思考...</text>
          </view>

          <view v-else-if="item.type === 'result'" class="result-card">
            <text class="result-title">顾问建议</text>
            <text class="result-advice">{{ item.data.advice }}</text>

            <view class="remark-box">
              <text class="remark-label">预约备注（将自动带入下单）</text>
              <text class="remark-content">{{ item.data.bookingRemark }}</text>
            </view>

            <view class="result-services">
              <text class="services-title">推荐服务（可跨门店）</text>
              <view
                v-for="(service, idx) in item.data.recommendations"
                :key="service.serviceId + '_' + service.storeId + '_' + idx"
                class="service-item"
                @click="goBooking(service, item.data.bookingRemark)"
              >
                <view class="service-main">
                  <text class="service-store">{{ service.storeName || '未知门店' }}</text>
                  <text class="service-name">{{ service.name }}</text>
                  <text class="service-meta">¥{{ service.price }} · {{ service.duration }}分钟</text>
                  <text class="service-reason">{{ service.reason }}</text>
                </view>
                <text class="service-action">去预约</text>
              </view>
            </view>
          </view>

          <view v-else class="msg-bubble msg-bubble-assistant">
            <text class="msg-text">{{ item.text }}</text>
          </view>
        </view>
      </view>

      <view id="chat-bottom-anchor" class="chat-bottom-anchor"></view>
    </scroll-view>

    <view class="composer-wrap" :style="{ bottom: composerBottom }">
      <scroll-view v-if="imageItems.length > 0" class="image-strip" scroll-x>
        <view class="image-row">
          <view v-for="(item, idx) in imageItems" :key="item.fileId" class="strip-item">
            <image class="strip-image" :src="item.preview" mode="aspectFill" @click="previewPendingImage(idx)" />
            <view class="strip-remove" @click.stop="removeImage(idx)">✕</view>
          </view>
        </view>
      </scroll-view>

      <view v-if="!inputFocused" class="composer">
        <view class="composer-plus" @click="pickImages">
          <text class="composer-plus-icon">+</text>
        </view>
        <input
          v-model="queryText"
          class="composer-input"
          placeholder="发送消息或输入发型诉求"
          :adjust-position="false"
          confirm-type="send"
          @focus="onInputFocus"
          @confirm="askAdvisor"
        />
        <view class="composer-send" :class="{ disabled: asking }" @click="askAdvisor">
          <text class="composer-send-text">发送</text>
        </view>
      </view>

      <view v-else class="composer-expanded">
        <textarea
          v-model="queryText"
          class="composer-textarea"
          placeholder="把问题和任务告诉我哟"
          :focus="inputFocused"
          :adjust-position="false"
          :show-confirm-bar="true"
          confirm-type="send"
          cursor-spacing="18"
          @blur="onInputBlur"
          @confirm="askAdvisor"
        />
        <view class="composer-expanded-icon">
          <text class="composer-expanded-icon-text">◉</text>
        </view>
      </view>
    </view>

    <view v-if="historyVisible" class="history-mask" @click="closeHistory">
      <view class="history-sheet" @click.stop>
        <view class="history-header">
          <view class="history-back" @click="closeHistory">‹</view>
          <text class="history-title">历史对话</text>
          <text v-if="batchMode" class="history-cancel" @click="cancelBatchMode">取消</text>
        </view>

        <view
          class="history-body"
          :style="{ height: batchMode ? 'calc(76vh - 186rpx)' : 'calc(76vh - 94rpx)' }"
          @click="closeHistoryMenu"
        >
          <text class="history-label">今天</text>
          <view class="history-card">
            <view
              v-for="item in todaySessions"
              :key="item.id"
              class="history-item"
              :class="{ 'history-item-selected': isBatchSelected(item.id) }"
              @click="onHistoryItemClick(item)"
              @longpress.stop="onHistoryItemLongPress(item, $event)"
            >
              <view class="history-item-main">
                <text v-if="batchMode" class="history-check">{{ isBatchSelected(item.id) ? '✓' : '○' }}</text>
                <text class="history-item-icon">◌</text>
                <text class="history-item-title">{{ item.title || '新会话' }}</text>
              </view>
              <text v-if="item.id === currentSessionId" class="history-current">当前会话</text>
            </view>
          </view>

          <text class="history-label">更早</text>
          <view class="history-card">
            <view
              v-for="item in olderSessions"
              :key="item.id"
              class="history-item"
              :class="{ 'history-item-selected': isBatchSelected(item.id) }"
              @click="onHistoryItemClick(item)"
              @longpress.stop="onHistoryItemLongPress(item, $event)"
            >
              <view class="history-item-main">
                <text v-if="batchMode" class="history-check">{{ isBatchSelected(item.id) ? '✓' : '○' }}</text>
                <text class="history-item-icon">◌</text>
                <text class="history-item-title">{{ item.title || '新会话' }}</text>
              </view>
            </view>
          </view>

          <text class="history-foot">已经全部展示</text>
        </view>

        <view
          v-if="historyMenuVisible && !batchMode"
          class="history-context-menu"
          :style="{ left: historyMenuLeft + 'px', top: historyMenuTop + 'px' }"
        >
          <view class="history-context-item" @click="enterBatchMode">批量</view>
          <view class="history-context-item history-context-danger" @click="deleteSessionById(historyMenuSessionId)">
            删除
          </view>
          <view class="history-context-arrow"></view>
        </view>

        <view v-if="batchMode" class="history-batch-bar">
          <view class="history-batch-btn" @click="toggleSelectAllBatch">{{ batchAllSelected ? '取消全选' : '全选' }}</view>
          <view class="history-batch-btn history-batch-danger" @click="deleteSelectedSessions">删除</view>
        </view>
      </view>
    </view>

    <bottom-tab-bar v-if="!inputFocused && !historyVisible" current="agent" />
  </view>
</template>

<script>
import { adviseServices } from '../../../api/agent';
import { authStore } from '../../../store/auth';
import BottomTabBar from '../../../components/bottom-tab-bar/bottom-tab-bar.vue';

const SESSION_STORAGE_KEY = 'ai_agent_sessions_v1';

export default {
  components: {
    BottomTabBar
  },
  data() {
    return {
      statusBarHeight: 24,
      navHeight: 112,
      queryText: '',
      inputFocused: false,
      imageItems: [],
      uploading: false,
      asking: false,
      scrollAnchor: '',
      contentScrollTop: 0,
      historyVisible: false,
      batchMode: false,
      batchSelectedIds: [],
      historyMenuVisible: false,
      historyMenuSessionId: '',
      historyMenuLeft: 0,
      historyMenuTop: 0,
      sessions: [],
      currentSessionId: '',
      seq: 0,
      chatItems: [],
      quickPrompts: [
        '我想要干净利落的短发，发质偏硬，如何选择？',
        '预算200以内，推荐适合职场的发型方案',
        '想做纹理感，不想太夸张，怎么搭配更自然？',
        '发尾有点干，能同时推荐剪发和护理吗？'
      ]
    };
  },
  computed: {
    contentTopPadding() {
      return Math.max(Number(this.navHeight || 88) - 18, 0);
    },
    contentBottomPadding() {
      if (this.inputFocused) return '20rpx';
      if (this.historyVisible) return '120rpx';
      return this.imageItems.length > 0 ? '420rpx' : '260rpx';
    },
    composerBottom() {
      if (this.inputFocused || this.historyVisible) return '0px';
      return '124rpx';
    },
    todaySessions() {
      return this.sessions.filter((item) => this.isToday(item.updatedAt));
    },
    olderSessions() {
      return this.sessions.filter((item) => !this.isToday(item.updatedAt));
    },
    batchAllSelected() {
      const total = this.sessions.length;
      if (!total) return false;
      return this.batchSelectedIds.length === total;
    }
  },
  onLoad() {
    this.initLayout();
    this.setSoftInputMode();
    this.hideTabBarSafe();
    this.initSessions();
  },
  onShow() {
    this.hideTabBarSafe();
  },
  onHide() {
    this.inputFocused = false;
    this.closeHistoryMenu();
    this.cancelBatchMode();
    this.showTabBarSafe();
    this.upsertCurrentSession();
  },
  onUnload() {
    this.showTabBarSafe();
    this.upsertCurrentSession();
  },
  methods: {
    initLayout() {
      try {
        const sys = uni.getSystemInfoSync();
        const statusBarHeight = Number(sys.statusBarHeight || 24);
        this.statusBarHeight = statusBarHeight;
        this.navHeight = statusBarHeight + 62;
      } catch (e) {
        this.statusBarHeight = 24;
        this.navHeight = 86;
      }
    },
    setSoftInputMode() {
      // #ifdef APP-PLUS
      try {
        let webview = null;
        if (typeof plus !== 'undefined' && plus.webview && plus.webview.currentWebview) {
          webview = plus.webview.currentWebview();
        }
        if (!webview) {
          webview = this.$scope && this.$scope.$getAppWebview && this.$scope.$getAppWebview();
        }
        if (webview && webview.setStyle) {
          webview.setStyle({
            softinputMode: 'adjustResize'
          });
        }
      } catch (e) {}
      // #endif
    },
    hideTabBarSafe() {
      try {
        uni.hideTabBar({ animation: false });
      } catch (e) {}
    },
    showTabBarSafe() {
      try {
        uni.hideTabBar({ animation: false });
      } catch (e) {}
    },
    initSessions() {
      try {
        const raw = uni.getStorageSync(SESSION_STORAGE_KEY);
        this.sessions = Array.isArray(raw) ? raw : [];
      } catch (e) {
        this.sessions = [];
      }
      if (this.sessions.length > 0) {
        const first = this.sessions[0];
        this.currentSessionId = first.id;
        this.chatItems = this.cloneChatItems(first.chatItems);
      } else {
        this.startNewChat(false);
      }
    },
    persistSessions() {
      try {
        uni.setStorageSync(SESSION_STORAGE_KEY, this.sessions);
      } catch (e) {}
    },
    genSessionId() {
      return `session_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    },
    cloneChatItems(items) {
      if (!Array.isArray(items)) return [];
      try {
        return JSON.parse(JSON.stringify(items));
      } catch (e) {
        return [];
      }
    },
    buildSessionTitle(chatItems) {
      const firstUser = (chatItems || []).find((item) => item && item.role === 'user' && item.text);
      if (!firstUser) return '新会话';
      return String(firstUser.text).slice(0, 16);
    },
    upsertCurrentSession() {
      const id = String(this.currentSessionId || '').trim();
      if (!id) return;
      const payload = {
        id,
        title: this.buildSessionTitle(this.chatItems),
        updatedAt: Date.now(),
        chatItems: this.cloneChatItems(this.chatItems)
      };
      const idx = this.sessions.findIndex((item) => item.id === id);
      if (idx >= 0) {
        this.sessions.splice(idx, 1, payload);
      } else {
        this.sessions.unshift(payload);
      }
      this.sessions.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      this.persistSessions();
    },
    isToday(ts) {
      const time = Number(ts || 0);
      if (!time) return false;
      const d = new Date(time);
      const n = new Date();
      return (
        d.getFullYear() === n.getFullYear() &&
        d.getMonth() === n.getMonth() &&
        d.getDate() === n.getDate()
      );
    },
    startNewChat(withTip = true) {
      this.upsertCurrentSession();
      this.currentSessionId = this.genSessionId();
      this.chatItems = [];
      this.queryText = '';
      this.imageItems = [];
      this.inputFocused = false;
      this.showTabBarSafe();
      this.historyVisible = false;
      this.cancelBatchMode();
      this.closeHistoryMenu();
      this.upsertCurrentSession();
      this.scrollAnchor = '';
      this.contentScrollTop = 0;
      if (withTip) {
        uni.showToast({ title: '已新建会话', icon: 'none' });
      }
    },
    openHistory() {
      this.upsertCurrentSession();
      this.closeHistoryMenu();
      this.cancelBatchMode();
      this.showTabBarSafe();
      this.historyVisible = true;
    },
    closeHistory() {
      this.closeHistoryMenu();
      this.cancelBatchMode();
      this.historyVisible = false;
      if (!this.inputFocused) {
        this.showTabBarSafe();
      }
    },
    onHistoryItemClick(session) {
      if (this.batchMode) {
        this.toggleBatchSelect(session.id);
        return;
      }
      this.switchSession(session);
    },
    onHistoryItemLongPress(session, event) {
      if (this.batchMode || !session || !session.id) return;
      const touch =
        (event && event.changedTouches && event.changedTouches[0]) ||
        (event && event.touches && event.touches[0]) ||
        null;
      const x = Number((touch && touch.clientX) || 220);
      const y = Number((touch && touch.clientY) || 340);
      let screenWidth = 390;
      try {
        const sys = uni.getSystemInfoSync();
        screenWidth = Number(sys.windowWidth || 390);
      } catch (e) {}
      const menuWidth = 178;
      this.historyMenuSessionId = session.id;
      this.historyMenuLeft = Math.max(16, Math.min(x - menuWidth, screenWidth - menuWidth - 16));
      this.historyMenuTop = Math.max(140, y - 30);
      this.historyMenuVisible = true;
    },
    closeHistoryMenu() {
      this.historyMenuVisible = false;
      this.historyMenuSessionId = '';
    },
    enterBatchMode() {
      this.batchMode = true;
      this.batchSelectedIds = [];
      this.closeHistoryMenu();
    },
    cancelBatchMode() {
      this.batchMode = false;
      this.batchSelectedIds = [];
      this.closeHistoryMenu();
    },
    isBatchSelected(sessionId) {
      return this.batchSelectedIds.includes(sessionId);
    },
    toggleBatchSelect(sessionId) {
      if (!sessionId) return;
      const idx = this.batchSelectedIds.indexOf(sessionId);
      if (idx >= 0) {
        this.batchSelectedIds.splice(idx, 1);
      } else {
        this.batchSelectedIds.push(sessionId);
      }
    },
    toggleSelectAllBatch() {
      if (this.batchAllSelected) {
        this.batchSelectedIds = [];
        return;
      }
      this.batchSelectedIds = this.sessions.map((item) => item.id);
    },
    deleteSessionById(sessionId) {
      if (!sessionId) return;
      const set = new Set([sessionId]);
      this.applyDeleteSessions(set);
      this.closeHistoryMenu();
    },
    deleteSelectedSessions() {
      if (!this.batchSelectedIds.length) {
        uni.showToast({ title: '请先选择会话', icon: 'none' });
        return;
      }
      const set = new Set(this.batchSelectedIds);
      this.applyDeleteSessions(set);
      this.cancelBatchMode();
    },
    applyDeleteSessions(deleteSet) {
      if (!deleteSet || deleteSet.size === 0) return;
      this.sessions = this.sessions.filter((item) => !deleteSet.has(item.id));
      if (!this.sessions.length) {
        this.currentSessionId = this.genSessionId();
        this.chatItems = [];
        this.sessions = [
          {
            id: this.currentSessionId,
            title: '新会话',
            updatedAt: Date.now(),
            chatItems: []
          }
        ];
      } else if (deleteSet.has(this.currentSessionId)) {
        const first = this.sessions[0];
        this.currentSessionId = first.id;
        this.chatItems = this.cloneChatItems(first.chatItems);
      }
      this.sessions.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      this.persistSessions();
    },
    switchSession(session) {
      if (!session || !session.id) return;
      this.upsertCurrentSession();
      this.currentSessionId = session.id;
      this.chatItems = this.cloneChatItems(session.chatItems);
      this.queryText = '';
      this.imageItems = [];
      this.historyVisible = false;
      this.closeHistoryMenu();
      this.cancelBatchMode();
      this.inputFocused = false;
      this.showTabBarSafe();
      this.$nextTick(() => {
        this.scrollToBottom();
      });
    },
    usePrompt(text) {
      this.queryText = String(text || '').trim();
    },
    onInputFocus() {
      this.inputFocused = true;
      this.setSoftInputMode();
      this.hideTabBarSafe();
      if (this.chatItems.length === 0) {
        this.scrollAnchor = '';
        this.contentScrollTop = 0;
      }
    },
    onInputBlur() {
      this.inputFocused = false;
      this.showTabBarSafe();
    },
    pickImages() {
      if (this.uploading) return;
      const remain = 3 - this.imageItems.length;
      if (remain <= 0) {
        uni.showToast({ title: '最多上传3张图片', icon: 'none' });
        return;
      }
      uni.chooseImage({
        count: remain,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const files = (res && res.tempFilePaths) || [];
          if (!files.length) return;
          this.uploadImages(files);
        }
      });
    },
    async uploadImages(files) {
      this.uploading = true;
      try {
        const user = authStore.state.user || {};
        const uid = user._id || user.userId || user.uid || 'guest';
        for (let i = 0; i < files.length; i += 1) {
          const filePath = files[i];
          const ext = (String(filePath).split('.').pop() || 'jpg').toLowerCase();
          const cloudPath = `ai-agent/${uid}_${Date.now()}_${i}.${ext}`;
          const uploadRes = await uniCloud.uploadFile({
            cloudPath,
            filePath
          });
          const fileID = (uploadRes && uploadRes.fileID) || '';
          if (!fileID) continue;
          this.imageItems.push({
            preview: filePath,
            fileId: fileID
          });
        }
      } catch (err) {
        uni.showToast({ title: '上传图片失败，请重试', icon: 'none' });
      } finally {
        this.uploading = false;
      }
    },
    removeImage(index) {
      this.imageItems.splice(index, 1);
    },
    previewPendingImage(index) {
      const urls = this.imageItems.map((item) => item && item.preview).filter((url) => !!url);
      if (!urls.length) return;
      const current = urls[Math.max(0, Math.min(index, urls.length - 1))];
      uni.previewImage({ current, urls });
    },
    previewChatImage(images, index) {
      const list = Array.isArray(images) ? images : [];
      const urls = list
        .map((item) => (typeof item === 'string' ? item : item && (item.preview || item.url || '')))
        .filter((url) => !!url);
      if (!urls.length) return;
      const current = urls[Math.max(0, Math.min(index, urls.length - 1))];
      uni.previewImage({ current, urls });
    },
    makeMsgId(prefix) {
      this.seq += 1;
      return `${prefix}_${Date.now()}_${this.seq}`;
    },
    removeChatById(id) {
      const idx = this.chatItems.findIndex((item) => item.id === id);
      if (idx >= 0) {
        this.chatItems.splice(idx, 1);
      }
    },
    async askAdvisor() {
      if (this.asking) return;

      const text = String(this.queryText || '').trim();
      if (!text && this.imageItems.length === 0) {
        uni.showToast({ title: '请先输入诉求或添加图片', icon: 'none' });
        return;
      }

      const displayText = text || (this.imageItems.length > 0 ? '发送了参考图，请结合图片给建议' : '');
      const imageFileIds = this.imageItems.map((item) => item.fileId);
      const messageImages = this.imageItems.map((item) => ({
        preview: item.preview,
        fileId: item.fileId
      }));

      this.chatItems.push({
        id: this.makeMsgId('user'),
        role: 'user',
        type: 'text',
        text: displayText,
        images: messageImages
      });

      const loadingId = this.makeMsgId('loading');
      this.chatItems.push({
        id: loadingId,
        role: 'assistant',
        type: 'loading'
      });

      this.queryText = '';
      this.imageItems = [];
      this.asking = true;
      this.scrollToBottom();
      this.upsertCurrentSession();

      try {
        const data = await adviseServices({
          text,
          imageFileIds
        });

        this.removeChatById(loadingId);
        this.chatItems.push({
          id: this.makeMsgId('assistant'),
          role: 'assistant',
          type: 'result',
          data: data || {
            advice: '暂无建议',
            bookingRemark: '',
            recommendations: []
          }
        });
      } catch (err) {
        this.removeChatById(loadingId);
        this.chatItems.push({
          id: this.makeMsgId('assistant_error'),
          role: 'assistant',
          type: 'text',
          text: err.message || '获取推荐失败，请稍后再试'
        });
      } finally {
        this.asking = false;
        this.upsertCurrentSession();
        this.scrollToBottom();
      }
    },
    goBooking(item, bookingRemark) {
      if (!item || !item.serviceId) return;
      const storeId = String(item.storeId || '').trim();
      if (!storeId) {
        uni.showToast({ title: '推荐项缺少门店信息', icon: 'none' });
        return;
      }
      const remark = encodeURIComponent(String(bookingRemark || ''));
      const url = `/pages/order/create?storeId=${storeId}&serviceId=${item.serviceId}&aiRemark=${remark}`;
      uni.navigateTo({ url });
    },
    scrollToBottom() {
      this.contentScrollTop = 0;
      this.scrollAnchor = '';
      this.$nextTick(() => {
        this.scrollAnchor = 'chat-bottom-anchor';
      });
    }
  }
};
</script>

<style scoped lang="scss">
.agent-page {
  height: 100vh;
  background: #f6f7fb;
  overflow: hidden;
}

.top-nav {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  z-index: 80;
  background: #f6f7fb;
}

.top-inner {
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16rpx;
}

.nav-left {
  display: flex;
  align-items: center;
}

.nav-brand {
  display: flex;
  align-items: center;
}

.nav-brand-logo-wrap {
  width: 42rpx;
  height: 42rpx;
  border-radius: 21rpx;
  background: conic-gradient(from 120deg, #ffe082, #81d4fa, #ce93d8, #ffe082);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-brand-logo {
  width: 32rpx;
  height: 32rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #6b4cd9;
  font-size: 16rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-brand-title {
  margin-left: 8rpx;
  color: #111827;
  font-size: 30rpx;
  font-weight: 700;
}

.nav-right {
  display: flex;
  align-items: center;
}

.nav-mini-btn {
  width: 60rpx;
  height: 60rpx;
  border-radius: 30rpx;
  margin-left: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-mini-icon {
  font-size: 36rpx;
  color: #111827;
  line-height: 1;
}

.content {
  height: 100vh;
  box-sizing: border-box;
  padding: 0 14rpx;
}

.chat-list {
  padding-top: 2rpx;
}

.prompt-list {
  margin-top: 12rpx;
}

.hero-wrap {
  margin: 4rpx 0 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-logo-wrap {
  width: 128rpx;
  height: 128rpx;
  border-radius: 64rpx;
  background: conic-gradient(from 120deg, #ffe082, #81d4fa, #ce93d8, #ffe082);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-logo {
  width: 96rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #6b4cd9;
  font-size: 34rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-title {
  margin-top: 20rpx;
  color: #111827;
  font-size: 36rpx;
  font-weight: 700;
}

.hero-subtitle {
  margin-top: 8rpx;
  color: #6b7280;
  font-size: 26rpx;
}

.prompt-item {
  display: inline-flex;
  max-width: 100%;
  background: #eef1f6;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 14rpx;
}

.prompt-text {
  color: #1f2937;
  font-size: 30rpx;
  line-height: 1.45;
}

.msg-row {
  display: flex;
  margin-bottom: 12rpx;
}

.msg-user {
  justify-content: flex-end;
}

.msg-assistant {
  justify-content: flex-start;
}

.msg-bubble {
  max-width: 84%;
  border-radius: 18rpx;
  padding: 16rpx 20rpx;
}

.msg-bubble-user {
  background: #efe7ff;
}

.msg-bubble-assistant {
  background: #ffffff;
  border: 1rpx solid #e5e7eb;
}

.msg-text {
  color: #111827;
  font-size: 30rpx;
  line-height: 1.5;
}

.msg-media-grid {
  margin-top: 10rpx;
  display: flex;
  flex-wrap: wrap;
}

.msg-media-image {
  width: 168rpx;
  height: 168rpx;
  border-radius: 14rpx;
  margin-right: 10rpx;
  margin-bottom: 10rpx;
  background: #e5e7eb;
}

.loading-bubble {
  min-width: 240rpx;
  background: #ffffff;
  border: 1rpx solid #e5e7eb;
  border-radius: 18rpx;
  padding: 18rpx 20rpx;
  display: flex;
  align-items: center;
}

.typing-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  margin-right: 8rpx;
  background: #94a3b8;
  animation: typing 1.2s infinite;
}

.dot2 {
  animation-delay: 0.15s;
}

.dot3 {
  animation-delay: 0.3s;
}

.loading-text {
  margin-left: 6rpx;
  color: #6b7280;
  font-size: 26rpx;
}

@keyframes typing {
  0% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-4rpx);
  }

  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
}

.result-card {
  width: calc(100% + 8rpx);
  margin-left: -4rpx;
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
  box-sizing: border-box;
}

.result-title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #111827;
}

.result-advice {
  display: block;
  margin-top: 10rpx;
  color: #374151;
  font-size: 30rpx;
  line-height: 1.6;
}

.remark-box {
  margin-top: 16rpx;
  background: #f7f8fb;
  border-radius: 14rpx;
  padding: 14rpx;
}

.remark-label {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
}

.remark-content {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  color: #111827;
  line-height: 1.6;
}

.result-services {
  margin-top: 18rpx;
}

.services-title {
  display: block;
  color: #6b7280;
  font-size: 24rpx;
}

.service-item {
  margin-top: 14rpx;
  border-radius: 14rpx;
  border: 1rpx solid #e5e7eb;
  padding: 16rpx;
  display: flex;
  align-items: center;
}

.service-main {
  flex: 1;
  min-width: 0;
}

.service-store {
  display: inline-block;
  background: #eef4ff;
  color: #1d4ed8;
  padding: 4rpx 10rpx;
  border-radius: 10rpx;
  font-size: 20rpx;
}

.service-name {
  display: block;
  margin-top: 8rpx;
  color: #111827;
  font-size: 32rpx;
  font-weight: 600;
}

.service-meta {
  display: block;
  margin-top: 6rpx;
  color: #6b7280;
  font-size: 24rpx;
}

.service-reason {
  display: block;
  margin-top: 8rpx;
  color: #374151;
  font-size: 24rpx;
  line-height: 1.5;
}

.service-action {
  margin-left: 14rpx;
  font-size: 26rpx;
  color: #1457ff;
  font-weight: 600;
}

.chat-bottom-anchor {
  height: 2rpx;
}

.composer-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  background: #f6f7fb;
  padding: 4rpx 14rpx calc(2rpx + env(safe-area-inset-bottom));
}

.image-strip {
  width: 100%;
  white-space: nowrap;
  margin-bottom: 8rpx;
}

.image-row {
  display: inline-flex;
  align-items: center;
}

.strip-item {
  width: 132rpx;
  height: 132rpx;
  border-radius: 14rpx;
  overflow: hidden;
  position: relative;
  margin-right: 12rpx;
  background: #e5e7eb;
}

.strip-image {
  width: 100%;
  height: 100%;
}

.strip-remove {
  position: absolute;
  right: 6rpx;
  top: 6rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 16rpx;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.composer {
  height: 88rpx;
  background: #ffffff;
  border: 1rpx solid #e5e7eb;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  padding: 0 10rpx;
}

.composer-plus {
  width: 64rpx;
  height: 64rpx;
  border-radius: 32rpx;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.composer-plus-icon {
  color: #374151;
  font-size: 42rpx;
  line-height: 1;
}

.composer-input {
  flex: 1;
  min-width: 0;
  margin: 0 12rpx;
  font-size: 30rpx;
  color: #111827;
}

.composer-send {
  min-width: 98rpx;
  height: 62rpx;
  border-radius: 32rpx;
  background: #1457ff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0 16rpx;
}

.composer-send.disabled {
  opacity: 0.6;
}

.composer-send-text {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
}

.composer-expanded {
  position: relative;
  background: #ffffff;
  border: 1rpx solid #e5e7eb;
  border-radius: 22rpx;
  padding: 16rpx 16rpx 56rpx;
}

.composer-textarea {
  width: 100%;
  height: 160rpx;
  font-size: 30rpx;
  color: #111827;
  line-height: 1.5;
}

.composer-expanded-icon {
  position: absolute;
  right: 16rpx;
  bottom: 14rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 26rpx;
  border: 1rpx solid #111827;
  display: flex;
  align-items: center;
  justify-content: center;
}

.composer-expanded-icon-text {
  font-size: 22rpx;
  color: #111827;
}

.history-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(17, 24, 39, 0.42);
  z-index: 120;
  display: flex;
  align-items: flex-end;
}

.history-sheet {
  width: 100%;
  height: 76vh;
  background: #ffffff;
  border-top-left-radius: 28rpx;
  border-top-right-radius: 28rpx;
  overflow: hidden;
}

.history-header {
  height: 94rpx;
  border-bottom: 1rpx solid #f0f1f5;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.history-back {
  position: absolute;
  left: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 52rpx;
  color: #111827;
}

.history-title {
  font-size: 48rpx;
  font-weight: 700;
  color: #111827;
}

.history-cancel {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  font-size: 26rpx;
}

.history-body {
  overflow-y: auto;
  padding: 20rpx 24rpx 32rpx;
  box-sizing: border-box;
  position: relative;
}

.history-label {
  display: block;
  margin: 10rpx 0 10rpx;
  color: #9ca3af;
  font-size: 26rpx;
}

.history-card {
  background: #f7f8fa;
  border-radius: 18rpx;
  padding: 8rpx 0;
}

.history-item {
  min-height: 80rpx;
  padding: 0 18rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-item-selected {
  background: #eef4ff;
}

.history-item-main {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.history-check {
  width: 30rpx;
  text-align: center;
  color: #1457ff;
  font-size: 26rpx;
  margin-right: 4rpx;
}

.history-item-icon {
  font-size: 28rpx;
  color: #9ca3af;
}

.history-item-title {
  margin-left: 8rpx;
  color: #111827;
  font-size: 32rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-current {
  margin-left: 12rpx;
  color: #9ca3af;
  font-size: 24rpx;
}

.history-foot {
  display: block;
  text-align: center;
  margin-top: 28rpx;
  color: #9ca3af;
  font-size: 24rpx;
}

.history-context-menu {
  position: absolute;
  width: 176px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(17, 24, 39, 0.16);
  padding: 8px 0;
  z-index: 6;
}

.history-context-item {
  height: 42px;
  line-height: 42px;
  padding: 0 18px;
  font-size: 28rpx;
  color: #111827;
}

.history-context-danger {
  color: #ef4444;
}

.history-context-arrow {
  position: absolute;
  bottom: -8px;
  right: 20px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid #ffffff;
}

.history-batch-bar {
  height: 92rpx;
  border-top: 1rpx solid #f0f1f5;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24rpx;
  box-sizing: border-box;
  background: #ffffff;
}

.history-batch-btn {
  min-width: 130rpx;
  height: 58rpx;
  border-radius: 29rpx;
  background: #f3f4f6;
  color: #111827;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 12rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
}

.history-batch-danger {
  background: #fee2e2;
  color: #ef4444;
}
</style>
