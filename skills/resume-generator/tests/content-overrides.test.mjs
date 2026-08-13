import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildPolishSourceHash } from '../scripts/resume_polish.mjs';

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

test('内容覆盖只进入当前简历生成结果，不修改 Wiki 原文', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-content-overrides-'));
  const wikiFile = join(root, 'knowledge', 'projects', 'data-agent.md');
  await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
  await mkdir(join(root, '.career-wiki-skill', 'templates'), { recursive: true });
  const wikiSource = `---
type: career.project
name: 数据智能体
description: Wiki 原始项目描述。
---
`;
  await writeFile(wikiFile, wikiSource);
  await writeFile(
    join(root, '.career-wiki-skill', 'templates', 'tech-minimal.json'),
    JSON.stringify({
      id: 'tech-minimal',
      sections: [{ module: 'project', title: '项目经验', fields: ['name', 'description'] }],
    }),
  );

  const port = 49500 + Math.floor(Math.random() * 100);
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
    id: 'edited-resume',
    name: '编辑后的简历',
    template: 'tech-minimal',
    modules: ['project'],
    polish: {
      enabled: true,
      entries: {
        'projects/data-agent.md': {
          source_hash: buildPolishSourceHash({
            name: '数据智能体',
            description: 'Wiki 原始项目描述。',
          }),
          fields: { description: 'AI 润色后的项目描述。' },
        },
      },
    },
    content_overrides: {
      'projects/data-agent.md': {
        description: '用户编辑后的项目描述。',
      },
    },
  };
  const saveResponse = await fetch(`${baseUrl}/api/resume/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  assert.equal(saveResponse.status, 200);

  const generateResponse = await fetch(`${baseUrl}/api/resume/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume_id: 'edited-resume' }),
  });
  const generated = await generateResponse.json();

  assert.equal(generateResponse.status, 200);
  assert.equal(generated.sections[0].items[0].description, '用户编辑后的项目描述。');

  const exportResponse = await fetch(`${baseUrl}/api/resume/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume_id: 'edited-resume', format: 'json' }),
  });
  const exported = await exportResponse.json();
  assert.equal(exportResponse.status, 200);
  assert.equal(exported.sections[0].items[0].description, '用户编辑后的项目描述。');
  assert.equal(await readFile(wikiFile, 'utf8'), wikiSource);
});
