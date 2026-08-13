import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumeConfig, TemplateConfig, WikiEntity } from '../types/index.ts';
import { buildPolishSourceHash } from './polish.ts';
import { projectResume } from './projection.ts';

function entity(
  path: string,
  entityType: WikiEntity['entity'],
  fields: Record<string, unknown>,
): WikiEntity {
  return {
    path,
    entity: entityType,
    title: String(fields.name || fields.company || ''),
    trustTier: 'unverified',
    sources: [],
    relations: [],
    links: [],
    fields,
  };
}

function config(overrides: Partial<ResumeConfig> = {}): ResumeConfig {
  return {
    id: 'ai-resume',
    name: 'AI 工程师简历',
    template: 'technical',
    created: '2026-08-13',
    updated: '2026-08-13',
    modules: ['project'],
    ...overrides,
  };
}

const template: TemplateConfig = {
  id: 'technical',
  name: '技术模板',
  style: 'technical.css',
  layout: 'single-column',
  sections: [{
    module: 'project',
    title: '重点项目',
    fields: ['name', 'role', 'start', 'end', 'description'],
  }],
};

test('简历投影按配置选择模块、模板字段和时间顺序生成 ResumeView', () => {
  const wiki = [
    entity('persons/wang.md', 'person', { name: '王二' }),
    entity('projects/older.md', 'project', {
      name: '旧项目',
      role: '开发工程师',
      start: '2023-01',
      end: '2023-06',
      description: '旧项目描述',
      internal_note: '不应进入简历',
    }),
    entity('projects/newer.md', 'project', {
      name: '新项目',
      role: 'AI 工程师',
      start: '2025-01',
      end: 'present',
      description: '新项目描述',
    }),
  ];

  const view = projectResume({ wiki, config: config(), template });

  assert.equal(view.person, null);
  assert.deepEqual(view.sections.map((section) => section.module), ['project']);
  assert.equal(view.sections[0].title, '重点项目');
  assert.deepEqual(view.sections[0].fields, [
    'name',
    'role',
    'start',
    'end',
    'description',
    'responsibilities',
    'tech_stack',
  ]);
  assert.deepEqual(view.sections[0].items?.map((item) => item.path), [
    'projects/newer.md',
    'projects/older.md',
  ]);
  assert.deepEqual(view.sections[0].items?.[1].fields, {
    name: '旧项目',
    role: '开发工程师',
    start: '2023-01',
    end: '2023-06',
    description: '旧项目描述',
  });
  assert.equal(view.meta.entity_count, 2);
});

test('简历投影按固定顺序处理润色、覆盖、隐藏、强调、隐私和分组', () => {
  const emphasizedProject = entity('projects/emphasized.md', 'project', {
    name: '重点项目',
    company: '远航科技',
    role: 'AI 工程师',
    start: '2023-01',
    end: '2023-12',
    description: '重点项目原文',
    salary: '30k',
    category: 'AI',
    internal_note: '不可公开',
  });
  const polishedProject = entity('projects/polished.md', 'project', {
    name: '近期项目',
    company: '星辰科技',
    role: '开发工程师',
    start: '2025-01',
    end: 'present',
    description: '近期项目原文',
    salary: '25k',
    category: 'AI',
    internal_note: '不可公开',
  });
  const hiddenProject = entity('projects/hidden.md', 'project', {
    name: '隐藏项目',
    start: '2026-01',
    description: '不应出现',
    category: 'AI',
  });
  const view = projectResume({
    wiki: [
      entity('persons/wang.md', 'person', {
        name: '王小明',
        phone: '13800138000',
        email: 'wang@example.com',
        github: 'github.com/wang',
        current_title: 'AI 工程师',
      }),
      emphasizedProject,
      polishedProject,
      hiddenProject,
    ],
    config: config({
      modules: ['person', 'project'],
      emphasize: [{ module: 'project', items: ['重点项目'] }],
      hide: [
        { module: 'project', items: ['projects/hidden.md'] },
        { module: 'project', fields: ['internal_note'] },
      ],
      privacy: {
        mask_name: true,
        mask_phone: true,
        mask_email: true,
        mask_company: true,
        mask_salary: true,
        mask_github: true,
      },
      polish: {
        enabled: true,
        selected_fields: ['description'],
        entries: {
          'projects/emphasized.md': {
            source_hash: buildPolishSourceHash(emphasizedProject.fields),
            fields: { description: '重点项目润色文案' },
          },
          'projects/polished.md': {
            source_hash: buildPolishSourceHash(polishedProject.fields),
            fields: { description: '近期项目润色文案' },
          },
        },
      },
      content_overrides: {
        'projects/emphasized.md': { description: '用户最终覆盖文案' },
      },
    }),
    template: {
      ...template,
      sections: [{
        module: 'project',
        title: '重点项目',
        fields: [
          'name', 'company', 'role', 'start', 'end', 'description',
          'salary', 'category', 'internal_note',
        ],
        group_by: 'category',
      }],
    },
  });

  assert.deepEqual(view.person?.fields, {
    name: '王**',
    phone: '138****8000',
    email: 'w***@example.com',
    github: '[GitHub已隐藏]',
    current_title: 'AI 工程师',
  });
  assert.equal(view.sections[0].grouped, true);
  assert.equal(view.sections[0].groupBy, 'category');
  assert.deepEqual(view.sections[0].groups?.map((group) => group.key), ['AI']);
  assert.deepEqual(view.sections[0].groups?.[0].items.map((item) => item.path), [
    'projects/emphasized.md',
    'projects/polished.md',
  ]);
  assert.deepEqual(view.sections[0].groups?.[0].items[0].fields, {
    name: '重***',
    company: '[公司已隐藏]',
    role: 'AI 工程师',
    start: '2023-01',
    end: '2023-12',
    description: '用户最终覆盖文案',
    salary: '[薪资已隐藏]',
    category: 'AI',
  });
  assert.equal(
    view.sections[0].groups?.[0].items[1].fields.description,
    '近期项目润色文案',
  );
  assert.equal(view.meta.entity_count, 2);
});

test('字段隐藏先于排序，隐藏排序字段后保持 Wiki 原始顺序', () => {
  const view = projectResume({
    wiki: [
      entity('projects/older.md', 'project', { name: '先采集项目', start: '2022-01' }),
      entity('projects/newer.md', 'project', { name: '后采集项目', start: '2025-01' }),
    ],
    config: config({
      hide: [{ module: 'project', fields: ['start'] }],
    }),
    template,
  });

  assert.deepEqual(view.sections[0].items?.map((item) => item.path), [
    'projects/older.md',
    'projects/newer.md',
  ]);
  assert.equal(Object.hasOwn(view.sections[0].items?.[0].fields || {}, 'start'), false);
});

test('模板未声明已选模块时使用领域兜底字段保留该模块', () => {
  const view = projectResume({
    wiki: [
      entity('projects/mail.md', 'project', {
        name: '邮件路由',
        role: 'AI 工程师',
        description: '识别邮件意图并完成路由。',
      }),
    ],
    config: config({ modules: ['project'] }),
    template: {
      ...template,
      sections: [{ module: 'experience', title: '工作经历', fields: ['company', 'role'] }],
    },
  });

  assert.equal(view.sections[0].module, 'project');
  assert.equal(view.sections[0].title, '项目经验');
  assert.equal(view.sections[0].items?.[0].fields.description, '识别邮件意图并完成路由。');
});
