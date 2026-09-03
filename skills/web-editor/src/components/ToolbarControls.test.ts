import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

async function renderComponent(path: string, props: Record<string, unknown>): Promise<string> {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  try {
    const module = await server.ssrLoadModule(path);
    return renderToStaticMarkup(createElement(module.default, props));
  } finally {
    await server.close();
  }
}

test('AI 润色关闭态不重复显示原文，并使用统一设置图标', async () => {
  const html = await renderComponent('/src/components/PolishControls.tsx', {
    enabled: false,
    hasEntries: false,
    generating: false,
    selectedFieldCount: 3,
    providerConfigured: true,
    settingsOpen: false,
    onChange: () => undefined,
    onOpenSettings: () => undefined,
  });

  assert.match(html, />润色/);
  assert.match(html, /aria-label="AI 润色"/);
  assert.doesNotMatch(html, /显示原文/);
  assert.match(html, /aria-label="配置 AI 润色模型"/);
  assert.match(html, /<svg/);
});

test('隐私设置默认收起，仅显示启用数量摘要', async () => {
  const html = await renderComponent('/src/components/PrivacyControls.tsx', {
    config: { mask_phone: true, mask_email: true },
    open: false,
    onChange: () => undefined,
    onOpenChange: () => undefined,
  });

  assert.match(html, />隐私</);
  assert.match(html, />2\/6</);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /隐私预览设置/);
});

test('AI 模型配置允许用户调整请求超时秒数', async () => {
  const html = await renderComponent('/src/components/PolishProviderSettings.tsx', {
    provider: {
      protocol: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model: '',
      timeout_ms: 60000,
    },
    selectedFields: ['description', 'responsibilities', 'content'],
    open: true,
    models: [],
    loadingModels: false,
    error: '',
    onClose: () => undefined,
    onSave: () => undefined,
    onFetchModels: () => undefined,
  });

  assert.match(html, /请求超时/);
  assert.match(html, /aria-label="请求超时秒数"/);
  assert.match(html, /value="60"/);
});

test('AI 模型配置允许选择项目描述、个人优势和岗位职责', async () => {
  const html = await renderComponent('/src/components/PolishProviderSettings.tsx', {
    provider: {
      protocol: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model: '',
      timeout_ms: 60000,
    },
    selectedFields: ['description', 'content'],
    open: true,
    models: [],
    loadingModels: false,
    error: '',
    onClose: () => undefined,
    onSave: () => undefined,
    onFetchModels: () => undefined,
  });

  assert.match(html, /润色内容/);
  assert.match(html, /项目描述/);
  assert.match(html, /个人优势/);
  assert.match(html, /岗位职责/);
  assert.equal(html.match(/type="checkbox"/g)?.length, 3);
});

test('AI 模型配置提供显式协议选择', async () => {
  const html = await renderComponent('/src/components/PolishProviderSettings.tsx', {
    provider: {
      protocol: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model: '',
      timeout_ms: 60000,
    },
    selectedFields: ['description'],
    open: true,
    models: [],
    loadingModels: false,
    error: '',
    onClose: () => undefined,
    onSave: () => undefined,
    onFetchModels: () => undefined,
  });

  assert.match(html, /AI 润色协议/);
  assert.match(html, /OpenAI-compatible/);
  assert.match(html, /Anthropic Messages/);
});
