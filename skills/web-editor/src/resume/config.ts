import type {
  EntityType,
  ModuleInstance,
  PrivacyConfig,
  ResumeConfig,
  ResumeContentOverrides,
  ResumeHide,
  ResumePolishConfig,
} from '../types';
import { MODULE_LIBRARY } from '../types/index.ts';

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

/** 将可持久化简历配置投影为编辑区模块；展开状态仍由 React 管理。 */
export function projectResumeModules(
  config: ResumeConfig | null,
  wikiEntities: Array<{ path: string; entity: EntityType }>,
  expandedTypes: ReadonlySet<EntityType> = new Set(),
): ModuleInstance[] {
  return (config?.modules || []).map((type) => {
    const def = MODULE_LIBRARY.find((module) => module.type === type);
    return {
      id: `module-${type}`,
      type,
      label: def?.label || type,
      expanded: expandedTypes.has(type),
      overrides: getModuleContentOverrides(config?.content_overrides, type, wikiEntities),
      hiddenItemIds: getHiddenItemIds(config?.hide, type),
    };
  });
}

/** 从编辑区模块提取可持久化草稿字段，不携带 expanded 等界面状态。 */
export function getModuleDraftPatch(
  baseConfig: ResumeConfig,
  modules: ModuleInstance[],
): Pick<ResumeConfig, 'modules' | 'hide' | 'content_overrides'> {
  const next = createResumeConfig({
    resumeName: baseConfig.name,
    resumeId: baseConfig.id,
    templateId: baseConfig.template,
    privacy: baseConfig.privacy || {},
    modules,
    baseConfig,
    polish: baseConfig.polish,
    today: baseConfig.updated,
  });
  return {
    modules: next.modules,
    hide: next.hide,
    content_overrides: next.content_overrides,
  };
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
 * 将模块选择器的勾选结果同步到当前简历编排。
 * 已存在的模块实例会被保留，以免丢失编辑内容、隐藏项和排序；
 * 取消勾选只移除当前简历视角中的模块，不触碰 Wiki 数据。
 */
export function reconcileModuleSelection(
  currentModules: ModuleInstance[],
  selectedTypes: EntityType[],
  createModule: (type: EntityType) => ModuleInstance,
): ModuleInstance[] {
  const uniqueSelectedTypes = [...new Set(selectedTypes)];
  const selectedTypeSet = new Set(uniqueSelectedTypes);
  const retainedModules = currentModules.filter((module) => selectedTypeSet.has(module.type));
  const retainedTypes = new Set(retainedModules.map((module) => module.type));
  const addedModules = uniqueSelectedTypes
    .filter((type) => !retainedTypes.has(type))
    .map(createModule);

  return [...retainedModules, ...addedModules];
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
