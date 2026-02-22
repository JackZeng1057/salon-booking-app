#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * 测试总入口
 *
 * 作用：
 * - 按固定顺序执行 3 类测试（白盒 -> 联调 -> 数据/性能）；
 * - 任一脚本失败即中断并返回非 0，便于快速发现问题；
 * - 给论文/答辩提供“一键复现”的执行方式。
 */

const cp = require('child_process');
const path = require('path');

const tasks = [
  'tests/whitebox/run-whitebox.js',
  'tests/interface/run-interface-contract.js',
  'tests/perf/run-data-perf-basic.js'
];

function runOne(file) {
  // 子进程直接继承终端输出，保证能看到每条 PASS/FAIL 明细
  return new Promise((resolve, reject) => {
    const full = path.resolve(process.cwd(), file);
    const p = cp.spawn('node', [full], { stdio: 'inherit' });
    p.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${file} 失败，退出码 ${code}`));
      }
    });
  });
}

async function main() {
  // 顺序执行而非并发：便于定位失败来源并保持日志可读性
  for (const t of tasks) {
    console.log(`\n=== RUN ${t} ===`);
    await runOne(t);
  }
  console.log('\n全部测试脚本执行完成。');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
