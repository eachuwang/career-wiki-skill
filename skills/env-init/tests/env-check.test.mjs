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
    await execFileAsync('python3', ['scripts/env_check.py', '--root', root], {
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
