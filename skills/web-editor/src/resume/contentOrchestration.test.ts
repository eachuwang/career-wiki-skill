import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumeConfig, WikiEntity } from '../types/index.ts';
import { createResumeEditingSession } from './editingSession.ts';
import { createResumeContentOrchestration } from './contentOrchestration.ts';

function resume(overrides: Partial<ResumeConfig> = {}): ResumeConfig {
  return {
    id: 'ai-engineer',
    name: 'AI 工程师简历',
    template: 'tech-minimal',
    created: '2026-08-01',
    updated: '2026-08-01',
    modules: ['project', 'experience'],
    privacy: { mask_phone: true },
    hide: [],
    polish: { enabled: false, entries: {} },
    content_overrides: {},
    ...overrides,
  };
}

const wikiEntities: WikiEntity[] = [
  {
    path: 'projects/mail.md',
    entity: 'project',
    title: '邮件路由项目',
    trustTier: 'human-reviewed',
    sources: [],
    fields: { description: '原始项目描述', responsibilities: '原始职责' },
    relations: [],
    links: [],
  },
  {
    path: 'experiences/acme.md',
    entity: 'experience',
    title: '示例公司',
    trustTier: 'human-reviewed',
    sources: [],
    fields: { responsibilities: '原始工作职责' },
    relations: [],
    links: [],
  },
];

function createOrchestration(configs: ResumeConfig[] = [resume()]) {
  const saved: ResumeConfig[] = [];
  const session = createResumeEditingSession({
    resumes: configs,
    saveResume: async (config) => {
      saved.push(structuredClone(config));
    },
  });
  const orchestration = createResumeContentOrchestration({
    session,
    wikiEntities,
  });
  return { orchestration, session, saved };
}

test('选择模块保存当前简历视角，并保留已存在模块的编辑状态', async () => {
  const initial = resume({
    content_overrides: {
      'projects/mail.md': { description: '当前简历版本' },
    },
    hide: [{ module: 'project', items: ['projects/mail.md'] }],
  });
  const { orchestration, session, saved } = createOrchestration([initial]);

  const result = await orchestration.selectModules(['project', 'education']);

  assert.deepEqual(result, { status: 'saved', message: '编排已更新' });
  assert.deepEqual(orchestration.getSnapshot().modules.map((module) => module.type), [
    'project',
    'education',
  ]);
  assert.deepEqual(orchestration.getSnapshot().modules[0].overrides, {
    'projects/mail.md': { description: '当前简历版本' },
  });
  assert.deepEqual(orchestration.getSnapshot().modules[0].hiddenItemIds, ['projects/mail.md']);
  assert.deepEqual(session.getSnapshot().draft?.modules, ['project', 'education']);
  assert.equal(saved.length, 1);
});

test('重复应用相同模块选择不产生保存副作用', async () => {
  const { orchestration, session, saved } = createOrchestration();

  const result = await orchestration.selectModules(['project', 'experience']);

  assert.deepEqual(result, { status: 'unchanged', message: '编排没有变化' });
  assert.deepEqual(session.getSnapshot().draft?.modules, ['project', 'experience']);
  assert.equal(saved.length, 0);
});

test('模块选择保存失败时保留草稿并返回失败结果', async () => {
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async () => {
      throw new Error('数据目录不可写');
    },
  });
  const orchestration = createResumeContentOrchestration({ session, wikiEntities });

  const result = await orchestration.selectModules(['project', 'education']);

  assert.deepEqual(result, { status: 'failed', error: '数据目录不可写' });
  assert.deepEqual(session.getSnapshot().draft?.modules, ['project', 'education']);
  assert.equal(session.getSnapshot().saveStatus, 'failed');
});

test('上下移动与拖拽移动共享同一套模块顺序规则', async () => {
  const { orchestration, session } = createOrchestration();

  await orchestration.moveModule('module-experience', 'up');
  assert.deepEqual(session.getSnapshot().draft?.modules, ['experience', 'project']);

  await orchestration.moveModuleBefore('module-experience', 'module-project');
  assert.deepEqual(session.getSnapshot().draft?.modules, ['project', 'experience']);

  await orchestration.moveModule('module-project', 'up');
  assert.deepEqual(session.getSnapshot().draft?.modules, ['project', 'experience']);
});

test('字段覆盖与子项隐藏通过编排工作流写入编辑会话', async () => {
  const { orchestration, session } = createOrchestration();

  const override = await orchestration.overrideField(
    'module-project',
    'projects/mail.md',
    'description',
    '当前简历项目描述',
  );
  const hidden = await orchestration.toggleItemVisibility('module-project', 'projects/mail.md');

  assert.deepEqual(override, { status: 'updated' });
  assert.deepEqual(hidden, { status: 'updated' });
  assert.deepEqual(session.getSnapshot().draft?.content_overrides, {
    'projects/mail.md': { description: '当前简历项目描述' },
  });
  assert.deepEqual(session.getSnapshot().draft?.hide, [
    { module: 'project', items: ['projects/mail.md'] },
  ]);

  await orchestration.overrideField(
    'module-project',
    'projects/mail.md',
    'description',
    '原始项目描述',
  );
  assert.deepEqual(session.getSnapshot().draft?.content_overrides, {});
});

test('展开状态只属于编排工作流，切换简历时不会泄漏到下一份简历', async () => {
  const { orchestration, session } = createOrchestration([
    resume(),
    resume({ id: 'product', name: '产品简历', modules: ['education'] }),
  ]);

  orchestration.toggleExpanded('module-project');
  assert.equal(orchestration.getSnapshot().modules[0].expanded, true);

  const switched = await session.dispatch({
    type: 'switch-resume',
    resumeId: 'product',
    discardDirty: true,
  });
  assert.deepEqual(switched, { status: 'switched' });
  assert.deepEqual(orchestration.getSnapshot().modules.map((module) => module.type), ['education']);
  assert.equal(orchestration.getSnapshot().modules[0].expanded, false);
});

test('删除模块保存新编排，删除不存在的模块不产生副作用', async () => {
  const { orchestration, session, saved } = createOrchestration();

  const removed = await orchestration.removeModule('module-project');
  const unchanged = await orchestration.removeModule('module-missing');

  assert.deepEqual(removed, { status: 'saved', message: '已删除并保存' });
  assert.deepEqual(unchanged, { status: 'updated' });
  assert.deepEqual(session.getSnapshot().draft?.modules, ['experience']);
  assert.equal(saved.length, 1);
});
