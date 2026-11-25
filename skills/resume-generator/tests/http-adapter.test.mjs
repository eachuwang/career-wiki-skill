import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCareerWikiAppState } from '../scripts/app_state.mjs';
import test from 'node:test';
import { createCareerWikiHttpAdapter, ENDPOINTS } from '../scripts/http_adapter.mjs';

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('HTTP adapter 只翻译请求与模块结果', async (t) => {
  const calls = [];
  const adapter = createCareerWikiHttpAdapter({
    knowledge: {
      load: async (query) => {
        calls.push(['knowledge.load', query]);
        return { entities: [{ path: 'projects/agent.md' }], allRelations: [], total: 1 };
      },
      get: async () => ({ path: 'projects/agent.md' }),
      status: async () => ({ root: '/data', exists: true, entity_counts: {}, okf_valid: true, okf_errors: [] }),
    },
    appState: {
      listResumes: async () => [],
      listTemplates: async () => [],
      saveResume: async (config) => {
        calls.push(['appState.saveResume', config]);
        return { status: 'saved', id: config.id };
      },
      deleteResume: async () => ({ status: 'deleted' }),
      saveTemplate: async () => ({ status: 'saved' }),
      deleteTemplate: async () => ({ status: 'deleted' }),
      readTemplateCss: async () => '.resume {}',
    },
    polish: {
      buildContext: async () => ({}),
      generate: async () => ({}),
      listModels: async () => [],
    },
  });
  const server = await listen(adapter);
  t.after(server.close);

  const contractResponse = await fetch(server.baseUrl);
  assert.equal(contractResponse.status, 200);
  assert.deepEqual((await contractResponse.json()).endpoints, ENDPOINTS);

  const wikiResponse = await fetch(`${server.baseUrl}/api/wiki?entity=project`);
  assert.equal(wikiResponse.status, 200);
  assert.equal((await wikiResponse.json()).total, 1);
  assert.deepEqual(calls[0], ['knowledge.load', { entity: 'project' }]);

  const saveResponse = await fetch(`${server.baseUrl}/api/resume/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { id: 'ai-engineer', name: 'AI 工程师' } }),
  });
  assert.equal(saveResponse.status, 200);
  assert.deepEqual(calls[1], [
    'appState.saveResume',
    { id: 'ai-engineer', name: 'AI 工程师' },
  ]);
});

test('HTTP adapter 将模块错误稳定映射为状态码和公开消息', async (t) => {
  const adapter = createCareerWikiHttpAdapter({
    knowledge: { load: async () => ({}), get: async () => ({}), status: async () => ({}) },
    appState: {
      listResumes: async () => [],
      listTemplates: async () => [],
      saveResume: async () => {
        throw Object.assign(new Error('数据目录不可写'), { statusCode: 500, code: 'EACCES' });
      },
    },
    polish: {},
  });
  const server = await listen(adapter);
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/resume/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'resume', name: 'Resume' }),
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: '保存失败',
    message: '数据目录不可写',
    code: 'EACCES',
  });
});

test('HTTP adapter 将无效 Wiki 查询映射为客户端错误', async (t) => {
  const adapter = createCareerWikiHttpAdapter({
    knowledge: {
      load: async () => {
        throw Object.assign(new Error('不支持的 Career 实体类型：unknown'), { statusCode: 400 });
      },
      get: async () => ({}),
      status: async () => ({}),
    },
    appState: {},
    polish: {},
  });
  const server = await listen(adapter);
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/wiki?entity=unknown`);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: '读取 Wiki 失败',
    message: '不支持的 Career 实体类型：unknown',
  });
});

test('HTTP adapter 将当前预览 HTML 生成为 PDF 文件响应', async (t) => {
  const calls = [];
  const adapter = createCareerWikiHttpAdapter({
    knowledge: {},
    appState: {},
    polish: {},
    pdf: {
      render: async (input) => {
        calls.push(input);
        return Buffer.from('%PDF-1.7 resume-content');
      },
    },
  });
  const server = await listen(adapter);
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/resume/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: '<article class="a4-page">王羿邱</article>' }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(calls, [{ html: '<article class="a4-page">王羿邱</article>' }]);
  assert.match(Buffer.from(await response.arrayBuffer()).toString(), /^%PDF-1\.7 resume-content/);
});

test('HTTP adapter 保存本地 Provider 且永不向浏览器返回 API Key', async (t) => {
  const calls = [];
  const publicConfig = {
    protocol: 'openai',
    base_url: 'https://example.com/v1',
    api_key: '',
    api_key_configured: true,
    model: 'model-a',
    timeout_ms: 60000,
  };
  const adapter = createCareerWikiHttpAdapter({
    knowledge: {},
    appState: {},
    pdf: {},
    polish: {
      getProvider: async () => publicConfig,
      saveProvider: async (provider) => {
        calls.push(provider);
        return publicConfig;
      },
    },
  });
  const server = await listen(adapter);
  t.after(server.close);

  const saveResponse = await fetch(`${server.baseUrl}/api/resume/polish-provider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'openai',
      base_url: 'https://example.com/v1',
      api_key: 'secret-key',
      model: 'model-a',
      timeout_ms: 60000,
    }),
  });
  const saved = await saveResponse.json();

  assert.equal(saveResponse.status, 200);
  assert.equal(JSON.stringify(saved).includes('secret-key'), false);
  assert.deepEqual(saved, publicConfig);
  assert.equal(calls[0].api_key, 'secret-key');

  const getResponse = await fetch(`${server.baseUrl}/api/resume/polish-provider`);
  assert.equal(getResponse.status, 200);
  assert.deepEqual(await getResponse.json(), publicConfig);
});


test('HTTP adapter checks local Host and Origin before dispatch and does not advertise CORS', async (t) => {
  let reads = 0;
  const server = await listen(createCareerWikiHttpAdapter({
    knowledge: { load: async () => { reads += 1; return {}; } },
  }));
  t.after(server.close);
  const get = (headers) => new Promise((resolve, reject) => {
    request(`${server.baseUrl}/api/wiki`, { headers }, (response) => {
      response.resume();
      resolve(response);
    }).on('error', reject).end();
  });
  for (const headers of [
    { Host: 'example.invalid:5173' },
    { Origin: 'http://localhost:9999' },
    { Origin: 'null' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const response = await get(headers);
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(reads, 0);

  const response = await get({ Host: 'localhost:5173', Origin: 'http://localhost:5173' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(reads, 1);
});

test('HTTP adapter limits both fixed-length and streamed JSON before dispatch', async (t) => {
  let writes = 0;
  const server = await listen(createCareerWikiHttpAdapter({
    appState: { saveResume: async () => { writes += 1; return {}; } },
  }));
  t.after(server.close);
  const url = `${server.baseUrl}/api/resume/save`;
  const headers = { 'content-type': 'application/json' };
  const body = JSON.stringify({ name: 'a'.repeat(2 * 1024 * 1024) });
  const fixedStatus = await new Promise((resolve, reject) => {
    const upload = request(url, {
      method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(body) },
    }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    upload.on('error', reject).flushHeaders();
  });
  assert.equal(fixedStatus, 413);
  const streamedResponse = await fetch(url, {
    method: 'POST', headers, duplex: 'half',
    body: (async function* () { yield body.slice(0, -32); yield body.slice(-32); })(),
  });
  assert.equal(streamedResponse.status, 413);
  await streamedResponse.text();
  const response = await fetch(url, { method: 'POST', body: '{}' });
  assert.equal(response.status, 415);
  assert.equal(writes, 0);
});

test('HTTP save treats create_only as request metadata for resumes and templates', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-http-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appState = createCareerWikiAppState({ root });
  const server = await listen(createCareerWikiHttpAdapter({ appState }));
  t.after(server.close);
  const save = (subject, payload) => fetch(`${server.baseUrl}/api/${subject}/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.baseUrl },
    body: JSON.stringify(payload),
  });
  assert.equal((await save('resume', { id: 'r', name: 'New', create_only: true })).status, 200);
  const conflict = await save('resume', { config: { id: 'r', name: 'Duplicate' }, create_only: true });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'ALREADY_EXISTS');
  const resume = await appState.getResume('r');
  assert.equal(resume.name, 'New');
  assert.equal(Object.hasOwn(resume, 'create_only'), false);

  const template = { id: 't', name: 'New', sections: [], create_only: true };
  assert.equal((await save('template', { template, css: '.new{}', create_only: true })).status, 200);
  assert.equal((await save('template', { template, css: '.duplicate{}', create_only: true })).status, 409);
  assert.equal(await appState.readTemplateCss('t'), '.new{}');
  assert.equal(Object.hasOwn((await appState.listTemplates())[0], 'create_only'), false);
  assert.equal((await save('resume', { id: 'r', name: 'Edited', create_only: false })).status, 200);
  assert.equal((await appState.getResume('r')).name, 'Edited');
});
