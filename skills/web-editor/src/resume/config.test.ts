import assert from 'node:assert/strict';
import test from 'node:test';
import { createResumeConfig, getHiddenItemIds } from './config.ts';

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
