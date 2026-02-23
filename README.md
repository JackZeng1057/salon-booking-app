# 理发预约系统

基于 `uni-app + uniCloud` 的多角色理发预约系统，覆盖用户端、理发师端、管理员端三条业务主线，支持预约下单、到店核验、服务流转、评价售后、通知触达与运营管理。

本 README 为正式交付版，按当前仓库真实代码目录编写，可直接用于答辩、评审与后续维护。

## 1. 项目概述

### 1.1 角色与能力
- 用户端：注册登录、浏览门店、创建预约、改期/取消、评价、售后、通知查看、AI 服务顾问。
- 理发师端：排班设置、时段管理、订单处理（开始服务/完成服务）。
- 管理员端：门店运营、订单核验、订单流转、理发师审核与管理、门店资料配置、售后处理、评价管理、看板统计。

### 1.2 业务状态规则
- 订单主状态：`BOOKED -> ARRIVED -> IN_SERVICE -> FINISHED`
- 异常状态：`BOOKED -> CANCELLED`、`BOOKED -> NO_SHOW`
- 核验约束：必须先核验到店（`ARRIVED`）后，才能开始服务（`IN_SERVICE`）
- 接口统一返回：`code / message / data / requestId`

## 2. 技术栈（完整）

### 2.1 客户端技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 前端框架 | `uni-app` + `Vue` | 多端统一开发（App/H5/小程序） |
| 页面组织 | `pages.json` + `*.vue` | 路由、导航、tabBar、页面组件化 |
| 全局状态 | `store/auth.js`（轻量 store） | 管理 token、用户、角色与持久化 |
| API 层 | `api/*.js` + `api/client.js` | 统一 `callCloud` 调用、错误处理、缓存失效 |
| UI 组件 | `components/*` | 统一导航、弹窗、日期选择、图标、底部栏 |
| 通知能力 | `uni` 通知 API + `plus.push` | App 端系统通知引导、渠道、去重推送 |

### 2.2 云端技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 服务形态 | `uniCloud` 云函数（阿里云） | 所有业务接口统一由云函数提供 |
| 公共模块 | `common/sb-common` | 统一响应、鉴权、错误、时段、排队、审计、自动取消 |
| 配置管理 | `uni-config-center` | 云端配置管理模块 |
| 身份相关依赖 | `uni-id-common` | uniCloud 身份体系公共依赖 |

### 2.3 数据层技术栈

| 层级 | 技术 | 说明 |
| --- | --- | --- |
| 数据库 | `uniCloud MongoDB` | 业务主数据存储 |
| 数据模型 | `*.schema.json` | 集合结构与字段约束 |
| 初始化脚本 | `*.jql` | 种子数据与维护脚本 |
| 数据交付 | `云数据库json文件夹/*.json` | 完整导出数据文件 |

### 2.4 工具与工程链路

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| IDE | `HBuilderX` | 项目开发、运行、打包、云函数上传 |
| 测试脚本 | `Node.js` | 白盒、接口契约、性能基础测试 |
| 打包配置 | `manifest.json` | App/H5/小程序构建参数 |
| H5 入口 | `index.html` | H5 宿主模板 |

### 2.5 当前工程规模（按代码统计）
- 页面文件：`35` 个（`pages/**/*.vue`）
- 组件文件：`6` 个（`components/**/*.vue`）
- API 文件：`11` 个（`api/*.js`）
- 工具文件：`4` 个（`utils/*.js`）
- 业务云函数：`48` 个（不含 `common`）
- 数据库 Schema：`14` 个

## 3. 运行平台与端能力

### 3.1 目标运行端
- App（Android / iOS）
- H5

### 3.2 App 关键能力（`manifest.json`）
- Android：`targetSdkVersion = 34`，`minSdkVersion = 21`
- ABI：`armeabi-v7a`、`arm64-v8a`
- 已声明模块：`Push`、`Geolocation`、`Camera`、`Contacts`、`Fingerprint`
- 已声明主要权限：通知、振动、网络状态、定位、相机、唤醒锁等

## 4. 仓库目录总览

```text
salon-booking-app/
├── .hbuilderx/                    # HBuilderX 本地运行配置
├── api/                           # 前端 API 封装
├── components/                    # 通用组件
├── docs/                          # 接口/数据库/测试文档
├── pages/                         # 业务页面
├── static/                        # 静态资源
├── store/                         # 全局状态
├── tests/                         # 自动化测试脚本
├── uniCloud-aliyun/               # 云端代码（云函数 + 数据库）
├── uni_modules/                   # uni 官方模块
├── unpackage/                     # 构建产物
├── utils/                         # 通用工具
├── 云数据库json文件夹/              # 数据库 JSON 导出
├── 文本/                           # 文本资料
├── App.vue
├── main.js
├── pages.json
├── manifest.json
├── uni.scss
├── uni.promisify.adaptor.js
└── README.md
```

## 5. 根目录关键文件说明

| 文件 | 说明 |
| --- | --- |
| `App.vue` | 应用生命周期入口；初始化登录态并轮询关键系统通知 |
| `main.js` | 应用入口；全局挂载 `authStore` |
| `pages.json` | 页面路由、导航样式、tabBar 配置 |
| `manifest.json` | 多端构建参数与 App 权限/图标配置 |
| `index.html` | H5 端模板入口 |
| `uni.scss` | 全局样式变量与基础样式 |
| `uni.promisify.adaptor.js` | uni API Promise 兼容层 |
| `androidPrivacy.json` | Android 隐私相关声明 |
| `.gitignore` | Git 忽略规则（构建产物/本地配置等） |
| `.hbuilderx/launch.json` | HBuilderX 本地调试启动项 |

## 6. 前端目录详细说明

### 6.1 页面目录 `pages/`

#### 6.1.1 入口与认证
- `pages/index/roleGate.vue`：角色分流入口
- `pages/auth/login.vue`：登录
- `pages/auth/register.vue`：注册
- `pages/auth/forgot-password.vue`：忘记密码（短信验证码）

#### 6.1.2 用户端
- `pages/user/home/index.vue`：用户首页
- `pages/user/agent/index.vue`：AI 顾问
- `pages/user/orders/index.vue`：用户订单列表
- `pages/user/pricing/index.vue`：价格说明
- `pages/user/reviews/index.vue`：我的评价
- `pages/user/notifications/index.vue`：通知列表
- `pages/user/notifications/detail.vue`：通知详情
- `pages/user/settings/index.vue`：设置首页
- `pages/user/settings/profile.vue`：资料编辑
- `pages/user/settings/phone.vue`：手机号绑定/变更
- `pages/user/settings/password.vue`：密码重置

#### 6.1.3 门店与订单流程页
- `pages/store/list.vue`：门店列表
- `pages/store/detail.vue`：门店详情
- `pages/store/reviews.vue`：门店评价
- `pages/order/create.vue`：创建订单
- `pages/order/detail.vue`：订单详情
- `pages/order/review.vue`：提交评价
- `pages/order/aftersale.vue`：提交售后

#### 6.1.4 理发师端
- `pages/barber/schedule/index.vue`：排班与时段管理
- `pages/barber/orders/index.vue`：理发师订单处理

#### 6.1.5 管理员端
- `pages/admin/manage/index.vue`：管理首页
- `pages/admin/dashboard.vue`：运营看板
- `pages/admin/orders/index.vue`：订单管理
- `pages/admin/verify.vue`：核验码校验
- `pages/admin/aftersales.vue`：售后管理
- `pages/admin/reviews/index.vue`：评价管理
- `pages/admin/barber-approvals/index.vue`：理发师审核
- `pages/admin/barber-services/index.vue`：理发师服务配置
- `pages/admin/barbers/index.vue`：理发师管理
- `pages/admin/store-settings/index.vue`：门店资料配置

#### 6.1.6 共享与预留
- `pages/account/settings/index.vue`：理发师/管理员共享账号设置
- `pages/search/`：预留目录（当前无页面文件）

### 6.2 组件目录 `components/`
- `components/app-nav/app-nav.vue`：统一导航栏
- `components/bottom-tab-bar/bottom-tab-bar.vue`：底部导航栏
- `components/app-icon/app-icon.vue`：图标组件
- `components/app-modal/app-modal.vue`：弹窗容器
- `components/app-confirm-host/app-confirm-host.vue`：全局确认弹窗宿主
- `components/modern-date-picker/modern-date-picker.vue`：日期选择器

### 6.3 API 目录 `api/`
- `api/client.js`：云函数统一调用、错误转换、requestId 提取
- `api/auth.js`：登录/注册/用户信息
- `api/store.js`：门店相关接口
- `api/order.js`：订单、评价、售后主接口
- `api/barber.js`：排班和时段接口
- `api/admin.js`：运营看板接口
- `api/notifications.js`：通知接口
- `api/review.js`：评价查询接口
- `api/barberApproval.js`：理发师申请审核接口
- `api/barberManage.js`：理发师管理接口
- `api/agent.js`：AI 顾问接口

### 6.4 状态与工具目录
- `store/auth.js`：登录态全局存储
- `utils/cache.js`：本地缓存工具（TTL）
- `utils/status.js`：状态文案格式化
- `utils/system-notify.js`：系统通知权限/渠道/去重
- `utils/app-confirm.js`：Promise 化确认弹窗

### 6.5 静态资源目录 `static/`
- `static/logo.png`：应用 logo
- `static/tabbar/*.png`：tabBar 四个菜单默认/激活图标

## 7. 云端目录详细说明

### 7.1 云函数目录 `uniCloud-aliyun/cloudfunctions/`

#### 7.1.1 公共模块 `common/sb-common`
- `index.js`：公共导出入口
- `response.js` / `withResponse.js`：统一响应包装
- `errors.js`：错误码与错误类型
- `auth.js`：登录与角色校验
- `password.js`：密码相关工具
- `audit.js`：审计日志
- `autoCancel.js`：超时自动取消
- `bookingSlots.js`：时段规则计算
- `barberServices.js`：理发师服务项处理
- `reviewStats.js`：评价统计维护
- `queue.js`：排队等待计算
- `chinaTime.js`：中国时区时间处理

#### 7.1.2 业务云函数（按模块分组）

认证与账号：
- `auth-register`：账号注册；创建用户、写入初始角色与资料，返回登录态信息。
- `auth-login`：账号登录；校验用户名密码，签发 token 并返回用户信息。
- `auth-me`：获取当前登录用户；用于前端刷新会话与角色信息。
- `user-bind-phone`：绑定手机号；校验验证码后将手机号写入当前账号。
- `user-profile-update`：更新个人资料；支持昵称/头像等用户展示信息更新。
- `password-reset`：重置密码；基于短信验证码重设账号密码。
- `sms-send-code`：发送短信验证码；用于注册、找回密码、绑定手机号流程。
- `sms-verify-code`：校验短信验证码；返回验证码是否有效及可继续后续操作。

门店与理发师：
- `stores-list`：门店列表查询；支持关键词、分页、排序与筛选。
- `stores-detail`：门店详情查询；返回门店基础信息、规则与展示字段。
- `stores-services`：门店服务项目查询；返回该门店可预约服务列表。
- `stores-barbers`：门店理发师查询；返回门店下可预约理发师列表。
- `store-update-profile`：门店资料更新；管理员修改门店信息、营业配置等。
- `barber-schedule-set`：排班设置；保存理发师某日工作时段并生成可约时间窗。
- `barber-slots-get`：时段查询；按理发师+日期(+服务)返回可预约 slots。
- `barber-services-set`：理发师服务项配置；维护理发师可提供的服务范围。
- `barber-applications-list`：理发师申请列表；管理员查看待审核/已审核申请。
- `barber-application-review`：理发师申请审核；通过或拒绝申请并更新状态。
- `barbers-manage`：理发师管理；提供列表、重命名、移除等管理动作。

订单与履约：
- `orders-create`：创建预约订单；校验时段冲突并生成核验码、订单事件。
- `orders-detail`：订单详情；返回订单主信息、排队估算与关联展示数据。
- `orders-mine`：用户订单列表；按用户查询订单并支持状态/分页过滤。
- `orders-barber-list`：理发师订单列表；按理发师视角拉取当日或指定日期订单。
- `orders-store-list`：门店订单列表；按门店视角拉取订单并用于管理员工作台。
- `orders-verify`：到店核验；通过核验码将状态由 `BOOKED` 更新为 `ARRIVED`。
- `orders-start-service`：开始服务；将状态由 `ARRIVED` 更新为 `IN_SERVICE`。
- `orders-finish-service`：完成服务；将状态由 `IN_SERVICE` 更新为 `FINISHED`。
- `orders-cancel`：取消订单；在允许窗口内将订单改为 `CANCELLED` 并记录原因。
- `orders-reschedule`：订单改期；变更日期时段并记录改期事件、通知相关角色。
- `orders-no-show`：标记爽约；将未到店订单更新为 `NO_SHOW`。
- `orders-delete`：删除订单；执行业务可见性删除（非物理硬删除语义）。
- `orders-items-list`：订单明细项；查询单笔订单下的服务项目明细。
- `orders-events-list`：订单事件流；查询状态流转与关键操作日志。

评价与售后：
- `reviews-list`：门店评价列表；按门店/筛选条件返回评价数据。
- `reviews-create`：创建评价；提交评分、文字、图片并回写门店评分统计。
- `reviews-by-order`：按订单查询评价；判断该订单是否已评价及评价详情。
- `reviews-mine`：我的评价列表；按当前用户查询历史评价。
- `reviews-delete`：删除评价；移除评价并同步更新门店评分汇总。
- `aftersales-create`：创建售后单；用户提交问题类型、描述与订单关联信息。
- `aftersales-store-list`：门店售后列表；管理员查看待处理/处理中/已完成售后。
- `aftersales-reply`：售后回复处理；门店侧回复并推进售后状态。

通知与运营：
- `notifications-list`：通知列表查询；支持分页、未读筛选与未读数统计。
- `notifications-mark-read`：通知已读；支持单条或批量标记已读。
- `notifications-delete`：删除通知；删除用户通知记录。
- `notifications-create`：创建通知；供业务云函数内部调用生成站内通知。
- `admin-dashboard`：管理看板统计；汇总订单量、转化、状态分布等运营指标。

扩展与初始化：
- `ai-service-advisor`：AI 服务顾问；根据文本/图片输入推荐适合服务项目。
- `seed-data`：初始化演示数据；批量写入示例用户、门店、服务、排班等测试数据。

### 7.2 数据库目录 `uniCloud-aliyun/database/`

#### 7.2.1 Schema（14 个）
- `users.schema.json`：用户主表；存储账号、密码摘要、角色、手机号、头像、昵称等身份信息。
- `stores.schema.json`：门店主表；存储门店名称、地址、营业时间、规则、联系方式等。
- `services.schema.json`：服务项目表；存储服务名称、时长、价格、所属门店与上架状态。
- `barber_schedules.schema.json`：理发师排班表；存储理发师某日工作起止时段与排班状态。
- `time_slots.schema.json`：预约时段表；存储可预约时间片、占用状态、关联理发师/服务信息。
- `orders.schema.json`：订单主表；存储预约单核心字段（状态、核验码、时间、角色关联等）。
- `order_items.schema.json`：订单明细表；存储订单内服务项、单价、数量与小计信息。
- `order_events.schema.json`：订单事件日志表；记录状态流转与关键操作审计轨迹。
- `reviews.schema.json`：评价表；存储评分、文本、图片、评价人与被评价门店/订单关联。
- `aftersales.schema.json`：售后表；存储售后类型、诉求内容、处理进度与回复记录。
- `notifications.schema.json`：通知表；存储站内通知内容、已读状态、接收用户与业务关联。
- `sms_codes.schema.json`：短信验证码表；存储验证码、手机号、用途、过期时间与校验状态。
- `auth_tokens.schema.json`：登录令牌表；存储 token、用户关联、有效期与会话元数据。
- `audit_logs.schema.json`：审计日志表；记录后台关键操作、操作者、时间、目标对象与变更内容。

#### 7.2.2 JQL 脚本
- `seed-users.jql`
- `seed-stores.jql`
- `seed-services.jql`
- `seed-time-slots.jql`
- `seed-barber-schedules.jql`
- `reset-admins.jql`
- `JQL查询.jql`

## 8. 测试目录说明

| 文件 | 作用 |
| --- | --- |
| `tests/run-all-tests.js` | 一键运行全部测试 |
| `tests/whitebox/run-whitebox.js` | 白盒分支测试 |
| `tests/interface/run-interface-contract.js` | 接口契约与联调测试 |
| `tests/perf/run-data-perf-basic.js` | 数据一致性与性能基础测试 |
| `tests/common/mock-db.js` | Mock DB 工具 |
| `tests/README.txt` | 测试说明 |

## 9. 文档与其他交付目录说明

### 9.1 `docs/` 文档目录
- `docs/云函数接口文档.md` / `docs/云函数接口文档.txt`
- `docs/云数据库文档.md` / `docs/云数据库文档.txt`
- `docs/测试结论.md` / `docs/测试结论.txt`
- `docs/测试总报告.txt`
- `docs/白盒测试记录.txt`
- `docs/接口联调测试结果.txt`
- `docs/数据与性能基础测试结果.txt`
- `docs/数据库交付与索引核对清单.txt`
- `docs/数据库复现教程.txt`

### 9.2 交付数据目录
- `云数据库json文件夹/users.json`
- `云数据库json文件夹/stores.json`
- `云数据库json文件夹/services.json`
- `云数据库json文件夹/barber_schedules.json`
- `云数据库json文件夹/time_slots.json`
- `云数据库json文件夹/orders.json`
- `云数据库json文件夹/order_items.json`
- `云数据库json文件夹/order_events.json`
- `云数据库json文件夹/reviews.json`
- `云数据库json文件夹/aftersales.json`
- `云数据库json文件夹/notifications.json`
- `云数据库json文件夹/sms_codes.json`
- `云数据库json文件夹/auth_tokens.json`
- `云数据库json文件夹/audit_logs.json`

### 9.3 其他目录说明
- `文本/项目完整功能与设计复刻说明.txt`：业务说明文档
- `uni_modules/`：uni 官方模块（`uni-config-center`、`uni-id-common`）
- `unpackage/release/`：打包输出（例如 APK）
- `unpackage/res/icons/`：App 图标资源

## 10. 配置说明

### 10.1 AI 配置
- 模板：`uniCloud-aliyun/cloudfunctions/ai-service-advisor/config.example.json`
- 实际：`uniCloud-aliyun/cloudfunctions/ai-service-advisor/config.json`

### 10.2 短信配置
- 模板：`uniCloud-aliyun/cloudfunctions/sms-send-code/config.example.json`
- 实际：`uniCloud-aliyun/cloudfunctions/sms-send-code/config.json`

## 11. 部署与运行

### 11.1 环境准备
- HBuilderX
- uniCloud 阿里云服务空间
- Node.js（用于测试脚本）

### 11.2 云端部署顺序
1. 打开项目并绑定 uniCloud 空间
2. 导入 `uniCloud-aliyun/database/*.schema.json`
3. 上传 `uniCloud-aliyun/cloudfunctions/common/sb-common`
4. 上传全部业务云函数
5. 按需执行 `seed-data` 初始化演示数据

### 11.3 本地运行
- HBuilderX 选择运行到 H5 / App / 小程序

### 11.4 App 打包
- 通过 HBuilderX 云打包或本地打包
- 打包结果输出在 `unpackage/release/`
- apk安装包在`unpackage/release/apk`

## 12. 测试命令

```bash
node tests/run-all-tests.js
```

## 13. 交付说明

- 本仓库按“完整交付”策略保留源代码、文档、数据库导出与构建产物目录。
- `seed-data` 为初始化数据函数，通常在部署或演示前执行，不属于日常高频业务入口。
- 线上环境建议限制初始化类函数调用权限，并通过管理员身份执行关键运维操作。
