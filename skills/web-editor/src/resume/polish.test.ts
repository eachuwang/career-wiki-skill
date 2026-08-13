import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumePolishConfig, WikiEntity } from '../types/index.ts';
import { applyPolishToEntities, buildPolishSourceHash } from './polish.ts';

const project: WikiEntity = {
  path: 'projects/data-agent.md',
  entity: 'project',
  title: '',
    trustTier: 'unverified',
  sources: [],
  relations: [],
  links: [],
  fields: {
    name: '数据智能体',
    role: '大模型应用工程师',
    description: '自动生成数据接入脚本。',
    responsibilities: '解析数据字典；生成 DDL 与 ETL 脚本。',
    tech_stack: 'Node.js、PostgreSQL、LangChain',
  },
};

test('前端只应用当前原文指纹匹配的项目润色', () => {
  const config: ResumePolishConfig = {
    entries: {
      [project.path]: {
        source_hash: buildPolishSourceHash(project.fields),
        fields: {
          description: '围绕数据接入自动化，完成脚本生成能力建设。',
        },
      },
    },
  };
  const polished = applyPolishToEntities([project], config)[0];

  assert.equal(polished.fields.description, '围绕数据接入自动化，完成脚本生成能力建设。');
  assert.equal(polished.fields.responsibilities, project.fields.responsibilities);
});

test('前端检测到原文变化后回退 Wiki 原文', () => {
  const config: ResumePolishConfig = {
    entries: {
      [project.path]: {
        source_hash: 'stale000',
        fields: { description: '旧润色结果' },
      },
    },
  };

  assert.deepEqual(applyPolishToEntities([project], config), [project]);
});

test('关闭 AI 润色时始终显示原始 Wiki 内容', () => {
  const config: ResumePolishConfig = {
    enabled: false,
    entries: {
      [project.path]: {
        source_hash: buildPolishSourceHash(project.fields),
        fields: { description: '不应显示的润色结果' },
      },
    },
  };

  assert.deepEqual(applyPolishToEntities([project], config), [project]);
});

test('只应用用户选择的润色字段，并支持个人优势内容', () => {
  const summary = {
    path: 'summaries/profile.md',
    entity: 'summary',
    title: '',
    trustTier: 'unverified',
    sources: [],
    relations: [],
    links: [],
    fields: { content: '擅长跨团队协作。' },
  } as WikiEntity;
  const project = {
    path: 'projects/demo.md',
    entity: 'project',
    title: '',
    trustTier: 'unverified',
    sources: [],
    relations: [],
    links: [],
    fields: {
      description: '建设数据平台。',
      responsibilities: '负责接口设计。',
    },
  } as WikiEntity;
  const config: ResumePolishConfig = {
    enabled: true,
    selected_fields: ['content', 'description'],
    entries: {
      [summary.path]: {
        source_hash: buildPolishSourceHash(summary.fields),
        fields: { content: '具备跨团队协作能力。' },
      },
      [project.path]: {
        source_hash: buildPolishSourceHash(project.fields),
        fields: {
          description: '围绕数据平台建设展开。',
          responsibilities: '不应显示的岗位职责润色。',
        },
      },
    },
  };

  const result = applyPolishToEntities([summary, project], config);
  assert.equal(result[0].fields.content, '具备跨团队协作能力。');
  assert.equal(result[1].fields.description, '围绕数据平台建设展开。');
  assert.equal(result[1].fields.responsibilities, '负责接口设计。');
});
