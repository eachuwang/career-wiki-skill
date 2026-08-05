import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/** 构造正文存岗位职责、frontmatter 存技术栈的兼容 Wiki 数据。 */
async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-responsibilities-'));
  await mkdir(join(root, 'wiki', 'projects'), { recursive: true });
  await mkdir(join(root, 'templates'), { recursive: true });
  await writeFile(
    join(root, 'wiki', 'projects', 'data-agent.md'),
    `---
entity: project
name: 数据智能体
role: 大模型应用工程师
start: 2024-01
end: present
description: 自动生成数据接入脚本。
tech_stack: Node.js、PostgreSQL、LangChain
---

项目背景说明。

**岗位职责：**

解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。
`,
  );
  await writeFile(
    join(root, 'templates', 'tech-minimal.json'),
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
