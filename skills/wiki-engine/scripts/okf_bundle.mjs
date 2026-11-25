#!/usr/bin/env node

import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveWorkspaceRoot, rootArgument } from '../../env-init/scripts/workspace_root.mjs';
import matter from 'gray-matter';
import {
  extractConceptLinks,
  migrateConceptDocument,
  migrateReferenceDocument,
  OKF_VERSION,
  validateConceptDocument,
} from './okf.mjs';
import { DATA_LAYOUT, bundleDirectory } from './layout.mjs';

const RESERVED_FILES = new Set(['index.md', 'log.md']);

async function collectMarkdown(directory, skip) {
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
    if (path === skip) continue;
    if (entry.isDirectory()) files.push(...await collectMarkdown(path, skip));
    else if (entry.isFile() && extname(entry.name) === '.md' && !RESERVED_FILES.has(entry.name)) {
      files.push(path);
    }
  }
  return files;
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

async function loadConcepts(wikiDirectory, skip) {
  const files = await collectMarkdown(wikiDirectory, skip);
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

async function readObject(path, label) {
  let value;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error(`${label}: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return value;
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function requireValidBundle(root) {
  const checked = await checkBundle(root);
  if (checked.errors.length) throw new Error(`staging 校验失败:\n${checked.errors.join('\n')}`);
  return checked;
}

// Record each successful rename before proceeding; unwind in reverse order on failure.
async function replace(paths, work) {
  const previous = join(work, 'previous');
  await mkdir(previous);
  const moved = [];
  async function move(from, to) {
    await rename(from, to);
    moved.push([from, to]);
  }
  try {
    for (const [index, { target, replacement, archive }] of paths.entries()) {
      if (await exists(target)) await move(target, archive ?? join(previous, String(index)));
      if (replacement) await move(replacement, target);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const [from, to] of moved.reverse()) {
      try {
        await rename(to, from);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    if (rollbackErrors.length) {
      throw Object.assign(new Error(`${error.message}；回滚未完成，保留工作目录 ${work}: ${rollbackErrors.join('; ')}`), { keepWork: true });
    }
    throw error;
  }
}

async function withWorkspaceWrite(root, write) {
  const state = join(root, DATA_LAYOUT.state);
  await mkdir(state, { recursive: true });
  const lock = join(state, 'wiki-write.lock');
  await mkdir(lock);
  let work;
  let keepWork;
  try {
    work = await mkdtemp(join(state, 'wiki-staging-'));
    return await write(work);
  } catch (error) {
    keepWork = error.keepWork;
    throw error;
  } finally {
    if (work && !keepWork) await rm(work, { recursive: true });
    await rm(lock, { recursive: true });
  }
}

export async function checkBundle(root) {
  const wikiDirectory = bundleDirectory(root);
  const concepts = await loadConcepts(wikiDirectory, join(root, DATA_LAYOUT.referencesUploads));
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
  return withWorkspaceWrite(root, async (work) => {
    const wikiDirectory = bundleDirectory(root);
    const legacyWiki = join(root, 'wiki');
    if (await exists(wikiDirectory)) throw new Error('knowledge/ 已存在；不会覆盖新布局数据');
    if (!await exists(legacyWiki)) throw new Error('未找到待迁移的旧 wiki/ 目录');

    const stagedBundle = bundleDirectory(work);
    const state = join(root, DATA_LAYOUT.state);
    const stagedState = join(work, DATA_LAYOUT.state);
    const configName = 'config.json';
    const checkpointName = 'interview-checkpoint.json';
    const config = await readObject(join(state, configName), configName);
    const checkpoint = await readObject(join(state, checkpointName), checkpointName);
    if (checkpoint && (typeof checkpoint.status !== 'string'
        || (checkpoint.interview_file !== undefined && typeof checkpoint.interview_file !== 'string'))) {
      throw new Error(`${checkpointName}: 无效的采访断点`);
    }
    await mkdir(stagedBundle);
    await mkdir(stagedState);
    await writeFile(join(stagedState, configName), `${JSON.stringify({ ...config,
      version: '2.0', okf_version: OKF_VERSION, root,
    }, null, 2)}\n`);
    if (checkpoint) {
      await writeFile(join(stagedState, checkpointName), `${JSON.stringify(migrateCheckpoint(checkpoint), null, 2)}\n`);
    }
    const paths = [
      { target: wikiDirectory, replacement: stagedBundle },
      { target: join(state, configName), replacement: join(stagedState, configName) },
      ...(checkpoint ? [{ target: join(state, checkpointName), replacement: join(stagedState, checkpointName) }] : []),
    ];
    for (const name of ['templates', 'resumes']) {
      const target = join(root, DATA_LAYOUT[name]);
      if (await exists(target) && (await readdir(target)).length) {
        throw new Error(`${DATA_LAYOUT[name]} 已包含数据；不会覆盖新布局数据`);
      }
      const source = join(root, name);
      const replacement = join(work, DATA_LAYOUT[name]);
      if (await exists(source)) await cp(source, replacement, { recursive: true });
      else await mkdir(replacement);
      for (const entry of await readdir(replacement, { withFileTypes: true })) {
        if (!entry.isFile() || extname(entry.name) !== '.json') continue;
        const file = join(replacement, entry.name);
        const value = await readObject(file, `${name}/${entry.name}`);
        if (name === 'templates') await writeFile(file, `${JSON.stringify(migrateTemplate(value), null, 2)}\n`);
      }
      paths.push({ target, replacement });
    }

    const migrated = [];
    for (const concept of await loadConcepts(legacyWiki)) {
      const raw = migrateConceptDocument(concept.raw, { generatedAt, conceptPath: concept.path });
      const { data } = matter(raw);
      migrated.push({ path: concept.path, title: String(data.title || basename(concept.path, '.md')),
        description: String(data.description || '') });
      const file = join(stagedBundle, concept.path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, raw);
    }
    await writeFile(join(stagedBundle, 'index.md'), buildRootIndex(migrated));
    const rawDirectory = join(root, 'sources', 'raw');
    for (const file of await collectMarkdown(rawDirectory)) {
      const path = relative(rawDirectory, file);
      const target = join(work, DATA_LAYOUT.referencesRaw, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, migrateReferenceDocument(await readFile(file, 'utf8'), {
        generatedAt, title: basename(path, '.md'),
      }));
    }
    const uploads = join(root, 'sources', 'uploads');
    if (await exists(uploads)) await cp(uploads, join(work, DATA_LAYOUT.referencesUploads), { recursive: true });
    const checked = await requireValidBundle(work);

    const legacy = ['wiki', 'sources', 'resumes', 'templates', '.career-wiki'];
    await mkdir(join(root, DATA_LAYOUT.backups), { recursive: true });
    const backup = await mkdtemp(join(root, DATA_LAYOUT.backups, 'before-okf-'));
    const archive = [];
    for (const name of legacy) {
      const target = join(root, name);
      if (await exists(target)) archive.push({ target, archive: join(backup, name) });
    }
    const stateBackup = join(backup, DATA_LAYOUT.state);
    await mkdir(stateBackup);
    for (const entry of await readdir(state, { withFileTypes: true })) {
      if (entry.isFile()) await cp(join(state, entry.name), join(stateBackup, entry.name));
    }
    await replace([...archive, ...paths], work);
    return { ...checked, backup };
  });
}

export async function publishBundle(root, candidateRoot) {
  return withWorkspaceWrite(root, async (work) => {
    const live = bundleDirectory(root);
    const staging = bundleDirectory(work);
    const candidate = bundleDirectory(candidateRoot);
    if (resolve(candidateRoot) === resolve(root)) throw new Error('staging 必须与 WorkspaceRoot 分开');
    const index = join(candidate, 'index.md');
    await readFile(index, 'utf8');
    const generated = (concept) => {
      const data = matter(concept.raw).data;
      return /^career\./.test(data.type) && /^(career-wiki-agent(?:\/|$)|process:career-wiki-okf-migration$)/.test(data.generated?.by);
    };
    const attachments = join(root, DATA_LAYOUT.referencesUploads);
    const old = (await loadConcepts(live, attachments)).filter(generated);
    const incoming = await loadConcepts(candidate);
    const replaceable = new Set(old.map(({ path }) => path));
    await cp(live, staging, { recursive: true, filter: (path) => path !== attachments });
    for (const { path } of old) await rm(join(staging, path));
    for (const concept of incoming) {
      const { path, raw } = concept;
      if (path.startsWith('references/') || !generated(concept)) {
        throw new Error(`staging 只接受生成的 Career Wiki 页面: ${path}`);
      }
      const target = join(staging, path);
      if (await exists(target)) throw new Error(`将覆盖现有页面，发布已停止: ${path}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, raw, { flag: 'wx' });
      replaceable.delete(path);
    }
    await cp(index, join(staging, 'index.md'));
    const checked = await requireValidBundle(work);
    await mkdir(join(root, DATA_LAYOUT.backups), { recursive: true });
    const backup = await mkdtemp(join(root, DATA_LAYOUT.backups, 'before-compile-'));
    const paths = [];
    for (const path of ['index.md', ...replaceable, ...incoming.map((concept) => concept.path)]) {
      const target = join(live, path);
      const archive = join(backup, path);
      await mkdir(dirname(target), { recursive: true });
      await mkdir(dirname(archive), { recursive: true });
      paths.push({ target, archive, replacement: replaceable.has(path) ? undefined : join(staging, path) });
    }
    await replace(paths, work);
    return { ...checked, backup };
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['check', 'migrate', 'publish'].includes(command)) {
    throw new Error('用法: node okf_bundle.mjs <check|migrate|publish <staging>> [--root <数据根目录>]');
  }
  const candidate = command === 'publish' ? args.shift() : undefined;
  if (command === 'publish' && (!candidate || candidate.startsWith('--'))) throw new Error('publish 需要 staging 路径');
  const root = resolveWorkspaceRoot(rootArgument(args));
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
  const result = command === 'publish' ? await publishBundle(root, candidate) : await migrateBundle(root);
  if (result.warnings.length > 0) console.warn(result.warnings.join('\n'));
  console.log(`OKF v${OKF_VERSION} ${command === 'publish' ? '发布' : '迁移'}完成：${result.conceptCount} 个 concepts`);
  console.log(`备份：${result.backup}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
