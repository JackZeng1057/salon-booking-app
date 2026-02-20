# 🎓 Salon Booking App - 美发沙龙预约系统

> 功能完整的现代化美发沙龙预约系统 | uni-app + uniCloud

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![uni-app](https://img.shields.io/badge/uni--app-3.0+-green.svg)](https://uniapp.dcloud.io/)
[![uniCloud](https://img.shields.io/badge/uniCloud-Aliyun-orange.svg)](https://unicloud.dcloud.net.cn/)

📋 **验收测试请查看**：[验收方案.md](验收方案.md)

---

## ✨ 功能特色

### 🔍 智能搜索与筛选
- 关键词搜索（门店/服务/技师）
- 多维度筛选（距离/评分/价格）
- 灵活排序（距离/评分/价格优先）

### 🏪 门店详情增强
- 精美相册展示（环境/服务/门头图）
- 特色标签展示
- 营业时间清晰展示
- 详细预约规则说明

### 📅 预约流程优化
- 4步式可视化预约流程
- 智能预选推荐
- 关键步骤规则提示
- 一键确认预约

### ⭐ 完善评价体系
- 多维度评分（服务/环境/技师）
- 图文并茂评价
- 智能评价筛选（好评/差评/有图）
- 商家回复功能

### 🔔 实时通知提醒
- 预约成功通知
- 改期/取消提醒
- 爽约提醒
- 到店提醒

### 🗺️ 地图与定位
- 自动定位获取
- 精准距离计算
- 地图位置标记
- 一键导航功能

### 🎨 统一UI体验
- 现代化设计风格
- 流畅交互动画
- 完善状态反馈（加载/空态/错误态）
- 优质表单体验

---

## 📱 界面预览

### 门店列表
- 搜索框 + 筛选面板
- 门店卡片展示（封面/评分/距离/价格）
- 标签展示

### 门店详情
- 大图轮播
- 相册展示
- 服务列表
- 理发师团队
- 地图位置
- 预约规则

### 预约流程
- 进度条导航
- 服务选择
- 理发师选择
- 时段选择
- 规则提示
- 确认预约

### 评价系统
- 三维评分
- 内容输入
- 图片上传
- 评价列表展示

---

## 🚀 快速开始

### 环境要求
- Node.js >= 14
- HBuilderX 3.0+
- uniCloud账号

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd salon-booking-app
```

2. **安装依赖**
```bash
npm install
```

3. **配置uniCloud**
- 在 HBuilderX 中打开项目
- 右键 `uniCloud` 目录
- 选择"关联云服务空间"
- 选择或创建阿里云服务空间

4. **初始化数据库**
```bash
# 在 HBuilderX 中
# 右键 uniCloud-aliyun/database
# 选择"上传所有DB Schema"
```

5. **上传云函数**
```bash
# 在 HBuilderX 中
# 右键 uniCloud-aliyun/cloudfunctions
# 选择"上传所有云函数及公共模块"
```

6. **配置 AI 顾问 API Key（Qwen）**
- 云函数：`ai-service-advisor`
- 若你的控制台支持云函数环境变量，可配置：
  - `DASHSCOPE_API_KEY`（或 `QWEN_API_KEY`）
  - `QWEN_MODEL`（默认 `qwen3-vl-flash`）
  - `QWEN_BASE_URL`（默认 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`）
- 若控制台没有环境变量入口（常见），请在云函数目录新建：
  - `uniCloud-aliyun/cloudfunctions/ai-service-advisor/config.json`

7. **运行项目**
```bash
# H5
npm run dev:h5

# 微信小程序
npm run dev:mp-weixin

# APP
npm run dev:app
```

---

## 📁 项目结构

```
salon-booking-app/
├── pages/                      # 页面
│   ├── store/                 # 门店相关
│   │   ├── list.vue          # 门店列表
│   │   ├── detail.vue        # 门店详情
│   │   └── reviews.vue       # 评价列表
│   ├── order/                # 订单相关
│   │   ├── create.vue        # 创建预约
│   │   ├── detail.vue        # 订单详情
│   │   └── review.vue        # 评价订单
│   ├── user/                 # 用户相关
│   │   ├── home/            # 用户主页
│   │   ├── orders/          # 我的订单
│   │   └── notifications/   # 通知中心
│   ├── barber/              # 理发师端
│   │   ├── orders/          # 理发师订单
│   │   └── schedule/        # 排班管理
│   └── admin/               # 管理端
│       ├── dashboard.vue    # 运营看板
│       ├── orders/          # 订单管理
│       └── verify.vue       # 核验到店
│
├── components/               # 通用组件
│   ├── empty-state/         # 空状态组件
│   ├── loading-spinner/     # 加载组件
│   ├── error-state/         # 错误状态组件
│   └── page-wrapper/        # 页面包装组件
│
├── uniCloud-aliyun/         # 云端代码
│   ├── cloudfunctions/      # 云函数
│   │   ├── common/          # 公共模块
│   │   │   └── sb-common/  # 通用工具
│   │   ├── auth-*/         # 认证相关
│   │   ├── stores-*/       # 门店相关
│   │   ├── orders-*/       # 订单相关
│   │   ├── reviews-*/      # 评价相关
│   │   └── notifications-*/ # 通知相关
│   └── database/           # 数据库Schema
│       ├── users.schema.json
│       ├── stores.schema.json
│       ├── services.schema.json
│       ├── orders.schema.json
│       ├── reviews.schema.json
│       └── notifications.schema.json
│
├── api/                    # API封装
│   ├── client.js          # 云函数调用客户端
│   ├── auth.js            # 认证API
│   ├── store.js           # 门店API
│   └── order.js           # 订单API
│
├── store/                 # Vuex状态管理
│   ├── index.js
│   └── auth.js           # 认证状态
│
├── utils/                # 工具函数
│   ├── cache.js         # 缓存工具
│   └── status.js        # 状态工具
│
├── uni.scss              # 全局样式变量
├── App.vue               # 应用入口
├── pages.json            # 页面配置
└── manifest.json         # 应用配置
```

---

## 🔧 技术栈

### 前端
- **框架**: uni-app (Vue 2)
- **样式**: SCSS
- **状态管理**: Vuex
- **组件库**: uni-ui

### 后端
- **云服务**: uniCloud (阿里云)
- **云函数**: Node.js
- **数据库**: MongoDB
- **存储**: 云存储

### 核心功能
- **认证授权**: 基于角色的权限控制
- **地理位置**: 定位 + 距离计算
- **文件上传**: 图片上传与管理
- **实时通知**: 站内消息系统
- **数据缓存**: 本地缓存优化

---

## 📊 功能模块

### 用户端
- ✅ 用户注册/登录
- ✅ 门店搜索/筛选/排序
- ✅ 门店详情查看
- ✅ 在线预约
- ✅ 订单管理（取消/改期）
- ✅ 订单评价
- ✅ 售后申请
- ✅ 通知中心

### 理发师端
- ✅ 排班设置
- ✅ 订单管理
- ✅ 开始/完成服务
- ✅ 工作统计

### 管理端
- ✅ 核验到店
- ✅ 订单管理
- ✅ 爽约标记
- ✅ 售后处理
- ✅ 运营看板
- ✅ 数据统计

---

## 🎯 核心亮点

### 1. 完整的业务流程
```
用户搜索门店 → 查看详情 → 在线预约 → 到店核验 → 
服务进行 → 完成服务 → 用户评价 → 售后处理
```

### 2. 多维评价体系
- 服务评分
- 环境评分
- 技师评分
- 图文评价
- 商家回复

### 3. 智能筛选排序
- 基于距离的地理位置筛选
- 基于评分的质量筛选
- 基于价格的预算筛选
- 多维度灵活排序

### 4. 实时通知系统
- 订单状态变更通知
- 预约提醒
- 爽约提醒
- 服务进度通知

### 5. 完善的权限控制
- 用户权限（查看/修改自己的订单）
- 理发师权限（管理自己的排班和订单）
- 管理员权限（核验/管理门店订单）

---

## 📈 性能优化

- ✅ **数据缓存**: 门店列表/详情本地缓存（TTL 24h）
- ✅ **懒加载**: 图片懒加载，按需加载
- ✅ **分页加载**: 列表分页，减少单次数据量
- ✅ **字段裁剪**: 只返回必要字段，减少传输
- ✅ **防抖节流**: 搜索输入防抖，点击节流
- ✅ **并发优化**: Promise.all并行请求

---

## 🔐 安全措施

- ✅ **权限验证**: 云函数统一鉴权中间件
- ✅ **数据校验**: 输入参数严格校验
- ✅ **SQL注入防护**: 参数化查询
- ✅ **权限隔离**: 数据库权限控制
- ✅ **审计日志**: 关键操作记录审计

---

## 🎨 设计规范

### 主题色
- **主色**: `#1F2A44` - 深蓝色
- **辅助色**: `#F0B429` - 暖金色
- **成功色**: `#52C41A`
- **警告色**: `#FAAD14`
- **错误色**: `#FF4D4F`

### 字体
- **标题**: 40-48rpx，粗体
- **正文**: 28rpx
- **辅助**: 24-26rpx
- **说明**: 22rpx

### 圆角
- **小**: 6rpx
- **中**: 12rpx
- **大**: 24rpx

### 阴影
- **小**: 0 2rpx 10rpx rgba(15, 23, 42, 0.06)
- **中**: 0 6rpx 18rpx rgba(15, 23, 42, 0.10)
- **大**: 0 10rpx 36rpx rgba(15, 23, 42, 0.14)

---

## 📝 数据模型

### 核心数据表

#### users (用户表)
- 基本信息：用户名、手机号、头像
- 角色信息：user / barber / admin
- 门店关联：storeId (理发师/管理员)

#### stores (门店表)
- 基本信息：名称、地址、电话
- 详细信息：简介、相册、标签
- 位置信息：经纬度坐标
- 营业时间：工作日/周末
- 预约规则：须知/取消规则/改期规则
- 评分统计：综合/服务/环境评分

#### orders (订单表)
- 订单信息：订单号、核验码
- 关联信息：用户/门店/服务/理发师
- 时间信息：预约日期、开始时间、结束时间
- 状态信息：BOOKED / ARRIVED / IN_SERVICE / FINISHED / CANCELLED / NO_SHOW
- 时间戳：创建/到店/开始/完成/取消

#### reviews (评价表)
- 评分信息：服务/环境/技师/综合评分
- 评价内容：文字内容、图片数组
- 关联信息：订单/用户/门店/理发师
- 互动信息：点赞数、商家回复

#### notifications (通知表)
- 通知类型：预约成功/改期/取消/爽约/到店提醒
- 通知内容：标题、内容
- 状态信息：已读/未读
- 关联信息：关联ID、关联类型

---

## 🧪 测试账号

### 用户账号
- 手机号: `PHONE_PLACEHOLDER`
- 密码: `123456`

### 理发师账号
- 手机号: `PHONE_PLACEHOLDER`
- 密码: `123456`

### 管理员账号
- 手机号: `PHONE_PLACEHOLDER`
- 密码: `123456`

---

## 📖 开发文档

详细功能清单和验收标准请查看：
- [项目功能清单.md](./项目功能清单.md)

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交规范
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式调整
- refactor: 代码重构
- test: 测试相关
- chore: 构建/工具相关

---

## 📄 License

[MIT](LICENSE)

---

## 👥 联系方式

如有问题或建议，欢迎联系：
- 项目作者: [Your Name]
- Email: [Gitee repository profile]

---

## 🎓 致谢

感谢以下开源项目：
- [uni-app](https://uniapp.dcloud.io/)
- [uniCloud](https://unicloud.dcloud.net.cn/)
- [Vue.js](https://vuejs.org/)

---

**⭐ 如果这个项目对你有帮助，欢迎 Star！**
