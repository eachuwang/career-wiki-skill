import type {
  EntityType,
  ModuleInstance,
  PrivacyConfig,
  ResumeConfig,
  ResumeHide,
} from '../types';

interface CreateResumeConfigInput {
  resumeName: string;
  resumeId: string;
  templateId: string;
  privacy: PrivacyConfig;
  modules: ModuleInstance[];
  baseConfig?: ResumeConfig;
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

/** 将编辑器状态转换成可保存配置，隐藏项只记录当前简历视角。 */
export function createResumeConfig({
  resumeName,
  resumeId,
  templateId,
  privacy,
  modules,
  baseConfig,
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

  return {
    ...baseConfig,
    name: resumeName,
    id: resumeId || resumeName.toLowerCase().replace(/\s+/g, '-'),
    template: templateId,
    created: baseConfig?.created || today,
    updated: today,
    modules: modules.map((module) => module.type),
    privacy,
    hide: [...fieldHides, ...itemHides],
  };
}
