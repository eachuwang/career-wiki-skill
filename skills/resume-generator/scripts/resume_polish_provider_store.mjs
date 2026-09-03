import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PROVIDER = Object.freeze({
  protocol: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model: '',
  timeout_ms: 60000,
});

function normalizeProvider(value = {}) {
  const timeout = Number(value.timeout_ms);
  return {
    protocol: value.protocol === 'anthropic' ? 'anthropic' : 'openai',
    base_url: String(value.base_url || DEFAULT_PROVIDER.base_url).trim(),
    api_key: String(value.api_key || '').trim(),
    model: String(value.model || '').trim(),
    timeout_ms: Number.isFinite(timeout)
      ? Math.min(180000, Math.max(10000, timeout))
      : DEFAULT_PROVIDER.timeout_ms,
  };
}

function publicProvider(provider) {
  return {
    ...provider,
    api_key: '',
    api_key_configured: Boolean(provider.api_key),
  };
}

function validateProvider(provider) {
  if (!/^https?:\/\//i.test(provider.base_url)) {
    throw Object.assign(new Error('请配置有效的 Base URL'), { statusCode: 400 });
  }
  if (!provider.api_key) {
    throw Object.assign(new Error('请配置 API Key'), { statusCode: 400 });
  }
  if (!provider.model) {
    throw Object.assign(new Error('请填写模型名称'), { statusCode: 400 });
  }
}

export function createResumePolishProviderStore({ filePath, fallbackProvider = null }) {
  const readStored = async () => {
    try {
      return normalizeProvider(JSON.parse(await readFile(filePath, 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw Object.assign(new Error('本地 AI Provider 配置无法读取'), {
        statusCode: 500,
        code: 'PROVIDER_CONFIG_READ_FAILED',
      });
    }
  };

  return {
    async getPublic() {
      const provider = await readStored() || normalizeProvider(fallbackProvider || {});
      return publicProvider(provider);
    },

    async resolve(requestProvider) {
      if (requestProvider?.api_key) return normalizeProvider(requestProvider);
      return await readStored()
        || (fallbackProvider ? normalizeProvider(fallbackProvider) : null);
    },

    async save(input = {}) {
      const existing = await readStored();
      const provider = normalizeProvider({
        ...existing,
        ...input,
        api_key: String(input.api_key || '').trim() || existing?.api_key || '',
      });
      validateProvider(provider);
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      try {
        await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
        await writeFile(temporaryPath, `${JSON.stringify(provider, null, 2)}\n`, { mode: 0o600 });
        await rename(temporaryPath, filePath);
        await chmod(filePath, 0o600);
      } catch {
        throw Object.assign(new Error('本地 AI Provider 配置保存失败'), {
          statusCode: 500,
          code: 'PROVIDER_CONFIG_WRITE_FAILED',
        });
      }
      return publicProvider(provider);
    },
  };
}
