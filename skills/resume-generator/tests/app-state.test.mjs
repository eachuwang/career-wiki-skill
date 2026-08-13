import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCareerWikiAppState } from '../scripts/app_state.mjs';

test('应用状态通过同一接口保存、读取并删除简历和模板', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-app-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = createCareerWikiAppState({
    root,
    now: () => new Date('2026-08-13T08:00:00.000Z'),
  });

  const draft = { id: 'ai-engineer', name: 'AI 工程师', modules: ['project'] };
  assert.deepEqual(await state.saveResume(draft), {
    status: 'saved',
    id: 'ai-engineer',
  });
  assert.equal(draft.created, undefined, '保存不得修改调用方持有的简历草稿');
  assert.deepEqual(await state.listResumes(), [{
    id: 'ai-engineer',
    name: 'AI 工程师',
    modules: ['project'],
    created: '2026-08-13',
    updated: '2026-08-13',
  }]);

  await state.saveTemplate({
    template: {
      id: 'tech-minimal',
      name: '技术简约',
      sections: [{ module: 'project', fields: ['name'] }],
    },
    css: '.resume { color: black; }',
  });
  assert.equal((await state.listTemplates())[0].style, 'tech-minimal.css');
  assert.equal(await state.readTemplateCss('tech-minimal'), '.resume { color: black; }');

  assert.deepEqual(await state.deleteResume('ai-engineer'), {
    status: 'deleted',
    id: 'ai-engineer',
  });
  assert.deepEqual(await state.deleteTemplate('tech-minimal'), {
    status: 'deleted',
    id: 'tech-minimal',
  });
  assert.deepEqual(await state.listResumes(), []);
  assert.deepEqual(await state.listTemplates(), []);
});

test('应用状态在接口处拒绝非法 id', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-app-state-id-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = createCareerWikiAppState({ root });

  await assert.rejects(
    state.deleteResume('../outside'),
    (error) => error.statusCode === 400 && /非法简历 id/.test(error.message),
  );
  await assert.rejects(
    state.readTemplateCss('../outside'),
    (error) => error.statusCode === 400 && /非法模板 id/.test(error.message),
  );
});
