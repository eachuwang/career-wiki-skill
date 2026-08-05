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
  EntityType,
} from '../types';
import { MODULE_LIBRARY } from '../types';

import * as api from '../api/client';
import { createResumeConfig, getHiddenItemIds } from '../resume/config';
import { toggleHiddenItem } from '../resume/visibility';
import {
  buildStandaloneResumeHtml,
  collectDocumentCss,
  downloadResumePdf,
} from '../resume/export';

let moduleIdCounter = 0;
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
            overrides: {},
            hiddenItemIds: getHiddenItemIds(config.hide, type),
          };
        }),
      );
    },
    [],
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

  const handleOverrideField = (moduleId: string, field: string, value: unknown) => {
    setModules((prev) =>
      prev.map((m) =>
        m.id === moduleId
          ? { ...m, overrides: { ...m.overrides, [field]: value } }
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

  const buildResumeConfig = (modulesOverride?: ModuleInstance[]): ResumeConfig => {
    const baseConfig = resumes.find((resume) => resume.id === currentResumeId);
    return createResumeConfig({
      resumeName,
      resumeId: currentResumeId,
      templateId,
      privacy,
      modules: modulesOverride ?? modules,
      baseConfig,
    });
  };

  const handleSave = async (modulesOverride?: ModuleInstance[]) => {
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
  };

  /** 复用当前预览 DOM 生成 PDF，确保下载内容与用户所见一致。 */
  const handleExportPDF = async () => {
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
  };

  const handleExportHTML = () => {
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
  };

  const handleExportJSON = async () => {
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
  };

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
