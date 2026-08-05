import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/** 写入最小 Wiki 数据，隔离验证 API 的简历视角过滤。 */
async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-api-'));
  await mkdir(join(root, 'wiki', 'projects'), { recursive: true });
  await mkdir(join(root, 'templates'), { recursive: true });
  await writeFile(
    join(root, 'wiki', 'projects', 'search-platform.md'),
    '---\nentity: project\nname: 搜索平台\nrole: 负责人\n---\n',
  );
  await writeFile(
    join(root, 'wiki', 'projects', 'legacy-console.md'),
    '---\nentity: project\nname: 旧版控制台\nrole: 开发者\n---\n',
  );
  await writeFile(
    join(root, 'templates', 'tech-minimal.json'),
    JSON.stringify({
      id: 'tech-minimal',
      sections: [
        { module: 'project', title: '项目经验', fields: ['name', 'role'] },
      ],
    }),
  );
  return root;
}

/** 等待真实 HTTP 服务可访问，避免用实现细节代替接口验证。 */
async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // 服务尚未监听，短暂等待后重试。
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('API 服务启动超时');
}

/** 请求简历接口并返回结构化响应，保持测试只观察 HTTP 公共行为。 */
async function postResume(baseUrl, path, config) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, format: 'json' }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('生成与 JSON 导出都排除当前简历隐藏的 Wiki 子项', async (t) => {
  const root = await createFixture();
  const port = 41000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WIKI_ROOT: root, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  });
  await waitForServer(baseUrl);

  const config = {
    id: 'backend',
    name: '后端工程师简历',
    template: 'tech-minimal',
    modules: ['project'],
    hide: [
      { module: 'project', items: ['projects/legacy-console.md'] },
    ],
  };

  const generated = await postResume(baseUrl, '/api/resume/generate', config);
  const exported = await postResume(baseUrl, '/api/resume/export', config);

  assert.deepEqual(
    generated.sections[0].items.map((item) => item.name),
    ['搜索平台'],
  );
  assert.deepEqual(
    exported.sections[0].items.map((item) => item.name),
    ['搜索平台'],
  );
});
