import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadContract() {
  return JSON.parse(await readFile(new URL('../project-contract.json', import.meta.url), 'utf8'));
}

test('项目采访契约覆盖完整的问题解决上下文', async () => {
  const contract = await loadContract();
  const fields = contract.project.fields.map(({ field }) => field);

  assert.deepEqual(fields, [
    'name',
    'experience',
    'start',
    'end',
    'role',
    'description',
    'responsibilities',
    'tech_stack',
    'challenges',
    'solutions',
    'outcomes',
    'learnings',
    'url',
  ]);
  assert.equal(contract.archive.preserve_verbatim, true);
});

test('项目补问契约要求单题串行并追问到明确', async () => {
  const { questioning } = await loadContract();

  assert.deepEqual(questioning, {
    max_questions_per_turn: 1,
    advance_only_when_clear: true,
    retry_current_field_when_unclear: true,
  });
});

/** 确保深度项进入知识库，但不会被预设简历模板默认消费。 */
test('项目深度信息进入 Wiki Schema 且默认不展示在简历', async () => {
  const { resume } = await loadContract();

  for (const template of ['tech-minimal', 'business-sidebar', 'creative-color']) {
    const content = await readFile(
      new URL(`../../web-editor/templates/${template}.json`, import.meta.url),
      'utf8',
    );
    for (const field of resume.excluded_by_default) {
      assert.doesNotMatch(content, new RegExp(field));
    }
  }
});
