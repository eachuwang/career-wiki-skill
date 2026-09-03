import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumeConfig, ResumePolishProviderConfig } from '../types/index.ts';
import {
  getPolishProvider,
  polishResume,
  savePolishProvider,
} from './client.ts';

const provider: ResumePolishProviderConfig = {
  protocol: 'openai',
  base_url: 'https://example.com/v1',
  api_key: 'secret-key',
  model: 'model-a',
  timeout_ms: 60000,
};

const publicProvider: ResumePolishProviderConfig = {
  ...provider,
  api_key: '',
  api_key_configured: true,
};

const config: ResumeConfig = {
  id: 'ai-engineer',
  name: 'AI 工程师',
  template: 'minimal',
  created: '2026-09-02',
  updated: '2026-09-02',
  modules: ['summary'],
};

test('前端仅在保存本地 Provider 时提交 API Key', async (t) => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url, body });
    if (url.endsWith('/api/resume/polish-provider')) {
      return new Response(JSON.stringify(publicProvider), { status: 200 });
    }
    return new Response(JSON.stringify({
      config,
      generated_count: 1,
      candidate_count: 1,
    }), { status: 200 });
  };

  assert.deepEqual(await getPolishProvider(), publicProvider);
  assert.deepEqual(await savePolishProvider(provider), publicProvider);
  await polishResume(config, provider);

  assert.equal(requests[1].body.api_key, 'secret-key');
  assert.equal(JSON.stringify(requests[2].body).includes('secret-key'), false);
  assert.equal(Object.hasOwn(requests[2].body, 'provider'), false);
});
