import type {
  EntityType,
  ModuleInstance,
  PrivacyConfig,
  ResumeConfig,
  ResumeContentOverrides,
  ResumeHide,
  ResumePolishConfig,
} from '../types';

interface CreateResumeConfigInput {
  resumeName: string;
  resumeId: string;
  templateId: string;
  privacy: PrivacyConfig;
  modules: ModuleInstance[];
  baseConfig?: ResumeConfig;
  polish?: ResumePolishConfig;
  today?: string;
}

/** 从保存配置中恢复指定模块的隐藏条目，同时兼容仅含 fields 的旧配置。 */
export function getHiddenItemIds(
  hide: ResumeHide[] | undefined,
  module: EntityType,
): string[] {
  return (hide || [])
    .filter((entry) => entry.module === module)
    .flatMap((entry) => entry.items || []);
}

/** 从简历配置恢复指定模块的条目字段覆盖。 */
export function getModuleContentOverrides(
  contentOverrides: ResumeContentOverrides | undefined,
  module: EntityType,
  wikiEntities: Array<{ path: string; entity: EntityType }>,
): ResumeContentOverrides {
  const paths = new Set(
    wikiEntities.filter((entity) => entity.entity === module).map((entity) => entity.path),
  );
  return Object.fromEntries(
    Object.entries(contentOverrides || {}).filter(([path]) => paths.has(path)),
  );
}

/**
 * 写入条目级手动覆盖；恢复为当前继承值时移除冗余覆盖。
 * 继承值已经包含有效 AI 润色，因此手动撤销后会自然回到“AI 润色或 Wiki 原文”。
 */
export function updateContentOverride(
  contentOverrides: ResumeContentOverrides,
  itemPath: string,
  field: string,
  value: unknown,
  inheritedValue: unknown,
): ResumeContentOverrides {
  const next = { ...contentOverrides };
  const itemOverrides = { ...(next[itemPath] || {}) };

  if (String(value ?? '') === String(inheritedValue ?? '')) {
    delete itemOverrides[field];
  } else {
    itemOverrides[field] = value;
  }

  if (Object.keys(itemOverrides).length === 0) {
    delete next[itemPath];
  } else {
    next[itemPath] = itemOverrides;
  }
  return next;
}

/** 将编辑器状态转换成可保存配置，隐藏项只记录当前简历视角。 */
export function createResumeConfig({
  resumeName,
  resumeId,
  templateId,
  privacy,
  modules,
  baseConfig,
  polish,
  today = new Date().toISOString().slice(0, 10),
}: CreateResumeConfigInput): ResumeConfig {
  const fieldHides: ResumeHide[] = (baseConfig?.hide || [])
    .filter((entry) => (entry.fields?.length || 0) > 0)
    .map((entry) => ({
      module: entry.module,
      fields: [...(entry.fields || [])],
      ...(entry.reason ? { reason: entry.reason } : {}),
    }));
  const itemHides: ResumeHide[] = modules
    .filter((module) => module.hiddenItemIds.length > 0)
    .map((module) => ({
      module: module.type,
      items: [...module.hiddenItemIds],
    }));
  const contentOverrides: ResumeContentOverrides = Object.assign(
    {},
    ...modules.map((module) => module.overrides || {}),
  );

  return {
    ...baseConfig,
    name: resumeName,
    id: resumeId || resumeName.toLowerCase().replace(/\s+/g, '-'),
    template: templateId,
    created: baseConfig?.created || today,
    updated: today,
    modules: modules.map((module) => module.type),
    privacy,
    polish: polish ?? baseConfig?.polish ?? { enabled: false },
    content_overrides: contentOverrides,
    hide: [...fieldHides, ...itemHides],
  };
}
