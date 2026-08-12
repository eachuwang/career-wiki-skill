import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from 'node:http';

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-polish-endpoint-'));
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
responsibilities: 解析数据字典；生成 DDL 与 ETL 脚本。
tech_stack: Node.js、PostgreSQL、LangChain
---
`,
  );
  await writeFile(
    join(root, 'templates', 'tech-minimal.json'),
    JSON.stringify({
      id: 'tech-minimal',
      sections: [
        { module: 'project', title: '项目经验', fields: ['name', 'description', 'responsibilities'] },
      ],
    }),
  );
  return root;
}

async function createMultiCandidateFixture(count) {
  const root = await createFixture();
  for (let index = 1; index < count; index += 1) {
    await writeFile(
      join(root, 'wiki', 'projects', `project-${index}.md`),
      `---
entity: project
name: 数据项目${index}
description: 负责数据接入与清洗。
---
`,
    );
  }
  return root;
}

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

test('生成润色接口返回可应用的非原文结果并开启润色状态', async (t) => {
  const root = await createFixture();
  const port = 45000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      WIKI_ROOT: root,
      PORT: String(port),
      RESUME_POLISH_PROVIDER: 'mock',
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  });
  await waitForServer(baseUrl);

  const original = '自动生成数据接入脚本。';
  const response = await fetch(`${baseUrl}/api/resume/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        id: 'polished-resume',
        name: '润色简历',
        template: 'tech-minimal',
        modules: ['project'],
      },
    }),
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.config.polish.enabled, true);
  assert.equal(result.config.provider, undefined);
  assert.notEqual(
    result.config.polish.entries['projects/data-agent.md'].fields.description,
    original,
  );
  assert.equal(result.config.polish.entries['projects/data-agent.md'].source_hash.length, 8);

  const polishedResumeResponse = await fetch(`${baseUrl}/api/resume/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: result.config }),
  });
  const polishedResume = await polishedResumeResponse.json();
  assert.equal(
    polishedResume.sections[0].items[0].description,
    result.config.polish.entries['projects/data-agent.md'].fields.description,
  );

  const originalResumeResponse = await fetch(`${baseUrl}/api/resume/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        ...result.config,
        polish: { ...result.config.polish, enabled: false },
      },
    }),
  });
  const originalResume = await originalResumeResponse.json();
  assert.equal(originalResume.sections[0].items[0].description, original);
});

test('润色内容选择只生成选中的字段，并保留其他已生成结果', async (t) => {
  const root = await createFixture();
  const port = 45100 + Math.floor(Math.random() * 500);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      WIKI_ROOT: root,
      PORT: String(port),
      RESUME_POLISH_PROVIDER: 'mock',
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  });
  await waitForServer(baseUrl);

  const response = await fetch(`${baseUrl}/api/resume/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        id: 'selected-fields-resume',
        name: '选择字段简历',
        template: 'tech-minimal',
        modules: ['project'],
        polish: {
          selected_fields: ['description'],
          entries: {
            'projects/data-agent.md': {
              source_hash: 'old-hash',
              fields: { responsibilities: '已存在的岗位职责润色。' },
            },
          },
        },
      },
    }),
  });

  const result = await response.json();
  const entry = result.config.polish.entries['projects/data-agent.md'];
  assert.equal(response.status, 200);
  assert.ok(entry.fields.description);
  assert.equal(entry.fields.responsibilities, '已存在的岗位职责润色。');
});

test('换一换只请求并更新指定条目的指定字段', async (t) => {
  const root = await createFixture();
  const providerPort = 46100 + Math.floor(Math.random() * 400);
  const apiPort = providerPort + 400;
  const requests = [];
  const providerServer = createServer(async (req, res) => {
    if (req.url !== '/v1/chat/completions') {
      res.statusCode = 404;
      return res.end();
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const prompt = requestBody.messages?.find((message) => message.role === 'user')?.content || '';
    const context = JSON.parse(prompt.split('\n').at(-1));
    requests.push(context);
    const candidate = context.candidates[0];
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        entries: [{
          path: candidate.path,
          source_hash: candidate.source_hash,
          fields: { description: '换一版项目描述。' },
        }],
      }) } }],
    }));
  });
  await new Promise((resolve) => providerServer.listen(providerPort, '127.0.0.1', resolve));

  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WIKI_ROOT: root, PORT: String(apiPort) },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await new Promise((resolve) => providerServer.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await waitForServer(baseUrl);
  const provider = {
    base_url: `http://127.0.0.1:${providerPort}/v1`,
    api_key: 'test-key',
    model: 'local-model',
  };
  const response = await fetch(`${baseUrl}/api/resume/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      only: { path: 'projects/data-agent.md', field: 'description' },
      config: {
        id: 'retry-field-resume',
        name: '换一换简历',
        template: 'tech-minimal',
        modules: ['project'],
        polish: {
          enabled: true,
          selected_fields: ['description', 'responsibilities'],
          entries: {
            'projects/data-agent.md': {
              source_hash: 'placeholder',
              fields: { responsibilities: '保留这条岗位职责润色。' },
            },
          },
        },
      },
    }),
  });
  const result = await response.json();
  const entry = result.config.polish.entries['projects/data-agent.md'];
  assert.equal(response.status, 200);
  assert.deepEqual(requests[0].selected_fields, ['description']);
  assert.equal(requests[0].candidates.length, 1);
  assert.deepEqual(requests[0].candidates[0].target_fields, ['description']);
  assert.equal(entry.fields.description, '换一版项目描述。');
  assert.equal(entry.fields.responsibilities, '保留这条岗位职责润色。');
});

test('OpenAI-compatible provider 支持拉取模型并生成润色', async (t) => {
  const root = await createFixture();
  const providerPort = 46000 + Math.floor(Math.random() * 1000);
  const apiPort = providerPort + 1;
  const received = [];
  const providerServer = createServer(async (req, res) => {
    received.push({ path: req.url, authorization: req.headers.authorization });
    if (req.url === '/v1/models') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ data: [{ id: 'local-model' }, { id: 'backup-model' }] }));
    }
    if (req.url === '/v1/chat/completions') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const prompt = requestBody.messages?.find((message) => message.role === 'user')?.content || '';
      const context = JSON.parse(prompt.split('\n').at(-1));
      const candidate = context.candidates.find((item) => item.target_fields.length > 0);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          entries: [{
            path: candidate.path,
            source_hash: candidate.source_hash,
            fields: { description: '项目围绕自动生成数据接入脚本展开。' },
          }],
        }) } }],
      }));
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => providerServer.listen(providerPort, '127.0.0.1', resolve));

  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      WIKI_ROOT: root,
      PORT: String(apiPort),
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await new Promise((resolve) => providerServer.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await waitForServer(baseUrl);
  const provider = {
    base_url: `http://127.0.0.1:${providerPort}/v1`,
    api_key: 'test-key',
    model: 'local-model',
  };

  const modelsResponse = await fetch(`${baseUrl}/api/resume/polish-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  assert.deepEqual((await modelsResponse.json()).models, ['backup-model', 'local-model']);

  const polishResponse = await fetch(`${baseUrl}/api/resume/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      config: { id: 'polished-resume', name: '润色简历', template: 'tech-minimal', modules: ['project'] },
    }),
  });
  const polishResult = await polishResponse.json();
  assert.equal(polishResponse.status, 200);
  assert.equal(polishResult.generated_count, 1);
  assert.equal(
    polishResult.config.polish.entries['projects/data-agent.md'].fields.description,
    '项目围绕自动生成数据接入脚本展开。',
  );
  assert.equal(received[0].path, '/v1/models');
  assert.equal(received[0].authorization, 'Bearer test-key');
  assert.equal(received[1].path, '/v1/chat/completions');
  assert.equal(received[1].authorization, 'Bearer test-key');
});

test('多个润色候选会分批请求模型并合并结果', async (t) => {
  const root = await createMultiCandidateFixture(5);
  const providerPort = 48000 + Math.floor(Math.random() * 500);
  const apiPort = providerPort + 500;
  const batchSizes = [];
  const providerServer = createServer(async (req, res) => {
    if (req.url !== '/v1/chat/completions') {
      res.statusCode = 404;
      return res.end();
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const prompt = requestBody.messages?.find((message) => message.role === 'user')?.content || '';
    const context = JSON.parse(prompt.split('\n').at(-1));
    batchSizes.push(context.candidates.length);
    const entries = context.candidates.map((candidate) => ({
      path: candidate.path,
      source_hash: candidate.source_hash,
      fields: {
        description: `项目围绕${candidate.source.description.replace(/。$/, '')}展开。`,
      },
    }));
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ entries }) } }],
    }));
  });
  await new Promise((resolve) => providerServer.listen(providerPort, '127.0.0.1', resolve));

  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WIKI_ROOT: root, PORT: String(apiPort) },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await new Promise((resolve) => providerServer.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await waitForServer(baseUrl);

  const response = await fetch(`${baseUrl}/api/resume/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: {
        base_url: `http://127.0.0.1:${providerPort}/v1`,
        api_key: 'test-key',
        model: 'local-model',
      },
      config: {
        id: 'batch-resume',
        name: '批量润色简历',
        template: 'tech-minimal',
        modules: ['project'],
      },
    }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.generated_count, 5);
  assert.deepEqual(batchSizes.sort((a, b) => b - a), [2, 2, 1]);
});

test('单批请求超时后自动重试一次并保留完整结果', async (t) => {
  const root = await createFixture();
  const providerPort = 49000 + Math.floor(Math.random() * 250);
  const apiPort = providerPort + 250;
  let requestCount = 0;
  const providerServer = createServer(async (req, res) => {
    if (req.url !== '/v1/chat/completions') {
      res.statusCode = 404;
      return res.end();
    }
    requestCount += 1;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const prompt = requestBody.messages?.find((message) => message.role === 'user')?.content || '';
    const context = JSON.parse(prompt.split('\n').at(-1));
    const candidate = context.candidates[0];
    if (requestCount === 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        entries: [{
          path: candidate.path,
          source_hash: candidate.source_hash,
          fields: { description: '项目围绕自动生成数据接入脚本展开。' },
        }],
      }) } }],
    }));
  });
  await new Promise((resolve) => providerServer.listen(providerPort, '127.0.0.1', resolve));

  const server = spawn(process.execPath, ['scripts/api_server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WIKI_ROOT: root, PORT: String(apiPort) },
    stdio: 'ignore',
  });
  t.after(async () => {
    server.kill('SIGTERM');
    await new Promise((resolve) => providerServer.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await waitForServer(baseUrl);

  const response = await fetch(`${baseUrl}/api/resume/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: {
        base_url: `http://127.0.0.1:${providerPort}/v1`,
        api_key: 'test-key',
        model: 'local-model',
        timeout_ms: 100,
      },
      config: {
        id: 'retry-resume',
        name: '重试润色简历',
        template: 'tech-minimal',
        modules: ['project'],
      },
    }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(requestCount, 2);
  assert.equal(result.generated_count, 1);
});
