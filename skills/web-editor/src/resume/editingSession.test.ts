import assert from 'node:assert/strict';
import test from 'node:test';
import { createResumeEditingSession } from './editingSession.ts';
import type { ResumeConfig } from '../types';

function resume(overrides: Partial<ResumeConfig> = {}): ResumeConfig {
  return {
    id: 'ai-engineer',
    name: 'AI 工程师简历',
    template: 'tech-minimal',
    created: '2026-08-01',
    updated: '2026-08-01',
    modules: ['person', 'project'],
    privacy: { mask_phone: true },
    hide: [],
    polish: { enabled: false, entries: {} },
    content_overrides: {},
    ...overrides,
  };
}

test('修改简历名称产生草稿，保存成功后以最新草稿作为已保存版本', async () => {
  const saved: ResumeConfig[] = [];
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async (config) => {
      saved.push(structuredClone(config));
    },
  });

  session.dispatch({ type: 'change-name', name: '大模型应用工程师简历' });

  assert.equal(session.getSnapshot().draft?.name, '大模型应用工程师简历');
  assert.equal(session.getSnapshot().saveStatus, 'dirty');

  const result = await session.dispatch({ type: 'save' });

  assert.deepEqual(result, { status: 'saved' });
  assert.equal(session.getSnapshot().saveStatus, 'saved');
  assert.equal(session.getSnapshot().saved?.name, '大模型应用工程师简历');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, '大模型应用工程师简历');
});

test('保存失败时保留简历草稿，并允许用户修改后重试', async () => {
  let attempts = 0;
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('数据目录暂时不可写');
    },
  });

  await session.dispatch({ type: 'change-name', name: '第一次修改' });
  const failed = await session.dispatch({ type: 'save' });

  assert.deepEqual(failed, { status: 'failed', error: '数据目录暂时不可写' });
  assert.equal(session.getSnapshot().saveStatus, 'failed');
  assert.equal(session.getSnapshot().saved?.name, 'AI 工程师简历');
  assert.equal(session.getSnapshot().draft?.name, '第一次修改');

  await session.dispatch({ type: 'change-name', name: '失败后继续修改' });
  const retried = await session.dispatch({ type: 'save' });

  assert.deepEqual(retried, { status: 'saved' });
  assert.equal(session.getSnapshot().saved?.name, '失败后继续修改');
  assert.equal(session.getSnapshot().draft?.name, '失败后继续修改');
});

test('连续保存串行执行，并将等待中的中间状态合并为最新草稿', async () => {
  let releaseFirstSave: (() => void) | undefined;
  const firstSavePending = new Promise<void>((resolve) => {
    releaseFirstSave = resolve;
  });
  const savedNames: string[] = [];
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async (config) => {
      savedNames.push(config.name);
      if (savedNames.length === 1) await firstSavePending;
    },
  });

  await session.dispatch({ type: 'change-name', name: '第一版草稿' });
  const firstSave = session.dispatch({ type: 'save' });
  await session.dispatch({ type: 'change-name', name: '不会单独保存的中间稿' });
  const secondSave = session.dispatch({ type: 'save' });
  await session.dispatch({ type: 'change-name', name: '最终草稿' });

  await Promise.resolve();
  assert.deepEqual(savedNames, ['第一版草稿']);

  releaseFirstSave?.();
  await Promise.all([firstSave, secondSave]);

  assert.deepEqual(savedNames, ['第一版草稿', '最终草稿']);
  assert.equal(session.getSnapshot().saved?.name, '最终草稿');
  assert.equal(session.getSnapshot().saveStatus, 'saved');
});

test('切换简历前保护未保存草稿，确认丢弃后才切换', async () => {
  const session = createResumeEditingSession({
    resumes: [resume(), resume({ id: 'product', name: '产品经理简历' })],
    saveResume: async () => {},
  });

  await session.dispatch({ type: 'change-name', name: '尚未保存的名称' });
  const guarded = await session.dispatch({ type: 'switch-resume', resumeId: 'product' });

  assert.deepEqual(guarded, { status: 'confirm-discard', resumeId: 'product' });
  assert.equal(session.getSnapshot().currentResumeId, 'ai-engineer');
  assert.equal(session.getSnapshot().draft?.name, '尚未保存的名称');

  const switched = await session.dispatch({
    type: 'switch-resume',
    resumeId: 'product',
    discardDirty: true,
  });

  assert.deepEqual(switched, { status: 'switched' });
  assert.equal(session.getSnapshot().currentResumeId, 'product');
  assert.equal(session.getSnapshot().draft?.name, '产品经理简历');
  assert.equal(session.getSnapshot().saveStatus, 'clean');
});

test('保存进行中切换简历时先等待保存，再保护期间产生的新草稿', async () => {
  let releaseSave: (() => void) | undefined;
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const session = createResumeEditingSession({
    resumes: [resume(), resume({ id: 'product', name: '产品经理简历' })],
    saveResume: async () => pendingSave,
  });

  await session.dispatch({ type: 'change-name', name: '正在保存的版本' });
  const saving = session.dispatch({ type: 'save' });
  await session.dispatch({ type: 'change-name', name: '保存期间的新草稿' });
  let switchSettled = false;
  const switching = session.dispatch({ type: 'switch-resume', resumeId: 'product' }).then((result) => {
    switchSettled = true;
    return result;
  });

  await Promise.resolve();
  assert.equal(switchSettled, false);

  releaseSave?.();
  await saving;
  assert.deepEqual(await switching, { status: 'confirm-discard', resumeId: 'product' });
  assert.equal(session.getSnapshot().draft?.name, '保存期间的新草稿');
});

test('刷新简历集合只同步列表，切换新简历仍受草稿保护', async () => {
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async () => {},
  });
  const created = resume({ id: 'new-resume', name: '新简历' });
  await session.dispatch({ type: 'change-name', name: '未保存名称' });

  await session.dispatch({ type: 'replace-resumes', resumes: [resume(), created] });
  const result = await session.dispatch({ type: 'switch-resume', resumeId: created.id });

  assert.deepEqual(result, { status: 'confirm-discard', resumeId: created.id });
  assert.equal(session.getSnapshot().resumes.length, 2);
  assert.equal(session.getSnapshot().currentResumeId, 'ai-engineer');
  assert.equal(session.getSnapshot().draft?.name, '未保存名称');
});

test('破坏性操作会等待进行中的保存，并报告保存期间产生的新草稿', async () => {
  let releaseSave: (() => void) | undefined;
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async () => pendingSave,
  });

  await session.dispatch({ type: 'change-name', name: '正在保存' });
  const saving = session.dispatch({ type: 'save' });
  await session.dispatch({ type: 'change-name', name: '保存期间的新草稿' });
  let prepared = false;
  const preparing = session.dispatch({ type: 'prepare-destructive-change' }).then((result) => {
    prepared = true;
    return result;
  });

  await Promise.resolve();
  assert.equal(prepared, false);
  releaseSave?.();
  await saving;
  assert.deepEqual(await preparing, { status: 'ready', hasUnsavedDraft: true });
});

test('新建简历作为一个事务持久化、加入集合并切换到新草稿', async () => {
  const persisted: ResumeConfig[] = [];
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async (config) => { persisted.push(structuredClone(config)); },
    deleteResume: async () => {},
  });
  const created = resume({ id: 'new-resume', name: '新简历' });

  const result = await session.dispatch({ type: 'create-resume', config: created });

  assert.deepEqual(result, { status: 'switched' });
  assert.deepEqual(persisted, [created]);
  assert.deepEqual(session.getSnapshot().resumes.map((item) => item.id), [
    'ai-engineer',
    'new-resume',
  ]);
  assert.equal(session.getSnapshot().currentResumeId, 'new-resume');
  assert.equal(session.getSnapshot().draft?.name, '新简历');
  assert.equal(session.getSnapshot().saveStatus, 'clean');
});

test('删除当前简历作为一个事务持久化，并切换到剩余简历', async () => {
  const deleted: string[] = [];
  const session = createResumeEditingSession({
    resumes: [resume(), resume({ id: 'product', name: '产品经理简历' })],
    saveResume: async () => {},
    deleteResume: async (id) => { deleted.push(id); },
  });

  const result = await session.dispatch({ type: 'delete-current-resume' });

  assert.deepEqual(result, { status: 'switched' });
  assert.deepEqual(deleted, ['ai-engineer']);
  assert.deepEqual(session.getSnapshot().resumes.map((item) => item.id), ['product']);
  assert.equal(session.getSnapshot().currentResumeId, 'product');
  assert.equal(session.getSnapshot().draft?.name, '产品经理简历');
});

test('新建持久化失败时保持当前简历和草稿不变', async () => {
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async () => { throw new Error('保存新简历失败'); },
    deleteResume: async () => {},
  });
  const before = structuredClone(session.getSnapshot());

  const result = await session.dispatch({
    type: 'create-resume',
    config: resume({ id: 'new-resume', name: '新简历' }),
  });

  assert.deepEqual(result, { status: 'failed', error: '保存新简历失败' });
  assert.deepEqual(session.getSnapshot(), before);
});

test('异步润色合并请求期间的用户修改，并将合并后的最新草稿保存', async () => {
  let releasePolish: (() => void) | undefined;
  const pendingPolish = new Promise<void>((resolve) => { releasePolish = resolve; });
  const saved: ResumeConfig[] = [];
  const session = createResumeEditingSession({
    resumes: [resume()],
    saveResume: async (config) => { saved.push(structuredClone(config)); },
    polishResume: async (config) => {
      await pendingPolish;
      return {
        config: {
          ...config,
          polish: {
            enabled: true,
            entries: {
              'projects/mail.md': {
                source_hash: 'abc',
                fields: { description: '润色后的项目描述' },
              },
            },
          },
        },
        generated_count: 1,
        candidate_count: 1,
      };
    },
  });

  const polishing = session.dispatch({
    type: 'generate-polish',
    provider: {
      protocol: 'openai',
      base_url: 'https://example.com/v1',
      api_key: 'key',
      model: 'model',
      timeout_ms: 1000,
    },
  });
  await session.dispatch({
    type: 'edit-draft',
    patch: {
      template: 'business-double',
      polish: { enabled: false, selected_fields: ['content'], entries: {} },
    },
  });
  releasePolish?.();

  assert.deepEqual(await polishing, {
    status: 'polished',
    generatedCount: 1,
    candidateCount: 1,
  });
  assert.equal(session.getSnapshot().draft?.template, 'business-double');
  assert.equal(session.getSnapshot().draft?.polish?.enabled, false);
  assert.deepEqual(session.getSnapshot().draft?.polish?.selected_fields, ['content']);
  assert.equal(session.getSnapshot().saveStatus, 'saved');
  assert.equal(saved[0].template, 'business-double');
  assert.equal(
    saved[0].polish?.entries?.['projects/mail.md']?.fields.description,
    '润色后的项目描述',
  );
});
