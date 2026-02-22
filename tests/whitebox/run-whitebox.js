#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * 白盒分支测试脚本（核心版）
 *
 * 这个脚本的定位：
 * 1) 直接调用云函数 main()，不经过页面层，验证“代码分支”是否符合预期；
 * 2) 覆盖订单状态机、权限校验、幂等逻辑、参数校验、异常返回码；
 * 3) 产出 PASS/FAIL 明细，便于答辩时说明“哪些分支被验证过”。
 *
 * 注意：
 * - 这里使用 MockDB 模拟 uniCloud.database()，属于可控测试环境；
 * - 返回码断言采用统一 assertCode，便于快速核对云函数约定。
 */

const path = require('path');
const assert = require('assert');
const Module = require('module');

// 让本地 Node 能加载 uniCloud 公共模块（sb-common）
const commonRoot = path.resolve(__dirname, '../../uniCloud-aliyun/cloudfunctions/common');
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${commonRoot}${path.delimiter}${process.env.NODE_PATH}`
  : commonRoot;
Module._initPaths();

// 简单深拷贝，避免测试数据在用例间相互污染
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// 按等值规则匹配 where 查询条件（满足当前白盒脚本所需）
function matchQuery(doc, query) {
  return Object.keys(query || {}).every((key) => doc && doc[key] === query[key]);
}

// 模拟 field 投影（仅保留值为 true 的字段）
function pickFields(doc, fieldMap) {
  if (!fieldMap) return clone(doc);
  const picked = {};
  Object.keys(fieldMap).forEach((key) => {
    if (fieldMap[key] && Object.prototype.hasOwnProperty.call(doc, key)) {
      picked[key] = doc[key];
    }
  });
  return picked;
}

// 轻量数据库模拟器：覆盖本次测试用到的 collection/doc/where/add/update/get
class MockDB {
  constructor(seed = {}) {
    this._data = {};
    this._idSeq = 1;
    Object.keys(seed).forEach((name) => {
      this._data[name] = clone(seed[name]);
    });
  }

  collection(name) {
    if (!this._data[name]) this._data[name] = [];
    const table = this._data[name];
    const db = this;

    const makeWhere = (query) => {
      let _limit = null;
      let _field = null;
      return {
        limit(n) {
          _limit = n;
          return this;
        },
        field(f) {
          _field = f;
          return this;
        },
        async get() {
          let rows = table.filter((doc) => matchQuery(doc, query));
          if (typeof _limit === 'number') rows = rows.slice(0, _limit);
          if (_field) rows = rows.map((doc) => pickFields(doc, _field));
          return { data: clone(rows) };
        }
      };
    };

    const makeDoc = (id) => {
      let _field = null;
      return {
        field(f) {
          _field = f;
          return this;
        },
        async get() {
          const hit = table.find((doc) => doc && doc._id === id);
          if (!hit) return { data: [] };
          const row = _field ? pickFields(hit, _field) : clone(hit);
          return { data: [row] };
        },
        async update(patch) {
          const idx = table.findIndex((doc) => doc && doc._id === id);
          if (idx < 0) return { updated: 0 };
          table[idx] = { ...table[idx], ...clone(patch) };
          return { updated: 1 };
        }
      };
    };

    return {
      where: makeWhere,
      doc: makeDoc,
      async add(doc) {
        const newDoc = { ...clone(doc) };
        if (!newDoc._id) {
          db._idSeq += 1;
          newDoc._id = `${name}_${db._idSeq}`;
        }
        table.push(newDoc);
        return { id: newDoc._id };
      }
    };
  }

  table(name) {
    return this._data[name] || [];
  }
}

// 单用例执行器：统一输出格式，失败时保留错误消息便于定位分支
async function runCase(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    return { name, pass: true };
  } catch (err) {
    console.error(`FAIL ${name}: ${err && err.message ? err.message : err}`);
    return { name, pass: false, error: err };
  }
}

// 统一断言返回码，确保所有函数都按 withResponse 契约返回
function assertCode(res, code) {
  assert.strictEqual(res && res.code, code);
}

// 给当前用例注入 uniCloud.database()，隔离不同用例的数据状态
function bindMockDB(db) {
  global.uniCloud = { database: () => db };
}

async function main() {
  // 按“高风险优先”加载本轮要测的核心云函数
  const startServiceFn = require('../../uniCloud-aliyun/cloudfunctions/orders-start-service/index.js').main;
  const verifyFn = require('../../uniCloud-aliyun/cloudfunctions/orders-verify/index.js').main;
  const finishFn = require('../../uniCloud-aliyun/cloudfunctions/orders-finish-service/index.js').main;
  const noShowFn = require('../../uniCloud-aliyun/cloudfunctions/orders-no-show/index.js').main;
  const createReviewFn = require('../../uniCloud-aliyun/cloudfunctions/reviews-create/index.js').main;

  const cases = [];

  // ==================== orders-start-service ====================
  // 目标：验证“只有 ARRIVED 才能开始服务”以及权限/幂等行为
  cases.push(await runCase('orders-start-service 缺少 orderId -> 400', async () => {
    const db = new MockDB();
    bindMockDB(db);
    const res = await startServiceFn({}, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 400);
  }));

  cases.push(await runCase('orders-start-service 订单不存在 -> 404', async () => {
    const db = new MockDB({ orders: [] });
    bindMockDB(db);
    const res = await startServiceFn({ orderId: 'o404' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 404);
  }));

  cases.push(await runCase('orders-start-service 理发师越权 -> 403', async () => {
    const db = new MockDB({ orders: [{ _id: 'o1', status: 'ARRIVED', barberId: 'barber_A', storeId: 's1' }] });
    bindMockDB(db);
    const res = await startServiceFn({ orderId: 'o1' }, { auth: { _id: 'barber_B', role: 'barber' } });
    assertCode(res, 403);
  }));

  cases.push(await runCase('orders-start-service BOOKED 不可开始 -> 422', async () => {
    const db = new MockDB({ orders: [{ _id: 'o2', status: 'BOOKED', barberId: 'barber_A', storeId: 's1' }] });
    bindMockDB(db);
    const res = await startServiceFn({ orderId: 'o2' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 422);
  }));

  cases.push(await runCase('orders-start-service ARRIVED 可开始 -> 0', async () => {
    const db = new MockDB({
      orders: [{ _id: 'o3', status: 'ARRIVED', barberId: 'barber_A', storeId: 's1' }],
      order_events: [],
      audit_logs: []
    });
    bindMockDB(db);
    const res = await startServiceFn({ orderId: 'o3' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    const order = db.table('orders').find((o) => o._id === 'o3');
    assert.strictEqual(order.status, 'IN_SERVICE');
    assert.ok(db.table('order_events').length >= 1);
  }));

  cases.push(await runCase('orders-start-service IN_SERVICE 幂等 -> 0', async () => {
    const db = new MockDB({ orders: [{ _id: 'o4', status: 'IN_SERVICE', barberId: 'barber_A', storeId: 's1' }] });
    bindMockDB(db);
    const res = await startServiceFn({ orderId: 'o4' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    assert.strictEqual(res.data.order.status, 'IN_SERVICE');
  }));

  // ==================== orders-verify ====================
  // 目标：验证 BOOKED -> ARRIVED 的前置条件、门店权限和幂等
  cases.push(await runCase('orders-verify 缺少 verifyCode -> 400', async () => {
    const db = new MockDB();
    bindMockDB(db);
    const res = await verifyFn({}, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 400);
  }));

  cases.push(await runCase('orders-verify 订单不存在 -> 404', async () => {
    const db = new MockDB({ orders: [] });
    bindMockDB(db);
    const res = await verifyFn({ verifyCode: '666666' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 404);
  }));

  cases.push(await runCase('orders-verify 门店越权 -> 403', async () => {
    const db = new MockDB({
      orders: [{ _id: 'ov1', verifyCode: '111111', storeId: 's2', status: 'BOOKED' }]
    });
    bindMockDB(db);
    const res = await verifyFn({ verifyCode: '111111' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 403);
  }));

  cases.push(await runCase('orders-verify 非 BOOKED 不可核验 -> 422', async () => {
    const db = new MockDB({
      orders: [{ _id: 'ov2', verifyCode: '222222', storeId: 's1', status: 'IN_SERVICE' }]
    });
    bindMockDB(db);
    const res = await verifyFn({ verifyCode: '222222' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 422);
  }));

  cases.push(await runCase('orders-verify ARRIVED 幂等 -> 0', async () => {
    const db = new MockDB({
      orders: [{ _id: 'ov3', verifyCode: '333333', storeId: 's1', status: 'ARRIVED' }]
    });
    bindMockDB(db);
    const res = await verifyFn({ verifyCode: '333333' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    assert.strictEqual(res.data.order.status, 'ARRIVED');
  }));

  cases.push(await runCase('orders-verify BOOKED 可核验 -> 0', async () => {
    const db = new MockDB({
      orders: [{ _id: 'ov4', verifyCode: '444444', storeId: 's1', status: 'BOOKED' }],
      order_events: [],
      audit_logs: []
    });
    bindMockDB(db);
    const res = await verifyFn({ verifyCode: '444444' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    const row = db.table('orders').find((o) => o._id === 'ov4');
    assert.strictEqual(row.status, 'ARRIVED');
    assert.ok(db.table('order_events').length >= 1);
  }));

  // ==================== orders-finish-service ====================
  // 目标：验证“仅 IN_SERVICE 可完成”以及完结后的日志写入
  cases.push(await runCase('orders-finish-service 缺少 orderId -> 400', async () => {
    const db = new MockDB();
    bindMockDB(db);
    const res = await finishFn({}, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 400);
  }));

  cases.push(await runCase('orders-finish-service 订单不存在 -> 404', async () => {
    const db = new MockDB({ orders: [] });
    bindMockDB(db);
    const res = await finishFn({ orderId: 'of404' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 404);
  }));

  cases.push(await runCase('orders-finish-service 管理员门店越权 -> 403', async () => {
    const db = new MockDB({ orders: [{ _id: 'of1', status: 'IN_SERVICE', barberId: 'b1', storeId: 's2' }] });
    bindMockDB(db);
    const res = await finishFn({ orderId: 'of1' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 403);
  }));

  cases.push(await runCase('orders-finish-service 非 IN_SERVICE -> 422', async () => {
    const db = new MockDB({ orders: [{ _id: 'of2', status: 'ARRIVED', barberId: 'b1', storeId: 's1' }] });
    bindMockDB(db);
    const res = await finishFn({ orderId: 'of2' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 422);
  }));

  cases.push(await runCase('orders-finish-service FINISHED 幂等 -> 0', async () => {
    const db = new MockDB({ orders: [{ _id: 'of3', status: 'FINISHED', barberId: 'b1', storeId: 's1' }] });
    bindMockDB(db);
    const res = await finishFn({ orderId: 'of3' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    assert.strictEqual(res.data.order.status, 'FINISHED');
  }));

  cases.push(await runCase('orders-finish-service IN_SERVICE 可完成 -> 0', async () => {
    const db = new MockDB({
      orders: [{ _id: 'of4', status: 'IN_SERVICE', barberId: 'b1', storeId: 's1' }],
      order_events: [],
      audit_logs: []
    });
    bindMockDB(db);
    const res = await finishFn({ orderId: 'of4' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    const row = db.table('orders').find((o) => o._id === 'of4');
    assert.strictEqual(row.status, 'FINISHED');
    assert.ok(db.table('order_events').length >= 1);
  }));

  // ==================== orders-no-show ====================
  // 目标：验证爽约标记的时间阈值、状态阈值和权限约束
  cases.push(await runCase('orders-no-show 缺少 orderId -> 400', async () => {
    const db = new MockDB();
    bindMockDB(db);
    const res = await noShowFn({}, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 400);
  }));

  cases.push(await runCase('orders-no-show 订单不存在 -> 404', async () => {
    const db = new MockDB({ orders: [] });
    bindMockDB(db);
    const res = await noShowFn({ orderId: 'on404' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 404);
  }));

  cases.push(await runCase('orders-no-show 门店越权 -> 403', async () => {
    const db = new MockDB({
      orders: [{ _id: 'on1', status: 'BOOKED', storeId: 's2', date: '2020-01-01', startTime: '10:00' }]
    });
    bindMockDB(db);
    const res = await noShowFn({ orderId: 'on1' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 403);
  }));

  cases.push(await runCase('orders-no-show 非 BOOKED 不可标记 -> 422', async () => {
    const db = new MockDB({
      orders: [{ _id: 'on2', status: 'ARRIVED', storeId: 's1', date: '2020-01-01', startTime: '10:00' }]
    });
    bindMockDB(db);
    const res = await noShowFn({ orderId: 'on2' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 422);
  }));

  cases.push(await runCase('orders-no-show 未超时不可标记 -> 422', async () => {
    const futureDate = '2099-01-01';
    const db = new MockDB({
      orders: [{ _id: 'on3', status: 'BOOKED', storeId: 's1', date: futureDate, startTime: '10:00' }]
    });
    bindMockDB(db);
    const res = await noShowFn({ orderId: 'on3', thresholdMin: 20 }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 422);
    assert.strictEqual(res.message, 'not_overdue');
  }));

  cases.push(await runCase('orders-no-show 已 NO_SHOW 幂等 -> 0', async () => {
    const db = new MockDB({
      orders: [{ _id: 'on4', status: 'NO_SHOW', storeId: 's1', date: '2020-01-01', startTime: '10:00' }]
    });
    bindMockDB(db);
    const res = await noShowFn({ orderId: 'on4' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    assert.strictEqual(res.data.order.status, 'NO_SHOW');
  }));

  cases.push(await runCase('orders-no-show BOOKED 超时可标记 -> 0', async () => {
    const db = new MockDB({
      orders: [{ _id: 'on5', status: 'BOOKED', storeId: 's1', date: '2020-01-01', startTime: '10:00' }],
      order_events: [],
      audit_logs: []
    });
    bindMockDB(db);
    const res = await noShowFn({ orderId: 'on5', reason: '超时未到店' }, { auth: { _id: 'admin1', role: 'admin', storeId: 's1' } });
    assertCode(res, 0);
    const row = db.table('orders').find((o) => o._id === 'on5');
    assert.strictEqual(row.status, 'NO_SHOW');
    assert.ok(db.table('order_events').length >= 1);
  }));

  // ==================== reviews-create ====================
  // 目标：验证评价创建的权限、状态、幂等、图片格式校验
  cases.push(await runCase('reviews-create rating 缺失 -> 400', async () => {
    const db = new MockDB();
    bindMockDB(db);
    const res = await createReviewFn({ orderId: 'r10' }, { auth: { _id: 'u1', role: 'user' } });
    assertCode(res, 400);
  }));

  cases.push(await runCase('reviews-create 非本人订单 -> 403', async () => {
    const db = new MockDB({
      orders: [{ _id: 'r11', userId: 'u2', status: 'FINISHED', storeId: 's1', barberId: 'b1' }]
    });
    bindMockDB(db);
    const res = await createReviewFn({
      orderId: 'r11',
      rating: { service: 5, environment: 5, barber: 5 }
    }, { auth: { _id: 'u1', role: 'user' } });
    assertCode(res, 403);
  }));

  cases.push(await runCase('reviews-create 非 FINISHED -> 422', async () => {
    const db = new MockDB({
      orders: [{ _id: 'r12', userId: 'u1', status: 'ARRIVED', storeId: 's1', barberId: 'b1' }]
    });
    bindMockDB(db);
    const res = await createReviewFn({
      orderId: 'r12',
      rating: { service: 5, environment: 5, barber: 5 }
    }, { auth: { _id: 'u1', role: 'user' } });
    assertCode(res, 422);
  }));

  cases.push(await runCase('reviews-create 重复评价 -> 409', async () => {
    const db = new MockDB({
      orders: [{ _id: 'r13', userId: 'u1', status: 'FINISHED', storeId: 's1', barberId: 'b1' }],
      reviews: [{ _id: 'r1', orderId: 'r13', storeId: 's1', rating: { overall: 5, service: 5, environment: 5, barber: 5 } }]
    });
    bindMockDB(db);
    const res = await createReviewFn({
      orderId: 'r13',
      rating: { service: 5, environment: 5, barber: 5 }
    }, { auth: { _id: 'u1', role: 'user' } });
    assertCode(res, 409);
  }));

  cases.push(await runCase('reviews-create 非法图片引用 -> 400', async () => {
    const db = new MockDB({
      orders: [{ _id: 'r14', userId: 'u1', status: 'FINISHED', storeId: 's1', barberId: 'b1' }],
      reviews: []
    });
    bindMockDB(db);
    const res = await createReviewFn({
      orderId: 'r14',
      rating: { service: 5, environment: 5, barber: 5 },
      images: ['tmp/local/path.jpg']
    }, { auth: { _id: 'u1', role: 'user' } });
    assertCode(res, 400);
  }));

  cases.push(await runCase('reviews-create 正常创建 -> 0', async () => {
    const db = new MockDB({
      orders: [{ _id: 'r15', userId: 'u1', status: 'FINISHED', storeId: 's1', barberId: 'b1' }],
      reviews: [],
      stores: [{ _id: 's1', rating: { overall: 5, service: 5, environment: 5, count: 0 } }]
    });
    bindMockDB(db);
    const res = await createReviewFn({
      orderId: 'r15',
      rating: { service: 5, environment: 4, barber: 5 },
      content: 'good',
      images: ['https://example.com/1.jpg']
    }, { auth: { _id: 'u1', role: 'user', name: '测试用户' } });
    assertCode(res, 0);
    assert.ok(res.data.id);
    assert.strictEqual(db.table('reviews').length, 1);
  }));

  const total = cases.length;
  const pass = cases.filter((c) => c.pass).length;
  const fail = total - pass;
  // 汇总结果：用于 CI/本地脚本快速判断
  console.log(`\nSummary: total=${total}, pass=${pass}, fail=${fail}`);

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
