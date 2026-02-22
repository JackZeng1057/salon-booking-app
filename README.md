# 理发预约系统

基于 `uni-app (Vue3) + uniCloud` 的多角色理发预约系统，包含用户端、理发师端、管理员端，支持预约、核验、服务流转、评价售后、通知与运营看板。

## 技术栈（按代码实际）
- 前端框架：`uni-app (Vue3)`
- 入口实现：`main.js` 使用 `#ifdef VUE3` + `createSSRApp`
- 状态管理：`store/auth.js`（轻量全局 `authStore`，非 Vuex）
- 后端：`uniCloud` 云函数（阿里云）
- 数据库：`uniCloud MongoDB`
- 测试：Node.js 本地脚本（白盒 / 接口联调 / 性能基础）

## 代码规模概览
- 前端页面：34 个 `*.vue`
- API 封装：10 个文件（`api/*.js`）
- 云函数：47 个业务云函数 + `common/sb-common`
- 数据表 Schema：14 个（`uniCloud-aliyun/database/*.schema.json`）

## 功能清单

### 用户端
- 登录、注册、忘记密码（短信/演示模式）
- 首页推荐、门店搜索/筛选/排序
- 门店详情（服务、理发师、规则、评价、导航、拨号）
- 预约创建（门店/服务/理发师/日期/时段）
- 订单详情（核验码、取消、改期、明细、事件日志）
- 评价（多维评分+图片）与售后申请
- 通知中心（未读筛选、已读、删除）
- AI 小顾问（文本/图片输入，跨门店服务推荐）

### 理发师端
- 排班设置（支持未来多天）
- 时段生成与可预约时段查看
- 订单处理（开始服务 / 完成服务）

### 管理员端
- 门店管理首页与未读提醒
- 门店订单管理（核验码校验、开始/完成、取消、爽约、删除）
- 独立核验页
- 售后处理、门店评价管理
- 理发师申请审核、理发师服务分配
- 门店信息设置（服务、营业时间、预约规则、封面等）
- 运营看板（订单与转化统计）

## 核心业务规则
- 订单主状态机：`BOOKED -> ARRIVED -> IN_SERVICE -> FINISHED`
- 异常流：`BOOKED -> CANCELLED`、`BOOKED -> NO_SHOW`
- 严格约束：不可从 `BOOKED` 直接开始服务，需先核验到店
- 等位提示：`queueAheadCount` / `queueWaitMin`
- 统一响应：`code / message / data / requestId`

## 目录结构

```text
salon-booking-app/
├── pages/                         # 前端页面（user / barber / admin）
├── components/                    # 通用组件
├── api/                           # 云函数调用封装
├── store/                         # 登录态存储
├── utils/                         # 缓存、通知、状态工具
├── tests/                         # 本地自动化测试
│   ├── whitebox/
│   ├── interface/
│   └── perf/
├── docs/                          # 项目文档与测试报告
└── uniCloud-aliyun/
    ├── cloudfunctions/            # 云函数
    └── database/                  # Schema / JQL
```

## 部署与运行

### 1) 环境准备
- HBuilderX
- 可用的 uniCloud 阿里云服务空间
- Node.js（用于本地测试脚本）

### 2) 云端部署
1. 用 HBuilderX 打开项目并绑定服务空间
2. 上传 `uniCloud-aliyun/database` 下全部 DB Schema
3. 上传 `uniCloud-aliyun/cloudfunctions` 下全部云函数和公共模块
4. 使用管理员登录态调用 `seed-data` 初始化演示数据（该函数要求管理员权限）

### 3) 本地运行
- 在 HBuilderX 中选择目标平台运行（H5 / 小程序 / App）

## 测试

### 一键测试
```bash
node tests/run-all-tests.js
```

### 覆盖内容
- `tests/whitebox/run-whitebox.js`：核心状态流转白盒分支
- `tests/interface/run-interface-contract.js`：云函数契约与核心链路联调
- `tests/perf/run-data-perf-basic.js`：数据一致性与性能基线

### 当前测试结果（仓库内脚本）
- 白盒：31/31 通过
- 接口契约扫描：47/47 通过
- 核心链路联调：通过
- 数据一致性与轻量性能基线：通过

## 已知约束（当前版本）
- `queueWaitMin` 为估算值，用于业务提示，不是实时精确排队系统
- 后端接口形态为云函数契约，不提供独立 REST 网关地址
- 自动化回归以本地脚本为主；云端建议做关键链路冒烟验证

## 种子账号（执行 seed-data 后）
- 用户：`user_001 / 123456`
- 理发师：`barber_chen / 123456`、`barber_li / 123456`
- 管理员：`admin_001 / 123456`、`admin_002 / 123456`

## 可选配置
- AI 顾问配置模板：`uniCloud-aliyun/cloudfunctions/ai-service-advisor/config.example.json`
- 短信通道配置模板：`uniCloud-aliyun/cloudfunctions/sms-send-code/config.example.json`

## 常见排障
- AI 顾问报错：优先检查 `ai-service-advisor` 是否已正确配置 API Key 与模型参数
- 短信发送报错：检查 `sms-send-code` 配置；未配置短信通道时可使用演示模式流程

## 文档索引
- `docs/测试结论.md`
- `docs/测试总报告.txt`
- `docs/云函数接口文档.md`
- `docs/云数据库文档.md`
- `docs/数据库复现教程.txt`
