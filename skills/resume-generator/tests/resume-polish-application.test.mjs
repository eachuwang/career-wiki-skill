import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCareerWikiAppState } from '../scripts/app_state.mjs';
import { createResumePolish } from '../scripts/resume_polish_application.mjs';

test('润色模块从简历和 Wiki 构造上下文，并原子合并生成结果', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-polish-app-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
  await writeFile(join(root, 'knowledge', 'projects', 'agent.md'), `---
type: career.project
name: 数据智能体
description: 自动生成数据接入脚本。
responsibilities: 解析数据字典。
---
`);
  const appState = createCareerWikiAppState({ root });
  await appState.saveResume({
    id: 'ai-engineer',
    name: 'AI 工程师',
    modules: ['project'],
    polish: { selected_fields: ['description'] },
  });
  const polish = createResumePolish({
    root,
    appState,
    now: () => new Date('2026-08-13T08:00:00.000Z'),
    generateEntries: async (context) => [{
      path: 'projects/agent.md',
      source_hash: context.candidates[0].source_hash,
      fields: { description: '围绕数据接入脚本实现自动生成能力。' },
    }],
    listModels: async () => ['model-b', 'model-a'],
  });

  const context = await polish.buildContext({ resume_id: 'ai-engineer' });
  assert.equal(context.candidates[0].source.description, '自动生成数据接入脚本。');
  assert.deepEqual(context.selected_fields, ['description']);

  const result = await polish.generate({ resume_id: 'ai-engineer', provider: { protocol: 'openai' } });
  assert.equal(result.generated_count, 1);
  assert.equal(result.config.polish.enabled, true);
  assert.equal(
    result.config.polish.entries['projects/agent.md'].fields.description,
    '围绕数据接入脚本实现自动生成能力。',
  );
  assert.equal(
    result.config.polish.entries['projects/agent.md'].updated_at,
    '2026-08-13T08:00:00.000Z',
  );
  assert.deepEqual(await polish.listModels({ provider: {} }), ['model-b', 'model-a']);
});
