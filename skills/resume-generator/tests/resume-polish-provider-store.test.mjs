import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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


test('密钥只被同一规范化 Base URL 和同一协议复用', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'career-wiki-provider-scope-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = {
    protocol: 'openai', base_url: 'https://example.invalid/api/v1',
    api_key: 'original-test-key', model: 'model-a',
  };
  const store = createResumePolishProviderStore({ filePath: join(directory, 'provider.json') });
  await store.save(original);
  const equivalent = await store.resolve({ base_url: 'https://EXAMPLE.invalid:443/api/', model: 'model-b' });
  assert.equal(equivalent.api_key, original.api_key);
  assert.equal(equivalent.base_url, original.base_url);
  assert.equal(equivalent.model, 'model-b');

  for (const change of [
    { base_url: 'https://other.invalid/api/v1' },
    { base_url: 'https://example.invalid/other/v1' },
    { base_url: 'https://example.invalid:4321/api/v1' },
    { protocol: 'anthropic' },
  ]) {
    await assert.rejects(store.resolve(change), { statusCode: 400 });
    await assert.rejects(store.save(change), { statusCode: 400 });
    assert.equal((await store.resolve()).api_key, original.api_key);
  }
  const changed = await store.resolve({ ...original, protocol: 'anthropic', api_key: 'new-key' });
  assert.equal(changed.api_key, 'new-key');
  assert.equal(changed.protocol, 'anthropic');

  const fallback = createResumePolishProviderStore({
    filePath: join(directory, 'missing.json'), fallbackProvider: original,
  });
  await assert.rejects(fallback.resolve({ protocol: 'anthropic' }), { statusCode: 400 });
  assert.equal((await fallback.resolve({ model: 'model-b' })).api_key, original.api_key);
});

test('无效 Provider 配置不阻止加载编辑器，并可用新配置修复', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'career-wiki-provider-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'provider.json');
  await writeFile(filePath, 'not JSON');
  const store = createResumePolishProviderStore({ filePath });
  const publicConfig = await store.getPublic();
  assert.equal(publicConfig.api_key_configured, false);
  assert.match(publicConfig.configuration_error, /配置无效/);
  await assert.rejects(store.resolve(), { code: 'PROVIDER_CONFIG_INVALID' });
  await store.save({ protocol: 'openai', base_url: 'https://example.invalid', api_key: 'test', model: 'model' });
  assert.equal((await store.getPublic()).api_key_configured, true);
});
