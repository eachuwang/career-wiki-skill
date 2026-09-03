import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createResumePolishProviderStore } from '../scripts/resume_polish_provider_store.mjs';

test('本地 Provider Store 持久化密钥但公开读取永不返回明文', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'career-wiki-provider-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'polish-provider.json');
  const store = createResumePolishProviderStore({ filePath });

  const publicConfig = await store.save({
    protocol: 'openai',
    base_url: 'https://example.com/v1',
    api_key: 'secret-key',
    model: 'model-a',
    timeout_ms: 60000,
  });

  assert.deepEqual(publicConfig, {
    protocol: 'openai',
    base_url: 'https://example.com/v1',
    api_key: '',
    api_key_configured: true,
    model: 'model-a',
    timeout_ms: 60000,
  });
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);

  const reloaded = createResumePolishProviderStore({ filePath });
  assert.deepEqual(await reloaded.getPublic(), publicConfig);
  assert.deepEqual(await reloaded.resolve(), {
    protocol: 'openai',
    base_url: 'https://example.com/v1',
    api_key: 'secret-key',
    model: 'model-a',
    timeout_ms: 60000,
  });

  await reloaded.save({ ...publicConfig, api_key: '', model: 'model-b' });
  assert.equal((await reloaded.resolve()).api_key, 'secret-key');
  assert.equal((await reloaded.resolve()).model, 'model-b');
});
