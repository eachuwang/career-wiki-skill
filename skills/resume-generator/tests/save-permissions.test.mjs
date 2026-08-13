import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // 服务尚未监听。
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('API 服务启动超时');
}

test('简历目录不可写时返回可操作的错误且不暴露本地绝对路径', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-save-permissions-'));
  const resumesDir = join(root, '.career-wiki-skill', 'resumes');
  const resumePath = join(resumesDir, 'readonly-resume.json');
  await mkdir(resumesDir, { recursive: true });
  await writeFile(resumePath, '{}');
  await chmod(resumePath, 0o444);

  const port = 47000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WIKI_ROOT: root, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await chmod(resumePath, 0o644).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  await waitForServer(baseUrl);

  const response = await fetch(`${baseUrl}/api/resume/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'readonly-resume', name: '只读简历' }),
  });
  const result = await response.json();

  assert.equal(response.status, 500);
  assert.equal(result.code, 'EACCES');
  assert.match(result.message, /数据目录不可写/);
  assert.doesNotMatch(result.message, new RegExp(root));
});
