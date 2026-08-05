import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/** 确保项目采访不会只采简历字段，而会保留完整的问题解决上下文。 */
test('项目采访覆盖描述、职责、技术栈、困难和解决方案', async () => {
  const content = await readFile(new URL('../SKILL.md', import.meta.url), 'utf8');

  for (const keyword of ['项目描述', '本人职责', '技术栈', '困难', '解决方案']) {
    assert.match(content, new RegExp(keyword));
  }
  assert.match(content, /原话.*完整.*raw|完整.*原话.*raw/);
});

/** 确保补问严格串行，当前答案未明确时不会跳到下一项。 */
test('项目缺口补问一次只问一个问题并追问到明确', async () => {
  const content = await readFile(new URL('../SKILL.md', import.meta.url), 'utf8');

  assert.match(content, /每轮只发送一个问题/);
  assert.match(content, /等待用户回答/);
  assert.match(content, /回答不明确/);
  assert.match(content, /不得进入下一/);
  assert.match(content, /明确后.*下一/);
  assert.match(content, /禁止.*多个问题/);
});

/** 确保深度项进入知识库，但不会被预设简历模板默认消费。 */
test('项目深度信息进入 Wiki Schema 且默认不展示在简历', async () => {
  const wikiSkill = await readFile(
    new URL('../../wiki-engine/SKILL.md', import.meta.url),
    'utf8',
  );
  const hiddenByDefault = ['challenges', 'solutions', 'outcomes', 'learnings'];

  for (const field of hiddenByDefault) assert.match(wikiSkill, new RegExp(`\\| ${field} \\|`));

  for (const template of ['tech-minimal', 'business-sidebar', 'creative-color']) {
    const content = await readFile(
      new URL(`../../template-manager/templates/${template}.json`, import.meta.url),
      'utf8',
    );
    for (const field of hiddenByDefault) assert.doesNotMatch(content, new RegExp(field));
  }
});
