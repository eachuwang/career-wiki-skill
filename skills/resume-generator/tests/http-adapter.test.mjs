import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
