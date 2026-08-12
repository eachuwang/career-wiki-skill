/**
 * ResumeEditor — 简历编辑器页面
 *
 * 布局：顶栏 + 左侧模块库 + 中间编辑区 + 右侧预览
 *
 * 顶栏：简历名称 | 模板选择 | 脱敏设置 | 导出PDF | 导出HTML | 导出JSON | 保存
 */

import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import ModuleLibrary from '../components/ModuleLibrary';
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
  ResumePolishProviderConfig,
} from '../types';
import { MODULE_LIBRARY } from '../types';

import * as api from '../api/client';
import {
  createResumeConfig,
  getHiddenItemIds,
  getModuleContentOverrides,
  updateContentOverride,
} from '../resume/config';
import { toggleHiddenItem } from '../resume/visibility';
import { applyPolishToEntities, getSelectedPolishFields, DEFAULT_POLISH_FIELDS } from '../resume/polish';
import {
  buildStandaloneResumeHtml,
  collectDocumentCss,
  createResumePdfBlob,
  saveExportBlob,
} from '../resume/export';

let moduleIdCounter = 0;
const POLISH_PROVIDER_STORAGE_KEY = 'career-wiki.resume-polish-provider';
const DEFAULT_POLISH_PROVIDER: ResumePolishProviderConfig = {
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model: '',
  timeout_ms: 60000,
};

function loadPolishProvider(): ResumePolishProviderConfig {
  if (typeof window === 'undefined') return DEFAULT_POLISH_PROVIDER;
  try {
    const raw = window.localStorage.getItem(POLISH_PROVIDER_STORAGE_KEY);
    if (!raw) return DEFAULT_POLISH_PROVIDER;
    const parsed = JSON.parse(raw) as Partial<ResumePolishProviderConfig>;
    return {
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

function genId(): string {
  moduleIdCounter++;
  return `module-${moduleIdCounter}`;
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
  // 当前简历配置（resumeList 为本地管理的简历列表，支持新建/复制/删除后即时刷新）
  const [currentResumeId, setCurrentResumeId] = useState<string>('');
  const [resumeList, setResumeList] = useState<ResumeConfig[]>(resumes);
  const [templateList, setTemplateList] = useState<TemplateConfig[]>(templates);
  const [resumeName, setResumeName] = useState('新建简历');
  const [templateId, setTemplateId] = useState<string>('');
  const [privacy, setPrivacy] = useState<PrivacyConfig>({
    mask_name: false,
    mask_phone: true,
    mask_email: true,
    mask_salary: true,
    mask_company: false,
    mask_github: false,
  });
  const [modules, setModules] = useState<ModuleInstance[]>([]);
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'edit' | 'preview'>('edit');
  const [polish, setPolish] = useState<ResumePolishConfig | undefined>();
  const [polishGenerating, setPolishGenerating] = useState(false);
  const [polishGeneratingKey, setPolishGeneratingKey] = useState<string | null>(null);
  const [polishProvider, setPolishProvider] = useState<ResumePolishProviderConfig>(loadPolishProvider);
  const [polishSettingsOpen, setPolishSettingsOpen] = useState(false);
  const [privacySettingsOpen, setPrivacySettingsOpen] = useState(false);
  const [polishModels, setPolishModels] = useState<string[]>([]);
  const [polishModelsLoading, setPolishModelsLoading] = useState(false);
  const [polishProviderError, setPolishProviderError] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // 加载简历配置
  const loadResume = useCallback(
    (config: ResumeConfig) => {
      setResumeName(config.name);
      setTemplateId(config.template);
      setPrivacy(
        config.privacy || {
          mask_name: false,
          mask_phone: true,
          mask_email: true,
          mask_salary: true,
          mask_company: false,
          mask_github: false,
        },
      );
      setModules(
        (config.modules || []).map((type) => {
          const def = MODULE_LIBRARY.find((m) => m.type === type);
          return {
            id: genId(),
            type,
            label: def?.label || type,
            expanded: false,
            overrides: getModuleContentOverrides(
              config.content_overrides,
              type,
              wikiEntities,
            ),
            hiddenItemIds: getHiddenItemIds(config.hide, type),
          };
        }),
      );
      setPolish(config.polish);
    },
    [wikiEntities],
  );

  // App 刷新数据时同步本地简历/模板列表
  useEffect(() => {
    setResumeList(resumes);
  }, [resumes]);
  useEffect(() => {
    setTemplateList(templates);
  }, [templates]);

  // 加载第一份简历
  useEffect(() => {
    if (resumeList.length > 0 && !currentResumeId) {
      setCurrentResumeId(resumeList[0].id);
      loadResume(resumeList[0]);
      // 简历配置里已带模板，直接返回；
      // 否则下面的默认模板逻辑会在同一次 effect 里用闭包中的旧值
      // 把 loadResume 设置的 templateId 覆盖掉
      return;
    }
    // 默认模板（仅在没有简历配置时兜底）
    if (templates.length > 0 && !templateId) {
      setTemplateId(templates[0].id);
    }
  }, [resumeList, templates, currentResumeId, templateId, loadResume]);

  // ---------- 多简历管理（原 multi-resume 能力） ----------

  /** 重新拉取简历列表并同步本地状态，返回最新列表 */
  const refreshResumeList = async (): Promise<ResumeConfig[]> => {
    const fresh = await api.getResumes();
    setResumeList(fresh);
    return fresh;
  };

  /** 切换简历：按 id 加载对应配置 */
  const handleSelectResume = (id: string) => {
    const config = resumeList.find((r) => r.id === id);
    if (!config || id === currentResumeId) return;
    setCurrentResumeId(id);
    loadResume(config);
  };

  /** 新建简历：默认模板 + 常用模块，保存后立即加载 */
  const handleNewResume = async () => {
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
        id: genId(),
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
      privacy: {
        mask_name: false,
        mask_phone: true,
        mask_email: true,
        mask_salary: true,
        mask_company: false,
        mask_github: false,
      },
      modules: newModules,
    });
    try {
      await api.saveResume(config);
      const fresh = await refreshResumeList();
      const created = fresh.find((r) => r.id === newId);
      if (created) {
        setCurrentResumeId(created.id);
        loadResume(created);
      }
    } catch (e) {
      alert(`新建简历失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  /** 复制当前简历：生成新 id/name，保留模板/模块/脱敏配置 */
  const handleDuplicateResume = async () => {
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
      const created = fresh.find((r) => r.id === newId);
      if (created) {
        setCurrentResumeId(created.id);
        loadResume(created);
      }
    } catch (e) {
      alert(`复制简历失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  /** 删除当前简历：确认后删除配置并切到剩余第一份 */
  const handleDeleteResume = async () => {
    const target = resumeList.find((r) => r.id === currentResumeId);
    if (!target || resumeList.length <= 1) return;
    if (!window.confirm(`确定删除简历「${target.name}」？仅删除配置，wiki 数据不受影响。`)) return;
    try {
      await api.deleteResume(target.id);
      const fresh = await refreshResumeList();
      if (fresh.length > 0) {
        setCurrentResumeId(fresh[0].id);
        loadResume(fresh[0]);
      } else {
        // 无简历：重置为空状态
        setCurrentResumeId('');
        setResumeName('新建简历');
        setModules([]);
      }
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
      setTemplateId(newId);
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
      setTemplateId(next);
    } catch (e) {
      alert(`删除模板失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  // ---------- dnd-kit handlers ----------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDrag({ id: String(e.active.id), type: String(e.active.data.current?.source) });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;

    // 从模块库拖入编辑区
    // 注意：编辑区非空时，useSortable 让每个模块卡片也成为 droppable，
    // closestCorners 会把 over 解析成卡片而非 edit-area 容器，
    // 所以这里必须同时处理两种落点，否则第二个模块永远拖不进来。
    if (active.data.current?.source === 'library') {
      const moduleType = active.data.current?.moduleType as EntityType;
      const def = MODULE_LIBRARY.find((m) => m.type === moduleType);
      if (!def) return;
      const newModule: ModuleInstance = {
        id: genId(),
        type: moduleType,
        label: def.label,
        expanded: false,
        overrides: {},
        hiddenItemIds: [],
      };
      setModules((prev) => {
        // 落在某个已有模块上 → 插入到它前面；落在空白处 → 追加到末尾
        const overIndex = prev.findIndex((m) => m.id === over.id);
        if (overIndex >= 0) {
          const next = [...prev];
          next.splice(overIndex, 0, newModule);
          return next;
        }
        return [...prev, newModule];
      });
      return;
    }

    // 编辑区内排序
    if (active.id !== over.id) {
      const oldIndex = modules.findIndex((m) => m.id === active.id);
      const newIndex = modules.findIndex((m) => m.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        setModules((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  // ---------- 模块操作 ----------

  const handleToggleExpand = (id: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m)),
    );
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
    setModules((prev) =>
      prev.map((m) =>
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
    // 用删除后的模块列表更新界面，并立即保存，
    // 保证刷新后被删组件不会重新出现。
    const nextModules = modules.filter((m) => m.id !== id);
    setModules(nextModules);
    await handleSave(nextModules);
  };

  /** 为键盘用户提供确定性的模块排序入口，并限制索引不越界。 */
  const handleReorderModule = (oldIndex: number, newIndex: number) => {
    if (newIndex < 0 || newIndex >= modules.length || oldIndex === newIndex) return;
    setModules((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  /** 切换子项在当前简历中的可见性，不触碰 Wiki 数据。 */
  const handleToggleItemVisibility = (moduleId: string, itemId: string) => {
    setModules((prev) =>
      prev.map((module) =>
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

  const buildResumeConfig = (
    modulesOverride?: ModuleInstance[],
    polishOverride?: ResumePolishConfig,
  ): ResumeConfig => {
    const baseConfig = resumeList.find((resume) => resume.id === currentResumeId);
    return createResumeConfig({
      resumeName,
      resumeId: currentResumeId,
      templateId,
      privacy,
      modules: modulesOverride ?? modules,
      baseConfig,
      polish: polishOverride ?? polish,
    });
  };

  const handleSave = async (modulesOverride?: ModuleInstance[]) => {
    setSaving(true);
    setSaveMsg('');
    try {
      const config = buildResumeConfig(modulesOverride);
      await api.saveResume(config);
      setResumeList((current) =>
        current.map((resume) => (resume.id === config.id ? config : resume)),
      );
      setSaveMsg(modulesOverride ? '已删除并保存' : '已保存');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg(`保存失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  /** 开启 AI 润色时先生成结果，再切换预览；关闭时立即回到原始 Wiki 内容。 */
  const handlePolishChange = async (enabled: boolean) => {
    const previousPolish = polish;
    if (!enabled) {
      const nextPolish = { ...(polish || {}), enabled: false };
      const config = buildResumeConfig(undefined, nextPolish);
      setPolish(nextPolish);
      try {
        await api.saveResume(config);
        setResumeList((current) =>
          current.map((resume) => (resume.id === config.id ? config : resume)),
        );
        setSaveMsg('已关闭 AI 润色，当前显示原文');
      } catch (e) {
        setPolish(previousPolish);
        setSaveMsg(`保存 AI 润色设置失败：${e instanceof Error ? e.message : e}`);
      }
      return;
    }

    const hasCachedPolish = Object.keys(polish?.entries || {}).length > 0;
    const providerConfigured = Boolean(
      polishProvider.base_url.trim() && polishProvider.api_key.trim() && polishProvider.model.trim(),
    );
    if (!providerConfigured && hasCachedPolish) {
      const nextPolish = { ...(polish || {}), enabled: true };
      const config = buildResumeConfig(undefined, nextPolish);
      setPolish(nextPolish);
      try {
        await api.saveResume(config);
        setResumeList((current) =>
          current.map((resume) => (resume.id === config.id ? config : resume)),
        );
        setSaveMsg('已开启 AI 润色，使用已有结果');
      } catch (e) {
        setPolish(previousPolish);
        setSaveMsg(`保存 AI 润色设置失败：${e instanceof Error ? e.message : e}`);
      }
      return;
    }
    if (!providerConfigured) {
      setPolishSettingsOpen(true);
      setPolishProviderError('请先配置 Base URL、API Key 和模型');
      setSaveMsg('请先配置 AI 润色模型');
      return;
    }

    setPolishGenerating(true);
    setSaveMsg('');
    try {
      const config = buildResumeConfig();
      const result = await api.polishResume(config, polishProvider);
      await api.saveResume(result.config);
      setPolish(result.config.polish);
      setResumeList((current) =>
        current.map((resume) => (resume.id === result.config.id ? result.config : resume)),
      );
      setSaveMsg(
        result.generated_count > 0
          ? `已生成 ${result.generated_count} 条润色内容`
          : '没有可润色的项目或经历，已保留原文',
      );
    } catch (e) {
      setSaveMsg(`AI 润色失败：${e instanceof Error ? e.message : e}`);
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
    setPolish(nextPolish);
    try {
      const config = buildResumeConfig(undefined, nextPolish);
      await api.saveResume(config);
      setResumeList((current) =>
        current.map((resume) => (resume.id === config.id ? config : resume)),
      );
      setSaveMsg('AI 润色模型和内容选择已保存');
    } catch (error) {
      setSaveMsg(`保存 AI 润色设置失败：${error instanceof Error ? error.message : error}`);
    }
  };

  /** 只重新生成当前条目的一个字段，供字段旁的“换一换”使用。 */
  const handleRegeneratePolish = async (path: string, field: ResumePolishField) => {
    const providerConfigured = Boolean(
      polishProvider.base_url.trim() && polishProvider.api_key.trim() && polishProvider.model.trim(),
    );
    if (!providerConfigured) {
      setPolishSettingsOpen(true);
      setPolishProviderError('请先配置 Base URL、API Key 和模型');
      return;
    }

    const generatingKey = `${path}:${field}`;
    setPolishGeneratingKey(generatingKey);
    setSaveMsg('');
    try {
      const config = buildResumeConfig(undefined, {
        ...(polish || {}),
        enabled: true,
        selected_fields: selectedPolishFields.length > 0 ? selectedPolishFields : DEFAULT_POLISH_FIELDS,
      });
      const result = await api.polishResume(config, polishProvider, { only: { path, field } });
      await api.saveResume(result.config);
      setPolish(result.config.polish);
      setResumeList((current) =>
        current.map((resume) => (resume.id === result.config.id ? result.config : resume)),
      );
      setSaveMsg(result.generated_count > 0 ? '已换一版润色内容' : '未生成新的内容，请稍后重试');
    } catch (error) {
      setSaveMsg(`重新生成失败：${error instanceof Error ? error.message : error}`);
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
      const blob = await api.exportResumeJson(buildResumeConfig());
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
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
              onNameChange={setResumeName}
            />
            <TemplateSelector
              templates={templateList}
              currentId={templateId}
              onChange={setTemplateId}
              onDuplicate={handleDuplicateTemplate}
              onDelete={handleDeleteTemplate}
            />
          </div>
          <div className="toolbar-utilities-group">
            <div className="polish-provider-anchor">
              <PolishControls
                enabled={polishEnabled}
                hasEntries={Object.keys(polish?.entries || {}).length > 0}
                generating={polishGenerating}
                selectedFieldCount={selectedPolishFields.length}
                providerConfigured={Boolean(
                  polishProvider.base_url.trim() && polishProvider.api_key.trim() && polishProvider.model.trim(),
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
              onChange={setPrivacy}
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
          {saveMsg && (
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
          {/* 左侧模块库 */}
          <div className="library-pane no-print">
            <ModuleLibrary />
          </div>

          {/* 中间编辑区 */}
          <div className="edit-pane no-print">
            <EditPanel
              modules={modules}
              wikiEntities={resumeWikiEntities}
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
            <PreviewPanel
              modules={modules}
              wikiEntities={resumeWikiEntities}
              template={currentTemplate}
              privacy={privacy}
              resumeName={resumeName}
              onOpenExport={() => {
                setPolishSettingsOpen(false);
                setPrivacySettingsOpen(false);
                setExportDialogOpen(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* 拖拽 overlay */}
      <DragOverlay>
        {activeDrag ? (
          <div className="drag-overlay-card">
            <UiIcon name="grip" size={18} /> 拖拽中：{activeDrag.type}
          </div>
        ) : null}
      </DragOverlay>

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
