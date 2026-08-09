import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/** 创建带有已删除项目清单的 API fixture，模拟 Wiki 文件尚未清理的过渡状态。 */
async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-api-deletion-'));
  await mkdir(join(root, 'wiki', 'projects'), { recursive: true });
  await mkdir(join(root, '.career-wiki-skill'), { recursive: true });
  await mkdir(join(root, 'templates'), { recursive: true });
  await writeFile(
    join(root, 'wiki', 'projects', 'deleted-project.md'),
    '---\nentity: project\nname: 待删除项目\nrole: 负责人\n---\n',
  );
  await writeFile(
    join(root, 'wiki', 'projects', 'kept-project.md'),
    '---\nentity: project\nname: 保留项目\nrole: 开发者\n---\n',
  );
  await writeFile(
    join(root, '.career-wiki-skill', 'deletions.json'),
    JSON.stringify({
      version: 1,
      deletions: [
        { entity: 'project', path: 'projects/deleted-project.md', name: '待删除项目' },
      ],
    }),
  );
  await writeFile(
    join(root, 'templates', 'tech-minimal.json'),
    JSON.stringify({
      id: 'tech-minimal',
      sections: [{ module: 'project', title: '项目经验', fields: ['name', 'role'] }],
    }),
  );
  return root;
}

/** 等待 API 服务真正监听，避免测试只验证进程是否启动。 */
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

test('删除清单会阻止已删除项目进入 Wiki 和简历生成结果', async (t) => {
  const root = await createFixture();
  const port = 42000 + Math.floor(Math.random() * 1000);
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

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.entity_counts.projects, 1);

  const wikiResponse = await fetch(`${baseUrl}/api/wiki?entity=project`);
  assert.equal(wikiResponse.status, 200);
  const wiki = await wikiResponse.json();
  assert.deepEqual(wiki.entities.map((item) => item.fields.name), ['保留项目']);

  const resumeResponse = await fetch(`${baseUrl}/api/resume/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        template: 'tech-minimal',
        modules: ['project'],
      },
    }),
  });
  assert.equal(resumeResponse.status, 200);
  const resume = await resumeResponse.json();
  assert.deepEqual(resume.sections[0].items.map((item) => item.name), ['保留项目']);

  const deletedResponse = await fetch(
    `${baseUrl}/api/wiki/projects/deleted-project.md`,
  );
  assert.equal(deletedResponse.status, 404);
});
