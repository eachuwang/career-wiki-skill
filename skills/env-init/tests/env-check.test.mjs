import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('env-init 创建严格 OKF bundle 与隔离的应用状态目录', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-env-init-'));
  try {
    const { stdout } = await execFileAsync('python3', ['scripts/env_check.py', '--root', root], {
      cwd: new URL('..', import.meta.url),
    });
    const index = await readFile(join(root, 'knowledge', 'index.md'), 'utf8');
    const config = JSON.parse(await readFile(
      join(root, '.career-wiki-skill', 'config.json'),
      'utf8',
    ));
    assert.match(index, /okf_version: "0\.2"/);
    assert.equal(config.okf_version, '0.2');
    assert.equal(config.root, await realpath(root));
    assert.equal(typeof config.created, 'string');
    assert.ok(Number.isFinite(Date.parse(config.created)), 'created 应为合法 ISO 8601 时间');
    assert.match(stdout, /gray-matter 已安装/);
    assert.match(stdout, /仓库的 skills\/ 目录运行: npm install/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
