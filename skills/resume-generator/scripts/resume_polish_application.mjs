import {
  CAREER_ENTITY_DIRECTORIES,
  loadCareerKnowledge,
} from 'career-wiki-wiki-engine/career-knowledge';
import {
  buildPolishSourceHash,
  getPolishStatus,
  getSelectedPolishFields,
  POLISH_FIELDS,
} from './resume_polish.mjs';
import {
  generatePolishEntries,
  listProviderModels,
} from './resume_polish_provider.mjs';

function applicationError(message, statusCode, details = {}) {
  return Object.assign(new Error(message), { statusCode, ...details });
}

function resolveOnly(value) {
  if (value == null) return null;
  if (
    typeof value !== 'object'
    || typeof value.path !== 'string'
    || !POLISH_FIELDS.includes(String(value.field))
  ) {
    throw applicationError('换一换参数无效', 400);
  }
  return value;
}

function visibleEntities(entities, config, module) {
  const hidden = new Set(
    (config.hide || [])
      .filter((entry) => entry.module === module)
      .flatMap((entry) => (Array.isArray(entry.items) ? entry.items.map(String) : [])),
  );
  return entities.filter((entity) => !hidden.has(String(entity.path)));
}

async function resolveConfig(appState, request) {
  if (request.resume_id) return appState.getResume(request.resume_id);
  if (request.config && typeof request.config === 'object') return request.config;
  throw applicationError('缺少 resume_id 或 config', 400);
}

async function buildContext(root, config, only) {
  const modules = Array.isArray(config.modules) && config.modules.length > 0
    ? config.modules
    : ['experience', 'project'];
  const targetModules = modules.filter((module) =>
    ['experience', 'project', 'summary'].includes(module),
  );
  const selectedFields = only?.field ? [only.field] : getSelectedPolishFields(config);
  const candidates = [];
  const styleSamples = [];

  for (const module of targetModules) {
    if (!Object.hasOwn(CAREER_ENTITY_DIRECTORIES, module)) continue;
    const snapshot = await loadCareerKnowledge(root, { entity: module });
    for (const entity of visibleEntities(snapshot.entities, config, module)) {
      if (only?.path && entity.path !== only.path) continue;
      const source = {};
      for (const field of [
        'description',
        'responsibilities',
        'role',
        'tech_stack',
        'challenges',
        'solutions',
        'outcomes',
        'learnings',
        'content',
      ]) {
        if (entity.fields[field] !== undefined) source[field] = entity.fields[field];
      }
      const status = getPolishStatus(entity.fields, entity.path, {
        ...config,
        polish: { ...(config.polish || {}), selected_fields: selectedFields },
      });
      candidates.push({
        path: entity.path,
        entity: module,
        name: entity.fields.name || entity.fields.company || '',
        source,
        source_hash: buildPolishSourceHash(entity.fields),
        target_fields: selectedFields.filter((field) => source[field]),
        status,
      });
      for (const field of selectedFields) {
        const value = entity.fields[field];
        if (typeof value === 'string' && value.trim()) {
          styleSamples.push({ entity: module, field, text: value });
        }
      }
    }
  }

  return {
    resume: {
      id: config.id || '',
      name: config.name || '',
      target: config.target || null,
    },
    candidates,
    selected_fields: selectedFields,
    style_samples: styleSamples,
    instructions: {
      output_path: 'polish.entries[<wiki path>]',
      output_shape: {
        source_hash: 'candidate.source_hash',
        fields: {
          description: '润色后的项目描述',
          content: '润色后的个人优势',
          responsibilities: '润色后的岗位职责',
        },
      },
      rules: [
        '只基于 source 和 style_samples 改写，不补造事实、数字、技术或结果。',
        '可以结合 resume.target 调整信息排序和表达重点，但不能改变事实内容。',
        '优先保留用户原有词汇、句式和语气；短输入只做必要的语义补全。',
        '项目描述和岗位职责分别处理，不把职责改成项目介绍。',
        '如果原文已经完整，只做语病、结构和简历可读性调整。',
        '输出简洁、自然、像用户自己写的中文，不使用空泛的 AI 套话。',
      ],
    },
  };
}

export function createResumePolish({
  root,
  appState,
  now = () => new Date(),
  generateEntries = generatePolishEntries,
  listModels = listProviderModels,
}) {
  return {
    async buildContext(request = {}) {
      const config = await resolveConfig(appState, request);
      return buildContext(root, config, resolveOnly(request.only));
    },

    async generate(request = {}) {
      const config = await resolveConfig(appState, request);
      const context = await buildContext(root, config, resolveOnly(request.only));
      const entries = await generateEntries(context, request.provider);
      const existingEntries = config.polish?.entries || {};
      const mergedEntries = { ...existingEntries };
      for (const entry of entries) {
        mergedEntries[entry.path] = {
          source_hash: entry.source_hash,
          fields: {
            ...(existingEntries[entry.path]?.fields || {}),
            ...entry.fields,
          },
          updated_at: now().toISOString(),
        };
      }
      return {
        config: {
          ...config,
          polish: {
            ...(config.polish || {}),
            enabled: true,
            entries: mergedEntries,
          },
        },
        generated_count: entries.length,
        candidate_count: context.candidates.length,
      };
    },

    async listModels(request = {}) {
      return listModels(request.provider || {});
    },
  };
}
