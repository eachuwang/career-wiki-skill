/**
 * lint.test.mjs — lint.mjs 回归测试
 *
 * 对 tests/fixtures/wiki 运行 lint 脚本，断言 7 项检查都能正确触发。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** 运行 lint 脚本并返回 { status, stdout } */
function runLint() {
  const res = spawnSync(process.execPath, [join(root, 'scripts', 'lint.mjs'), join(root, 'tests', 'fixtures', 'wiki')], {
    encoding: 'utf-8',
  });
  return { status: res.status, stdout: res.stdout };
}

test('lint 对含问题的 fixture 退出码为 1（有 error）', () => {
  const { status } = runLint();
  assert.equal(status, 1);
});

test('lint 报告覆盖全部 7 项检查', () => {
  const { stdout } = runLint();
  const checks = [
    ['断链', '[ERROR] 断链: skills/missing.md 被引用但不存在'],
    ['frontmatter 缺失', '[ERROR] frontmatter 缺失: skills/react.md 缺少 confidence 字段'],
    ['重复实体', '[ERROR] 重复实体: projects/dup.md 与 projects/dup2.md 疑似重复'],
    ['孤儿页面', '[WARN]  孤儿页面: skills/rust.md 无入链'],
    ['confidence 偏低', '[WARN]  confidence 偏低: projects/xxx.md confidence=inferred'],
    ['无来源', '[WARN]  无来源: certificates/pmp.md sources 为空'],
    ['过期信息', '[WARN]  过期信息: experiences/old.md end=present 但 start=2018-01'],
  ];
  for (const [name, expected] of checks) {
    assert.ok(stdout.includes(expected), `应输出 ${name} 检查: ${expected}`);
  }
  assert.ok(stdout.includes('总计: 4 errors, 10 warnings'));
});
