import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);

async function fixture(t) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'career-env-init-')));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.WIKI_ROOT;
  const options = { cwd: new URL('..', import.meta.url), env };
  return {
    home,
    init: (...args) => exec('python3', ['scripts/env_check.py', ...args], options),
    locate: (...args) => exec(process.execPath, ['scripts/workspace_root.mjs', ...args], options),
    check: (...args) => exec(process.execPath, ['../wiki-engine/scripts/okf_bundle.mjs', 'check', ...args], options),
  };
}

test('env-init records custom root; repeats and Wiki CLI reuse it', async (t) => {
  const { home, init, locate, check } = await fixture(t);
  const root = join(home, 'custom root');
  const defaultRoot = join(home, '.career_wiki');
  await mkdir(join(defaultRoot, 'knowledge'), { recursive: true });
  await writeFile(join(defaultRoot, 'knowledge', 'index.md'), 'not OKF');
  await init('--root', root);
  const configPath = join(root, '.career-wiki-skill', 'config.json');
  const originalConfig = await readFile(configPath, 'utf8');
  assert.equal(JSON.parse(originalConfig).root, root);
  assert.match(await readFile(join(root, 'knowledge', 'index.md'), 'utf8'), /okf_version: "0\.2"/);
  assert.equal((await locate()).stdout.trim(), root);
  assert.match((await check()).stdout, /0 个 concepts/);
  await init();
  assert.equal(await readFile(configPath, 'utf8'), originalConfig);
  assert.equal(await readFile(join(defaultRoot, 'knowledge', 'index.md'), 'utf8'), 'not OKF');
  await assert.rejects(check('--root', join(home, 'missing')), /无效的 WorkspaceRoot/);
  await assert.rejects(init('--root', configPath), /不是目录/);
  assert.equal((await locate()).stdout.trim(), root);
  await writeFile(join(home, '.career-wiki-skill', 'workspace.json'), '{');
  await assert.rejects(locate(), /无效的 WorkspaceRoot 配置/);
});

test('legacy init stops without creating knowledge or a locator', async (t) => {
  const { home, init } = await fixture(t);
  const root = join(home, '.career_wiki');
  await mkdir(join(root, 'wiki'), { recursive: true });
  await assert.rejects(init(), /检测到旧工作区/);
  await assert.rejects(stat(join(root, 'knowledge')), { code: 'ENOENT' });
  await assert.rejects(stat(join(home, '.career-wiki-skill', 'workspace.json')), { code: 'ENOENT' });
});
