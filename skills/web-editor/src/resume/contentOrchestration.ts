import type {
  EntityType,
  ModuleInstance,
  WikiEntity,
} from '../types/index.ts';
import { MODULE_LIBRARY } from '../types/index.ts';
import {
  getModuleDraftPatch,
  projectResumeModules,
  reconcileModuleSelection,
  updateContentOverride,
} from './config.ts';
import type { ResumeEditingSession, ResumeEditingSessionResult } from './editingSession.ts';
import { toggleHiddenItem } from './visibility.ts';

export type ModuleMoveDirection = 'up' | 'down';

export interface ResumeContentOrchestrationSnapshot {
  modules: ModuleInstance[];
}

export type ResumeContentOrchestrationResult =
  | { status: 'updated' }
  | { status: 'saved'; message: string }
  | { status: 'unchanged'; message: string }
  | { status: 'failed'; error: string };

export interface ResumeContentOrchestration {
  getSnapshot(): ResumeContentOrchestrationSnapshot;
  subscribe(listener: () => void): () => void;
  setWikiEntities(entities: WikiEntity[]): void;
  selectModules(types: EntityType[]): Promise<ResumeContentOrchestrationResult>;
  moveModule(moduleId: string, direction: ModuleMoveDirection): Promise<ResumeContentOrchestrationResult>;
  moveModuleBefore(activeId: string, overId: string): Promise<ResumeContentOrchestrationResult>;
  toggleExpanded(moduleId: string): void;
  overrideField(
    moduleId: string,
    itemPath: string,
    field: string,
    value: unknown,
  ): Promise<ResumeContentOrchestrationResult>;
  toggleItemVisibility(
    moduleId: string,
    itemId: string,
  ): Promise<ResumeContentOrchestrationResult>;
  removeModule(moduleId: string): Promise<ResumeContentOrchestrationResult>;
}

interface CreateResumeContentOrchestrationInput {
  session: ResumeEditingSession;
  wikiEntities: WikiEntity[];
}

function createModuleInstance(type: EntityType): ModuleInstance {
  const definition = MODULE_LIBRARY.find((module) => module.type === type);
  return {
    id: `module-${type}`,
    type,
    label: definition?.label || type,
    expanded: false,
    overrides: {},
    hiddenItemIds: [],
  };
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) return items;

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function getError(result: ResumeEditingSessionResult): string | null {
  return result.status === 'failed' ? result.error : null;
}

/**
 * 内容编排工作流：将模块选择、排序和当前简历视角编辑集中到一个深模块。
 * Wiki 只作为输入，简历草稿的变更与保存始终委托给 Resume Editing Session。
 */
export function createResumeContentOrchestration({
  session,
  wikiEntities: initialWikiEntities,
}: CreateResumeContentOrchestrationInput): ResumeContentOrchestration {
  let wikiEntities = initialWikiEntities;
  let expandedModuleTypes = new Set<EntityType>();
  let currentResumeId = session.getSnapshot().currentResumeId;
  let snapshot: ResumeContentOrchestrationSnapshot = {
    modules: projectResumeModules(session.getSnapshot().draft, wikiEntities, expandedModuleTypes),
  };
  const listeners = new Set<() => void>();

  const update = () => {
    snapshot = {
      modules: projectResumeModules(
        session.getSnapshot().draft,
        wikiEntities,
        expandedModuleTypes,
      ),
    };
    listeners.forEach((listener) => listener());
  };

  const syncFromSession = () => {
    const nextResumeId = session.getSnapshot().currentResumeId;
    if (nextResumeId !== currentResumeId) {
      currentResumeId = nextResumeId;
      expandedModuleTypes = new Set();
    }
    update();
  };

  session.subscribe(syncFromSession);

  const editModules = async (
    nextModules: ModuleInstance[],
  ): Promise<ResumeContentOrchestrationResult> => {
    const draft = session.getSnapshot().draft;
    if (!draft) return { status: 'failed', error: '没有可编辑的简历草稿' };
    const result = await session.dispatch({
      type: 'edit-draft',
      patch: getModuleDraftPatch(draft, nextModules),
    });
    const error = getError(result);
    return error ? { status: 'failed', error } : { status: 'updated' };
  };

  const editAndSaveModules = async (
    nextModules: ModuleInstance[],
    message: string,
  ): Promise<ResumeContentOrchestrationResult> => {
    const updated = await editModules(nextModules);
    if (updated.status === 'failed') return updated;
    const saved = await session.dispatch({ type: 'save' });
    const error = getError(saved);
    return error ? { status: 'failed', error } : { status: 'saved', message };
  };

  const moveToIndex = async (
    moduleId: string,
    targetIndex: number,
  ): Promise<ResumeContentOrchestrationResult> => {
    const currentIndex = snapshot.modules.findIndex((module) => module.id === moduleId);
    if (currentIndex < 0 || currentIndex === targetIndex) return { status: 'updated' };
    const nextModules = moveItem(snapshot.modules, currentIndex, targetIndex);
    return editModules(nextModules);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setWikiEntities(nextEntities) {
      if (wikiEntities === nextEntities) return;
      wikiEntities = nextEntities;
      update();
    },
    async selectModules(types) {
      const currentTypes = session.getSnapshot().draft?.modules || [];
      const nextTypes = [...new Set(types)];
      if (
        session.getSnapshot().saveStatus !== 'failed' &&
        currentTypes.length === nextTypes.length &&
        currentTypes.every((type, index) => type === nextTypes[index])
      ) {
        return { status: 'unchanged', message: '编排没有变化' };
      }
      const nextModules = reconcileModuleSelection(
        snapshot.modules,
        nextTypes,
        createModuleInstance,
      );
      return editAndSaveModules(nextModules, '编排已更新');
    },
    async moveModule(moduleId, direction) {
      const currentIndex = snapshot.modules.findIndex((module) => module.id === moduleId);
      if (currentIndex < 0) return { status: 'updated' };
      const offset = direction === 'up' ? -1 : 1;
      return moveToIndex(moduleId, currentIndex + offset);
    },
    async moveModuleBefore(activeId, overId) {
      if (activeId === overId) return { status: 'updated' };
      const targetIndex = snapshot.modules.findIndex((module) => module.id === overId);
      if (targetIndex < 0) return { status: 'updated' };
      return moveToIndex(activeId, targetIndex);
    },
    toggleExpanded(moduleId) {
      const module = snapshot.modules.find((item) => item.id === moduleId);
      if (!module) return;
      const next = new Set(expandedModuleTypes);
      if (next.has(module.type)) next.delete(module.type);
      else next.add(module.type);
      expandedModuleTypes = next;
      update();
    },
    async overrideField(moduleId, itemPath, field, value) {
      const module = snapshot.modules.find((item) => item.id === moduleId);
      if (!module) return { status: 'updated' };
      const inheritedValue = wikiEntities.find((entity) => entity.path === itemPath)?.fields[field];
      const nextModules = snapshot.modules.map((item) =>
        item.id === moduleId
          ? {
              ...item,
              overrides: updateContentOverride(
                item.overrides,
                itemPath,
                field,
                value,
                inheritedValue,
              ),
            }
          : item,
      );
      return editModules(nextModules);
    },
    async toggleItemVisibility(moduleId, itemId) {
      const module = snapshot.modules.find((item) => item.id === moduleId);
      if (!module) return { status: 'updated' };
      const nextModules = snapshot.modules.map((item) =>
        item.id === moduleId
          ? { ...item, hiddenItemIds: toggleHiddenItem(item.hiddenItemIds, itemId) }
          : item,
      );
      return editModules(nextModules);
    },
    async removeModule(moduleId) {
      const nextModules = snapshot.modules.filter((module) => module.id !== moduleId);
      if (nextModules.length === snapshot.modules.length) return { status: 'updated' };
      return editAndSaveModules(nextModules, '已删除并保存');
    },
  };
}
