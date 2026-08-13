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
  ResumePolishField,
  ResumePolishProviderConfig,
} from '../types';
import { MODULE_LIBRARY } from '../types';

import * as api from '../api/client';
import { createResumeConfig } from '../resume/config';
import { createResumeEditingSession } from '../resume/editingSession';
import {
  createResumeContentOrchestration,
  type ResumeContentOrchestrationResult,
} from '../resume/contentOrchestration';
import { applyPolishToEntities, getSelectedPolishFields } from '../resume/polish';
import {
  createResumePolishWorkflow,
  isPolishProviderConfigured,
} from '../resume/polishWorkflow';
import { projectResume } from '../resume/projection';
import {
  buildStandaloneResumeHtml,
  collectDocumentCss,
  createResumePdfBlob,
  createResumeJsonBlob,
  saveExportBlob,
} from '../resume/export';

const DEFAULT_PRIVACY: PrivacyConfig = {
  mask_name: false,
  mask_phone: true,
  mask_email: true,
  mask_salary: true,
  mask_company: false,
  mask_github: false,
};

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
    createResumeEditingSession({
      resumes,
      saveResume: api.saveResume,
      deleteResume: api.deleteResume,
      polishResume: api.polishResume,
    }),
  );
  const session = useSyncExternalStore(
    editingSession.subscribe,
    editingSession.getSnapshot,
    editingSession.getSnapshot,
  );
  const [polishWorkflow] = useState(() => createResumePolishWorkflow({
    session: editingSession,
    modelClient: { getModels: api.getPolishModels },
  }));
  const polishWorkflowSnapshot = useSyncExternalStore(
    polishWorkflow.subscribe,
    polishWorkflow.getSnapshot,
    polishWorkflow.getSnapshot,
  );
  const [templateList, setTemplateList] = useState<TemplateConfig[]>(templates);
  const draft = session.draft;
  const currentResumeId = session.currentResumeId;
  const resumeList = session.resumes;
  const resumeName = draft?.name || '新建简历';
  const templateId = draft?.template || templates[0]?.id || '';
  const privacy = draft?.privacy || DEFAULT_PRIVACY;
  const polish = draft?.polish;
  const polishEnabled = polish?.enabled === true;
  const resumeWikiEntities = useMemo(
    () => applyPolishToEntities(
      wikiEntities,
      polishEnabled ? polish : { ...(polish || {}), enabled: false },
    ),
    [polish, polishEnabled, wikiEntities],
  );
  const [contentOrchestration] = useState(() => createResumeContentOrchestration({
    session: editingSession,
    wikiEntities: resumeWikiEntities,
  }));
  const contentSnapshot = useSyncExternalStore(
    contentOrchestration.subscribe,
    contentOrchestration.getSnapshot,
    contentOrchestration.getSnapshot,
  );
  const modules = contentSnapshot.modules;
  const saving = session.saveStatus === 'saving';
  const [saveMsg, setSaveMsg] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'edit' | 'preview'>('edit');
  const [activeOverlay, setActiveOverlay] = useState<'polish' | 'privacy' | 'export' | null>(null);
  const polishProviderAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeOverlay !== 'polish') return undefined;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const anchor = polishProviderAnchorRef.current;
      if (anchor && !anchor.contains(event.target as Node)) {
        setActiveOverlay(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [activeOverlay]);

  const polishProvider = polishWorkflowSnapshot.provider;
  const polishGenerating = polishWorkflowSnapshot.generating;
  const polishGeneratingKey = polishWorkflowSnapshot.generatingKey;
  const polishModels = polishWorkflowSnapshot.models;
  const polishModelsLoading = polishWorkflowSnapshot.modelsLoading;
  const polishProviderError = polishWorkflowSnapshot.error;

  // App 刷新数据时只同步服务端集合；当前草稿仍由编辑会话保护。
  useEffect(() => {
    void editingSession.dispatch({ type: 'replace-resumes', resumes });
  }, [editingSession, resumes]);
  useEffect(() => {
    setTemplateList(templates);
  }, [templates]);

  // ---------- 多简历管理（原 multi-resume 能力） ----------

  /** 切换简历：按 id 加载对应配置 */
  const handleSelectResume = async (id: string) => {
    const result = await editingSession.dispatch({ type: 'switch-resume', resumeId: id });
    if (result.status === 'confirm-discard') {
      if (!window.confirm('当前简历有未保存修改，切换后这些修改会丢失。确定继续吗？')) return;
      await editingSession.dispatch({ type: 'switch-resume', resumeId: id, discardDirty: true });
    }
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
      const result = await editingSession.dispatch({ type: 'create-resume', config });
      if (result.status === 'failed') throw new Error(result.error);
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
      const result = await editingSession.dispatch({ type: 'create-resume', config: copy });
      if (result.status === 'failed') throw new Error(result.error);
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
      const result = await editingSession.dispatch({ type: 'delete-current-resume' });
      if (result.status === 'failed') throw new Error(result.error);
    } catch (e) {
      alert(`删除简历失败: ${e instanceof Error ? e.message : e}`);
    }
  };

  // 当前模板对象
  const currentTemplate = templateList.find((t) => t.id === templateId) || null;
  const selectedPolishFields = getSelectedPolishFields(polish);
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

  useEffect(() => {
    contentOrchestration.setWikiEntities(resumeWikiEntities);
  }, [contentOrchestration, resumeWikiEntities]);

  // ---------- 内容编排工作流 ----------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;

    if (active.id !== over.id) {
      void contentOrchestration
        .moveModuleBefore(String(active.id), String(over.id))
        .then(reportContentResult);
    }
  };

  const reportContentResult = (result: ResumeContentOrchestrationResult) => {
    if (result.status === 'saved') setSaveMsg(result.message);
    if (result.status === 'unchanged') setSaveMsg(result.message);
    if (result.status === 'failed') setSaveMsg(`编排更新失败：${result.error}`);
  };

  const handleModuleSelection = async (types: EntityType[]): Promise<boolean> => {
    const result = await contentOrchestration.selectModules(types);
    reportContentResult(result);
    return result.status !== 'failed';
  };

  // ---------- 模块操作 ----------

  const handleToggleExpand = (id: string) => {
    contentOrchestration.toggleExpanded(id);
  };

  const handleOverrideField = (
    moduleId: string,
    itemPath: string,
    field: string,
    value: unknown,
  ) => {
    void contentOrchestration
      .overrideField(moduleId, itemPath, field, value)
      .then(reportContentResult);
  };

  const handleRemoveModule = async (id: string) => {
    reportContentResult(await contentOrchestration.removeModule(id));
  };

  /** 为键盘用户提供确定性的模块排序入口。 */
  const handleMoveModule = (moduleId: string, direction: 'up' | 'down') => {
    void contentOrchestration
      .moveModule(moduleId, direction)
      .then(reportContentResult);
  };

  /** 切换子项在当前简历中的可见性，不触碰 Wiki 数据。 */
  const handleToggleItemVisibility = (moduleId: string, itemId: string) => {
    void contentOrchestration
      .toggleItemVisibility(moduleId, itemId)
      .then(reportContentResult);
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
    setSaveMsg('');
    const result = await polishWorkflow.toggle(enabled);
    if (result.status === 'needs-config') {
      setActiveOverlay('polish');
      setSaveMsg('请先配置 AI 润色协议和模型');
      return;
    }
    if (result.status === 'failed') setActiveOverlay('polish');
    setSaveMsg(result.status === 'success' ? result.message : `AI 润色失败：${result.error}`);
  };

  /** 保存模型配置与用户选择的润色字段。字段选择属于当前简历视角。 */
  const handleSavePolishProvider = async (
    provider: ResumePolishProviderConfig,
    selectedFields: ResumePolishField[],
  ) => {
    const result = await polishWorkflow.saveProvider(provider, selectedFields);
    if (result.status === 'success') {
      setActiveOverlay(null);
      setSaveMsg(result.message);
    }
  };

  /** 只重新生成当前条目的一个字段，供字段旁的“换一换”使用。 */
  const handleRegeneratePolish = async (path: string, field: ResumePolishField) => {
    setSaveMsg('');
    const result = await polishWorkflow.regenerate(path, field);
    if (result.status === 'needs-config') setActiveOverlay('polish');
    setSaveMsg(result.status === 'success' ? result.message : `重新生成失败：${result.error}`);
  };

  const handleFetchPolishModels = async (provider: ResumePolishProviderConfig) => {
    await polishWorkflow.fetchModels(provider);
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
                providerConfigured={isPolishProviderConfigured(polishProvider)}
                settingsOpen={activeOverlay === 'polish'}
                onChange={handlePolishChange}
                onOpenSettings={() => {
                  polishWorkflow.clearError();
                  setActiveOverlay((overlay) => overlay === 'polish' ? null : 'polish');
                }}
              />
              <PolishProviderSettings
                provider={polishProvider}
                selectedFields={selectedPolishFields}
                open={activeOverlay === 'polish'}
                models={polishModels}
                loadingModels={polishModelsLoading}
                error={polishProviderError}
                onClose={() => setActiveOverlay(null)}
                onSave={handleSavePolishProvider}
                onFetchModels={handleFetchPolishModels}
              />
            </div>
            <PrivacyControls
              config={privacy}
              open={activeOverlay === 'privacy'}
              onChange={(nextPrivacy) => {
                void editingSession.dispatch({
                  type: 'edit-draft',
                  patch: { privacy: nextPrivacy },
                });
              }}
              onOpenChange={(open) => {
                setActiveOverlay(open ? 'privacy' : null);
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
          {saveMsg && activeOverlay !== 'polish' && (
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
              onApplyModules={handleModuleSelection}
              onMove={handleMoveModule}
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
                  setActiveOverlay('export');
                }}
              />
            )}
          </div>
        </div>
      </div>

      <ExportDialog
        open={activeOverlay === 'export'}
        resumeName={resumeName}
        privacyEnabledCount={Object.values(privacy).filter(Boolean).length}
        onClose={() => setActiveOverlay(null)}
        onExport={handleExport}
      />
    </DndContext>
  );
}
