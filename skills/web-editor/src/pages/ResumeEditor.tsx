/** ResumeEditor — 简历编辑工作区的 React 与浏览器适配层。 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

import ExportDialog from '../components/ExportDialog';
import ModuleEditDialog from '../components/ModuleEditDialog';
import ModuleSettings from '../components/ModuleSettings';
import PolishControls from '../components/PolishControls';
import PolishProviderSettings from '../components/PolishProviderSettings';
import PreviewPanel from '../components/PreviewPanel';
import PrivacyControls from '../components/PrivacyControls';
import ResumeSelector from '../components/ResumeSelector';
import TemplateSelector from '../components/TemplateSelector';
import TopBar, { type TopBarPage } from '../components/TopBar';
import UiIcon from '../components/UiIcon';
import * as api from '../api/client';
import { exportResumePreview, type ResumeExportFormat } from '../resume/browserExport';
import { createResumeEditingWorkspace } from '../resume/editingWorkspace';
import { POLISH_PROVIDER_STORAGE_KEY } from '../resume/polishWorkflow';
import type {
  EntityType,
  ResumeConfig,
  ResumePolishField,
  ResumePolishProviderConfig,
  TemplateConfig,
  WikiEntity,
} from '../types';
import type { ReactNode } from 'react';

interface ResumeEditorProps {
  wikiEntities: WikiEntity[];
  templates: TemplateConfig[];
  resumes: ResumeConfig[];
  polishProvider: ResumePolishProviderConfig;
  page: TopBarPage;
  onNavigate: (page: TopBarPage) => void;
  trailing?: ReactNode;
}

/** 预览点击编辑的定位目标 */
export interface EditTarget {
  path?: string;
  field?: string;
}

export default function ResumeEditor({
  wikiEntities,
  templates,
  resumes,
  polishProvider,
  page,
  onNavigate,
  trailing,
}: ResumeEditorProps) {
  const [workspace] = useState(() => createResumeEditingWorkspace({
    resumes,
    templates,
    wikiEntities,
    saveResume: api.saveResume,
    deleteResume: api.deleteResume,
    polishResume: api.polishResume,
    modelClient: { getModels: api.getPolishModels },
    polishProviderStorage: {
      load: () => polishProvider,
      save: api.savePolishProvider,
    },
    templateRepository: {
      list: api.getTemplates,
      getCss: api.getTemplateCss,
      save: api.saveTemplate,
      delete: api.deleteTemplate,
    },
    confirmation: { confirm: (message) => window.confirm(message) },
  }));
  const state = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    workspace.getSnapshot,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // 中央悬浮编辑窗状态
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>({});

  useEffect(() => {
    window.localStorage.removeItem(POLISH_PROVIDER_STORAGE_KEY);
  }, []);

  useEffect(() => {
    void workspace.dispatch({ type: 'replace-inputs', resumes, templates, wikiEntities });
  }, [resumes, templates, wikiEntities, workspace]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      void workspace.dispatch({
        type: 'move-module-before',
        activeId: String(active.id),
        overId: String(over.id),
      });
    }
  };

  const handleModuleSelection = async (moduleTypes: EntityType[]): Promise<boolean> => {
    const result = await workspace.dispatch({ type: 'select-modules', moduleTypes });
    return result.status !== 'failed';
  };

  const handleExport = (format: ResumeExportFormat, filename: string) => exportResumePreview({
    format,
    filename,
    resumeName: state.resumeName,
    resumeView: state.resumeView,
  });

  /** 点击预览文字 → 打开对应模块的中央编辑窗并定位到字段 */
  const handleEditBlock = (moduleType: EntityType, path?: string, field?: string) => {
    const module = state.modules.find((m) => m.type === moduleType);
    if (!module) return;
    setEditTarget({ path, field });
    setEditingModuleId(module.id);
  };

  const feedbackIsError = state.feedback?.tone === 'error';
  const editingModule = state.modules.find((m) => m.id === editingModuleId) || null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col">
        <TopBar page={page} onNavigate={onNavigate} trailing={trailing}>
          <div className="toolbar-document-group">
            <ResumeSelector
              resumes={state.resumes}
              currentId={state.currentResumeId}
              onChange={(resumeId) => {
                void workspace.dispatch({ type: 'select-resume', resumeId });
              }}
              onNew={() => {
                void workspace.dispatch({ type: 'create-resume' });
              }}
              onDuplicate={() => {
                void workspace.dispatch({ type: 'duplicate-resume' });
              }}
              onDelete={() => {
                void workspace.dispatch({ type: 'delete-resume' });
              }}
              name={state.resumeName}
              onNameChange={(name) => {
                void workspace.dispatch({ type: 'change-name', name });
              }}
            />
            <TemplateSelector
              templates={state.templates}
              currentId={state.templateId}
              onChange={(templateId) => {
                void workspace.dispatch({ type: 'select-template', templateId });
              }}
              onDuplicate={() => {
                void workspace.dispatch({ type: 'duplicate-template' });
              }}
              onDelete={() => {
                void workspace.dispatch({ type: 'delete-template' });
              }}
            />
          </div>

          <div className="toolbar-utilities-group">
            <div className="polish-provider-anchor">
              <PolishControls
                enabled={state.polishEnabled}
                hasEntries={Object.keys(state.polish?.entries || {}).length > 0}
                generating={state.polishGenerating}
                selectedFieldCount={state.selectedPolishFields.length}
                providerConfigured={state.polishProviderConfigured}
                settingsOpen={state.activeOverlay === 'polish'}
                variants={state.polishVariants}
                selectedVariant={state.polishSelectedVariant}
                onChange={(enabled) => {
                  void workspace.dispatch({ type: 'toggle-polish', enabled });
                }}
                onOpenSettings={() => {
                  void workspace.dispatch({ type: 'open-polish-settings' });
                }}
                onRegenerateAll={() => {
                  void workspace.dispatch({ type: 'regenerate-all-polish' });
                }}
                onSelectVariant={(index) => {
                  void workspace.dispatch({ type: 'select-polish-variant', index });
                }}
              />
              <PolishProviderSettings
                provider={state.polishProvider}
                selectedFields={state.selectedPolishFields}
                open={state.activeOverlay === 'polish'}
                models={state.polishModels}
                loadingModels={state.polishModelsLoading}
                error={state.polishProviderError}
                onClose={() => {
                  void workspace.dispatch({ type: 'close-overlay' });
                }}
                onSave={(
                  provider: ResumePolishProviderConfig,
                  selectedFields: ResumePolishField[],
                ) => workspace.dispatch({
                  type: 'save-polish-provider',
                  provider,
                  selectedFields,
                }).then(() => undefined)}
                onFetchModels={(provider) => workspace.dispatch({
                  type: 'fetch-polish-models',
                  provider,
                }).then(() => undefined)}
              />
            </div>
            <PrivacyControls
              config={state.privacy}
              open={state.activeOverlay === 'privacy'}
              onChange={(privacy) => {
                void workspace.dispatch({ type: 'change-privacy', privacy });
              }}
              onOpenChange={(open) => {
                void workspace.dispatch(open
                  ? { type: 'toggle-overlay', overlay: 'privacy' }
                  : { type: 'close-overlay' });
              }}
            />
          </div>

          <div className="toolbar-actions">
            <ModuleSettings
              modules={state.modules}
              wikiEntities={state.resumeWikiEntities}
              onApplyModules={handleModuleSelection}
              onOpenModule={(moduleId) => {
                setEditTarget({});
                setEditingModuleId(moduleId);
              }}
            />
            <button
              onClick={() => {
                void workspace.dispatch({ type: 'toggle-overlay', overlay: 'export' });
              }}
              className="toolbar-button primary"
              title="导出简历"
            >
              <UiIcon name="download" size={16} /> 导出
            </button>
            <button
              onClick={() => void workspace.dispatch({ type: 'save' })}
              disabled={state.saving}
              className="toolbar-button strong"
            >
              <UiIcon name="save" size={16} /> {state.saving ? '保存中…' : '保存'}
            </button>
          </div>
        </TopBar>

        {state.feedback && state.activeOverlay !== 'polish' && (
          <span
            className={'save-status' + (feedbackIsError ? ' is-error' : '')}
            role={feedbackIsError ? 'alert' : 'status'}
          >
            {state.feedback.message}
          </span>
        )}

        <div className="editor-workspace">
          <div className="preview-pane">
            {state.resumeView && (
              <PreviewPanel
                view={state.resumeView}
                template={state.currentTemplate}
                onEditBlock={handleEditBlock}
              />
            )}
          </div>
        </div>

        <ExportDialog
          open={state.activeOverlay === 'export'}
          resumeName={state.resumeName}
          privacyEnabledCount={Object.values(state.privacy).filter(Boolean).length}
          onClose={() => {
            void workspace.dispatch({ type: 'close-overlay' });
          }}
          onExport={handleExport}
        />

        {editingModule && (
          <ModuleEditDialog
            module={editingModule}
            wikiEntities={state.resumeWikiEntities}
            initialTarget={editTarget}
            onClose={() => {
              setEditingModuleId(null);
              setEditTarget({});
            }}
            onOverrideField={(moduleId, itemPath, field, value) => {
              void workspace.dispatch({ type: 'override-field', moduleId, itemPath, field, value });
            }}
            onRestoreField={(moduleId, itemPath, field) => {
              void workspace.dispatch({ type: 'restore-field', moduleId, itemPath, field });
            }}
            onToggleItemVisibility={(moduleId, itemId) => {
              void workspace.dispatch({ type: 'toggle-item-visibility', moduleId, itemId });
            }}
            polish={state.polishEnabled ? state.polish : undefined}
            polishGeneratingKey={state.polishGeneratingKey}
            onRegeneratePolish={(path, field) => {
              void workspace.dispatch({ type: 'regenerate-polish', path, field });
            }}
          />
        )}
      </div>
    </DndContext>
  );
}
