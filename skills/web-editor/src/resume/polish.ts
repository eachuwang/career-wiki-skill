import type { ResumePolishConfig, ResumePolishField, WikiEntity } from '../types';

export const POLISH_FIELDS = ['description', 'responsibilities', 'content'] as const;
export const DEFAULT_POLISH_FIELDS: ResumePolishField[] = [...POLISH_FIELDS];
export const POLISH_FIELD_OPTIONS: Array<{ field: ResumePolishField; label: string; description: string }> = [
  { field: 'description', label: '项目描述', description: '项目做什么、解决什么问题' },
  { field: 'content', label: '个人优势', description: '个人优势与职业概述' },
  { field: 'responsibilities', label: '岗位职责', description: '在项目或工作中的具体职责' },
];

/** 返回当前简历选中的润色字段；尚未配置时使用界面默认值。 */
export function getSelectedPolishFields(config?: ResumePolishConfig): ResumePolishField[] {
  if (!Array.isArray(config?.selected_fields)) return DEFAULT_POLISH_FIELDS;
  return POLISH_FIELDS.filter((field) => config.selected_fields?.includes(field));
}
function normalizeSourceValue(value: unknown): unknown {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalizeSourceValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, normalizeSourceValue((value as Record<string, unknown>)[key])]),
    );
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 与 API server 保持一致的轻量 FNV-1a 指纹。 */
export function buildPolishSourceHash(fields: Record<string, unknown>): string {
  const source = JSON.stringify(
    Object.keys(fields)
      .sort()
      .map((field) => [field, normalizeSourceValue(fields[field])]),
  );
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 只把和当前 Wiki 原文匹配的润色结果放入预览。 */
export function applyPolishToEntities(
  entities: WikiEntity[],
  config?: ResumePolishConfig,
): WikiEntity[] {
  if (!config || config.enabled === false) return entities;
  const selectedFields = getSelectedPolishFields(config);

  return entities.map((entity) => {
    if (!['project', 'experience', 'summary'].includes(entity.entity)) return entity;
    const entry = config.entries?.[entity.path];
    if (!entry || entry.source_hash !== buildPolishSourceHash(entity.fields)) return entity;

    const fields = { ...entity.fields };
    for (const field of selectedFields) {
      const value = entry.fields?.[field];
      if (typeof value === 'string' && value.trim()) fields[field] = value;
    }
    return { ...entity, fields };
  });
}
