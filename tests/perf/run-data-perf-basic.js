#!/usr/bin/env node
/* eslint-disable no-console */

// 数据与性能基础测试（轻量版）
// 目标：
// 1) 校验核心数据一致性（状态流转后日志是否写入）
// 2) 进行轻量性能基线记录（队列计算与核心接口调用耗时）
//
// 说明：
// - 这不是生产压测，而是“课程项目级性能基线”；
// - 重点是证明关键路径可运行、可扩展、可量化。

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');
const { performance } = require('perf_hooks');
const { MockDB, bindMockDB } = require('../common/mock-db');
const { buildQueueHintMap, attachQueueHints } = require('../../uniCloud-aliyun/cloudfunctions/common/sb-common/queue');

const commonRoot = path.resolve(__dirname, '../../uniCloud-aliyun/cloudfunctions/common');
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${commonRoot}${path.delimiter}${process.env.NODE_PATH}`
  : commonRoot;
Module._initPaths();

function nowMs() {
  // 统一精度，便于不同机器上对比结果
  return Math.round(performance.now() * 1000) / 1000;
}

function generateOrders(size) {
  // 生成可控订单样本，覆盖多理发师、多状态、多时段
  const rows = [];
  const baseDate = '2026-02-22';
  for (let i = 0; i < size; i += 1) {
    const barberIdx = i % 12;
    const statusPool = ['BOOKED', 'ARRIVED', 'IN_SERVICE', 'FINISHED', 'CANCELLED'];
    const status = statusPool[i % statusPool.length];
    const hh = String(9 + (i % 10)).padStart(2, '0');
    const mm = i % 2 === 0 ? '00' : '30';
    const startTime = `${hh}:${mm}`;
    const endTime = `${String((Number(hh) + 1) % 24).padStart(2, '0')}:${mm}`;
    rows.push({
      _id: `o_${i}`,
      status,
      barberId: `b_${barberIdx}`,
      date: baseDate,
      startTime,
      endTime,
      arrivedAt: status === 'ARRIVED' || status === 'IN_SERVICE' ? 1700000000000 + i * 60000 : 0,
      inServiceAt: status === 'IN_SERVICE' ? 1700000000000 + i * 60000 : 0
    });
  }
  return rows;
}

async function testDataConsistency() {
  // 通过 verify -> start -> finish 的真实状态推进
  // 验证 orders 主表与 order_events/audit_logs 的一致性
  const verifyFn = require('../../uniCloud-aliyun/cloudfunctions/orders-verify/index.js').main;
  const startFn = require('../../uniCloud-aliyun/cloudfunctions/orders-start-service/index.js').main;
  const finishFn = require('../../uniCloud-aliyun/cloudfunctions/orders-finish-service/index.js').main;

  const db = new MockDB({
    orders: [{
      _id: 'perf_flow_1',
      verifyCode: '909090',
      status: 'BOOKED',
      barberId: 'b1',
      storeId: 's1',
      userId: 'u1',
      date: '2020-01-01',
      startTime: '10:00',
      endTime: '10:45'
    }],
    order_events: [],
    audit_logs: []
  });
  bindMockDB(db);

  const adminCtx = { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } };

  const r1 = await verifyFn({ verifyCode: '909090' }, adminCtx);
  const r2 = await startFn({ orderId: 'perf_flow_1' }, adminCtx);
  const r3 = await finishFn({ orderId: 'perf_flow_1' }, adminCtx);

  assert.strictEqual(r1.code, 0);
  assert.strictEqual(r2.code, 0);
  assert.strictEqual(r3.code, 0);

  const order = db.table('orders').find((o) => o._id === 'perf_flow_1');
  const events = db.table('order_events').filter((e) => e.orderId === 'perf_flow_1');

  assert.strictEqual(order.status, 'FINISHED');
  assert.ok(events.length >= 3);

  return {
    finalStatus: order.status,
    eventCount: events.length,
    auditCount: db.table('audit_logs').length
  };
}

async function benchmarkQueue(size) {
  // 使用不同数据量测量 queue.js 关键方法耗时
  // buildQueueHintMap：生成等位映射
  // attachQueueHints：回填到列表
  const allOrders = generateOrders(size);
  const db = new MockDB({ orders: allOrders });
  bindMockDB(db);

  const targetList = allOrders.slice(0, Math.min(300, allOrders.length));
  const t1 = nowMs();
  const hintMap = await buildQueueHintMap(db, targetList);
  const t2 = nowMs();
  const attached = attachQueueHints(targetList, hintMap);
  const t3 = nowMs();

  // 至少验证函数输出结构可用
  assert.ok(Array.isArray(attached));
  assert.strictEqual(attached.length, targetList.length);

  return {
    size,
    hintBuildMs: Math.round((t2 - t1) * 1000) / 1000,
    attachMs: Math.round((t3 - t2) * 1000) / 1000,
    totalMs: Math.round((t3 - t1) * 1000) / 1000
  };
}

function writeReport(consistency, benches) {
  // 输出结构化文本，便于直接纳入测试章节
  const reportPath = path.resolve(__dirname, '../../docs/数据与性能基础测试结果.txt');
  const lines = [];
  lines.push('理发预约系统-数据与性能基础测试结果');
  lines.push('');
  lines.push('一、数据一致性检查');
  lines.push(`- 最终订单状态：${consistency.finalStatus}`);
  lines.push(`- 订单事件条数：${consistency.eventCount}`);
  lines.push(`- 审计日志条数：${consistency.auditCount}`);
  lines.push('');
  lines.push('二、轻量性能基线（队列计算）');
  benches.forEach((b) => {
    lines.push(`- 数据量 ${b.size}：buildQueueHintMap=${b.hintBuildMs}ms，attachQueueHints=${b.attachMs}ms，总计=${b.totalMs}ms`);
  });
  lines.push('');
  lines.push('三、说明');
  lines.push('- 该测试为项目阶段性的基础性能验证，不等同于生产压测。');
  lines.push('- 重点用于证明核心查询与计算路径可运行、可扩展。');

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  return reportPath;
}

async function main() {
  // 先一致性，后性能；两部分都通过才算本脚本通过
  const consistency = await testDataConsistency();
  const benches = [];
  benches.push(await benchmarkQueue(500));
  benches.push(await benchmarkQueue(2000));
  benches.push(await benchmarkQueue(5000));

  const reportPath = writeReport(consistency, benches);
  console.log('PASS 数据一致性检查');
  benches.forEach((b) => {
    console.log(`PASS 队列性能 size=${b.size}, total=${b.totalMs}ms`);
  });
  console.log(`报告已生成: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
