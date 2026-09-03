import type {
  EntityType,
  ModuleInstance,
  PrivacyConfig,
  ResumeConfig,
  ResumePolishField,
  ResumePolishProviderConfig,
  ResumePolishVariant,
  TemplateConfig,
  WikiEntity,
} from '../types/index.ts';
import { MODULE_LIBRARY } from '../types/index.ts';
import { createResumeConfig } from './config.ts';
import {
  createResumeContentOrchestration,
  type ModuleMoveDirection,
  type ResumeContentOrchestrationResult,
} from './contentOrchestration.ts';
import { createResumeEditingSession } from './editingSession.ts';
import { applyPolishToEntities, getSelectedPolishFields } from './polish.ts';
import {
  createResumePolishWorkflow,
  isPolishProviderConfigured,
  type ResumePolishModelClient,
  type ResumePolishProviderStorage,
} from './polishWorkflow.ts';
import { projectResume, type ResumeView } from './projection.ts';

export type ResumeWorkspaceView = 'edit' | 'preview';
export type ResumeWorkspaceOverlay = 'polish' | 'privacy' | 'export';
export type ResumeWorkspaceFeedbackTone = 'info' | 'success' | 'error';

export interface ResumeWorkspaceFeedback {
  message: string;
  tone: ResumeWorkspaceFeedbackTone;
}

export interface ResumeEditingWorkspaceSnapshot {
  resumes: ResumeConfig[];
  currentResumeId: string;
  draft: ResumeConfig | null;
  resumeName: string;
  templates: TemplateConfig[];
  templateId: string;
  currentTemplate: TemplateConfig | null;
  privacy: PrivacyConfig;
  polish: ResumeConfig['polish'];
  polishEnabled: boolean;
  selectedPolishFields: ResumePolishField[];
  polishProvider: ResumePolishProviderConfig;
  polishProviderConfigured: boolean;
  polishModels: string[];
  polishModelsLoading: boolean;
  polishGenerating: boolean;
  polishGeneratingKey: string | null;
  polishProviderError: string;
  polishVariants: ResumePolishVariant[];
  polishSelectedVariant: number;
  modules: ModuleInstance[];
  resumeWikiEntities: WikiEntity[];
  resumeView: ResumeView | null;
  saving: boolean;
  view: ResumeWorkspaceView;
  activeOverlay: ResumeWorkspaceOverlay | null;
  feedback: ResumeWorkspaceFeedback | null;
}

export type ResumeEditingWorkspaceCommand =
  | { type: 'replace-inputs'; resumes?: ResumeConfig[]; templates?: TemplateConfig[]; wikiEntities?: WikiEntity[] }
  | { type: 'set-view'; view: ResumeWorkspaceView }
  | { type: 'toggle-overlay'; overlay: ResumeWorkspaceOverlay }
  | { type: 'close-overlay' }
  | { type: 'select-resume'; resumeId: string }
  | { type: 'create-resume' }
  | { type: 'duplicate-resume' }
  | { type: 'delete-resume' }
  | { type: 'change-name'; name: string }
  | { type: 'select-template'; templateId: string }
  | { type: 'duplicate-template' }
  | { type: 'delete-template' }
  | { type: 'change-privacy'; privacy: PrivacyConfig }
  | { type: 'save'; successMessage?: string }
  | { type: 'select-modules'; moduleTypes: EntityType[] }
  | { type: 'move-module'; moduleId: string; direction: ModuleMoveDirection }
  | { type: 'move-module-before'; activeId: string; overId: string }
  | { type: 'toggle-module'; moduleId: string }
  | { type: 'override-field'; moduleId: string; itemPath: string; field: string; value: unknown }
  | { type: 'restore-field'; moduleId: string; itemPath: string; field: string }
  | { type: 'toggle-item-visibility'; moduleId: string; itemId: string }
  | { type: 'remove-module'; moduleId: string }
  | { type: 'toggle-polish'; enabled: boolean }
  | { type: 'open-polish-settings' }
  | { type: 'save-polish-provider'; provider: ResumePolishProviderConfig; selectedFields: ResumePolishField[] }
  | { type: 'fetch-polish-models'; provider: ResumePolishProviderConfig }
  | { type: 'regenerate-polish'; path: string; field: ResumePolishField }
  | { type: 'regenerate-all-polish' }
  | { type: 'select-polish-variant'; index: number };

export type ResumeEditingWorkspaceResult =
  | { status: 'completed' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export interface ResumeEditingWorkspace {
  getSnapshot(): ResumeEditingWorkspaceSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: ResumeEditingWorkspaceCommand): Promise<ResumeEditingWorkspaceResult>;
}

export interface ResumeTemplateRepository {
  list(): Promise<TemplateConfig[]>;
  getCss(id: string): Promise<string>;
  save(config: TemplateConfig, css: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ResumeWorkspaceConfirmation {
  confirm(message: string): boolean | Promise<boolean>;
}

interface CreateResumeEditingWorkspaceInput {
  resumes: ResumeConfig[];
  templates: TemplateConfig[];
  wikiEntities: WikiEntity[];
  saveResume(config: ResumeConfig): Promise<void>;
  deleteResume(id: string): Promise<void>;
  polishResume(
    config: ResumeConfig,
    provider: ResumePolishProviderConfig,
    options?: { only?: { path: string; field: ResumePolishField } },
  ): Promise<{ config: ResumeConfig; generated_count: number; candidate_count: number }>;
  modelClient: ResumePolishModelClient;
  templateRepository: ResumeTemplateRepository;
  confirmation: ResumeWorkspaceConfirmation;
  polishProviderStorage?: ResumePolishProviderStorage;
  now?: () => Date;
  feedbackScheduler?: {
    setTimeout(callback: () => void, delay: number): unknown;
    clearTimeout(timer: unknown): void;
  };
}

const DEFAULT_PRIVACY: PrivacyConfig = {
  mask_name: false,
  mask_phone: true,
  mask_email: true,
  mask_salary: true,
  mask_company: false,
  mask_github: false,
};

const DEFAULT_MODULE_TYPES: EntityType[] = [
  'person',
  'experience',
  'project',
  'skill',
  'education',
];

function createDefaultModules(): ModuleInstance[] {
  return DEFAULT_MODULE_TYPES.map((type) => ({
    id: `module-${type}`,
    type,
    label: MODULE_LIBRARY.find((module) => module.type === type)?.label || type,
    expanded: false,
    overrides: {},
    hiddenItemIds: [],
  }));
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 简历编辑工作区：组合编辑会话、内容编排和 AI 润色三个深模块。
 * 页面只表达用户意图并渲染 snapshot；确认、事务顺序、叠层互斥和反馈时效由此处统一决定。
 */
export function createResumeEditingWorkspace({
  resumes,
  templates,
  wikiEntities: initialWikiEntities,
  saveResume,
  deleteResume,
  polishResume,
  modelClient,
  templateRepository,
  confirmation,
  polishProviderStorage,
  now = () => new Date(),
  feedbackScheduler = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  },
}: CreateResumeEditingWorkspaceInput): ResumeEditingWorkspace {
  const session = createResumeEditingSession({ resumes, saveResume, deleteResume, polishResume });
  const polishWorkflow = createResumePolishWorkflow({
    session,
    modelClient,
    ...(polishProviderStorage ? { storage: polishProviderStorage } : {}),
  });
  let templateList = templates;
  let wikiEntities = initialWikiEntities;
  let view: ResumeWorkspaceView = 'edit';
  let activeOverlay: ResumeWorkspaceOverlay | null = null;
  let feedback: ResumeWorkspaceFeedback | null = null;
  let feedbackTimer: unknown | null = null;
  const listeners = new Set<() => void>();

  const getResumeWikiEntities = () => {
    const polish = session.getSnapshot().draft?.polish;
    return applyPolishToEntities(
      wikiEntities,
      polish?.enabled === true ? polish : { ...(polish || {}), enabled: false },
    );
  };

  const contentOrchestration = createResumeContentOrchestration({
    session,
    wikiEntities: getResumeWikiEntities(),
  });

  const buildSnapshot = (): ResumeEditingWorkspaceSnapshot => {
    const sessionSnapshot = session.getSnapshot();
    const polishSnapshot = polishWorkflow.getSnapshot();
    const draft = sessionSnapshot.draft;
    const templateId = draft?.template || templateList[0]?.id || '';
    const currentTemplate = templateList.find((template) => template.id === templateId) || null;
    const polish = draft?.polish;
    return {
      resumes: sessionSnapshot.resumes,
      currentResumeId: sessionSnapshot.currentResumeId,
      draft,
      resumeName: draft?.name || '新建简历',
      templates: templateList,
      templateId,
      currentTemplate,
      privacy: draft?.privacy || DEFAULT_PRIVACY,
      polish,
      polishEnabled: polish?.enabled === true,
      selectedPolishFields: getSelectedPolishFields(polish),
      polishProvider: polishSnapshot.provider,
      polishProviderConfigured: isPolishProviderConfigured(polishSnapshot.provider),
      polishModels: polishSnapshot.models,
      polishModelsLoading: polishSnapshot.modelsLoading,
      polishGenerating: polishSnapshot.generating,
      polishGeneratingKey: polishSnapshot.generatingKey,
      polishProviderError: polishSnapshot.error,
      polishVariants: polish?.variants || [],
      polishSelectedVariant: polish && typeof polish.selected_variant === 'number' ? polish.selected_variant : 1,
      modules: contentOrchestration.getSnapshot().modules,
      resumeWikiEntities: getResumeWikiEntities(),
      resumeView: draft
        ? projectResume({ wiki: wikiEntities, config: draft, template: currentTemplate })
        : null,
      saving: sessionSnapshot.saveStatus === 'saving',
      view,
      activeOverlay,
      feedback,
    };
  };

  let snapshot = buildSnapshot();
  const emit = () => {
    snapshot = buildSnapshot();
    listeners.forEach((listener) => listener());
  };

  const setFeedback = (
    message: string,
    tone: ResumeWorkspaceFeedbackTone = 'info',
  ) => {
    if (feedbackTimer) feedbackScheduler.clearTimeout(feedbackTimer);
    feedbackTimer = null;
    feedback = message ? { message, tone } : null;
    emit();
    if (!message) return;
    feedbackTimer = feedbackScheduler.setTimeout(() => {
      feedbackTimer = null;
      feedback = null;
      polishWorkflow.clearError();
      emit();
    }, tone === 'error' ? 6000 : 3000);
    (feedbackTimer as { unref?: () => void }).unref?.();
  };

  const setOverlay = (overlay: ResumeWorkspaceOverlay | null) => {
    activeOverlay = overlay;
    emit();
  };

  const reportContentResult = (result: ResumeContentOrchestrationResult) => {
    if (result.status === 'saved' || result.status === 'unchanged') {
      setFeedback(result.message, 'success');
    }
    if (result.status === 'failed') setFeedback(`编排更新失败：${result.error}`, 'error');
  };

  const failed = (prefix: string, error: unknown): ResumeEditingWorkspaceResult => {
    const message = `${prefix}：${messageForError(error)}`;
    setFeedback(message, 'error');
    return { status: 'failed', error: message };
  };

  session.subscribe(() => {
    contentOrchestration.setWikiEntities(getResumeWikiEntities());
    emit();
  });
  polishWorkflow.subscribe(emit);
  contentOrchestration.subscribe(emit);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(command) {
      if (command.type === 'replace-inputs') {
        if (command.resumes) {
          await session.dispatch({ type: 'replace-resumes', resumes: command.resumes });
        }
        if (command.templates) templateList = command.templates;
        if (command.wikiEntities) {
          wikiEntities = command.wikiEntities;
          contentOrchestration.setWikiEntities(getResumeWikiEntities());
        }
        emit();
        return { status: 'completed' };
      }

      if (command.type === 'set-view') {
        view = command.view;
        emit();
        return { status: 'completed' };
      }

      if (command.type === 'toggle-overlay') {
        setOverlay(activeOverlay === command.overlay ? null : command.overlay);
        return { status: 'completed' };
      }

      if (command.type === 'close-overlay') {
        setOverlay(null);
        return { status: 'completed' };
      }

      if (command.type === 'select-resume') {
        const result = await session.dispatch({ type: 'switch-resume', resumeId: command.resumeId });
        if (result.status === 'confirm-discard') {
          const confirmed = await confirmation.confirm(
            '当前简历有未保存修改，切换后这些修改会丢失。确定继续吗？',
          );
          if (!confirmed) return { status: 'cancelled' };
          const switched = await session.dispatch({
            type: 'switch-resume',
            resumeId: command.resumeId,
            discardDirty: true,
          });
          if (switched.status === 'failed') return failed('切换简历失败', switched.error);
        } else if (result.status === 'failed') {
          return failed('切换简历失败', result.error);
        }
        setOverlay(null);
        return { status: 'completed' };
      }

      if (command.type === 'create-resume' || command.type === 'duplicate-resume') {
        const prepared = await session.dispatch({ type: 'prepare-destructive-change' });
        if (prepared.status === 'ready' && prepared.hasUnsavedDraft) {
          const action = command.type === 'create-resume' ? '新建后切换' : '创建副本';
          const confirmed = await confirmation.confirm(
            `当前简历有未保存修改，${action}会丢失这些修改。确定继续吗？`,
          );
          if (!confirmed) return { status: 'cancelled' };
        }

        const current = session.getSnapshot();
        let config: ResumeConfig;
        if (command.type === 'create-resume') {
          const timestamp = now().getTime();
          config = createResumeConfig({
            resumeName: `新简历 ${current.resumes.length + 1}`,
            resumeId: `resume-${timestamp}`,
            templateId: current.draft?.template || templateList[0]?.id || '',
            privacy: DEFAULT_PRIVACY,
            modules: createDefaultModules(),
            today: now().toISOString().slice(0, 10),
          });
        } else {
          const source = current.resumes.find((resume) => resume.id === current.currentResumeId);
          if (!source) return failed('复制简历失败', '找不到当前简历');
          const today = now().toISOString().slice(0, 10);
          config = {
            ...structuredClone(source),
            id: `${source.id}-copy`,
            name: `${source.name} 副本`,
            created: today,
            updated: today,
          };
        }
        const result = await session.dispatch({ type: 'create-resume', config });
        if (result.status === 'failed') {
          return failed(command.type === 'create-resume' ? '新建简历失败' : '复制简历失败', result.error);
        }
        setOverlay(null);
        return { status: 'completed' };
      }

      if (command.type === 'delete-resume') {
        const current = session.getSnapshot();
        const target = current.resumes.find((resume) => resume.id === current.currentResumeId);
        if (!target || current.resumes.length <= 1) return { status: 'cancelled' };
        const prepared = await session.dispatch({ type: 'prepare-destructive-change' });
        const draftWarning = prepared.status === 'ready' && prepared.hasUnsavedDraft
          ? ' 当前未保存草稿也会丢失。'
          : '';
        const confirmed = await confirmation.confirm(
          `确定删除简历「${target.name}」？${draftWarning}仅删除配置，wiki 数据不受影响。`,
        );
        if (!confirmed) return { status: 'cancelled' };
        const result = await session.dispatch({ type: 'delete-current-resume' });
        if (result.status === 'failed') return failed('删除简历失败', result.error);
        setOverlay(null);
        return { status: 'completed' };
      }

      if (command.type === 'change-name') {
        await session.dispatch({ type: 'change-name', name: command.name });
        return { status: 'completed' };
      }

      if (command.type === 'select-template') {
        await session.dispatch({ type: 'edit-draft', patch: { template: command.templateId } });
        return { status: 'completed' };
      }

      if (command.type === 'duplicate-template') {
        const current = snapshot.currentTemplate;
        if (!current) return failed('复制模板失败', '找不到当前模板');
        const copy = { ...current, id: `${current.id}-copy`, name: `${current.name} 副本` };
        try {
          const css = await templateRepository.getCss(current.id);
          await templateRepository.save(copy, css);
          templateList = await templateRepository.list();
          await session.dispatch({ type: 'edit-draft', patch: { template: copy.id } });
          return { status: 'completed' };
        } catch (error) {
          return failed('复制模板失败', error);
        }
      }

      if (command.type === 'delete-template') {
        const current = snapshot.currentTemplate;
        if (!current || templateList.length <= 1) return { status: 'cancelled' };
        if (!await confirmation.confirm(`确定删除模板「${current.name}」？`)) {
          return { status: 'cancelled' };
        }
        try {
          await templateRepository.delete(current.id);
          templateList = await templateRepository.list();
          await session.dispatch({
            type: 'edit-draft',
            patch: { template: templateList[0]?.id || '' },
          });
          return { status: 'completed' };
        } catch (error) {
          return failed('删除模板失败', error);
        }
      }

      if (command.type === 'change-privacy') {
        await session.dispatch({ type: 'edit-draft', patch: { privacy: command.privacy } });
        return { status: 'completed' };
      }

      if (command.type === 'save') {
        setFeedback('', 'info');
        const result = await session.dispatch({ type: 'save' });
        if (result.status === 'failed') return failed('保存失败', result.error);
        setFeedback(command.successMessage || '已保存', 'success');
        return { status: 'completed' };
      }

      if (command.type === 'select-modules') {
        const result = await contentOrchestration.selectModules(command.moduleTypes);
        reportContentResult(result);
        return result.status === 'failed'
          ? { status: 'failed', error: result.error }
          : { status: 'completed' };
      }

      if (command.type === 'move-module') {
        reportContentResult(await contentOrchestration.moveModule(command.moduleId, command.direction));
        return { status: 'completed' };
      }

      if (command.type === 'move-module-before') {
        reportContentResult(await contentOrchestration.moveModuleBefore(command.activeId, command.overId));
        return { status: 'completed' };
      }

      if (command.type === 'toggle-module') {
        contentOrchestration.toggleExpanded(command.moduleId);
        return { status: 'completed' };
      }

      if (command.type === 'override-field') {
        reportContentResult(await contentOrchestration.overrideField(
          command.moduleId,
          command.itemPath,
          command.field,
          command.value,
        ));
        return { status: 'completed' };
      }

      if (command.type === 'restore-field') {
        const result = await contentOrchestration.restoreField(
          command.moduleId,
          command.itemPath,
          command.field,
        );
        reportContentResult(result);
        if (result.status === 'failed') return { status: 'failed', error: result.error };
        setFeedback('已恢复 AI/Wiki 内容', 'success');
        return { status: 'completed' };
      }

      if (command.type === 'toggle-item-visibility') {
        reportContentResult(await contentOrchestration.toggleItemVisibility(
          command.moduleId,
          command.itemId,
        ));
        return { status: 'completed' };
      }

      if (command.type === 'remove-module') {
        reportContentResult(await contentOrchestration.removeModule(command.moduleId));
        return { status: 'completed' };
      }

      if (command.type === 'open-polish-settings') {
        polishWorkflow.clearError();
        setOverlay(activeOverlay === 'polish' ? null : 'polish');
        return { status: 'completed' };
      }

      if (command.type === 'toggle-polish') {
        setFeedback('', 'info');
        const result = await polishWorkflow.toggle(command.enabled);
        if (result.status === 'needs-config') {
          setOverlay('polish');
          setFeedback('请先配置 AI 润色协议和模型', 'error');
          return { status: 'failed', error: result.error };
        }
        if (result.status !== 'success') {
          if (result.status === 'failed') setOverlay('polish');
          const error = `AI 润色失败：${result.error}`;
          setFeedback(error, 'error');
          return { status: 'failed', error };
        }
        setFeedback(result.message, 'success');
        return { status: 'completed' };
      }

      if (command.type === 'save-polish-provider') {
        const result = await polishWorkflow.saveProvider(command.provider, command.selectedFields);
        if (result.status !== 'success') {
          setFeedback(result.error, 'error');
          return { status: 'failed', error: result.error };
        }
        setOverlay(null);
        setFeedback(result.message, 'success');
        return { status: 'completed' };
      }

      if (command.type === 'fetch-polish-models') {
        const result = await polishWorkflow.fetchModels(command.provider);
        if (result.status === 'success') return { status: 'completed' };
        setFeedback(result.error, 'error');
        return { status: 'failed', error: result.error };
      }

      if (command.type === 'regenerate-polish') {
        setFeedback('', 'info');
        const result = await polishWorkflow.regenerate(command.path, command.field);
        if (result.status === 'needs-config') setOverlay('polish');
        if (result.status !== 'success') {
          const error = `重新生成失败：${result.error}`;
          setFeedback(error, 'error');
          return { status: 'failed', error };
        }
        setFeedback(result.message, 'success');
        return { status: 'completed' };
      }

      if (command.type === 'regenerate-all-polish') {
        setFeedback('', 'info');
        const result = await polishWorkflow.regenerateAll();
        if (result.status === 'needs-config') setOverlay('polish');
        if (result.status !== 'success') {
          const error = `重新生成失败：${result.error}`;
          setFeedback(error, 'error');
          return { status: 'failed', error };
        }
        setFeedback(result.message, 'success');
        return { status: 'completed' };
      }

      if (command.type === 'select-polish-variant') {
        const result = await polishWorkflow.selectVariant(command.index);
        if (result.status !== 'success') {
          setFeedback(result.error, 'error');
          return { status: 'failed', error: result.error };
        }
        setFeedback(result.message, 'success');
        return { status: 'completed' };
      }

      const exhaustive: never = command;
      return failed('工作区命令失败', `不支持的命令：${String(exhaustive)}`);
    },
  };
}
