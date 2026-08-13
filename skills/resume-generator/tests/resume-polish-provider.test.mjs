import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  generatePolishEntries,
  generateWithProvider,
  listProviderModels,
} from '../scripts/resume_polish_provider.mjs';

function candidate(path = 'projects/agent.md') {
  return {
    path,
    source_hash: '1234abcd',
    source: { description: '自动生成 Node.js 数据接入脚本。' },
    target_fields: ['description'],
  };
}

function context(candidates = [candidate()]) {
  return {
    resume: { id: 'ai-engineer', name: 'AI 工程师', target: null },
    candidates,
    selected_fields: ['description'],
    style_samples: [],
    instructions: {},
  };
}

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function openAiResponse(requestContext, description = '自动生成 Node.js 数据接入脚本，提升交付效率。') {
  const item = requestContext.candidates[0];
  return {
    choices: [{ message: { content: JSON.stringify({
      entries: [{
        path: item.path,
        source_hash: item.source_hash,
        fields: { description },
      }],
    }) } }],
  };
}

test('OpenAI-compatible adapter 拉取模型并按同一协议解析润色结果', async (t) => {
  const received = [];
  const provider = await listen(async (request, response) => {
    received.push({ path: request.url, authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/models') {
      return response.end(JSON.stringify({ data: [{ id: 'model-b' }, { id: 'model-a' }] }));
    }
    const body = await readJson(request);
    const prompt = body.messages.find((message) => message.role === 'user').content;
    return response.end(JSON.stringify(openAiResponse(JSON.parse(prompt.split('\n').at(-1)))));
  });
  t.after(provider.close);
  const config = {
    protocol: 'openai',
    base_url: `${provider.baseUrl}/v1`,
    api_key: 'test-key',
    model: 'model-a',
  };

  assert.deepEqual(await listProviderModels(config), ['model-a', 'model-b']);
  const result = await generateWithProvider(context(), config);

  assert.equal(result.entries[0].path, 'projects/agent.md');
  assert.deepEqual(received, [
    { path: '/v1/models', authorization: 'Bearer test-key' },
    { path: '/v1/chat/completions', authorization: 'Bearer test-key' },
  ]);
});

test('OpenAI-compatible adapter 从思考文本和代码围栏中提取 JSON', async (t) => {
  const provider = await listen(async (request, response) => {
    const body = await readJson(request);
    const prompt = body.messages.find((message) => message.role === 'user').content;
    const payload = openAiResponse(JSON.parse(prompt.split('\n').at(-1)));
    payload.choices[0].message.content = `<think>检查事实</think>\n\`\`\`json\n${payload.choices[0].message.content}\n\`\`\``;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
  });
  t.after(provider.close);

  const result = await generateWithProvider(context(), {
    protocol: 'openai',
    base_url: `${provider.baseUrl}/v1`,
    api_key: 'test-key',
    model: 'model-a',
  });
  assert.equal(result.entries.length, 1);
});

test('Anthropic Messages adapter 使用显式协议的请求头和响应结构', async (t) => {
  const received = [];
  const provider = await listen(async (request, response) => {
    received.push({
      path: request.url,
      apiKey: request.headers['x-api-key'],
      version: request.headers['anthropic-version'],
    });
    const body = await readJson(request);
    const requestContext = JSON.parse(body.messages[0].content.split('\n').at(-1));
    const item = requestContext.candidates[0];
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({
        entries: [{
          path: item.path,
          source_hash: item.source_hash,
          fields: { description: '自动生成 Node.js 数据接入脚本，提升交付效率。' },
        }],
      }) }],
    }));
  });
  t.after(provider.close);

  const result = await generateWithProvider(context(), {
    protocol: 'anthropic',
    base_url: `${provider.baseUrl}/apps/anthropic`,
    api_key: 'anthropic-key',
    model: 'claude',
  });

  assert.equal(result.entries.length, 1);
  assert.deepEqual(received, [{
    path: '/apps/anthropic/v1/messages',
    apiKey: 'anthropic-key',
    version: '2023-06-01',
  }]);
});

test('Provider 必须显式选择协议，且网络错误返回可定位信息', async () => {
  await assert.rejects(
    generateWithProvider(context(), {
      base_url: 'http://127.0.0.1:9/v1',
      api_key: 'test-key',
      model: 'model-a',
    }),
    (error) => error.statusCode === 400 && /请选择 AI 润色协议/.test(error.message),
  );
  await assert.rejects(
    generateWithProvider(context(), {
      protocol: 'openai',
      base_url: 'http://127.0.0.1:9/v1',
      api_key: 'test-key',
      model: 'model-a',
      timeout_ms: 100,
    }),
    (error) => error.statusCode === 502
      && /无法连接 AI 润色服务/.test(error.message)
      && !/fetch failed/.test(error.message),
  );
});

test('润色候选按每批两条并发处理后合并为完整结果', async (t) => {
  const batchSizes = [];
  const provider = await listen(async (request, response) => {
    const body = await readJson(request);
    const prompt = body.messages.find((message) => message.role === 'user').content;
    const requestContext = JSON.parse(prompt.split('\n').at(-1));
    batchSizes.push(requestContext.candidates.length);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        entries: requestContext.candidates.map((item) => ({
          path: item.path,
          source_hash: item.source_hash,
          fields: { description: '围绕 Node.js 实现数据接入脚本自动生成。' },
        })),
      }) } }],
    }));
  });
  t.after(provider.close);
  const candidates = Array.from({ length: 5 }, (_, index) => candidate(`projects/${index}.md`));

  const result = await generatePolishEntries(context(candidates), {
    protocol: 'openai',
    base_url: `${provider.baseUrl}/v1`,
    api_key: 'test-key',
    model: 'model-a',
  });

  assert.equal(result.length, 5);
  assert.deepEqual(batchSizes.sort((a, b) => b - a), [2, 2, 1]);
});

test('Provider 超时后只重试一次并返回完整结果', async (t) => {
  let attempts = 0;
  const provider = await listen(async (request, response) => {
    attempts += 1;
    const body = await readJson(request);
    const prompt = body.messages.find((message) => message.role === 'user').content;
    const requestContext = JSON.parse(prompt.split('\n').at(-1));
    if (attempts === 1) await new Promise((resolve) => setTimeout(resolve, 150));
    if (response.destroyed) return;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(openAiResponse(requestContext)));
  });
  t.after(provider.close);

  const result = await generateWithProvider(context(), {
    protocol: 'openai',
    base_url: `${provider.baseUrl}/v1`,
    api_key: 'test-key',
    model: 'model-a',
    timeout_ms: 100,
  });

  assert.equal(attempts, 2);
  assert.equal(result.entries.length, 1);
});
