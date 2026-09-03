import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCareerWikiAppState } from '../scripts/app_state.mjs';
import { buildPolishSourceHash } from '../scripts/resume_polish.mjs';
import { createCareerKnowledge } from '../scripts/career_knowledge_application.mjs';
import { createResumePolish } from '../scripts/resume_polish_application.mjs';

test('润色指纹覆盖所有原始字段，避免上下文事实变化后复用旧文案', () => {
  assert.notEqual(
    buildPolishSourceHash({ description: '做数据接入', tech_stack: 'Node.js' }),
    buildPolishSourceHash({ description: '做数据接入', tech_stack: 'Python' }),
  );
  assert.notEqual(
    buildPolishSourceHash({ description: '做数据接入', role: '后端工程师' }),
    buildPolishSourceHash({ description: '做数据接入', role: '产品经理' }),
  );
});

/** 构造严格 OKF Career concept 测试数据。 */
async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-responsibilities-'));
  await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
  await mkdir(join(root, '.career-wiki-skill', 'templates'), { recursive: true });
  await writeFile(
    join(root, 'knowledge', 'projects', 'data-agent.md'),
    `---
type: career.project
name: 数据智能体
role: 大模型应用工程师
start: 2024-01
end: present
description: 自动生成数据接入脚本。
responsibilities: 解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。
tech_stack: Node.js、PostgreSQL、LangChain
---

项目背景说明。
`,
  );
  await writeFile(
    join(root, '.career-wiki-skill', 'templates', 'tech-minimal.json'),
    JSON.stringify({
      id: 'tech-minimal',
      sections: [
        {
          module: 'project',
          title: '项目经验',
          fields: ['name', 'role', 'start', 'end', 'description'],
        },
      ],
    }),
  );
  return root;
}

test('项目岗位职责和技术栈以独立字段进入 Career Knowledge', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const wiki = await createCareerKnowledge({ root }).load();
  assert.equal(
    wiki.entities[0].fields.responsibilities,
    '解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。',
  );
  assert.equal(wiki.entities[0].fields.tech_stack, 'Node.js、PostgreSQL、LangChain');

});

test('润色上下文提供原始事实、口吻样本和稳定指纹', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const appState = createCareerWikiAppState({ root });
  const polish = createResumePolish({ root, appState });
  const context = await polish.buildContext({
    config: {
      id: 'ai-resume',
      name: 'AI 应用简历',
      template: 'tech-minimal',
      modules: ['project'],
    },
  });
  assert.equal(context.candidates.length, 1);
  assert.equal(context.candidates[0].source.description, '自动生成数据接入脚本。');
  assert.equal(context.candidates[0].source.responsibilities, '解析数据字典；生成 DDL 与 ETL 脚本；推荐数仓模型。');
  assert.match(context.candidates[0].source_hash, /^[0-9a-f]{8}$/);
  assert.equal(context.candidates[0].status.status, 'missing');
  assert.ok(context.style_samples.some((sample) => sample.field === 'description'));
  assert.ok(context.instructions.rules.some((rule) => rule.includes('不补造事实')));
});
