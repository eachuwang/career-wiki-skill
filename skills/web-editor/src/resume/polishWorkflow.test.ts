import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumeConfig, ResumePolishProviderConfig } from '../types';
import { createResumeEditingSession } from './editingSession.ts';
import {
  createResumePolishWorkflow,
  type ResumePolishProviderStorage,
} from './polishWorkflow.ts';

const provider: ResumePolishProviderConfig = {
  protocol: 'openai',
  base_url: 'https://example.com/v1',
  api_key: 'test-key',
  model: 'test-model',
  timeout_ms: 60000,
};

function resume(overrides: Partial<ResumeConfig> = {}): ResumeConfig {
  return {
    id: 'ai-engineer',
    name: 'AI 工程师简历',
    template: 'tech-minimal',
    created: '2026-08-01',
    updated: '2026-08-01',
    modules: ['project'],
    privacy: { mask_phone: true },
    hide: [],
    polish: { enabled: false, selected_fields: ['description'], entries: {} },
    content_overrides: {},
    ...overrides,
  };
}

function memoryStorage(initial: unknown = null): ResumePolishProviderStorage & { value: unknown } {
  return {
    value: initial,
    load() {
      return this.value;
    },
    save(next) {
      this.value = structuredClone(next);
    },
  };
}

function createWorkflow(options: {
  initialProvider?: unknown;
} = {}) {
  const saved: ResumeConfig[] = [];
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async (config) => {
      saved.push(structuredClone(config));
    },
    polishResume: async (config, _provider, options) => ({
      config: { ...config, polish: { ...(config.polish || {}), enabled: true } },
      generated_count: options?.only ? 1 : 2,
      candidate_count: options?.only ? 1 : 2,
    }),
  });
  const storage = memoryStorage(options.initialProvider);
  const workflow = createResumePolishWorkflow({
    session,
    storage,
    modelClient: {
      getModels: async () => ['model-a', 'model-b'],
    },
  });
  return { workflow, session, storage, saved };
}

test('未配置 provider 时开启润色只返回配置意图，不触发生成', async () => {
  let generated = false;
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async () => {},
    polishResume: async () => {
      generated = true;
      return { config: resume(), generated_count: 1, candidate_count: 1 };
    },
  });
  const workflow = createResumePolishWorkflow({
    session,
    storage: memoryStorage(),
    modelClient: { getModels: async () => [] },
  });

  const result = await workflow.toggle(true);

  assert.deepEqual(result, {
    status: 'needs-config',
    error: '请先选择协议并配置 Base URL、API Key 和模型',
  });
  assert.equal(generated, false);
  assert.equal(workflow.getSnapshot().error, result.error);
});

test('保存 provider 同时保存当前简历字段选择，并使用 storage adapter 持久化连接设置', async () => {
  const { workflow, session, storage, saved } = createWorkflow();

  const result = await workflow.saveProvider(provider, ['content']);

  assert.deepEqual(result, {
    status: 'success',
    message: 'AI 润色模型和内容选择已保存',
  });
  assert.deepEqual(storage.value, provider);
  assert.deepEqual(workflow.getSnapshot().provider, provider);
  assert.deepEqual(session.getSnapshot().draft?.polish?.selected_fields, ['content']);
  assert.equal(saved.length, 1);
});

test('批量润色通过 editingSession 生成并保存，工作流只暴露结果摘要', async () => {
  const { workflow, session } = createWorkflow({ initialProvider: provider });

  const result = await workflow.toggle(true);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.generatedCount, 2);
  assert.equal(session.getSnapshot().draft?.polish?.enabled, true);
  assert.equal(session.getSnapshot().saveStatus, 'saved');
  assert.equal(workflow.getSnapshot().generating, false);
});

test('模型列表查询只更新工作流 snapshot，不污染简历草稿', async () => {
  const { workflow, session } = createWorkflow({ initialProvider: provider });

  const result = await workflow.fetchModels(provider);

  assert.deepEqual(result, { status: 'success', message: '已拉取 2 个模型' });
  assert.deepEqual(workflow.getSnapshot().models, ['model-a', 'model-b']);
  assert.equal(session.getSnapshot().saveStatus, 'clean');
});

test('单条重新生成暴露稳定的 generating key，并将结果交给 editingSession 保存', async () => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const saved: ResumeConfig[] = [];
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async (config) => saved.push(structuredClone(config)),
    polishResume: async (config, _provider, options) => {
      await pending;
      assert.deepEqual(options?.only, { path: 'projects/mail.md', field: 'description' });
      return {
        config: {
          ...config,
          polish: {
            ...(config.polish || {}),
            enabled: true,
            entries: {
              'projects/mail.md': {
                source_hash: 'abc',
                fields: { description: '新版本项目描述' },
              },
            },
          },
        },
        generated_count: 1,
        candidate_count: 1,
      };
    },
  });
  const workflow = createResumePolishWorkflow({
    session,
    storage: memoryStorage(provider),
    modelClient: { getModels: async () => [] },
  });

  const regenerating = workflow.regenerate('projects/mail.md', 'description');
  await Promise.resolve();
  assert.equal(workflow.getSnapshot().generatingKey, 'projects/mail.md:description');
  release?.();

  const result = await regenerating;
  assert.deepEqual(result, {
    status: 'success',
    message: '已换一版润色内容',
    generatedCount: 1,
    candidateCount: 1,
  });
  assert.equal(saved.length, 1);
  assert.equal(workflow.getSnapshot().generating, false);
});
