import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { closestCorners, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { exportResumePreview, type ResumeExportFormat } from '../resume/browserExport';
import type { ResumeEditingWorkspace, ResumeEditingWorkspaceSnapshot } from '../resume/editingWorkspace';
import { TEMPLATE_PRESETS } from '../resume/templates';
import type { EntityType, ModuleInstance } from '../types';

interface ResumeEditorProps {
  workspace: ResumeEditingWorkspace;
  state: ResumeEditingWorkspaceSnapshot;
  wikiEmpty: boolean;
  onCompile: () => void;
  page: TopBarPage;
  onNavigate: (page: TopBarPage) => void;
  trailing?: ReactNode;
}

export interface EditorSelection {
  moduleId: string;
  path?: string;
  field?: string;
}

const SAVE_STATUS = { clean: '已保存', dirty: '未保存', saving: '保存中…', saved: '已保存', failed: '保存失败' };

function OutlineRow({ module, selected, onOpen, onMove }: { module: ModuleInstance; selected: boolean; onOpen: () => void; onMove: (direction: 'up' | 'down') => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: module.id });
  return <div ref={setNodeRef} className="outline-row" data-dragging={isDragging || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    <button type="button" ref={setActivatorNodeRef} className="icon-button outline-grip"
      {...attributes} {...listeners} aria-label={`拖拽排序：${module.label}`} aria-describedby="outline-reorder-help"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        onMove(event.key === 'ArrowUp' ? 'up' : 'down');
      }}>
      <UiIcon name="grip" size={16} />
    </button>
    <button type="button" className="outline-section" aria-current={selected ? 'true' : undefined} onClick={onOpen}>{module.label}</button>
  </div>;
}

export default function ResumeEditor({ workspace, state, wikiEmpty, onCompile, page, onNavigate, trailing }: ResumeEditorProps) {
  const { dispatch } = workspace;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [emptyAction, setEmptyAction] = useState<'import' | 'interview' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const closeOverlay = useCallback(() => { void dispatch({ type: 'close-overlay' }); }, [dispatch]);
  useEffect(() => { setSelection(null); }, [state.currentResumeId]);

  const openField = (moduleId: string, path?: string, field?: string) => {
    if (!selection) returnFocus.current = document.activeElement as HTMLElement;
    setSelection({ moduleId, path, field });
  };
  const handleEditBlock = (moduleType: EntityType, path?: string, field?: string) => {
    const module = state.modules.find((item) => item.type === moduleType);
    if (module) openField(module.id, path, field);
  };
  const editingModule = state.modules.find((module) => module.id === selection?.moduleId);
  const hasUnsavedDraft = state.saveStatus !== 'clean' && state.saveStatus !== 'saved';
  const feedback = state.feedback;

  if (wikiEmpty || !state.draft) return (
    <div className="h-full flex flex-col">
      <TopBar page={page} onNavigate={onNavigate} trailing={trailing} />
      <main className="workspace-empty">
        <h1>创建第一份简历</h1>
        <div className="workspace-choice-actions">
          <button type="button" className="toolbar-button strong" onClick={() => setEmptyAction('import')}>导入简历</button>
          <button type="button" className="toolbar-button" onClick={() => setEmptyAction('interview')}>开始采访</button>
        </div>
        {emptyAction && <p role="status">{emptyAction === 'import' ? '在 Agent 对话中附上简历并说「导入我的简历」。' : '在 Agent 对话中说「开始采访」。'} 完成后点击「刷新 Wiki」。</p>}
        <button type="button" className="toolbar-button ghost" onClick={onCompile}>Wiki 编译指引</button>
      </main>
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id) void dispatch({ type: 'move-module-before', activeId: String(active.id), overId: String(over.id) });
    }}>
      <div className="h-full flex flex-col">
        <TopBar page={page} onNavigate={onNavigate} trailing={trailing}>
          <div className="toolbar-document-group">
            <ResumeSelector
              resumes={state.resumes}
              currentId={state.currentResumeId}
              onChange={(resumeId) => void dispatch({ type: 'select-resume', resumeId })}
              onNew={() => void dispatch({ type: 'create-resume' })}
              onDuplicate={() => void dispatch({ type: 'duplicate-resume' })}
              onDelete={() => void dispatch({ type: 'delete-resume' })}
              name={state.resumeName}
              onNameChange={(name) => void dispatch({ type: 'change-name', name })}
            />
          </div>
          <div className="toolbar-actions">
            <span className="document-save-state" role="status" title={state.saveError}>{SAVE_STATUS[state.saveStatus]}</span>
            <button type="button" className="toolbar-button" onClick={() => void dispatch({ type: 'toggle-overlay', overlay: 'export' })}>
              <UiIcon name="download" size={16} /> 导出
            </button>
            <button type="button" className="toolbar-button strong" onClick={() => void dispatch({ type: 'save' })} disabled={state.saving}>
              <UiIcon name="save" size={16} /> 保存
            </button>
            <button type="button" className="toolbar-button ghost" aria-expanded={settingsOpen} onClick={() => {
              if (settingsOpen && state.activeOverlay !== 'export') closeOverlay();
              setSettingsOpen((open) => !open);
            }}>设置</button>
          </div>
        </TopBar>

        {settingsOpen && (
          <div className="document-settings no-print">
            <TemplateSelector
              templates={state.templates}
              currentId={state.templateId}
              deletable={!TEMPLATE_PRESETS.some((preset) => preset.id === state.templateId)}
              onChange={(templateId) => void dispatch({ type: 'select-template', templateId })}
              onDuplicate={() => void dispatch({ type: 'duplicate-template' })}
              onDelete={() => void dispatch({ type: 'delete-template' })}
            />
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
                onChange={(enabled) => void dispatch({ type: 'toggle-polish', enabled })}
                onOpenSettings={() => void dispatch({ type: 'open-polish-settings' })}
                onRegenerateAll={() => void dispatch({ type: 'regenerate-all-polish' })}
                onSelectVariant={(index) => void dispatch({ type: 'select-polish-variant', index })}
              />
              <PolishProviderSettings
                provider={state.polishProvider}
                selectedFields={state.selectedPolishFields}
                open={state.activeOverlay === 'polish'}
                models={state.polishModels}
                loadingModels={state.polishModelsLoading}
                error={state.polishProviderError}
                onClose={closeOverlay}
                onSave={(provider, selectedFields) => dispatch({ type: 'save-polish-provider', provider, selectedFields }).then(() => undefined)}
                onFetchModels={(provider) => dispatch({ type: 'fetch-polish-models', provider }).then(() => undefined)}
              />
            </div>
            <PrivacyControls
              config={state.privacy}
              open={state.activeOverlay === 'privacy'}
              onChange={(privacy) => void dispatch({ type: 'change-privacy', privacy })}
              onOpenChange={(open) => open ? void dispatch({ type: 'toggle-overlay', overlay: 'privacy' }) : closeOverlay()}
            />
            <button type="button" className="toolbar-button ghost" onClick={onCompile}>Wiki 编译指引</button>
          </div>
        )}

        {feedback && feedback.message !== SAVE_STATUS[state.saveStatus] && state.activeOverlay !== 'polish' && (
          <div className="workspace-notice" role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.message}</div>
        )}
        <div className={'editor-workspace document-workspace' + (editingModule ? ' has-inspector' : '')}>
          <div className="document-outline">
            <button type="button" className="outline-toggle toolbar-button" aria-expanded={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}>章节</button>
            <div className={'outline-content' + (outlineOpen ? ' is-open' : '')}>
              <h2>章节</h2>
              <nav aria-label="简历章节">
                <span className="sr-only" id="outline-reorder-help">按上键或下键移动当前章节。</span>
                <SortableContext items={state.modules.map((module) => module.id)} strategy={verticalListSortingStrategy}>
                  {state.modules.map((module) => (
                    <OutlineRow key={module.id} module={module} selected={selection?.moduleId === module.id}
                      onMove={(direction) => void dispatch({ type: 'move-module', moduleId: module.id, direction })} onOpen={() => {
                      previewRef.current?.querySelector(`[data-section="${module.type}"]`)?.scrollIntoView({ block: 'nearest' });
                      openField(module.id);
                    }} />
                  ))}
                </SortableContext>
              </nav>
              <ModuleSettings modules={state.modules} wikiEntities={state.resumeWikiEntities}
                onApplyModules={async (moduleTypes) => (await dispatch({ type: 'select-modules', moduleTypes })).status !== 'failed'}
                onOpenModule={(id) => openField(id)} />
            </div>
          </div>
          <main className="preview-pane" ref={previewRef}>
            {state.resumeView && <PreviewPanel view={state.resumeView} template={state.currentTemplate} onEditBlock={handleEditBlock} />}
          </main>
          {editingModule && selection && (
            <ModuleEditDialog
              key={`${state.currentResumeId}:${selection.moduleId}:${selection.path ?? ''}:${selection.field ?? ''}`}
              module={editingModule}
              wikiEntities={state.resumeWikiEntities}
              initialTarget={selection}
              onClose={() => { setSelection(null); returnFocus.current?.focus({ preventScroll: true }); }}
              onOverrideField={(moduleId, itemPath, field, value) => void dispatch({ type: 'override-field', moduleId, itemPath, field, value })}
              onRestoreField={(moduleId, itemPath, field) => void dispatch({ type: 'restore-field', moduleId, itemPath, field })}
              onToggleItemVisibility={(moduleId, itemId) => void dispatch({ type: 'toggle-item-visibility', moduleId, itemId })}
              polish={state.polishEnabled ? state.polish : undefined}
              polishGeneratingKey={state.polishGeneratingKey}
              onRegeneratePolish={(path, field) => void dispatch({ type: 'regenerate-polish', path, field })}
            />
          )}
        </div>
        <ExportDialog open={state.activeOverlay === 'export'} resumeName="简历" unsaved={hasUnsavedDraft}
          privacyEnabledCount={Object.values(state.privacy).filter(Boolean).length} onClose={closeOverlay}
          onExport={(format: ResumeExportFormat, filename: string) => exportResumePreview({
            format, filename, resumeName: '简历', resumeView: state.resumeView, documentRoot: previewRef.current,
          })} />
      </div>
    </DndContext>
  );
}
