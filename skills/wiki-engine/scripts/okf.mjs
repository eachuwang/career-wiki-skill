import matter from 'gray-matter';
import { posix } from 'node:path';

export const OKF_VERSION = '0.2';
export const CAREER_CONCEPT_PREFIX = 'career.';
const LEGACY_WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const MARKDOWN_LINK_RE = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;

const TITLE_FIELDS = {
  person: ['name'],
  experience: ['company', 'role'],
  project: ['name'],
  skill: ['name'],
  education: ['school', 'degree'],
  certificate: ['name'],
  award: ['name'],
  publication: ['publication_title'],
  activity: ['name'],
  summary: ['content'],
};

export function parseCareerEntity(frontmatter) {
  const type = typeof frontmatter?.type === 'string' ? frontmatter.type : '';
  if (!type.startsWith(CAREER_CONCEPT_PREFIX)) return null;
  const entity = type.slice(CAREER_CONCEPT_PREFIX.length);
  return Object.hasOwn(TITLE_FIELDS, entity) ? entity : null;
}

function titleFor(entity, frontmatter) {
  const values = (TITLE_FIELDS[entity] || [])
    .map((field) => String(frontmatter[field] || '').trim())
    .filter(Boolean);
  return values.join(' · ') || entity;
}

function normalizeSource(source) {
  if (source && typeof source === 'object' && typeof source.resource === 'string') {
    return { ...source };
  }
  const legacy = String(source || '').trim().replace(/^\.?\//, '');
  const resource = legacy.startsWith('sources/raw/')
    ? `/references/raw/${legacy.slice('sources/raw/'.length)}`
    : legacy.startsWith('sources/uploads/')
      ? `/references/uploads/${legacy.slice('sources/uploads/'.length)}`
      : legacy;
  return { resource };
}

export function migrateLegacyLinks(content) {
  return content.replace(LEGACY_WIKILINK_RE, (_match, rawTarget, rawTitle) => {
    const target = String(rawTarget).trim().replace(/^wiki\//, '').replace(/\.md$/i, '');
    const title = String(rawTitle || target).trim();
    return `[${title}](/${target}.md)`;
  });
}

function migrateLegacyRelations(relations) {
  if (!Array.isArray(relations) || relations.length === 0) return '';
  const links = relations.flatMap((relation) => {
    if (!relation || typeof relation !== 'object') return [];
    const relationType = String(relation.type || 'references').trim();
    const target = String(relation.target || '').trim().replace(/^wiki\//, '').replace(/\.md$/i, '');
    if (!target) return [];
    const label = String(relation.label || posix.basename(target)).trim();
    return [`- ${relationType}: [${label}](/${target}.md)`];
  });
  return links.length > 0 ? `\n\n## Relationships\n\n${links.join('\n')}\n` : '';
}

export function migrateConceptDocument(raw, options = {}) {
  const parsed = matter(raw);
  const legacy = { ...(parsed.data || {}) };
  const entity = legacy.entity || parseCareerEntity(legacy);
  if (!Object.hasOwn(TITLE_FIELDS, entity)) {
    throw new Error(`无法迁移未知 Career 概念类型：${entity || legacy.type || 'missing'}`);
  }

  const domainType = legacy.type;
  delete legacy.entity;
  delete legacy.type;

  if (entity === 'experience' && domainType && !String(domainType).startsWith(CAREER_CONCEPT_PREFIX)) {
    legacy.employment_type = domainType;
  }
  if (entity === 'summary' && domainType && !String(domainType).startsWith(CAREER_CONCEPT_PREFIX)) {
    legacy.summary_type = domainType;
  }
  if (entity === 'person' && legacy.title) {
    legacy.current_title = legacy.title;
  }
  if (entity === 'publication' && legacy.title) {
    legacy.publication_title = legacy.title;
  }

  const sources = (Array.isArray(legacy.sources) ? legacy.sources : [legacy.sources])
    .filter(Boolean)
    .map(normalizeSource);
  const title = titleFor(entity, legacy);
  const description = typeof legacy.description === 'string'
    ? legacy.description.split(/\r?\n/, 1)[0].trim()
    : undefined;
  delete legacy.sources;
  delete legacy.title;
  delete legacy.description;
  const confidence = legacy.confidence;
  delete legacy.confidence;
  const relationSection = migrateLegacyRelations(legacy.relations);
  delete legacy.relations;

  const frontmatter = {
    type: `${CAREER_CONCEPT_PREFIX}${entity}`,
    title,
    ...(description ? { description } : {}),
    status: legacy.status || 'stable',
    generated: legacy.generated || {
      by: 'process:career-wiki-okf-migration',
      at: options.generatedAt || new Date().toISOString(),
    },
    ...(legacy.verified || confidence === 'verified'
      ? {
          verified: legacy.verified || {
            by: 'human:career-wiki-user',
            at: options.generatedAt || new Date().toISOString(),
          },
        }
      : {}),
    sources,
    ...legacy,
  };

  return matter.stringify(`${migrateLegacyLinks(parsed.content || '').trimEnd()}${relationSection}`, frontmatter);
}

export function migrateReferenceDocument(raw, options = {}) {
  const parsed = matter(raw);
  const legacy = { ...(parsed.data || {}) };
  const title = String(
    legacy.title || legacy.original_file || options.title || 'Source material',
  ).trim();
  delete legacy.type;
  delete legacy.title;
  delete legacy.sources;
  delete legacy.generated;
  delete legacy.verified;
  delete legacy.status;
  return matter.stringify(parsed.content || '', {
    type: 'Reference',
    title,
    status: 'stable',
    generated: {
      by: 'process:career-wiki-okf-migration',
      at: options.generatedAt || new Date().toISOString(),
    },
    ...legacy,
  });
}

export function validateConceptDocument(raw) {
  const parsed = matter(raw);
  const frontmatter = parsed.data || {};
  const errors = [];
  if (typeof frontmatter.type !== 'string' || !frontmatter.type.trim()) {
    errors.push('frontmatter.type 必须是非空字符串');
  }
  for (const legacyKey of ['entity', 'confidence', 'relations']) {
    if (Object.hasOwn(frontmatter, legacyKey)) {
      errors.push(`不允许旧字段 frontmatter.${legacyKey}`);
    }
  }
  if (frontmatter.sources != null && !Array.isArray(frontmatter.sources)) {
    errors.push('frontmatter.sources 必须是对象数组');
  }
  const sources = Array.isArray(frontmatter.sources) ? frontmatter.sources : [];
  sources.forEach((source, index) => {
    if (!source || typeof source !== 'object' || typeof source.resource !== 'string' || !source.resource.trim()) {
      errors.push(`sources[${index}] 必须是包含 resource 的对象`);
    }
  });
  if (frontmatter.generated != null) {
    if (!frontmatter.generated || typeof frontmatter.generated !== 'object'
        || typeof frontmatter.generated.by !== 'string' || !frontmatter.generated.by.trim()) {
      errors.push('generated 必须是包含非空 by 的对象');
    }
  }
  const verifications = Array.isArray(frontmatter.verified)
    ? frontmatter.verified
    : frontmatter.verified == null
      ? []
      : [frontmatter.verified];
  verifications.forEach((verification, index) => {
    if (!verification || typeof verification !== 'object'
        || typeof verification.by !== 'string' || !verification.by.trim()
        || typeof verification.at !== 'string' || !verification.at.trim()) {
      errors.push(`verified[${index}] 必须是包含非空 by 和 at 的对象`);
    }
  });
  if (frontmatter.status != null && !['draft', 'stable', 'deprecated'].includes(frontmatter.status)) {
    errors.push('status 必须是 draft、stable 或 deprecated');
  }
  if (frontmatter.stale_after != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(frontmatter.stale_after))) {
    errors.push('stale_after 必须是 YYYY-MM-DD');
  }
  if (LEGACY_WIKILINK_RE.test(parsed.content || '')) {
    errors.push('正文必须使用标准 Markdown 链接，不能使用 [[wikilink]]');
  }
  LEGACY_WIKILINK_RE.lastIndex = 0;
  return errors;
}

export function sourceResources(frontmatter) {
  return Array.isArray(frontmatter.sources)
    ? frontmatter.sources.map((source) => source.resource)
    : [];
}

export function extractConceptLinks(content, conceptPath) {
  const links = [];
  const re = new RegExp(MARKDOWN_LINK_RE.source, 'g');
  let match;
  while ((match = re.exec(content)) !== null) {
    const name = match[1].trim();
    const href = match[2].trim().split(/[?#]/, 1)[0];
    if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#')) continue;
    const target = href.startsWith('/')
      ? href.slice(1)
      : posix.normalize(posix.join(posix.dirname(conceptPath), href));
    if (!target.endsWith('.md') || target === 'index.md' || target.endsWith('/index.md')) continue;
    const lineStart = content.lastIndexOf('\n', match.index) + 1;
    const prefix = content.slice(lineStart, match.index);
    const relationMatch = /^\s*[-*+]\s+([a-z][a-z0-9_-]*):\s*$/i.exec(prefix);
    links.push({
      target: posix.normalize(target),
      name,
      type: relationMatch?.[1] || 'references',
    });
  }
  return links;
}
