import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { writeAtomicFile } from './atomic_file.mjs';
import { providerDestination } from './resume_polish_provider.mjs';

const DEFAULT_PROVIDER = Object.freeze({
  protocol: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model: '',
  timeout_ms: 60000,
});

function normalizeProvider(value) {
  const { protocol, baseUrl } = providerDestination(value);
  const timeout = Number(value.timeout_ms);
  return {
    protocol,
    base_url: baseUrl,
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

function configError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function withScopedKey(input, existing) {
  const provider = normalizeProvider({ ...existing, ...input, api_key: input.api_key });
  if (!provider.api_key && existing?.protocol === provider.protocol && existing.base_url === provider.base_url) {
    provider.api_key = existing.api_key;
  }
  if (!provider.api_key) throw configError('请为当前协议和 Base URL 配置 API Key');
  return provider;
}

export function createResumePolishProviderStore({ filePath, fallbackProvider = null }) {
  const readStored = async () => {
    let contents;
    try {
      contents = await readFile(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw Object.assign(new Error('本地 AI Provider 配置无法读取'), {
        statusCode: 500,
        code: 'PROVIDER_CONFIG_READ_FAILED',
      });
    }
    try {
      const provider = normalizeProvider(JSON.parse(contents));
      if (!provider.api_key || !provider.model) throw new Error();
      return provider;
    } catch {
      throw Object.assign(configError('本地 AI Provider 配置无效，请重新保存配置'), {
        code: 'PROVIDER_CONFIG_INVALID',
      });
    }
  };
  const resolveExisting = async () => await readStored()
    || (fallbackProvider ? normalizeProvider(fallbackProvider) : null);

  return {
    async getPublic() {
      try {
        return publicProvider(await resolveExisting() || DEFAULT_PROVIDER);
      } catch (error) {
        // A broken optional provider must not prevent the editor from opening.
        return { ...publicProvider(DEFAULT_PROVIDER), configuration_error: error.message };
      }
    },

    async resolve(requestProvider) {
      if (!requestProvider) return resolveExisting();
      if (String(requestProvider.api_key || '').trim()) return withScopedKey(requestProvider, null);
      return withScopedKey(requestProvider, await resolveExisting());
    },

    async save(input = {}) {
      const existing = await readStored().catch((error) => {
        if (error.code !== 'PROVIDER_CONFIG_INVALID') throw error;
        return null;
      });
      const provider = withScopedKey(input, existing);
      if (!provider.model) throw configError('请填写模型名称');
      try {
        await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
        await writeAtomicFile(filePath, `${JSON.stringify(provider, null, 2)}\n`);
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
