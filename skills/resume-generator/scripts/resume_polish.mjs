/**
 * 简历润色的确定性辅助函数。
 *
 * Agent 负责根据用户原始输入生成润色结果；本模块只负责：
 * - 为原始项目事实生成稳定指纹
 * - 校验润色结果是否仍对应当前 Wiki 内容
 * - 将通过校验的 description / responsibilities 应用到简历视角
 */

export const POLISH_FIELDS = ['description', 'responsibilities', 'content'];
export const DEFAULT_POLISH_FIELDS = [...POLISH_FIELDS];

/** 返回当前配置允许生成的字段；尚未配置时使用产品默认值。 */
export function getSelectedPolishFields(config = {}) {
  if (!Array.isArray(config?.polish?.selected_fields)) return DEFAULT_POLISH_FIELDS;
  return POLISH_FIELDS.filter((field) => config.polish.selected_fields.includes(field));
}

function normalizeSourceValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalizeSourceValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeSourceValue(value[key])]),
    );
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 为当前实体的原始事实生成跨 Node/浏览器一致的短指纹。
 * 使用 FNV-1a 是为了让前端实时预览无需异步调用 Web Crypto。
 */
export function buildPolishSourceHash(fields = {}) {
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

function hasText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

function getEntry(config, path) {
  const entries = config?.polish?.entries;
  if (!entries || typeof entries !== 'object') return null;
  const raw = entries[path];
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.fields || typeof raw.fields !== 'object') return null;
  return raw;
}

/**
 * 返回一个项目/经历的润色状态，并且不修改任何输入。
 * 无 source_hash 的结果被视为 unverified，不直接进入简历，避免 stale 文案混入。
 */
export function getPolishStatus(originalFields = {}, path, config = {}) {
  const targetFields = getSelectedPolishFields(config).filter((field) => hasText(originalFields[field]));
  const sourceHash = buildPolishSourceHash(originalFields);
  if (targetFields.length === 0) {
    return {
      path,
      status: 'not_applicable',
      source_hash: sourceHash,
      target_fields: [],
      applied_fields: [],
      missing_fields: [],
      stale_fields: [],
    };
  }

  if (config?.polish?.enabled === false) {
    return {
      path,
      status: 'disabled',
      source_hash: sourceHash,
      target_fields: targetFields,
      applied_fields: [],
      missing_fields: targetFields,
      stale_fields: [],
    };
  }

  const entry = getEntry(config, path);
  if (!entry) {
    return {
      path,
      status: 'missing',
      source_hash: sourceHash,
      target_fields: targetFields,
      applied_fields: [],
      missing_fields: targetFields,
      stale_fields: [],
    };
  }

  if (!entry.source_hash) {
    return {
      path,
      status: 'unverified',
      source_hash: sourceHash,
      target_fields: targetFields,
      applied_fields: [],
      missing_fields: targetFields,
      stale_fields: [],
    };
  }

  if (entry.source_hash !== sourceHash) {
    return {
      path,
      status: 'stale',
      source_hash: sourceHash,
      target_fields: targetFields,
      applied_fields: [],
      missing_fields: [],
      stale_fields: targetFields,
    };
  }

  const polishedFields = entry.fields || {};
  const appliedFields = targetFields.filter((field) => hasText(polishedFields[field]));
  const missingFields = targetFields.filter((field) => !hasText(polishedFields[field]));
  return {
    path,
    status: appliedFields.length === targetFields.length ? 'applied' : 'partial',
    source_hash: sourceHash,
    target_fields: targetFields,
    applied_fields: appliedFields,
    missing_fields: missingFields,
    stale_fields: [],
  };
}

/** 应用当前指纹匹配的润色字段；未通过校验时原样返回。 */
export function applyPolish(originalFields = {}, path, config = {}) {
  const status = getPolishStatus(originalFields, path, config);
  if (!['applied', 'partial'].includes(status.status)) {
    return { fields: { ...originalFields }, status };
  }

  const entry = getEntry(config, path);
  const polishedFields = entry?.fields || {};
  const fields = { ...originalFields };
  for (const field of status.applied_fields) {
    fields[field] = polishedFields[field];
  }
  return { fields, status };
}
