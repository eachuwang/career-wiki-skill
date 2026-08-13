import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildPolishSourceHash } from '../scripts/resume_polish.mjs';

test('润色指纹覆盖所有原始字段，避免上下文事实变化后复用旧文案', () => {
  assert.notEqual(
    buildPolishSourceHash({ description: '做数据接入', tech_stack: 'Node.js' }),
    buildPolishSourceHash({ description: '做数据接入', tech_stack: 'Python' }),
  );
  assert.notEqual(
    buildPolishSourceHash({ description: '做数据接入', role: '后端工程师' }),
    buildPolishSourceHash({ description: '做数据接入', role: '产品经理' }),
  );
});

/** 构造严格 OKF Career concept 测试数据。 */
async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-responsibilities-'));
  await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
  await mkdir(join(root, '.career-wiki-skill', 'templates'), { recursive: true });
  await writeFile(
    join(root, 'knowledge', 'projects', 'data-agent.md'),
    `---
type: career.project
name: 数据智能体
role: 大模型应用工程师
start: 2024-01
end: present
description: 自动生成数据接入脚本。
responsibilities: 解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。
tech_stack: Node.js、PostgreSQL、LangChain
---

项目背景说明。
`,
  );
  await writeFile(
    join(root, '.career-wiki-skill', 'templates', 'tech-minimal.json'),
    JSON.stringify({
      id: 'tech-minimal',
      sections: [
        {
          module: 'project',
          title: '项目经验',
          fields: ['name', 'role', 'start', 'end', 'description'],
        },
      ],
    }),
  );
  return root;
}

/** 等待真实服务可访问，确保测试覆盖 Markdown 到 HTTP 的完整链路。 */
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

test('项目岗位职责和技术栈以独立字段进入简历结果', async (t) => {
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

  const wikiResponse = await fetch(`${baseUrl}/api/wiki`);
  const wiki = await wikiResponse.json();
  assert.equal(
    wiki.entities[0].fields.responsibilities,
    '解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。',
  );
  assert.equal(wiki.entities[0].fields.tech_stack, 'Node.js、PostgreSQL、LangChain');

  const resumeResponse = await fetch(`${baseUrl}/api/resume/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        id: 'ai-resume',
        name: 'AI 应用简历',
        template: 'tech-minimal',
        modules: ['project'],
      },
    }),
  });
  const resume = await resumeResponse.json();
  assert.equal(
    resume.sections[0].items[0].responsibilities,
    '解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。',
  );
  assert.equal(
    resume.sections[0].items[0].tech_stack,
    'Node.js、PostgreSQL、LangChain',
  );
});

test('润色上下文提供原始事实、口吻样本和稳定指纹', async (t) => {
  const root = await createFixture();
  const port = 43000 + Math.floor(Math.random() * 1000);
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

  const response = await fetch(`${baseUrl}/api/resume/polish-context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        id: 'ai-resume',
        name: 'AI 应用简历',
        template: 'tech-minimal',
        modules: ['project'],
      },
    }),
  });
  assert.equal(response.status, 200);
  const context = await response.json();
  assert.equal(context.candidates.length, 1);
  assert.equal(context.candidates[0].source.description, '自动生成数据接入脚本。');
  assert.equal(context.candidates[0].source.responsibilities, '解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。');
  assert.match(context.candidates[0].source_hash, /^[0-9a-f]{8}$/);
  assert.equal(context.candidates[0].status.status, 'missing');
  assert.ok(context.style_samples.some((sample) => sample.field === 'description'));
  assert.ok(context.instructions.rules.some((rule) => rule.includes('不补造事实')));
});

test('仅应用与当前 Wiki 原文匹配的润色结果，原文变化后自动回退', async (t) => {
  const root = await createFixture();
  const port = 44000 + Math.floor(Math.random() * 1000);
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

  const contextResponse = await fetch(`${baseUrl}/api/resume/polish-context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { template: 'tech-minimal', modules: ['project'] } }),
  });
  const context = await contextResponse.json();
  const candidate = context.candidates[0];
  const config = {
    id: 'polished-resume',
    name: '润色简历',
    template: 'tech-minimal',
    modules: ['project'],
    polish: {
      entries: {
        [candidate.path]: {
          source_hash: candidate.source_hash,
          fields: {
            description: '围绕数据接入自动化，完成脚本生成能力建设。',
            responsibilities: '负责解析数据字典，并生成 DDL 与 ETL 脚本。',
          },
        },
      },
    },
  };

  const appliedResponse = await fetch(`${baseUrl}/api/resume/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const applied = await appliedResponse.json();
  assert.equal(applied.sections[0].items[0].description, '围绕数据接入自动化，完成脚本生成能力建设。');
  assert.equal(applied.sections[0].items[0]._polish.status, 'applied');

  await writeFile(
    join(root, 'knowledge', 'projects', 'data-agent.md'),
    `---
type: career.project
name: 数据智能体
role: 大模型应用工程师
start: 2024-01
end: present
description: 自动生成数据接入脚本，并支持字段校验。
responsibilities: 解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。
tech_stack: Node.js、PostgreSQL、LangChain
---
`,
  );
  const staleResponse = await fetch(`${baseUrl}/api/resume/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const stale = await staleResponse.json();
  assert.equal(stale.sections[0].items[0].description, '自动生成数据接入脚本，并支持字段校验。');
  assert.equal(stale.sections[0].items[0]._polish.status, 'stale');
});
