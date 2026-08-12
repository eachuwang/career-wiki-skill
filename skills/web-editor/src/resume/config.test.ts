import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createResumeConfig,
  getHiddenItemIds,
  getModuleContentOverrides,
  updateContentOverride,
} from './config.ts';

test('保存配置时按模块持久化隐藏子项路径', () => {
  const config = createResumeConfig({
    resumeName: '后端工程师简历',
    resumeId: 'backend',
    templateId: 'tech-minimal',
    privacy: { mask_phone: true },
    modules: [
      {
        id: 'module-project',
        type: 'project',
        label: '项目经验',
        expanded: true,
        overrides: {},
        hiddenItemIds: ['projects/legacy-console.md'],
      },
      {
        id: 'module-experience',
        type: 'experience',
        label: '工作经历',
        expanded: false,
        overrides: {},
        hiddenItemIds: [],
      },
    ],
    today: '2026-08-05',
  });

  assert.deepEqual(config.hide, [
    { module: 'project', items: ['projects/legacy-console.md'] },
  ]);
  assert.deepEqual(config.modules, ['project', 'experience']);
});

test('重新打开简历时按模块恢复隐藏子项路径', () => {
  const hidden = getHiddenItemIds(
    [
      { module: 'project', items: ['projects/legacy-console.md'] },
      { module: 'project', fields: ['url'] },
    ],
    'project',
  );

  assert.deepEqual(hidden, ['projects/legacy-console.md']);
});

test('保存子项隐藏时保留原简历的字段隐藏与投递策略', () => {
  const baseConfig = {
    id: 'backend',
    name: '旧名称',
    template: 'tech-minimal',
    created: '2026-07-01',
    updated: '2026-07-02',
    target: { company: '示例公司', position: '后端工程师' },
    modules: ['project'] as const,
    emphasize: [{ module: 'project' as const, items: ['搜索平台'] }],
    hide: [{ module: 'person' as const, fields: ['phone'] }],
    privacy: { mask_phone: true },
    notes: '保留投递策略',
  };

  const config = createResumeConfig({
    resumeName: '新名称',
    resumeId: 'backend',
    templateId: 'tech-minimal',
    privacy: { mask_phone: true },
    modules: [
      {
        id: 'module-project',
        type: 'project',
        label: '项目经验',
        expanded: true,
        overrides: {},
        hiddenItemIds: ['projects/legacy-console.md'],
      },
    ],
    baseConfig,
    today: '2026-08-05',
  });

  assert.equal(config.created, '2026-07-01');
  assert.deepEqual(config.target, baseConfig.target);
  assert.deepEqual(config.emphasize, baseConfig.emphasize);
  assert.equal(config.notes, '保留投递策略');
  assert.deepEqual(config.hide, [
    { module: 'person', fields: ['phone'] },
    { module: 'project', items: ['projects/legacy-console.md'] },
  ]);
});

test('保存配置时持久化 AI 润色开关，同时保留润色结果', () => {
  const polish = {
    enabled: true,
    entries: {
      'projects/demo.md': {
        source_hash: '1234abcd',
        fields: { description: '润色后的描述' },
      },
    },
  };
  const config = createResumeConfig({
    resumeName: '产品简历',
    resumeId: 'product',
    templateId: 'tech-minimal',
    privacy: {},
    polish,
    modules: [],
  });

  assert.deepEqual(config.polish, polish);
});

test('保存配置时持久化内容编排中的条目字段覆盖', () => {
  const config = createResumeConfig({
    resumeName: 'AI 工程师简历',
    resumeId: 'ai-engineer',
    templateId: 'tech-minimal',
    privacy: {},
    modules: [
      {
        id: 'module-project',
        type: 'project',
        label: '项目经验',
        expanded: true,
        overrides: {
          'projects/data-agent.md': {
            description: '用户编辑后的项目描述。',
          },
        },
        hiddenItemIds: [],
      },
    ],
    today: '2026-08-12',
  });

  assert.deepEqual(config.content_overrides, {
    'projects/data-agent.md': {
      description: '用户编辑后的项目描述。',
    },
  });
});

test('重新打开简历时只恢复当前模块对应条目的字段覆盖', () => {
  const overrides = getModuleContentOverrides(
    {
      'projects/data-agent.md': { description: '用户编辑后的项目描述。' },
      'experiences/acme.md': { responsibilities: '用户编辑后的岗位职责。' },
    },
    'project',
    [
      { path: 'projects/data-agent.md', entity: 'project' },
      { path: 'experiences/acme.md', entity: 'experience' },
    ],
  );

  assert.deepEqual(overrides, {
    'projects/data-agent.md': { description: '用户编辑后的项目描述。' },
  });
});

test('字段恢复为当前继承值时移除冗余手动覆盖', () => {
  const overrides = updateContentOverride(
    {
      'projects/data-agent.md': {
        description: '用户临时编辑的描述。',
        responsibilities: '仍需保留的职责。',
      },
    },
    'projects/data-agent.md',
    'description',
    '当前 AI 润色结果。',
    '当前 AI 润色结果。',
  );

  assert.deepEqual(overrides, {
    'projects/data-agent.md': {
      responsibilities: '仍需保留的职责。',
    },
  });
});
