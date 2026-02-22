#!/usr/bin/env node
/* eslint-disable no-console */

// 接口联调脚本（云函数层）
// 目标：
// 1) 扫描所有云函数是否满足统一返回结构（code/message/data/requestId）
// 2) 对核心链路做联调：核验到店 -> 开始服务 -> 完成服务 -> 评价创建
//
// 为什么这个脚本重要：
// - 白盒分支测试关注“代码路径对不对”；
// - 本脚本关注“接口契约稳不稳”（返回结构统一、跨函数链路可串起来）。
// - 答辩时可以用这份结果证明后端接口层不是孤立测试。

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');
const { MockDB, bindMockDB } = require('../common/mock-db');

const ROOT = path.resolve(__dirname, '../../uniCloud-aliyun/cloudfunctions');
const commonRoot = path.resolve(__dirname, '../../uniCloud-aliyun/cloudfunctions/common');
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${commonRoot}${path.delimiter}${process.env.NODE_PATH}`
  : commonRoot;
Module._initPaths();

function listFunctions() {
  // 读取 cloudfunctions 目录，排除 common 公共模块
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'common')
    .map((d) => d.name)
    .sort();
}

function isEnvelope(res) {
  // withResponse 统一返回结构的最小判定
  return !!res &&
    typeof res === 'object' &&
    typeof res.code === 'number' &&
    typeof res.message === 'string' &&
    Object.prototype.hasOwnProperty.call(res, 'data') &&
    typeof res.requestId === 'string';
}

async function scanEnvelope() {
  // 逐个云函数探测：重点不是业务成功，而是“返回格式规范”
  const names = listFunctions();
  const rows = [];

  // 给一个最小 uniCloud，保证函数调用不会因全局缺失直接崩溃
  bindMockDB(new MockDB({}));

  for (const fn of names) {
    try {
      const mod = require(path.join(ROOT, fn, 'index.js'));
      if (!mod || typeof mod.main !== 'function') {
        rows.push({ fn, pass: false, message: '缺少 exports.main' });
        continue;
      }
      const res = await mod.main({}, {});
      if (!isEnvelope(res)) {
        rows.push({ fn, pass: false, message: '返回结构不符合统一封装' });
        continue;
      }
      rows.push({ fn, pass: true, message: `code=${res.code}` });
    } catch (err) {
      rows.push({ fn, pass: false, message: err && err.message ? err.message : String(err) });
    }
  }

  return rows;
}

async function runCoreIntegration() {
  // 这是一个“最短可闭环链路”：
  // verify -> start -> finish -> review
  // 用于验证跨函数联调时数据状态能连续推进。
  const verifyFn = require('../../uniCloud-aliyun/cloudfunctions/orders-verify/index.js').main;
  const startFn = require('../../uniCloud-aliyun/cloudfunctions/orders-start-service/index.js').main;
  const finishFn = require('../../uniCloud-aliyun/cloudfunctions/orders-finish-service/index.js').main;
  const reviewFn = require('../../uniCloud-aliyun/cloudfunctions/reviews-create/index.js').main;

  const db = new MockDB({
    orders: [{
      _id: 'flow_o1',
      verifyCode: '123456',
      status: 'BOOKED',
      userId: 'u1',
      barberId: 'b1',
      storeId: 's1',
      date: '2020-01-01',
      startTime: '10:00',
      endTime: '10:45'
    }],
    reviews: [],
    stores: [{ _id: 's1', rating: { overall: 5, service: 5, environment: 5, count: 0 } }],
    order_events: [],
    audit_logs: []
  });
  bindMockDB(db);

  const adminCtx = { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } };
  const userCtx = { auth: { _id: 'u1', role: 'user', name: '用户A' } };

  const r1 = await verifyFn({ verifyCode: '123456' }, adminCtx);
  assert.strictEqual(r1.code, 0);
  assert.strictEqual(db.table('orders')[0].status, 'ARRIVED');

  const r2 = await startFn({ orderId: 'flow_o1' }, adminCtx);
  assert.strictEqual(r2.code, 0);
  assert.strictEqual(db.table('orders')[0].status, 'IN_SERVICE');

  const r3 = await finishFn({ orderId: 'flow_o1' }, adminCtx);
  assert.strictEqual(r3.code, 0);
  assert.strictEqual(db.table('orders')[0].status, 'FINISHED');

  const r4 = await reviewFn({
    orderId: 'flow_o1',
    rating: { service: 5, environment: 4, barber: 5 },
    content: '流程联调测试'
  }, userCtx);
  assert.strictEqual(r4.code, 0);

  return {
    pass: true,
    steps: ['verify', 'start', 'finish', 'review'],
    orderEvents: db.table('order_events').length,
    auditLogs: db.table('audit_logs').length
  };
}

function writeReport(envelopeRows, flowResult) {
  // 输出可直接放论文附录的文本报告
  const reportPath = path.resolve(__dirname, '../../docs/接口联调测试结果.txt');
  const passCount = envelopeRows.filter((r) => r.pass).length;
  const failCount = envelopeRows.length - passCount;

  const lines = [];
  lines.push('美发预约系统-接口联调测试结果');
  lines.push('');
  lines.push(`扫描时间：${new Date().toISOString()}`);
  lines.push(`统一返回结构扫描：总计 ${envelopeRows.length}，通过 ${passCount}，失败 ${failCount}`);
  lines.push(`核心链路联调：${flowResult.pass ? '通过' : '失败'}`);
  lines.push('');
  lines.push('一、统一返回结构扫描明细');
  envelopeRows.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.fn} - ${r.pass ? 'PASS' : 'FAIL'} (${r.message})`);
  });
  lines.push('');
  lines.push('二、核心链路联调结果');
  lines.push(`- 步骤：${flowResult.steps.join(' -> ')}`);
  lines.push(`- order_events 写入条数：${flowResult.orderEvents}`);
  lines.push(`- audit_logs 写入条数：${flowResult.auditLogs}`);

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  return { reportPath, passCount, failCount };
}

async function main() {
  // 先做全量契约扫描，再做核心链路联调
  // 如果任意一项失败，脚本以非 0 退出，方便自动化接入
  const envelopeRows = await scanEnvelope();
  const flowResult = await runCoreIntegration();
  const { reportPath, passCount, failCount } = writeReport(envelopeRows, flowResult);

  envelopeRows.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.fn} ${r.message}`));
  console.log(`\nSummary: envelope pass=${passCount}, fail=${failCount}`);
  console.log(`核心链路联调：${flowResult.pass ? 'PASS' : 'FAIL'}`);
  console.log(`报告已生成: ${reportPath}`);

  if (failCount > 0 || !flowResult.pass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
