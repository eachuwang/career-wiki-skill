import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCareerWikiAppState } from '../scripts/app_state.mjs';
import { resumesDirectory, templatesDirectory } from '../../wiki-engine/scripts/layout.mjs';

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


test('同时创建同一 ID 只写入一个完整版本并清理临时文件', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-app-state-create-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = createCareerWikiAppState({ root });

  const names = ['First draft', 'Second draft'];
  const resumes = await Promise.allSettled(names.map((name) =>
    state.saveResume({ id: 'resume', name }, { createOnly: true }),
  ));
  assert.equal(resumes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(resumes.find((result) => result.status === 'rejected').reason.statusCode, 409);
  assert.equal((await state.getResume('resume')).name, names[resumes.findIndex((result) => result.status === 'fulfilled')]);
  assert.deepEqual(await readdir(resumesDirectory(root)), ['resume.json']);

  const templates = await Promise.allSettled(names.map((name) => state.saveTemplate({
    template: { id: 'template', name, sections: [] }, css: name, createOnly: true,
  })));
  assert.equal(templates.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(templates.find((result) => result.status === 'rejected').reason.statusCode, 409);
  assert.equal((await state.listTemplates())[0].name, await state.readTemplateCss('template'));
  assert.deepEqual((await readdir(templatesDirectory(root))).sort(), ['template.css', 'template.json']);
});
