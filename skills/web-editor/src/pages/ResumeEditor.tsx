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

import EditPanel from '../components/EditPanel';
import ExportDialog from '../components/ExportDialog';
import PolishControls from '../components/PolishControls';
import PolishProviderSettings from '../components/PolishProviderSettings';
import PreviewPanel from '../components/PreviewPanel';
import PrivacyControls from '../components/PrivacyControls';
import ResumeSelector from '../components/ResumeSelector';
import TemplateSelector from '../components/TemplateSelector';
import UiIcon from '../components/UiIcon';
import * as api from '../api/client';
import { exportResumePreview, type ResumeExportFormat } from '../resume/browserExport';
import { createResumeEditingWorkspace } from '../resume/editingWorkspace';
import type {
  EntityType,
  ResumeConfig,
  ResumePolishField,
  ResumePolishProviderConfig,
  TemplateConfig,
  WikiEntity,
} from '../types';

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
  const [workspace] = useState(() => createResumeEditingWorkspace({
    resumes,
    templates,
    wikiEntities,
    saveResume: api.saveResume,
    deleteResume: api.deleteResume,
    polishResume: api.polishResume,
    modelClient: { getModels: api.getPolishModels },
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
  const polishProviderAnchorRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    void workspace.dispatch({ type: 'replace-inputs', resumes, templates, wikiEntities });
  }, [resumes, templates, wikiEntities, workspace]);

  useEffect(() => {
    if (state.activeOverlay !== 'polish') return undefined;
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!polishProviderAnchorRef.current?.contains(event.target as Node)) {
        void workspace.dispatch({ type: 'close-overlay' });
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [state.activeOverlay, workspace]);

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

  const feedbackIsError = state.feedback?.tone === 'error';

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col">
        <div className="editor-toolbar no-print">
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
            <div className="polish-provider-anchor" ref={polishProviderAnchorRef}>
              <PolishControls
                enabled={state.polishEnabled}
                hasEntries={Object.keys(state.polish?.entries || {}).length > 0}
                generating={state.polishGenerating}
                selectedFieldCount={state.selectedPolishFields.length}
                providerConfigured={state.polishProviderConfigured}
                settingsOpen={state.activeOverlay === 'polish'}
                onChange={(enabled) => {
                  void workspace.dispatch({ type: 'toggle-polish', enabled });
                }}
                onOpenSettings={() => {
                  void workspace.dispatch({ type: 'open-polish-settings' });
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
            <div className="editor-view-switch" role="group" aria-label="编辑器视图">
              <button
                type="button"
                aria-pressed={state.view === 'edit'}
                onClick={() => void workspace.dispatch({ type: 'set-view', view: 'edit' })}
              >
                编辑
              </button>
              <button
                type="button"
                aria-pressed={state.view === 'preview'}
                onClick={() => void workspace.dispatch({ type: 'set-view', view: 'preview' })}
              >
                预览
              </button>
            </div>
            <button
              onClick={() => void workspace.dispatch({ type: 'save' })}
              disabled={state.saving}
              className="toolbar-button strong"
            >
              <UiIcon name="save" size={16} /> {state.saving ? '保存中…' : '保存'}
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

          {state.feedback && state.activeOverlay !== 'polish' && (
            <span
              className={`save-status ${feedbackIsError ? 'is-error' : ''}`}
              role={feedbackIsError ? 'alert' : 'status'}
            >
              {state.feedback.message}
            </span>
          )}
        </div>

        <div className={`editor-workspace workspace-view-${state.view}`}>
          <div className="edit-pane no-print">
            <EditPanel
              modules={state.modules}
              wikiEntities={state.resumeWikiEntities}
              onApplyModules={handleModuleSelection}
              onMove={(moduleId, direction) => {
                void workspace.dispatch({ type: 'move-module', moduleId, direction });
              }}
              onToggleExpand={(moduleId) => {
                void workspace.dispatch({ type: 'toggle-module', moduleId });
              }}
              onOverrideField={(moduleId, itemPath, field, value) => {
                void workspace.dispatch({ type: 'override-field', moduleId, itemPath, field, value });
              }}
              onToggleItemVisibility={(moduleId, itemId) => {
                void workspace.dispatch({ type: 'toggle-item-visibility', moduleId, itemId });
              }}
              onRemoveModule={(moduleId) => {
                void workspace.dispatch({ type: 'remove-module', moduleId });
              }}
              polish={state.polishEnabled ? state.polish : undefined}
              polishGeneratingKey={state.polishGeneratingKey}
              onRegeneratePolish={(path, field) => {
                void workspace.dispatch({ type: 'regenerate-polish', path, field });
              }}
            />
          </div>

          <div className="preview-pane">
            {state.resumeView && (
              <PreviewPanel
                view={state.resumeView}
                template={state.currentTemplate}
                onOpenExport={() => {
                  void workspace.dispatch({ type: 'toggle-overlay', overlay: 'export' });
                }}
              />
            )}
          </div>
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
    </DndContext>
  );
}
