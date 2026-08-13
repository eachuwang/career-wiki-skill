import matter from 'gray-matter';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { bundleDirectory } from './layout.mjs';
import { isEntityDeleted, readDeletionManifest } from './delete_entity.mjs';
import {
  extractConceptLinks,
  parseCareerEntity,
  sourceResources,
  validateConceptDocument,
} from './okf.mjs';

export const CAREER_ENTITY_DIRECTORIES = Object.freeze({
  person: 'persons',
  experience: 'experiences',
  project: 'projects',
  skill: 'skills',
  education: 'education',
  certificate: 'certificates',
  award: 'awards',
  publication: 'publications',
  activity: 'activities',
  summary: 'summaries',
});

const META_KEYS = new Set([
  'type',
  'title',
  'resource',
  'tags',
  'sources',
  'usage_window',
  'generated',
  'verified',
  'status',
  'stale_after',
]);

async function collectMarkdown(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdown(path));
    else if (entry.isFile() && extname(entry.name) === '.md'
        && entry.name !== 'index.md' && entry.name !== 'log.md') {
      files.push(path);
    }
  }
  return files;
}

function trustTier(verified) {
  const events = Array.isArray(verified) ? verified : verified ? [verified] : [];
  if (events.some((event) => String(event?.by || '').startsWith('human:'))) {
    return 'human-reviewed';
  }
  return events.length > 0 ? 'machine-confirmed' : 'unverified';
}

async function readCareerEntity(file, knowledgeDirectory) {
  const raw = await readFile(file, 'utf8');
  const path = relative(knowledgeDirectory, file).replaceAll('\\', '/');
  const errors = validateConceptDocument(raw);
  if (errors.length > 0) throw new Error(`${path}: ${errors.join('; ')}`);
  const parsed = matter(raw);
  const entity = parseCareerEntity(parsed.data);
  if (!entity) throw new Error(`${path}: type 必须是受支持的 career.* concept`);
  const links = extractConceptLinks(parsed.content || '', path);
  const fields = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => !META_KEYS.has(key)),
  );
  return {
    path,
    entity,
    title: parsed.data.title,
    trustTier: trustTier(parsed.data.verified),
    sources: sourceResources(parsed.data),
    fields,
    relations: links.map(({ type, target }) => ({ type, target })),
    links,
    content: parsed.content || '',
  };
}

/**
 * 读取 Career Wiki 的严格 OKF bundle，返回供简历、图谱和 HTTP adapter 共用的快照。
 */
export async function loadCareerKnowledge(root, options = {}) {
  const { entity: requestedEntity, includeContent = true } = options;
  if (requestedEntity && !Object.hasOwn(CAREER_ENTITY_DIRECTORIES, requestedEntity)) {
    throw new Error(`不支持的 Career 实体类型：${requestedEntity}`);
  }
  const knowledgeDirectory = bundleDirectory(root);
  const deletions = await readDeletionManifest(root);
  const directories = requestedEntity
    ? [CAREER_ENTITY_DIRECTORIES[requestedEntity]]
    : Object.values(CAREER_ENTITY_DIRECTORIES);
  const files = (
    await Promise.all(
      directories.map((directory) => collectMarkdown(join(knowledgeDirectory, directory))),
    )
  ).flat().sort();
  const parsedEntities = await Promise.all(
    files.map((file) => readCareerEntity(file, knowledgeDirectory)),
  );
  const entities = parsedEntities
    .filter((entity) => !isEntityDeleted(entity, deletions))
    .map((entity) => {
      if (includeContent) return entity;
      const { content: _content, ...lightweight } = entity;
      return lightweight;
    });
  const entityPaths = new Set(entities.map((entity) => entity.path));
  const allRelations = entities.flatMap((entity) =>
    entity.relations
      .filter((relation) => entityPaths.has(relation.target))
      .map((relation) => ({
        from: entity.path,
        to: relation.target,
        type: relation.type,
      })),
  );
  return { entities, allRelations, total: entities.length };
}
