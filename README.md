# 理发预约系统

基于 `uni-app + uniCloud` 的多角色理发预约系统，包含用户端、理发师端、管理员端三条业务主线，覆盖注册登录、预约下单、到店核验、服务流转、评价售后、通知触达和运营管理。

本 README 已按当前仓库代码结构重写，目标是让评审或新成员可直接根据目录理解系统实现。

## 1. 项目定位与能力范围

### 1.1 角色与核心能力
- 用户端：选店、选服务、选理发师、预约、改期、取消、评价、售后、通知、AI 服务顾问。
- 理发师端：排班、时段管理、订单服务流转（开始/完成）、查看个人订单列表。
- 管理员端：门店运营总览、订单核验与处理、理发师审核与管理、门店资料维护、售后处理、评价管理。

### 1.2 核心业务规则
- 订单主状态机：`BOOKED -> ARRIVED -> IN_SERVICE -> FINISHED`。
- 异常状态：`BOOKED -> CANCELLED`、`BOOKED -> NO_SHOW`。
- 强约束：必须先核验到店（`ARRIVED`）后才能开始服务（`IN_SERVICE`）。
- 统一返回结构：`{ code, message, data, requestId }`。

## 2. 技术栈与运行形态

- 前端：`uni-app`（`App.vue + pages/*.vue`），入口文件为 `main.js`。
- 全局状态：轻量 `authStore`（`store/auth.js`），不依赖 Vuex。
- 服务端：`uniCloud` 云函数（阿里云空间）+ 公共模块 `sb-common`。
- 数据层：uniCloud MongoDB（Schema 文件在 `uniCloud-aliyun/database/*.schema.json`）。
- 自动化脚本：Node.js（`tests/` 目录）。

## 3. 仓库总览（顶层目录）

```text
salon-booking-app/
├── api/                        # 前端 API 封装（统一 callCloud）
├── components/                 # 通用组件
├── docs/                       # 交付文档、测试记录、接口文档
├── pages/                      # 业务页面（用户/理发师/管理员）
├── static/                     # 静态资源（logo、tabbar 图标）
├── store/                      # 全局登录态
├── tests/                      # 本地测试脚本
├── uniCloud-aliyun/            # 云端代码（云函数 + 数据库 schema/jql）
├── uni_modules/                # uni 官方模块依赖
├── unpackage/                  # 构建产物（当前仓库保留）
├── utils/                      # 通用工具（缓存/状态/系统通知/确认弹窗）
├── 云数据库json文件夹/          # 数据库 JSON 导出文件
├── 文本/                        # 需求与说明类文本
├── App.vue
├── main.js
├── pages.json
├── manifest.json
├── uni.scss
└── uni.promisify.adaptor.js
```

## 4. 根文件说明（关键入口）

| 路径 | 作用 |
| --- | --- |
| `App.vue` | 应用生命周期入口；初始化登录态；触发系统通知轮询同步。 |
| `main.js` | uni-app 入口；挂载 `authStore` 到全局属性。 |
| `pages.json` | 页面路由、全局导航、tabBar 配置。 |
| `manifest.json` | uni-app 平台构建与应用配置。 |
| `uni.scss` | 全局样式变量与基础样式。 |
| `uni.promisify.adaptor.js` | uni API Promise 适配。 |
| `androidPrivacy.json` | Android 隐私声明配置。 |

## 5. 前端目录详细说明

### 5.1 页面目录 `pages/`

#### 5.1.1 入口与认证

| 页面路径 | 作用 |
| --- | --- |
| `pages/index/roleGate.vue` | 角色分流入口，根据登录态与角色跳转到对应主界面。 |
| `pages/auth/login.vue` | 登录。 |
| `pages/auth/register.vue` | 注册。 |
| `pages/auth/forgot-password.vue` | 忘记密码（短信验证码 + 密码重置）。 |

#### 5.1.2 用户端页面

| 页面路径 | 作用 |
| --- | --- |
| `pages/user/home/index.vue` | 用户首页，门店推荐与快捷入口。 |
| `pages/user/agent/index.vue` | AI 服务顾问（文本/图片推荐）。 |
| `pages/user/orders/index.vue` | 用户订单列表。 |
| `pages/user/pricing/index.vue` | 价格说明页。 |
| `pages/user/reviews/index.vue` | 我的评价列表。 |
| `pages/user/notifications/index.vue` | 通知列表。 |
| `pages/user/notifications/detail.vue` | 通知详情。 |
| `pages/user/settings/index.vue` | 用户设置入口。 |
| `pages/user/settings/profile.vue` | 个人资料编辑。 |
| `pages/user/settings/phone.vue` | 手机号绑定/变更。 |
| `pages/user/settings/password.vue` | 密码重置。 |

#### 5.1.3 门店与订单页面（用户侧通用流程）

| 页面路径 | 作用 |
| --- | --- |
| `pages/store/list.vue` | 门店列表（筛选/排序/搜索）。 |
| `pages/store/detail.vue` | 门店详情（服务、理发师、规则、评价入口）。 |
| `pages/store/reviews.vue` | 门店评价列表。 |
| `pages/order/create.vue` | 创建预约订单。 |
| `pages/order/detail.vue` | 订单详情（核验码、事件、可操作按钮）。 |
| `pages/order/review.vue` | 提交评价（文本 + 图片）。 |
| `pages/order/aftersale.vue` | 提交售后申请。 |

#### 5.1.4 理发师端页面

| 页面路径 | 作用 |
| --- | --- |
| `pages/barber/schedule/index.vue` | 理发师排班设置与时段管理。 |
| `pages/barber/orders/index.vue` | 理发师订单列表与服务处理。 |

#### 5.1.5 管理员端页面

| 页面路径 | 作用 |
| --- | --- |
| `pages/admin/manage/index.vue` | 管理端首页，运营入口聚合。 |
| `pages/admin/dashboard.vue` | 运营看板（统计指标）。 |
| `pages/admin/orders/index.vue` | 门店订单管理（核验/流转/异常处理）。 |
| `pages/admin/verify.vue` | 独立核验码校验页面。 |
| `pages/admin/aftersales.vue` | 售后列表与处理。 |
| `pages/admin/reviews/index.vue` | 门店评价管理。 |
| `pages/admin/barber-approvals/index.vue` | 理发师入驻审核。 |
| `pages/admin/barber-services/index.vue` | 理发师服务项配置。 |
| `pages/admin/barbers/index.vue` | 理发师管理（改名/移除等）。 |
| `pages/admin/store-settings/index.vue` | 门店资料、营业信息、预约规则配置。 |

#### 5.1.6 通用账号设置

| 页面路径 | 作用 |
| --- | --- |
| `pages/account/settings/index.vue` | 管理员与理发师共用账号设置页。 |

#### 5.1.7 预留目录

| 目录路径 | 说明 |
| --- | --- |
| `pages/search/` | 预留目录，当前无页面文件。 |

### 5.2 组件目录 `components/`

| 组件路径 | 作用 |
| --- | --- |
| `components/app-nav/app-nav.vue` | 自定义导航栏，统一顶部交互。 |
| `components/bottom-tab-bar/bottom-tab-bar.vue` | 底部导航栏组件。 |
| `components/app-icon/app-icon.vue` | 图标组件封装。 |
| `components/app-modal/app-modal.vue` | 通用弹窗容器。 |
| `components/app-confirm-host/app-confirm-host.vue` | 全局确认弹窗宿主。 |
| `components/modern-date-picker/modern-date-picker.vue` | 日期选择器组件。 |

### 5.3 API 封装目录 `api/`

| 文件路径 | 主要职责 |
| --- | --- |
| `api/client.js` | 统一云函数调用入口 `callCloud`、错误码映射、requestId 处理。 |
| `api/auth.js` | 登录、注册、当前用户、手机号绑定、资料更新。 |
| `api/store.js` | 门店列表/详情/服务/理发师查询与门店配置更新。 |
| `api/order.js` | 订单创建、详情、列表、取消、改期、服务流转、售后、评价相关。 |
| `api/barber.js` | 理发师排班设置、时段读取。 |
| `api/admin.js` | 管理端看板接口。 |
| `api/notifications.js` | 通知列表、已读、删除、未读数。 |
| `api/review.js` | 门店评价查询与图片 URL 处理。 |
| `api/barberApproval.js` | 理发师申请列表与审核。 |
| `api/barberManage.js` | 理发师管理操作（列表、改名、移除）。 |
| `api/agent.js` | AI 服务顾问调用封装。 |

### 5.4 状态与工具目录

| 文件路径 | 作用 |
| --- | --- |
| `store/auth.js` | 登录态持久化（token/user/role）与全局访问。 |
| `utils/cache.js` | 本地缓存与 TTL 失效策略。 |
| `utils/status.js` | 订单/时段/售后状态文案格式化。 |
| `utils/system-notify.js` | 系统通知权限、渠道、轮询同步、去重推送。 |
| `utils/app-confirm.js` | Promise 化确认弹窗调用。 |

## 6. 云端代码说明（`uniCloud-aliyun/`）

### 6.1 云函数目录 `uniCloud-aliyun/cloudfunctions/`

#### 6.1.1 公共模块 `common/sb-common`

| 文件 | 作用 |
| --- | --- |
| `index.js` | 公共能力聚合导出。 |
| `withResponse.js` / `response.js` | 统一响应包装。 |
| `errors.js` | 错误类型与错误码定义。 |
| `auth.js` | 登录态与角色校验辅助。 |
| `password.js` | 密码处理辅助。 |
| `audit.js` | 审计日志辅助。 |
| `autoCancel.js` | 预约超时自动取消相关逻辑。 |
| `bookingSlots.js` | 时段计算/校验。 |
| `barberServices.js` | 理发师服务项处理。 |
| `reviewStats.js` | 评价统计维护。 |
| `queue.js` | 排队/等待信息辅助计算。 |
| `chinaTime.js` | 中国时区日期时间工具。 |

#### 6.1.2 业务云函数（全部目录）

| 云函数名 | 作用 |
| --- | --- |
| `auth-register` | 注册。 |
| `auth-login` | 登录。 |
| `auth-me` | 获取当前登录用户。 |
| `user-bind-phone` | 用户绑定手机号。 |
| `user-profile-update` | 用户资料更新。 |
| `password-reset` | 密码重置。 |
| `sms-send-code` | 短信验证码发送。 |
| `sms-verify-code` | 验证码校验。 |
| `stores-list` | 门店列表。 |
| `stores-detail` | 门店详情。 |
| `stores-services` | 门店服务列表。 |
| `stores-barbers` | 门店理发师列表。 |
| `store-update-profile` | 门店资料更新。 |
| `barber-schedule-set` | 理发师排班设置。 |
| `barber-slots-get` | 理发师时段查询。 |
| `barber-services-set` | 理发师服务项配置。 |
| `barber-applications-list` | 理发师申请列表。 |
| `barber-application-review` | 理发师申请审核。 |
| `barbers-manage` | 理发师管理。 |
| `orders-create` | 创建订单。 |
| `orders-detail` | 订单详情。 |
| `orders-mine` | 用户订单列表。 |
| `orders-barber-list` | 理发师订单列表。 |
| `orders-store-list` | 门店订单列表。 |
| `orders-verify` | 核验码校验。 |
| `orders-start-service` | 开始服务。 |
| `orders-finish-service` | 完成服务。 |
| `orders-cancel` | 订单取消。 |
| `orders-reschedule` | 订单改期。 |
| `orders-no-show` | 标记爽约。 |
| `orders-delete` | 删除订单。 |
| `orders-items-list` | 订单项目列表。 |
| `orders-events-list` | 订单事件流。 |
| `reviews-list` | 门店评价列表。 |
| `reviews-create` | 提交评价。 |
| `reviews-by-order` | 按订单查询评价。 |
| `reviews-mine` | 我的评价。 |
| `reviews-delete` | 删除评价。 |
| `aftersales-create` | 创建售后单。 |
| `aftersales-store-list` | 门店售后列表。 |
| `aftersales-reply` | 售后回复处理。 |
| `notifications-list` | 通知列表。 |
| `notifications-mark-read` | 标记通知已读。 |
| `notifications-delete` | 删除通知。 |
| `notifications-create` | 创建通知（多由其他云函数内部调用）。 |
| `admin-dashboard` | 管理端看板数据。 |
| `ai-service-advisor` | AI 顾问能力。 |
| `seed-data` | 初始化演示数据（部署或演示前可执行）。 |

### 6.2 数据库目录 `uniCloud-aliyun/database/`

#### 6.2.1 Schema 文件

| 文件 | 集合/用途 |
| --- | --- |
| `users.schema.json` | 用户与角色。 |
| `stores.schema.json` | 门店信息。 |
| `services.schema.json` | 服务项目定义。 |
| `barber_schedules.schema.json` | 理发师排班。 |
| `time_slots.schema.json` | 可预约时段。 |
| `orders.schema.json` | 订单主表。 |
| `order_items.schema.json` | 订单服务项明细。 |
| `order_events.schema.json` | 订单事件日志。 |
| `reviews.schema.json` | 评价数据。 |
| `aftersales.schema.json` | 售后单。 |
| `notifications.schema.json` | 站内通知。 |
| `sms_codes.schema.json` | 验证码记录。 |
| `auth_tokens.schema.json` | 登录 token 记录。 |
| `audit_logs.schema.json` | 审计日志。 |

#### 6.2.2 JQL / 运维脚本

| 文件 | 作用 |
| --- | --- |
| `seed-users.jql` | 初始化用户数据。 |
| `seed-stores.jql` | 初始化门店数据。 |
| `seed-services.jql` | 初始化服务数据。 |
| `seed-time-slots.jql` | 初始化时段数据。 |
| `seed-barber-schedules.jql` | 初始化排班数据。 |
| `reset-admins.jql` | 重置管理员相关数据。 |
| `JQL查询.jql` | 查询示例脚本。 |

## 7. 测试目录说明（`tests/`）

| 文件路径 | 作用 |
| --- | --- |
| `tests/run-all-tests.js` | 一键执行白盒、接口、性能基础测试。 |
| `tests/whitebox/run-whitebox.js` | 核心业务白盒测试。 |
| `tests/interface/run-interface-contract.js` | 云函数契约与联调测试。 |
| `tests/perf/run-data-perf-basic.js` | 数据一致性与基础性能测试。 |
| `tests/common/mock-db.js` | 测试 mock 数据库能力。 |
| `tests/README.txt` | 测试说明。 |

## 8. 文档与交付目录说明

| 路径 | 说明 |
| --- | --- |
| `docs/` | 接口文档、数据库文档、测试报告、交付核对文档。 |
| `文本/` | 项目说明性文本资料。 |
| `云数据库json文件夹/` | 数据库 JSON 导出文件（交付资料）。 |
| `unpackage/` | 编译构建产物（当前仓库按交付策略保留）。 |

## 9. 运行与部署指南

### 9.1 环境准备

- HBuilderX（推荐最新稳定版）。
- 已开通的 uniCloud 阿里云服务空间。
- Node.js（用于执行 `tests/` 本地脚本）。

### 9.2 云端部署顺序（建议）

1. 使用 HBuilderX 打开项目并绑定 uniCloud 服务空间。
2. 导入 `uniCloud-aliyun/database/*.schema.json`。
3. 上传 `uniCloud-aliyun/cloudfunctions/common/sb-common`。
4. 上传 `uniCloud-aliyun/cloudfunctions` 下全部业务云函数。
5. 按需执行 `seed-data` 初始化演示数据（管理员权限）。

### 9.3 本地运行

- 在 HBuilderX 选择目标端运行（H5 / App / 小程序）。
- App 端若涉及通知权限、短信、AI 能力，需确保对应云函数配置完整。

## 10. 配置文件说明

| 路径 | 说明 |
| --- | --- |
| `uniCloud-aliyun/cloudfunctions/sms-send-code/config.example.json` | 短信配置模板。 |
| `uniCloud-aliyun/cloudfunctions/sms-send-code/config.json` | 短信实际配置。 |
| `uniCloud-aliyun/cloudfunctions/ai-service-advisor/config.example.json` | AI 顾问配置模板。 |
| `uniCloud-aliyun/cloudfunctions/ai-service-advisor/config.json` | AI 顾问实际配置。 |

## 11. 常用命令

```bash
node tests/run-all-tests.js
```

## 12. 文档索引

- `docs/云函数接口文档.md`
- `docs/云数据库文档.md`
- `docs/测试结论.md`
- `docs/测试总报告.txt`
- `docs/数据库交付与索引核对清单.txt`
- `docs/数据库复现教程.txt`

## 13. 交付说明

- 本仓库按“完整交付”策略保留源代码、文档、数据库 JSON、以及构建产物目录。
- 若用于二次开发，建议基于本 README 的目录职责表先定位修改范围，再进行功能扩展。
