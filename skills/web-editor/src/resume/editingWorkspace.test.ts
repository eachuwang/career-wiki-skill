import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ResumeConfig,
  ResumePolishProviderConfig,
  TemplateConfig,
  WikiEntity,
} from '../types/index.ts';
import type { ResumePolishProviderStorage } from './polishWorkflow.ts';
import { createResumeEditingWorkspace } from './editingWorkspace.ts';
import { buildPolishSourceHash } from './polish.ts';

const provider: ResumePolishProviderConfig = {
  protocol: 'openai',
  base_url: 'https://example.com/v1',
  api_key: 'key',
  model: 'model-a',
  timeout_ms: 60000,
};

const templates: TemplateConfig[] = [
  {
    id: 'minimal',
    name: '极简',
    style: 'minimal.css',
    layout: 'single-column',
    sections: [{ module: 'project', title: '项目', fields: ['description'] }],
  },
  {
    id: 'business',
    name: '商务',
    style: 'business.css',
    layout: 'single-column',
    sections: [{ module: 'project', title: '项目', fields: ['description'] }],
  },
];

const wikiEntities: WikiEntity[] = [{
  path: 'projects/mail.md',
  entity: 'project',
  title: '邮件项目',
  trustTier: 'human-reviewed',
  sources: [],
  fields: { description: '原始描述' },
  relations: [],
  links: [],
}];

function resume(overrides: Partial<ResumeConfig> = {}): ResumeConfig {
  return {
    id: 'ai-engineer',
    name: 'AI 工程师简历',
    template: 'minimal',
    created: '2026-08-01',
    updated: '2026-08-01',
    modules: ['project'],
    privacy: { mask_phone: true },
    polish: { enabled: false, selected_fields: ['description'], entries: {} },
    hide: [],
    content_overrides: {},
    ...overrides,
  };
}

function memoryStorage(value: unknown = provider): ResumePolishProviderStorage {
  return {
    load: () => value,
    save: () => {},
  };
}

function createWorkspace(options: {
  configs?: ResumeConfig[];
  confirms?: boolean[];
  scheduledFeedback?: Array<{ callback: () => void; delay: number }>;
} = {}) {
  const saved: ResumeConfig[] = [];
  const deletedResumes: string[] = [];
  const deletedTemplates: string[] = [];
  const confirmations: string[] = [];
  let templateList = structuredClone(templates);
  const confirmAnswers = [...(options.confirms || [])];
  const workspace = createResumeEditingWorkspace({
    resumes: options.configs || [resume(), resume({ id: 'product', name: '产品简历' })],
    templates: templateList,
    wikiEntities,
    saveResume: async (config) => saved.push(structuredClone(config)),
    deleteResume: async (id) => { deletedResumes.push(id); },
    polishResume: async (config) => ({
      config: {
        ...config,
        polish: {
          ...(config.polish || {}),
          enabled: true,
          entries: {
            'projects/mail.md': {
              source_hash: buildPolishSourceHash(wikiEntities[0].fields),
              fields: { description: '润色描述' },
            },
          },
        },
      },
      generated_count: 1,
      candidate_count: 1,
    }),
    modelClient: { getModels: async () => ['model-a'] },
    templateRepository: {
      list: async () => structuredClone(templateList),
      getCss: async () => '.resume {}',
      save: async (config) => {
        templateList = [...templateList.filter((item) => item.id !== config.id), config];
      },
      delete: async (id) => {
        deletedTemplates.push(id);
        templateList = templateList.filter((item) => item.id !== id);
      },
    },
    confirmation: {
      confirm: async (message) => {
        confirmations.push(message);
        return confirmAnswers.shift() ?? true;
      },
    },
    polishProviderStorage: memoryStorage(),
    now: () => new Date('2026-08-13T00:00:00.000Z'),
    ...(options.scheduledFeedback ? {
      feedbackScheduler: {
        setTimeout(callback, delay) {
          options.scheduledFeedback?.push({ callback, delay });
          return callback;
        },
        clearTimeout() {},
      },
    } : {}),
  });
  return { workspace, saved, deletedResumes, deletedTemplates, confirmations };
}

test('工作区统一投影编辑、预览、模板和润色状态', async () => {
  const { workspace } = createWorkspace();

  await workspace.dispatch({ type: 'change-name', name: '资深 AI 工程师' });
  await workspace.dispatch({ type: 'select-template', templateId: 'business' });
  await workspace.dispatch({ type: 'change-privacy', privacy: { mask_name: true } });

  const snapshot = workspace.getSnapshot();
  assert.equal(snapshot.resumeName, '资深 AI 工程师');
  assert.equal(snapshot.currentTemplate?.id, 'business');
  assert.deepEqual(snapshot.privacy, { mask_name: true });
  assert.equal(snapshot.resumeView?.resume.name, '资深 AI 工程师');
  assert.equal(snapshot.polishProviderConfigured, true);
});

test('所有临时叠层互斥，关闭动作清空当前叠层', async () => {
  const { workspace } = createWorkspace();

  await workspace.dispatch({ type: 'toggle-overlay', overlay: 'privacy' });
  assert.equal(workspace.getSnapshot().activeOverlay, 'privacy');
  await workspace.dispatch({ type: 'open-polish-settings' });
  assert.equal(workspace.getSnapshot().activeOverlay, 'polish');
  await workspace.dispatch({ type: 'toggle-overlay', overlay: 'export' });
  assert.equal(workspace.getSnapshot().activeOverlay, 'export');
  await workspace.dispatch({ type: 'close-overlay' });
  assert.equal(workspace.getSnapshot().activeOverlay, null);
});

test('脏草稿切换由工作区统一确认，取消时不改变当前简历', async () => {
  const { workspace, confirmations } = createWorkspace({ confirms: [false] });
  await workspace.dispatch({ type: 'change-name', name: '未保存名称' });

  const result = await workspace.dispatch({ type: 'select-resume', resumeId: 'product' });

  assert.deepEqual(result, { status: 'cancelled' });
  assert.equal(workspace.getSnapshot().currentResumeId, 'ai-engineer');
  assert.equal(confirmations.length, 1);
});

test('内容编排结果和保存结果使用同一反馈通道', async () => {
  const { workspace, saved } = createWorkspace();

  await workspace.dispatch({ type: 'select-modules', moduleTypes: ['project', 'education'] });
  assert.deepEqual(workspace.getSnapshot().draft?.modules, ['project', 'education']);
  assert.deepEqual(workspace.getSnapshot().feedback, { message: '编排已更新', tone: 'success' });

  await workspace.dispatch({ type: 'save', successMessage: '简历已保存' });
  assert.deepEqual(workspace.getSnapshot().feedback, { message: '简历已保存', tone: 'success' });
  assert.equal(saved.length, 2);
});

test('反馈生命周期由工作区统一管理，成功与失败使用不同显示时长', async () => {
  const scheduledFeedback: Array<{ callback: () => void; delay: number }> = [];
  const { workspace } = createWorkspace({ scheduledFeedback });

  await workspace.dispatch({ type: 'save' });
  assert.equal(scheduledFeedback[scheduledFeedback.length - 1]?.delay, 3000);
  scheduledFeedback[scheduledFeedback.length - 1]?.callback();
  assert.equal(workspace.getSnapshot().feedback, null);

  await workspace.dispatch({ type: 'select-resume', resumeId: 'missing' });
  assert.equal(scheduledFeedback[scheduledFeedback.length - 1]?.delay, 6000);
  assert.equal(workspace.getSnapshot().feedback?.tone, 'error');
});

test('模板复制和删除在工作区事务完成后同步模板投影', async () => {
  const { workspace, deletedTemplates } = createWorkspace();

  await workspace.dispatch({ type: 'duplicate-template' });
  assert.equal(workspace.getSnapshot().templateId, 'minimal-copy');
  assert.ok(workspace.getSnapshot().templates.some((item) => item.id === 'minimal-copy'));

  await workspace.dispatch({ type: 'delete-template' });
  assert.deepEqual(deletedTemplates, ['minimal-copy']);
  assert.equal(workspace.getSnapshot().templateId, 'minimal');
});

test('润色动作更新预览并通过工作区反馈成功结果', async () => {
  const { workspace } = createWorkspace();

  await workspace.dispatch({ type: 'toggle-polish', enabled: true });

  const snapshot = workspace.getSnapshot();
  assert.equal(snapshot.polishEnabled, true);
  assert.equal(snapshot.resumeWikiEntities[0].fields.description, '润色描述');
  assert.equal(snapshot.resumeView?.sections[0].items?.[0].fields.description, '润色描述');
  assert.equal(snapshot.feedback?.tone, 'success');
});
