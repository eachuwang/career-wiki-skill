/**
 * ResumeEditor — 简历编辑器页面（编排 + 渲染壳）
 *
 * 布局：顶栏 + 左侧模块库 + 中间编辑区 + 右侧预览
 *
 * 职责域已拆分到 hooks：
 * - useResumes：多简历 CRUD（选择 / 新建 / 复制 / 删除）
 * - useTemplates：模板 CRUD（复制 / 删除 / 切换）
 * - useModules：模块操作 + dnd-kit 拖拽
 * 本组件只负责跨域协调（loadResume / save / export）与布局渲染。
 */

import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core';

import ModuleLibrary from '../components/ModuleLibrary';
import EditPanel from '../components/EditPanel';
import PreviewPanel from '../components/PreviewPanel';
import ResumeSelector from '../components/ResumeSelector';
import TemplateSelector from '../components/TemplateSelector';
import PrivacyControls from '../components/PrivacyControls';
import UiIcon from '../components/UiIcon';

import type {
  ModuleInstance,
  WikiEntity,
  TemplateConfig,
  ResumeConfig,
  PrivacyConfig,
} from '../types';
import { MODULE_LIBRARY } from '../constants';

import * as api from '../api/client';
import { createResumeConfig, getHiddenItemIds } from '../resume/config';
import { DEFAULT_EDITOR_PRIVACY } from '../resume/privacy';
import {
  buildStandaloneResumeHtml,
  collectDocumentCss,
  downloadResumePdf,
} from '../resume/export';

import { useResumes, genId } from '../hooks/useResumes';
import { useTemplates } from '../hooks/useTemplates';
import { useModules } from '../hooks/useModules';

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
  const [resumeName, setResumeName] = useState('新建简历');
  const [privacy, setPrivacy] = useState<PrivacyConfig>(DEFAULT_EDITOR_PRIVACY);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [workspaceView, setWorkspaceView] = useState<'edit' | 'preview'>('edit');

  // 模板管理
  const {
    templateList,
    templateId,
    setTemplateId,
    currentTemplate,
    handleDuplicateTemplate,
    handleDeleteTemplate,
  } = useTemplates({ initialTemplates: templates });

  // handleSave 需要穿过多层 hook，用 ref 打破循环依赖
  const saveRef = useRef<(modulesOverride?: ModuleInstance[]) => Promise<void>>(
    async () => {},
  );

  // 模块操作 + dnd
  const {
    modules,
    setModules,
    activeDrag,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleToggleExpand,
    handleOverrideField,
    handleRemoveModule,
    handleReorderModule,
    handleToggleItemVisibility,
  } = useModules({
    onRemoveSave: async (mods) => saveRef.current(mods),
  });

  // 将简历配置加载到编辑器状态（跨域协调）
  const loadResume = useCallback(
    (config: ResumeConfig) => {
      setResumeName(config.name);
      setTemplateId(config.template);
      setPrivacy(config.privacy || DEFAULT_EDITOR_PRIVACY);
      setModules(
        (config.modules || []).map((type) => {
          const def = MODULE_LIBRARY.find((m) => m.type === type);
          return {
            id: genId(),
            type,
            label: def?.label || type,
            expanded: false,
            overrides: {},
            hiddenItemIds: getHiddenItemIds(config.hide, type),
          };
        }),
      );
    },
    [setTemplateId, setModules],
  );

  const onResetEmpty = useCallback(() => {
    setResumeName('新建简历');
    setPrivacy(DEFAULT_EDITOR_PRIVACY);
    setModules([]);
  }, [setModules]);

  // 多简历管理
  const {
    currentResumeId,
    resumeList,
    handleSelectResume,
    handleNewResume,
    handleDuplicateResume,
    handleDeleteResume,
  } = useResumes({
    initialResumes: resumes,
    templates,
    templateId,
    onLoadResume: loadResume,
    onResetEmpty,
  });

  // ---------- 导出与保存 ----------

  const buildResumeConfig = useCallback(
    (modulesOverride?: ModuleInstance[]): ResumeConfig => {
      const baseConfig = resumes.find((resume) => resume.id === currentResumeId);
      return createResumeConfig({
        resumeName,
        resumeId: currentResumeId,
        templateId,
        privacy,
        modules: modulesOverride ?? modules,
        baseConfig,
      });
    },
    [resumes, currentResumeId, resumeName, templateId, privacy, modules],
  );

  const handleSave = useCallback(
    async (modulesOverride?: ModuleInstance[]) => {
      setSaving(true);
      setSaveMsg('');
      try {
        const config = buildResumeConfig(modulesOverride);
        await api.saveResume(config);
        setSaveMsg(modulesOverride ? '已删除并保存' : '已保存');
        setTimeout(() => setSaveMsg(''), 3000);
      } catch (e) {
        setSaveMsg(`保存失败：${e instanceof Error ? e.message : e}`);
      } finally {
        setSaving(false);
      }
    },
    [buildResumeConfig],
  );

  // 刷新 ref，供 useModules.onRemoveSave 调用
  saveRef.current = handleSave;

  const handleExportPDF = useCallback(async () => {
    const resumeElement = document.querySelector<HTMLElement>('.print-area');
    if (!resumeElement) return;
    try {
      await downloadResumePdf({
        element: resumeElement,
        filename: `${resumeName}.pdf`,
      });
    } catch (e) {
      alert(`导出 PDF 失败: ${e instanceof Error ? e.message : e}`);
    }
  }, [resumeName]);

  const handleExportHTML = useCallback(() => {
    const resumeMarkup = document.querySelector('.print-area')?.outerHTML;
    if (!resumeMarkup) return;
    const fullHTML = buildStandaloneResumeHtml({
      title: resumeName,
      resumeMarkup,
      cssText: collectDocumentCss(),
    });
    const blob = new Blob([fullHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resumeName}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resumeName]);

  const handleExportJSON = useCallback(async () => {
    try {
      const config = buildResumeConfig();
      const blob = await api.exportResumeJson(config);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resumeName}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`导出 JSON 失败: ${e instanceof Error ? e.message : e}`);
    }
  }, [buildResumeConfig, resumeName]);

  // ---------- 渲染 ----------

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
          <div className="toolbar-primary">
            <ResumeSelector
              resumes={resumeList}
              currentId={currentResumeId}
              onChange={handleSelectResume}
              onNew={handleNewResume}
              onDuplicate={handleDuplicateResume}
              onDelete={handleDeleteResume}
            />
            <label className="toolbar-field">
              <span>简历名称</span>
              <input
                type="text"
                value={resumeName}
                onChange={(e) => setResumeName(e.target.value)}
                className="resume-name-input"
              />
            </label>
            <TemplateSelector
              templates={templateList}
              currentId={templateId}
              onChange={setTemplateId}
              onDuplicate={handleDuplicateTemplate}
              onDelete={handleDeleteTemplate}
            />
          </div>
          <div className="toolbar-privacy">
            <PrivacyControls config={privacy} onChange={setPrivacy} />
          </div>
          <div className="toolbar-actions">
            {saveMsg && <span className="save-status" role="status">{saveMsg}</span>}
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
              <UiIcon name="save" size={16} /> {saving ? '保存中...' : '保存配置'}
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
              wikiEntities={wikiEntities}
              onReorder={handleReorderModule}
              onToggleExpand={handleToggleExpand}
              onOverrideField={handleOverrideField}
              onToggleItemVisibility={handleToggleItemVisibility}
              onRemoveModule={handleRemoveModule}
            />
          </div>

          {/* 右侧预览 */}
          <div className="preview-pane">
            <PreviewPanel
              modules={modules}
              wikiEntities={wikiEntities}
              template={currentTemplate}
              privacy={privacy}
              resumeName={resumeName}
              onExportPDF={handleExportPDF}
              onExportHTML={handleExportHTML}
              onExportJSON={handleExportJSON}
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
    </DndContext>
  );
}
