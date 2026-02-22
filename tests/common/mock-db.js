/**
 * 通用 Mock 数据库工具
 *
 * 用途：
 * 1) 在本地 Node 环境模拟 uniCloud.database() 的最小能力；
 * 2) 支持白盒测试、接口联调测试、性能基础测试复用；
 * 3) 保证每个测试用例有独立数据上下文，避免互相污染。
 */

function clone(obj) {
  // 用 JSON 深拷贝满足当前数据结构（纯对象/数组/基础类型）
  return JSON.parse(JSON.stringify(obj));
}

function matchQuery(doc, query) {
  return Object.keys(query || {}).every((key) => {
    const expected = query[key];
    // 兼容简单 in 查询：{ field: db.command.in([...]) }
    if (expected && typeof expected === 'object' && expected.__op === 'in') {
      return Array.isArray(expected.value) && expected.value.includes(doc && doc[key]);
    }
    return doc && doc[key] === expected;
  });
}

function pickFields(doc, fieldMap) {
  // 模拟 .field({ a:true, b:true }) 的字段投影行为
  if (!fieldMap) return clone(doc);
  const picked = {};
  Object.keys(fieldMap).forEach((key) => {
    if (fieldMap[key] && Object.prototype.hasOwnProperty.call(doc, key)) {
      picked[key] = doc[key];
    }
  });
  return picked;
}

class MockDB {
  constructor(seed = {}) {
    this._data = {};
    this._idSeq = 1;
    Object.keys(seed).forEach((name) => {
      this._data[name] = clone(seed[name]);
    });
  }

  collection(name) {
    // 延迟初始化表，便于测试中按需使用新集合
    if (!this._data[name]) this._data[name] = [];
    const table = this._data[name];
    const db = this;

    const makeWhere = (query) => {
      // 模拟 uniCloud 的 where/limit/field/get 链式调用
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
      // 模拟 doc(id).get()/update() 调用
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
        // 模拟 add：自动生成 _id 并返回 id
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

function bindMockDB(db) {
  // 兼容 db.command.in([...]) 用法（当前测试已使用）
  db.command = {
    in(list) {
      return { __op: 'in', value: Array.isArray(list) ? list : [] };
    }
  };
  global.uniCloud = {
    database: () => db
  };
}

module.exports = {
  MockDB,
  bindMockDB,
  clone
};
