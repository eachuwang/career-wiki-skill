import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCareerWikiAppState } from '../scripts/app_state.mjs';

test('简历目录不可写时返回可操作的错误且不暴露本地绝对路径', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-save-permissions-'));
  const resumesDir = join(root, '.career-wiki-skill', 'resumes');
  const resumePath = join(resumesDir, 'readonly-resume.json');
  await mkdir(resumesDir, { recursive: true });
  await writeFile(resumePath, '{}');
  await chmod(resumePath, 0o444);

  t.after(async () => {
    await chmod(resumePath, 0o644).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  const state = createCareerWikiAppState({ root });

  await assert.rejects(
    state.saveResume({ id: 'readonly-resume', name: '只读简历' }),
    (error) => error.statusCode === 500
      && error.code === 'EACCES'
      && /数据目录不可写/.test(error.message)
      && !error.message.includes(root),
  );
});
