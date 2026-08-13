/**
 * ResumeEditor — 简历编辑器页面
 *
 * 布局：顶栏 + 内容编排区 + 右侧预览
 *
 * 顶栏：简历名称 | 模板选择 | 脱敏设置 | 导出PDF | 导出HTML | 导出JSON | 保存
 */

import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import EditPanel from '../components/EditPanel';
import PreviewPanel from '../components/PreviewPanel';
import ExportDialog, {
  type ExportResult,
  type ResumeExportFormat,
} from '../components/ExportDialog';
import ResumeSelector from '../components/ResumeSelector';
import TemplateSelector from '../components/TemplateSelector';
import PrivacyControls from '../components/PrivacyControls';
import PolishControls from '../components/PolishControls';
import PolishProviderSettings from '../components/PolishProviderSettings';
import UiIcon from '../components/UiIcon';

import type {
  ModuleInstance,
  WikiEntity,
  TemplateConfig,
  ResumeConfig,
  PrivacyConfig,
  EntityType,
  ResumePolishConfig,
  ResumePolishField,
  ResumePolishProtocol,
  ResumePolishProviderConfig,
} from '../types';
import { MODULE_LIBRARY } from '../types';

import * as api from '../api/client';
import {
  createResumeConfig,
  getModuleDraftPatch,
  projectResumeModules,
  reconcileModuleSelection,
  updateContentOverride,
} from '../resume/config';
import { createResumeEditingSession } from '../resume/editingSession';
import { toggleHiddenItem } from '../resume/visibility';
import { applyPolishToEntities, getSelectedPolishFields, DEFAULT_POLISH_FIELDS } from '../resume/polish';
import { projectResume } from '../resume/projection';
import {
  buildStandaloneResumeHtml,
  collectDocumentCss,
  createResumePdfBlob,
  createResumeJsonBlob,
  saveExportBlob,
} from '../resume/export';

const POLISH_PROVIDER_STORAGE_KEY = 'career-wiki.resume-polish-provider';
const DEFAULT_POLISH_PROVIDER: ResumePolishProviderConfig = {
  protocol: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model: '',
  timeout_ms: 60000,
};
const DEFAULT_PRIVACY: PrivacyConfig = {
  mask_name: false,
  mask_phone: true,
  mask_email: true,
  mask_salary: true,
  mask_company: false,
  mask_github: false,
};

function loadPolishProvider(): ResumePolishProviderConfig {
  if (typeof window === 'undefined') return DEFAULT_POLISH_PROVIDER;
  try {
    const raw = window.localStorage.getItem(POLISH_PROVIDER_STORAGE_KEY);
    if (!raw) return DEFAULT_POLISH_PROVIDER;
    const parsed = JSON.parse(raw) as Partial<ResumePolishProviderConfig>;
    return {
      protocol: parsed.protocol === 'anthropic' ? 'anthropic' : 'openai',
      base_url: typeof parsed.base_url === 'string' ? parsed.base_url : DEFAULT_POLISH_PROVIDER.base_url,
      api_key: typeof parsed.api_key === 'string' ? parsed.api_key : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      timeout_ms:
        typeof parsed.timeout_ms === 'number'
          ? Math.min(180000, Math.max(10000, parsed.timeout_ms))
          : DEFAULT_POLISH_PROVIDER.timeout_ms,
    };
  } catch {
    return DEFAULT_POLISH_PROVIDER;
  }
}

interface ResumeEditorProps {
  wikiEntities: WikiEntity[];
  templates: TemplateConfig[];
  resumes: ResumeConfig[];
  onRefreshWiki: () => void;
}

export default function ResumeEditor({
  wikiEntities,
  templates,
  resumes,
  onRefreshWiki,
}: ResumeEditorProps) {
  const [editingSession] = useState(() =>
    createResumeEditingSession({ resumes, saveResume: api.saveResume }),
  );
  const session = useSyncExternalStore(
    editingSession.subscribe,
    editingSession.getSnapshot,
    editingSession.getSnapshot,
  );
  const [templateList, setTemplateList] = useState<TemplateConfig[]>(templates);
  const [expandedModuleTypes, setExpandedModuleTypes] = useState<Set<EntityType>>(new Set());
  const draft = session.draft;
  const currentResumeId = session.currentResumeId;
  const resumeList = session.resumes;
  const resumeName = draft?.name || '新建简历';
  const templateId = draft?.template || templates[0]?.id || '';
  const privacy = draft?.privacy || DEFAULT_PRIVACY;
  const polish = draft?.polish;
  const modules = projectResumeModules(draft, wikiEntities, expandedModuleTypes);
  const saving = session.saveStatus === 'saving';
  const [saveMsg, setSaveMsg] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'edit' | 'preview'>('edit');
  const [polishGenerating, setPolishGenerating] = useState(false);
  const [polishGeneratingKey, setPolishGeneratingKey] = useState<string | null>(null);
  const [polishProvider, setPolishProvider] = useState<ResumePolishProviderConfig>(loadPolishProvider);
  const [polishSettingsOpen, setPolishSettingsOpen] = useState(false);
  const [privacySettingsOpen, setPrivacySettingsOpen] = useState(false);
  const [polishModels, setPolishModels] = useState<string[]>([]);
  const [polishModelsLoading, setPolishModelsLoading] = useState(false);
  const [polishProviderError, setPolishProviderError] = useState('');
  const polishProviderAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!polishSettingsOpen) return undefined;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const anchor = polishProviderAnchorRef.current;
      if (anchor && !anchor.contains(event.target as Node)) {
        setPolishSettingsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [polishSettingsOpen]);

  useEffect(() => {
    if (!polishProviderError) return undefined;

    const timeout = window.setTimeout(() => setPolishProviderError(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [polishProviderError]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // App 刷新数据时只同步服务端集合；当前草稿仍由编辑会话保护。
  useEffect(() => {
    void editingSession.dispatch({ type: 'replace-resumes', resumes });
  }, [editingSession, resumes]);
  useEffect(() => {
    setTemplateList(templates);
  }, [templates]);

  // ---------- 多简历管理（原 multi-resume 能力） ----------

  /** 重新拉取简历列表并同步本地状态，返回最新列表 */
  const refreshResumeList = async (): Promise<ResumeConfig[]> => {
    const fresh = await api.getResumes();
    return fresh;
  };

  /** 切换简历：按 id 加载对应配置 */
  const handleSelectResume = async (id: string) => {
    const result = await editingSession.dispatch({ type: 'switch-resume', resumeId: id });
    if (result.status === 'confirm-discard') {
      if (!window.confirm('当前简历有未保存修改，切换后这些修改会丢失。确定继续吗？')) return;
      await editingSession.dispatch({ type: 'switch-resume', resumeId: id, discardDirty: true });
    }
    setExpandedModuleTypes(new Set());
  };

  /** 新建简历：默认模板 + 常用模块，保存后立即加载 */
  const handleNewResume = async () => {
    const prepared = await editingSession.dispatch({ type: 'prepare-destructive-change' });
    if (prepared.status === 'ready' && prepared.hasUnsavedDraft) {
      if (!window.confirm('当前简历有未保存修改，新建后切换会丢失这些修改。确定继续吗？')) return;
    }
    const newId = `resume-${Date.now()}`;
    // 常用模块按模块库定义构造 ModuleInstance 列表
    const defaultTypes: EntityType[] = [
      'person',
      'experience',
      'project',
      'skill',
      'education',
    ];
    const newModules: ModuleInstance[] = defaultTypes.map((type) => {
      const def = MODULE_LIBRARY.find((m) => m.type === type);
      return {
        id: `module-${type}`,
        type,
        label: def?.label || type,
        expanded: false,
        overrides: {},
        hiddenItemIds: [],
      };
    });
    const config = createResumeConfig({
      resumeName: `新简历 ${resumeList.length + 1}`,
      resumeId: newId,
      templateId: templateId || templates[0]?.id || '',
      privacy: DEFAULT_PRIVACY,
      modules: newModules,
    });
    try {
      await api.saveResume(config);
      const fresh = await refreshResumeList();
      await editingSession.dispatch({ type: 'replace-resumes', resumes: fresh });
      await editingSession.dispatch({ type: 'switch-resume', resumeId: newId, discardDirty: true });
      setExpandedModuleTypes(new Set());
    } catch (e) {
      alert(`新建简历失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  /** 复制当前简历：生成新 id/name，保留模板/模块/脱敏配置 */
  const handleDuplicateResume = async () => {
    const prepared = await editingSession.dispatch({ type: 'prepare-destructive-change' });
    if (prepared.status === 'ready' && prepared.hasUnsavedDraft) {
      if (!window.confirm('当前简历有未保存修改，创建副本会使用已保存版本并丢弃当前修改。确定继续吗？')) return;
    }
    const source = resumeList.find((r) => r.id === currentResumeId);
    if (!source) return;
    const newId = `${source.id}-copy`;
    const copy: ResumeConfig = {
      ...source,
      id: newId,
      name: `${source.name} 副本`,
      created: new Date().toISOString().slice(0, 10),
      updated: new Date().toISOString().slice(0, 10),
    };
    try {
      await api.saveResume(copy);
      const fresh = await refreshResumeList();
      await editingSession.dispatch({ type: 'replace-resumes', resumes: fresh });
      await editingSession.dispatch({ type: 'switch-resume', resumeId: newId, discardDirty: true });
      setExpandedModuleTypes(new Set());
    } catch (e) {
      alert(`复制简历失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  /** 删除当前简历：确认后删除配置并切到剩余第一份 */
  const handleDeleteResume = async () => {
    const prepared = await editingSession.dispatch({ type: 'prepare-destructive-change' });
    const target = resumeList.find((r) => r.id === currentResumeId);
    if (!target || resumeList.length <= 1) return;
    const draftWarning = prepared.status === 'ready' && prepared.hasUnsavedDraft
      ? ' 当前未保存草稿也会丢失。'
      : '';
    if (!window.confirm(`确定删除简历「${target.name}」？${draftWarning}仅删除配置，wiki 数据不受影响。`)) return;
    try {
      await api.deleteResume(target.id);
      const fresh = await refreshResumeList();
      if (fresh.length > 0) {
        await editingSession.dispatch({
          type: 'replace-resumes',
          resumes: fresh,
        });
        await editingSession.dispatch({
          type: 'switch-resume',
          resumeId: fresh[0].id,
          discardDirty: true,
        });
      }
      setExpandedModuleTypes(new Set());
    } catch (e) {
      alert(`删除简历失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  // 当前模板对象
  const currentTemplate = templateList.find((t) => t.id === templateId) || null;
  const polishEnabled = polish?.enabled === true;
  const selectedPolishFields = getSelectedPolishFields(polish);
  const resumeWikiEntities = applyPolishToEntities(
    wikiEntities,
    polishEnabled ? polish : { ...(polish || {}), enabled: false },
  );
  const resumeView = useMemo(
    () => draft
      ? projectResume({ wiki: wikiEntities, config: draft, template: currentTemplate })
      : null,
    [currentTemplate, draft, wikiEntities],
  );

  // ---------- 模板管理（原 template-manager 能力） ----------

  /** 复制当前模板：生成新 id/name，携带源模板 CSS */
  const handleDuplicateTemplate = async () => {
    const source = templateList.find((t) => t.id === templateId);
    if (!source) return;
    const newId = `${source.id}-copy`;
    const copy: TemplateConfig = {
      ...source,
      id: newId,
      name: `${source.name} 副本`,
    };
    try {
      const css = await api.getTemplateCss(source.id);
      await api.saveTemplate(copy, css);
      const fresh = await api.getTemplates();
      setTemplateList(fresh);
      await editingSession.dispatch({ type: 'edit-draft', patch: { template: newId } });
    } catch (e) {
      alert(`复制模板失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  /** 删除当前模板：确认后删除 JSON + CSS，切到剩余第一个模板 */
  const handleDeleteTemplate = async () => {
    if (!templateId || templateList.length <= 1) return;
    const target = templateList.find((t) => t.id === templateId);
    if (!target) return;
    if (!window.confirm(`确定删除模板「${target.name}」？`)) return;
    try {
      await api.deleteTemplate(target.id);
      const fresh = await api.getTemplates();
      setTemplateList(fresh);
      const next = fresh[0]?.id || '';
      await editingSession.dispatch({ type: 'edit-draft', patch: { template: next } });
    } catch (e) {
      alert(`删除模板失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  // ---------- dnd-kit handlers ----------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;

    // 编辑区内排序
    if (active.id !== over.id) {
      const oldIndex = modules.findIndex((m) => m.id === active.id);
      const newIndex = modules.findIndex((m) => m.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        void updateDraftModules(arrayMove(modules, oldIndex, newIndex));
      }
    }
  };

  const updateDraftModules = async (nextModules: ModuleInstance[]) => {
    if (!draft) return;
    await editingSession.dispatch({
      type: 'edit-draft',
      patch: getModuleDraftPatch(draft, nextModules),
    });
  };

  const handleModuleSelection = async (types: EntityType[]) => {
    const nextModules = reconcileModuleSelection(modules, types, (type) => {
      const def = MODULE_LIBRARY.find((module) => module.type === type);
      return {
        id: `module-${type}`,
        type,
        label: def?.label || type,
        expanded: false,
        overrides: {},
        hiddenItemIds: [],
      };
    });
    await updateDraftModules(nextModules);
    await handleSave('编排已更新');
  };

  // ---------- 模块操作 ----------

  const handleToggleExpand = (id: string) => {
    const type = modules.find((module) => module.id === id)?.type;
    if (!type) return;
    setExpandedModuleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleOverrideField = (
    moduleId: string,
    itemPath: string,
    field: string,
    value: unknown,
  ) => {
    const inheritedValue = resumeWikiEntities
      .find((entity) => entity.path === itemPath)
      ?.fields[field];
    void updateDraftModules(
      modules.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              overrides: updateContentOverride(
                m.overrides,
                itemPath,
                field,
                value,
                inheritedValue,
              ),
            }
          : m,
      ),
    );
  };

  const handleRemoveModule = async (id: string) => {
    // 仅从当前简历的预览/导出编排中移除，并立即保存简历配置；不触碰 Wiki。
    const nextModules = modules.filter((m) => m.id !== id);
    await updateDraftModules(nextModules);
    await handleSave('已删除并保存');
  };

  /** 为键盘用户提供确定性的模块排序入口，并限制索引不越界。 */
  const handleReorderModule = (oldIndex: number, newIndex: number) => {
    if (newIndex < 0 || newIndex >= modules.length || oldIndex === newIndex) return;
    void updateDraftModules(arrayMove(modules, oldIndex, newIndex));
  };

  /** 切换子项在当前简历中的可见性，不触碰 Wiki 数据。 */
  const handleToggleItemVisibility = (moduleId: string, itemId: string) => {
    void updateDraftModules(
      modules.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              hiddenItemIds: toggleHiddenItem(module.hiddenItemIds, itemId),
            }
          : module,
      ),
    );
  };

  // ---------- 导出 ----------

  const handleSave = async (successMessage = '已保存') => {
    setSaveMsg('');
    const result = await editingSession.dispatch({ type: 'save' });
    if (result.status === 'saved') {
      setSaveMsg(successMessage);
    } else if (result.status === 'failed') {
      setSaveMsg(`保存失败：${result.error}`);
    }
  };

  /** 开启 AI 润色时先生成结果，再切换预览；关闭时立即回到原始 Wiki 内容。 */
  const handlePolishChange = async (enabled: boolean) => {
    if (!enabled) {
      const nextPolish = { ...(polish || {}), enabled: false };
      await editingSession.dispatch({ type: 'edit-draft', patch: { polish: nextPolish } });
      const saved = await editingSession.dispatch({ type: 'save' });
      if (saved.status === 'saved') {
        setSaveMsg('已关闭 AI 润色，当前显示原文');
      } else if (saved.status === 'failed') {
        setSaveMsg(`保存 AI 润色设置失败：${saved.error}`);
      }
      return;
    }

    const hasCachedPolish = Object.keys(polish?.entries || {}).length > 0;
    const providerConfigured = Boolean(
      polishProvider.protocol &&
        polishProvider.base_url.trim() &&
        polishProvider.api_key.trim() &&
        polishProvider.model.trim(),
    );
    if (!providerConfigured && hasCachedPolish) {
      const nextPolish = { ...(polish || {}), enabled: true };
      await editingSession.dispatch({ type: 'edit-draft', patch: { polish: nextPolish } });
      const saved = await editingSession.dispatch({ type: 'save' });
      if (saved.status === 'saved') {
        setSaveMsg('已开启 AI 润色，使用已有结果');
      } else if (saved.status === 'failed') {
        setSaveMsg(`保存 AI 润色设置失败：${saved.error}`);
      }
      return;
    }
    if (!providerConfigured) {
      setPolishSettingsOpen(true);
      setPolishProviderError('请先选择协议并配置 Base URL、API Key 和模型');
      setSaveMsg('请先配置 AI 润色协议和模型');
      return;
    }
    setPolishGenerating(true);
    setSaveMsg('');
    try {
      if (!draft) throw new Error('没有可润色的简历草稿');
      const requestResumeId = draft.id;
      const result = await api.polishResume(structuredClone(draft), polishProvider);
      await editingSession.dispatch({
        type: 'merge-polish-result',
        requestResumeId,
        polish: result.config.polish,
      });
      const saved = await editingSession.dispatch({ type: 'save' });
      if (saved.status === 'failed') throw new Error(saved.error);
      setSaveMsg(
        result.generated_count > 0
          ? `已生成 ${result.generated_count} 条润色内容`
          : '没有可润色的项目或经历，已保留原文',
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setPolishProviderError(message);
      setPolishSettingsOpen(true);
      setSaveMsg(`AI 润色失败：${message}`);
    } finally {
      setPolishGenerating(false);
    }
  };

  /** 保存模型配置与用户选择的润色字段。字段选择属于当前简历视角。 */
  const handleSavePolishProvider = async (
    provider: ResumePolishProviderConfig,
    selectedFields: ResumePolishField[],
  ) => {
    if (selectedFields.length === 0) {
      setPolishProviderError('至少选择一项润色内容');
      return;
    }
    setPolishProvider(provider);
    setPolishProviderError('');
    try {
      window.localStorage.setItem(POLISH_PROVIDER_STORAGE_KEY, JSON.stringify(provider));
    } catch {
      setPolishProviderError('浏览器无法保存本地配置，但本次仍可继续使用');
    }
    setPolishSettingsOpen(false);
    const nextPolish: ResumePolishConfig = {
      ...(polish || {}),
      selected_fields: selectedFields,
    };
    await editingSession.dispatch({ type: 'edit-draft', patch: { polish: nextPolish } });
    const saved = await editingSession.dispatch({ type: 'save' });
    if (saved.status === 'saved') {
      setSaveMsg('AI 润色模型和内容选择已保存');
    } else if (saved.status === 'failed') {
      setSaveMsg(`保存 AI 润色设置失败：${saved.error}`);
    }
  };

  /** 只重新生成当前条目的一个字段，供字段旁的“换一换”使用。 */
  const handleRegeneratePolish = async (path: string, field: ResumePolishField) => {
    const providerConfigured = Boolean(
      polishProvider.protocol &&
        polishProvider.base_url.trim() &&
        polishProvider.api_key.trim() &&
        polishProvider.model.trim(),
    );
    if (!providerConfigured) {
      setPolishSettingsOpen(true);
      setPolishProviderError('请先选择协议并配置 Base URL、API Key 和模型');
      return;
    }
    const generatingKey = `${path}:${field}`;
    setPolishGeneratingKey(generatingKey);
    setSaveMsg('');
    try {
      if (!draft) throw new Error('没有可润色的简历草稿');
      const requestResumeId = draft.id;
      const requestConfig: ResumeConfig = { ...structuredClone(draft), polish: {
        ...(polish || {}),
        enabled: true,
        selected_fields: selectedPolishFields.length > 0 ? selectedPolishFields : DEFAULT_POLISH_FIELDS,
      } };
      const result = await api.polishResume(requestConfig, polishProvider, { only: { path, field } });
      await editingSession.dispatch({
        type: 'merge-polish-result',
        requestResumeId,
        polish: result.config.polish,
      });
      const saved = await editingSession.dispatch({ type: 'save' });
      if (saved.status === 'failed') throw new Error(saved.error);
      setSaveMsg(result.generated_count > 0 ? '已换一版润色内容' : '未生成新的内容，请稍后重试');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPolishProviderError(message);
      setPolishSettingsOpen(true);
      setSaveMsg(`重新生成失败：${message}`);
    } finally {
      setPolishGeneratingKey(null);
    }
  };

  const handleFetchPolishModels = async (provider: ResumePolishProviderConfig) => {
    setPolishModelsLoading(true);
    setPolishProviderError('');
    try {
      const models = await api.getPolishModels(provider);
      setPolishModels(models);
      if (models.length === 0) setPolishProviderError('模型列表为空，请手动填写模型名称');
    } catch (error) {
      setPolishProviderError(error instanceof Error ? error.message : String(error));
    } finally {
      setPolishModelsLoading(false);
    }
  };

  /** 构造当前预览对应的文件，并交给系统“另存为”或浏览器下载。 */
  const handleExport = async (
    format: ResumeExportFormat,
    filename: string,
  ): Promise<ExportResult> => {
    const fullFilename = `${filename}.${format}`;
    if (format === 'pdf') {
      const resumeElement = document.querySelector<HTMLElement>('.print-area');
      if (!resumeElement) throw new Error('预览尚未准备好，请稍后重试');
      const blob = await createResumePdfBlob({ element: resumeElement });
      return saveExportBlob({
        blob,
        filename: fullFilename,
        description: 'PDF 简历',
        mimeType: 'application/pdf',
        extension: '.pdf',
      });
    }

    if (format === 'json') {
      if (!resumeView) throw new Error('没有可导出的简历视图');
      const blob = createResumeJsonBlob(resumeView);
      return saveExportBlob({
        blob,
        filename: fullFilename,
        description: 'JSON 简历数据',
        mimeType: 'application/json',
        extension: '.json',
      });
    }

    const resumeMarkup = document.querySelector('.print-area')?.outerHTML;
    if (!resumeMarkup) throw new Error('预览尚未准备好，请稍后重试');
    const fullHTML = buildStandaloneResumeHtml({
      title: resumeName,
      resumeMarkup,
      cssText: collectDocumentCss(),
    });
    const blob = new Blob([fullHTML], { type: 'text/html' });
    return saveExportBlob({
      blob,
      filename: fullFilename,
      description: 'HTML 简历',
      mimeType: 'text/html',
      extension: '.html',
    });
  };

  // ---------- 渲染 ----------

  const saveMsgIsError = /失败|无法|未保存/.test(saveMsg);

  useEffect(() => {
    if (!saveMsg) return undefined;

    const timeout = window.setTimeout(() => setSaveMsg(''), saveMsgIsError ? 6000 : 3000);
    return () => window.clearTimeout(timeout);
  }, [saveMsg, saveMsgIsError]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col">
        {/* 顶栏 */}
        <div className="editor-toolbar no-print">
          <div className="toolbar-document-group">
            <ResumeSelector
              resumes={resumeList}
              currentId={currentResumeId}
              onChange={handleSelectResume}
              onNew={handleNewResume}
              onDuplicate={handleDuplicateResume}
              onDelete={handleDeleteResume}
              name={resumeName}
              onNameChange={(name) => {
                void editingSession.dispatch({ type: 'change-name', name });
              }}
            />
            <TemplateSelector
              templates={templateList}
              currentId={templateId}
              onChange={(template) => {
                void editingSession.dispatch({ type: 'edit-draft', patch: { template } });
              }}
              onDuplicate={handleDuplicateTemplate}
              onDelete={handleDeleteTemplate}
            />
          </div>
          <div className="toolbar-utilities-group">
            <div className="polish-provider-anchor" ref={polishProviderAnchorRef}>
              <PolishControls
                enabled={polishEnabled}
                hasEntries={Object.keys(polish?.entries || {}).length > 0}
                generating={polishGenerating}
                selectedFieldCount={selectedPolishFields.length}
                providerConfigured={Boolean(
                  polishProvider.protocol &&
                    polishProvider.base_url.trim() &&
                    polishProvider.api_key.trim() &&
                    polishProvider.model.trim(),
                )}
                settingsOpen={polishSettingsOpen}
                onChange={handlePolishChange}
                onOpenSettings={() => {
                  setPolishProviderError('');
                  setPrivacySettingsOpen(false);
                  setPolishSettingsOpen((open) => !open);
                }}
              />
              <PolishProviderSettings
                provider={polishProvider}
                selectedFields={selectedPolishFields}
                open={polishSettingsOpen}
                models={polishModels}
                loadingModels={polishModelsLoading}
                error={polishProviderError}
                onClose={() => setPolishSettingsOpen(false)}
                onSave={handleSavePolishProvider}
                onFetchModels={handleFetchPolishModels}
              />
            </div>
            <PrivacyControls
              config={privacy}
              open={privacySettingsOpen}
              onChange={(nextPrivacy) => {
                void editingSession.dispatch({
                  type: 'edit-draft',
                  patch: { privacy: nextPrivacy },
                });
              }}
              onOpenChange={(open) => {
                if (open) setPolishSettingsOpen(false);
                setPrivacySettingsOpen(open);
              }}
            />
          </div>
          <div className="toolbar-actions">
            <div className="editor-view-switch" role="group" aria-label="编辑器视图">
              <button
                type="button"
                aria-pressed={workspaceView === 'edit'}
                onClick={() => setWorkspaceView('edit')}
              >
                编辑
              </button>
              <button
                type="button"
                aria-pressed={workspaceView === 'preview'}
                onClick={() => setWorkspaceView('preview')}
              >
                预览
              </button>
            </div>
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="toolbar-button strong"
            >
              <UiIcon name="save" size={16} /> {saving ? '保存中…' : '保存'}
            </button>
            <button
              onClick={onRefreshWiki}
              className="toolbar-icon-button"
              title="重新编译 Wiki"
              aria-label="重新编译 Wiki"
            >
              <UiIcon name="refresh" size={18} />
            </button>
          </div>
          {saveMsg && !polishSettingsOpen && (
            <span
              className={`save-status ${saveMsgIsError ? 'is-error' : ''}`}
              role={saveMsgIsError ? 'alert' : 'status'}
            >
              {saveMsg}
            </span>
          )}
        </div>

        {/* 三栏布局 */}
        <div className={`editor-workspace workspace-view-${workspaceView}`}>
          {/* 中间编辑区 */}
          <div className="edit-pane no-print">
            <EditPanel
              modules={modules}
              wikiEntities={resumeWikiEntities}
              onAddModules={handleModuleSelection}
              onReorder={handleReorderModule}
              onToggleExpand={handleToggleExpand}
              onOverrideField={handleOverrideField}
              onToggleItemVisibility={handleToggleItemVisibility}
              onRemoveModule={handleRemoveModule}
              polish={polishEnabled ? polish : undefined}
              polishGeneratingKey={polishGeneratingKey}
              onRegeneratePolish={handleRegeneratePolish}
            />
          </div>

          {/* 右侧预览 */}
          <div className="preview-pane">
            {resumeView && (
              <PreviewPanel
                view={resumeView}
                template={currentTemplate}
                onOpenExport={() => {
                  setPolishSettingsOpen(false);
                  setPrivacySettingsOpen(false);
                  setExportDialogOpen(true);
                }}
              />
            )}
          </div>
        </div>
      </div>

      <ExportDialog
        open={exportDialogOpen}
        resumeName={resumeName}
        privacyEnabledCount={Object.values(privacy).filter(Boolean).length}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
      />
    </DndContext>
  );
}
