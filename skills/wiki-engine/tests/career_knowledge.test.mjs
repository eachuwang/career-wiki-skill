import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadCareerKnowledge } from '../scripts/career_knowledge.mjs';

/** 通过数据根目录观察职业知识读取接口，不依赖单文件解析等内部实现。 */
test('读取 OKF Career concepts 为统一实体与关系快照', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-knowledge-'));
  try {
    await mkdir(join(root, 'knowledge', 'persons'), { recursive: true });
    await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
    await writeFile(
      join(root, 'knowledge', 'persons', 'wang.md'),
      `---
type: career.person
title: 王二
name: 王二
current_title: AI 工程师
verified: { by: human:career-wiki-user, at: "2026-08-13T00:00:00Z" }
sources:
  - resource: /references/raw/interview.md
---

负责 [邮件路由项目](/projects/mail-routing.md)。
`,
    );
    await writeFile(
      join(root, 'knowledge', 'projects', 'mail-routing.md'),
      `---
type: career.project
title: 邮件路由项目
name: 邮件路由项目
description: 根据邮件意图完成智能路由。
---
`,
    );

    const snapshot = await loadCareerKnowledge(root);

    assert.equal(snapshot.total, 2);
    assert.deepEqual(snapshot.entities.map((entity) => entity.path), [
      'persons/wang.md',
      'projects/mail-routing.md',
    ]);
    assert.deepEqual(snapshot.entities[0], {
      path: 'persons/wang.md',
      entity: 'person',
      title: '王二',
      trustTier: 'human-reviewed',
      sources: ['/references/raw/interview.md'],
      fields: { name: '王二', current_title: 'AI 工程师' },
      relations: [{ type: 'references', target: 'projects/mail-routing.md' }],
      links: [{ type: 'references', target: 'projects/mail-routing.md', name: '邮件路由项目' }],
      content: '\n负责 [邮件路由项目](/projects/mail-routing.md)。\n',
    });
    assert.deepEqual(snapshot.allRelations, [{
      from: 'persons/wang.md',
      to: 'projects/mail-routing.md',
      type: 'references',
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('删除清单中的实体和指向它的关系不会进入快照', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-knowledge-deletion-'));
  try {
    await mkdir(join(root, 'knowledge', 'persons'), { recursive: true });
    await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
    await mkdir(join(root, '.career-wiki-skill'), { recursive: true });
    await writeFile(
      join(root, 'knowledge', 'persons', 'wang.md'),
      `---
type: career.person
title: 王二
name: 王二
---

参与 [已删除项目](/projects/deleted.md) 和 [保留项目](/projects/kept.md)。
`,
    );
    await writeFile(
      join(root, 'knowledge', 'projects', 'deleted.md'),
      '---\ntype: career.project\ntitle: 已删除项目\nname: 已删除项目\n---\n',
    );
    await writeFile(
      join(root, 'knowledge', 'projects', 'kept.md'),
      '---\ntype: career.project\ntitle: 保留项目\nname: 保留项目\n---\n',
    );
    await writeFile(
      join(root, '.career-wiki-skill', 'deletions.json'),
      JSON.stringify({
        version: 1,
        deletions: [{ entity: 'project', path: 'projects/deleted.md' }],
      }),
    );

    const snapshot = await loadCareerKnowledge(root);

    assert.deepEqual(snapshot.entities.map((entity) => entity.path), [
      'persons/wang.md',
      'projects/kept.md',
    ]);
    assert.deepEqual(snapshot.allRelations, [{
      from: 'persons/wang.md',
      to: 'projects/kept.md',
      type: 'references',
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('可按实体类型读取轻量快照，并拒绝未知类型', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-knowledge-query-'));
  try {
    await mkdir(join(root, 'knowledge', 'persons'), { recursive: true });
    await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
    await writeFile(
      join(root, 'knowledge', 'persons', 'wang.md'),
      '---\ntype: career.person\ntitle: 王二\nname: 王二\n---\n\n个人正文。\n',
    );
    await writeFile(
      join(root, 'knowledge', 'projects', 'mail.md'),
      '---\ntype: career.project\ntitle: 邮件项目\nname: 邮件项目\n---\n\n项目正文。\n',
    );

    const snapshot = await loadCareerKnowledge(root, {
      entity: 'project',
      includeContent: false,
    });

    assert.equal(snapshot.total, 1);
    assert.equal(snapshot.entities[0].path, 'projects/mail.md');
    assert.equal(Object.hasOwn(snapshot.entities[0], 'content'), false);
    await assert.rejects(
      loadCareerKnowledge(root, { entity: 'unknown' }),
      /不支持的 Career 实体类型：unknown/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
