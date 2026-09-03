#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { homedir } from 'node:os';
import matter from 'gray-matter';
import {
  extractConceptLinks,
  migrateConceptDocument,
  migrateReferenceDocument,
  OKF_VERSION,
  validateConceptDocument,
} from './okf.mjs';
import { DATA_LAYOUT, bundleDirectory, templatesDirectory } from './layout.mjs';

const RESERVED_FILES = new Set(['index.md', 'log.md']);

async function collectMarkdown(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdown(path));
    else if (entry.isFile() && extname(entry.name) === '.md' && !RESERVED_FILES.has(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args.shift();
  let root = join(homedir(), '.career_wiki');
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--root') root = args[++index];
  }
  if (!['check', 'migrate'].includes(command)) {
    throw new Error('用法: node okf_bundle.mjs <check|migrate> [--root <数据根目录>]');
  }
  return { command, root };
}

function buildRootIndex(concepts) {
  const groups = new Map();
  for (const concept of concepts) {
    const directory = dirname(concept.path).replaceAll('\\', '/');
    const list = groups.get(directory) || [];
    list.push(concept);
    groups.set(directory, list);
  }
  const sections = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directory, entries]) => {
      const items = entries
        .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
        .map((entry) => `* [${entry.title}](${entry.path})${entry.description ? ` - ${entry.description}` : ''}`)
        .join('\n');
      return `# ${directory}\n\n${items}`;
    })
    .join('\n\n');
  return matter.stringify(`${sections}\n`, { okf_version: OKF_VERSION });
}

function migrateTemplate(template) {
  return {
    ...template,
    sections: (template.sections || []).map((section) => {
      if (section.module === 'person') {
        return {
          ...section,
          fields: (section.fields || []).map((field) => field === 'title' ? 'current_title' : field),
        };
      }
      if (section.module === 'publication') {
        return {
          ...section,
          fields: (section.fields || []).map((field) => field === 'title' ? 'publication_title' : field),
        };
      }
      return section;
    }),
  };
}

async function loadConcepts(wikiDirectory) {
  const files = await collectMarkdown(wikiDirectory);
  return Promise.all(files.map(async (file) => ({
    file,
    path: relative(wikiDirectory, file).replaceAll('\\', '/'),
    raw: await readFile(file, 'utf8'),
  })));
}

function migrateCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return checkpoint;
  const interviewFile = typeof checkpoint.interview_file === 'string'
    ? checkpoint.interview_file
        .replace(/^sources\/raw\//, `${DATA_LAYOUT.referencesRaw}/`)
        .replace(/^sources\/uploads\//, `${DATA_LAYOUT.referencesUploads}/`)
    : checkpoint.interview_file;
  return { ...checkpoint, ...(interviewFile ? { interview_file: interviewFile } : {}) };
}

export async function migrateAppState(root) {
  const checkpointPath = join(root, DATA_LAYOUT.state, 'interview-checkpoint.json');
  try {
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
    await writeFile(
      checkpointPath,
      `${JSON.stringify(migrateCheckpoint(checkpoint), null, 2)}\n`,
      'utf8',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function checkBundle(root) {
  const wikiDirectory = bundleDirectory(root);
  const concepts = await loadConcepts(wikiDirectory);
  const errors = [];
  const warnings = [];
  const conceptPaths = new Set(concepts.map((concept) => concept.path));
  for (const concept of concepts) {
    validateConceptDocument(concept.raw).forEach((message) => {
      errors.push(`${concept.path}: ${message}`);
    });
    const content = matter(concept.raw).content || '';
    for (const link of extractConceptLinks(content, concept.path)) {
      if (!conceptPaths.has(link.target)) {
        warnings.push(`${concept.path}: Markdown 链接目标不存在: ${link.target}`);
      }
    }
  }
  const rootIndex = join(wikiDirectory, 'index.md');
  try {
    const parsed = matter(await readFile(rootIndex, 'utf8'));
    if (String(parsed.data.okf_version || '') !== OKF_VERSION) {
      errors.push(`index.md: okf_version 必须是 ${OKF_VERSION}`);
    }
  } catch {
    errors.push('index.md: 缺少声明 OKF 版本的根索引');
  }
  return { conceptCount: concepts.length, errors, warnings };
}

export async function migrateBundle(root, generatedAt = new Date().toISOString()) {
  const legacyWikiDirectory = join(root, 'wiki');
  const wikiDirectory = bundleDirectory(root);
  try {
    await stat(wikiDirectory);
    throw new Error('knowledge/ 已存在；迁移器只接受旧 wiki/ 布局。请运行 check 校验现有 bundle。');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await stat(legacyWikiDirectory);
  } catch {
    throw new Error('未找到待迁移的旧 wiki/ 目录');
  }
  const concepts = await loadConcepts(legacyWikiDirectory);
  const migrated = concepts.map((concept) => {
    const raw = migrateConceptDocument(concept.raw, { generatedAt, conceptPath: concept.path });
    const parsed = matter(raw);
    return {
      ...concept,
      raw,
      title: String(parsed.data.title || basename(concept.path, '.md')),
      description: String(parsed.data.description || ''),
    };
  });

  const legacyTemplateDirectory = join(root, 'templates');
  const templateDirectory = templatesDirectory(root);
  const templates = [];
  try {
    for (const entry of await readdir(legacyTemplateDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || extname(entry.name) !== '.json') continue;
      const file = join(legacyTemplateDirectory, entry.name);
      templates.push({ file, value: migrateTemplate(JSON.parse(await readFile(file, 'utf8'))) });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const stamp = generatedAt.replace(/[:.]/g, '-');
  const backup = join(root, DATA_LAYOUT.backups, `before-okf-${stamp}`);
  await mkdir(backup, { recursive: true });
  for (const directory of ['wiki', 'sources', 'resumes', 'templates', '.career-wiki']) {
    const source = join(root, directory);
    try {
      await stat(source);
      await cp(source, join(backup, directory), { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`备份 ${directory} 失败，迁移已中止: ${error.message}`);
      }
    }
  }
  const stateDirectory = join(root, DATA_LAYOUT.state);
  const stateBackupDirectory = join(backup, DATA_LAYOUT.state);
  await mkdir(stateBackupDirectory, { recursive: true });
  for (const entry of await readdir(stateDirectory, { withFileTypes: true })) {
    if (entry.isFile()) {
      await cp(join(stateDirectory, entry.name), join(stateBackupDirectory, entry.name));
    }
  }
  for (const directory of [DATA_LAYOUT.resumes, DATA_LAYOUT.templates]) {
    const source = join(root, directory);
    try {
      const entries = await readdir(source);
      if (entries.length > 0) {
        throw new Error(`${directory} 已包含数据；请先处理新旧状态目录冲突再迁移`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const staging = join(root, '.career-wiki-skill', `okf-staging-${stamp}`);
  const stagedBundle = join(staging, 'knowledge');
  const stagedTemplates = join(staging, 'templates');
  const stagedResumes = join(staging, 'resumes');
  await mkdir(stagedBundle, { recursive: true });
  await mkdir(stagedTemplates, { recursive: true });
  await mkdir(stagedResumes, { recursive: true });

  for (const concept of migrated) {
    const target = join(stagedBundle, concept.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, concept.raw, 'utf8');
  }
  await writeFile(join(stagedBundle, 'index.md'), buildRootIndex(migrated), 'utf8');

  const legacySources = join(root, 'sources');
  try {
    const rawDirectory = join(legacySources, 'raw');
    const rawFiles = await collectMarkdown(rawDirectory);
    for (const file of rawFiles) {
      const path = relative(rawDirectory, file).replaceAll('\\', '/');
      const target = join(stagedBundle, 'references', 'raw', path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, migrateReferenceDocument(await readFile(file, 'utf8'), {
        generatedAt,
        title: basename(path, '.md'),
      }), 'utf8');
    }
    const uploads = join(legacySources, 'uploads');
    await stat(uploads);
    await cp(uploads, join(stagedBundle, 'references', 'uploads'), { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  try {
    await cp(legacyTemplateDirectory, stagedTemplates, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const template of templates) {
    await writeFile(
      join(stagedTemplates, basename(template.file)),
      `${JSON.stringify(template.value, null, 2)}\n`,
      'utf8',
    );
  }
  const legacyResumes = join(root, 'resumes');
  try {
    await stat(legacyResumes);
    await cp(legacyResumes, stagedResumes, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const stagedCheck = await checkBundle(staging);
  if (stagedCheck.errors.length > 0) {
    throw new Error(`迁移 staging 校验失败:\n${stagedCheck.errors.join('\n')}`);
  }

  await rm(wikiDirectory, { recursive: true, force: true });
  await rm(templateDirectory, { recursive: true, force: true });
  await rm(join(root, DATA_LAYOUT.resumes), { recursive: true, force: true });
  await mkdir(dirname(wikiDirectory), { recursive: true });
  await mkdir(dirname(templateDirectory), { recursive: true });
  await rename(stagedBundle, wikiDirectory);
  await rename(stagedTemplates, templateDirectory);
  await rename(stagedResumes, join(root, DATA_LAYOUT.resumes));
  const configPath = join(root, DATA_LAYOUT.state, 'config.json');
  let config = {};
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(configPath, `${JSON.stringify({
    ...config,
    version: '2.0',
    okf_version: OKF_VERSION,
    root,
  }, null, 2)}\n`, 'utf8');
  await migrateAppState(root);
  await rm(staging, { recursive: true, force: true });
  for (const legacyDirectory of ['wiki', 'sources', 'resumes', 'templates', '.career-wiki']) {
    await rm(join(root, legacyDirectory), { recursive: true, force: true });
  }

  const checked = await checkBundle(root);
  if (checked.errors.length > 0) {
    throw new Error(`迁移后 OKF 校验失败:\n${checked.errors.join('\n')}`);
  }
  return { ...checked, backup };
}

async function main() {
  const { command, root } = parseArgs(process.argv);
  if (command === 'check') {
    const result = await checkBundle(root);
    if (result.errors.length > 0) {
      console.error(result.errors.join('\n'));
      process.exitCode = 1;
      return;
    }
    if (result.warnings.length > 0) console.warn(result.warnings.join('\n'));
    console.log(`OKF v${OKF_VERSION} 校验通过：${result.conceptCount} 个 concepts`);
    return;
  }
  const result = await migrateBundle(root);
  if (result.warnings.length > 0) console.warn(result.warnings.join('\n'));
  console.log(`OKF v${OKF_VERSION} 迁移完成：${result.conceptCount} 个 concepts`);
  console.log(`备份：${result.backup}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
