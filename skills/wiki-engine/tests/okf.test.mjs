import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import matter from 'gray-matter';
import {
  extractConceptLinks,
  migrateConceptDocument,
  parseCareerEntity,
  validateConceptDocument,
} from '../scripts/okf.mjs';
import { checkBundle, migrateBundle } from '../scripts/okf_bundle.mjs';

test('旧 Career Wiki 项目迁移为 OKF v0.2 concept', () => {
  const legacy = matter.stringify(
    '由 [[wiki/persons/王羿邱|王羿邱]] 负责。',
    {
      entity: 'project',
      confidence: 'extracted',
      sources: ['sources/raw/uploads/resume.md'],
      name: '邮件路由项目',
      description: '根据邮件意图完成智能路由。',
    },
  );

  const migrated = migrateConceptDocument(legacy, {
    generatedAt: '2026-08-13T00:00:00.000Z',
  });
  const parsed = matter(migrated);

  assert.equal(parsed.data.type, 'career.project');
  assert.equal(parsed.data.title, '邮件路由项目');
  assert.equal(parsed.data.entity, undefined);
  assert.deepEqual(parsed.data.sources, [
    { resource: '/references/raw/uploads/resume.md' },
  ]);
  assert.deepEqual(parsed.data.generated, {
    by: 'process:career-wiki-okf-migration',
    at: '2026-08-13T00:00:00.000Z',
  });
  assert.match(parsed.content, /\[王羿邱\]\(\/persons\/王羿邱\.md\)/);
  assert.deepEqual(validateConceptDocument(migrated), []);
});

test('迁移保留领域字段并避开 OKF 保留键冲突', () => {
  const experience = migrateConceptDocument(matter.stringify('', {
    entity: 'experience',
    type: 'full-time',
    company: '示例公司',
    role: '工程师',
    sources: ['sources/raw/interview.md'],
  }));
  const person = migrateConceptDocument(matter.stringify('', {
    entity: 'person',
    name: '王二',
    title: 'AI 工程师',
    sources: ['sources/raw/interview.md'],
  }));
  const summary = migrateConceptDocument(matter.stringify('', {
    entity: 'summary',
    type: 'personal',
    content: '个人优势',
    sources: ['sources/raw/interview.md'],
  }));

  assert.equal(matter(experience).data.type, 'career.experience');
  assert.equal(matter(experience).data.employment_type, 'full-time');
  assert.equal(matter(person).data.title, '王二');
  assert.equal(matter(person).data.current_title, 'AI 工程师');
  assert.equal(matter(summary).data.type, 'career.summary');
  assert.equal(matter(summary).data.summary_type, 'personal');
});

test('消费者只识别 OKF concept type，拒绝旧 entity 契约', () => {
  assert.equal(parseCareerEntity({ entity: 'project' }), null);
  assert.equal(parseCareerEntity({ type: 'career.project' }), 'project');
  assert.equal(parseCareerEntity({ type: 'Metric' }), null);
});

test('校验器报告缺少 type、字符串来源和旧 wikilink', () => {
  const errors = validateConceptDocument(matter.stringify('[[wiki/projects/a|A]]', {
    entity: 'project',
    sources: ['sources/raw/a.md'],
  }));

  assert.deepEqual(errors, [
    'frontmatter.type 必须是非空字符串',
    '不允许旧字段 frontmatter.entity',
    'sources[0] 必须是包含 resource 的对象',
    '正文必须使用标准 Markdown 链接，不能使用 [[wikilink]]',
  ]);
});

test('断链作为 lint 警告报告，但不破坏 OKF conformance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-okf-links-'));
  try {
    await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
    await writeFile(join(root, 'knowledge', 'index.md'), matter.stringify('# Career Wiki\n', {
      okf_version: '0.2',
    }));
    await writeFile(join(root, 'knowledge', 'projects', 'example.md'), matter.stringify(
      '[Missing](/skills/missing.md)',
      { type: 'career.project', name: 'Example' },
    ));
    const result = await checkBundle(root);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, [
      'projects/example.md: Markdown 链接目标不存在: skills/missing.md',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('旧 relations 迁移为带语义上下文的标准 Markdown 链接', () => {
  const migrated = migrateConceptDocument(matter.stringify('', {
    entity: 'project',
    name: '示例项目',
    relations: [{ type: 'used_skill', target: 'wiki/skills/python', label: 'Python' }],
  }));
  const parsed = matter(migrated);

  assert.match(parsed.content, /- used_skill: \[Python\]\(\/skills\/python\.md\)/);
  assert.deepEqual(extractConceptLinks(parsed.content, 'projects/example.md'), [
    { target: 'skills/python.md', name: 'Python', type: 'used_skill' },
  ]);
});

test('bundle 迁移先备份，再写入根 index 与 OKF concepts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-okf-'));
  try {
    await mkdir(join(root, 'wiki', 'persons'), { recursive: true });
    await mkdir(join(root, 'sources', 'raw'), { recursive: true });
    await mkdir(join(root, 'sources', 'uploads'), { recursive: true });
    await mkdir(join(root, 'resumes'), { recursive: true });
    await mkdir(join(root, '.career-wiki-skill'), { recursive: true });
    await mkdir(join(root, 'templates'), { recursive: true });
    await writeFile(join(root, 'wiki', 'persons', '王二.md'), matter.stringify('', {
      entity: 'person',
      name: '王二',
      title: 'AI 工程师',
      sources: ['sources/raw/interview.md'],
    }));
    await writeFile(join(root, 'templates', 'test.json'), JSON.stringify({
      sections: [{ module: 'person', fields: ['name', 'title', 'email'] }],
    }));
    await writeFile(join(root, 'templates', 'test.css'), '.resume { color: black; }');
    await writeFile(join(root, 'resumes', 'test.json'), JSON.stringify({ id: 'test' }));
    await writeFile(join(root, 'sources', 'raw', 'interview.md'), '# Interview\n');
    await writeFile(join(root, 'sources', 'uploads', 'resume.pdf'), 'binary');
    await writeFile(join(root, '.career-wiki-skill', 'config.json'), JSON.stringify({
      version: '1.0', root,
    }));
    await writeFile(join(root, '.career-wiki-skill', 'interview-checkpoint.json'), JSON.stringify({
      status: 'in_progress',
      interview_file: 'sources/raw/interview.md',
    }));

    assert.equal((await checkBundle(root)).errors.length > 0, true);
    const result = await migrateBundle(root, '2026-08-13T00:00:00.000Z');

    assert.equal(result.errors.length, 0);
    assert.match(await readFile(join(root, 'knowledge', 'index.md'), 'utf8'), /okf_version: '0.2'/);
    assert.equal(matter(await readFile(join(root, 'knowledge', 'persons', '王二.md'), 'utf8')).data.type, 'career.person');
    assert.deepEqual(
      JSON.parse(await readFile(join(root, '.career-wiki-skill', 'templates', 'test.json'), 'utf8')).sections[0].fields,
      ['name', 'current_title', 'email'],
    );
    assert.equal(await readFile(join(root, '.career-wiki-skill', 'templates', 'test.css'), 'utf8'), '.resume { color: black; }');
    assert.deepEqual(
      JSON.parse(await readFile(join(root, '.career-wiki-skill', 'resumes', 'test.json'), 'utf8')),
      { id: 'test' },
    );
    assert.equal(
      matter(await readFile(join(root, 'knowledge', 'references', 'raw', 'interview.md'), 'utf8')).data.type,
      'Reference',
    );
    assert.equal(await readFile(join(root, 'knowledge', 'references', 'uploads', 'resume.pdf'), 'utf8'), 'binary');
    assert.deepEqual(
      JSON.parse(await readFile(join(root, '.career-wiki-skill', 'config.json'), 'utf8')),
      { version: '2.0', root, okf_version: '0.2' },
    );
    assert.equal(
      JSON.parse(await readFile(
        join(root, '.career-wiki-skill', 'interview-checkpoint.json'),
        'utf8',
      )).interview_file,
      'knowledge/references/raw/interview.md',
    );
    assert.equal(
      JSON.parse(await readFile(
        join(result.backup, '.career-wiki-skill', 'interview-checkpoint.json'),
        'utf8',
      )).interview_file,
      'sources/raw/interview.md',
    );
    await assert.rejects(readFile(join(root, 'wiki', 'persons', '王二.md'), 'utf8'));
    assert.equal(
      matter(await readFile(join(result.backup, 'wiki', 'persons', '王二.md'), 'utf8')).data.entity,
      'person',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
