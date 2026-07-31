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
import TemplateSelector from '../components/TemplateSelector';
import PrivacyControls from '../components/PrivacyControls';

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
  // 当前简历配置
  const [currentResumeId, setCurrentResumeId] = useState<string>('');
  const [resumeName, setResumeName] = useState('新建简历');
  const [templateId, setTemplateId] = useState<string>('');
  const [privacy, setPrivacy] = useState<PrivacyConfig>({
    mask_name: false,
    mask_phone: true,
    mask_email: true,
  });
  const [modules, setModules] = useState<ModuleInstance[]>([]);
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // 加载简历配置
  const loadResume = useCallback(
    (config: ResumeConfig) => {
      setResumeName(config.name);
      setTemplateId(config.template);
      setPrivacy(config.privacy || { mask_phone: true, mask_email: true });
      setModules(
        (config.modules || []).map((type) => {
          const def = MODULE_LIBRARY.find((m) => m.type === type);
          return {
            id: genId(),
            type,
            label: def?.label || type,
            expanded: false,
            overrides: {},
          };
        }),
      );
    },
    [],
  );

  // 加载第一份简历
  useEffect(() => {
    if (resumes.length > 0 && !currentResumeId) {
      setCurrentResumeId(resumes[0].id);
      loadResume(resumes[0]);
    }
    // 默认模板
    if (templates.length > 0 && !templateId) {
      setTemplateId(templates[0].id);
    }
  }, [resumes, templates, currentResumeId, templateId, loadResume]);

  // 当前模板对象
  const currentTemplate = templates.find((t) => t.id === templateId) || null;

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
    if (
      active.data.current?.source === 'library' &&
      (over.id === 'edit-area' || over.data.current?.source === 'edit-area')
    ) {
      const moduleType = active.data.current?.moduleType as EntityType;
      const def = MODULE_LIBRARY.find((m) => m.type === moduleType);
      if (!def) return;
      const newModule: ModuleInstance = {
        id: genId(),
        type: moduleType,
        label: def.label,
        expanded: false,
        overrides: {},
      };
      setModules((prev) => [...prev, newModule]);
      return;
    }

    // 编辑区内排序
    if (active.id !== over.id && active.data.current?.source !== 'library') {
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

  const handleRemoveModule = (id: string) => {
    setModules((prev) => prev.filter((m) => m.id !== id));
  };

  // ---------- 导出 ----------

  const buildResumeConfig = (): ResumeConfig => {
    const now = new Date().toISOString().slice(0, 10);
    return {
      name: resumeName,
      id: currentResumeId || resumeName.toLowerCase().replace(/\s+/g, '-'),
      template: templateId,
      created: now,
      updated: now,
      modules: modules.map((m) => m.type),
      privacy,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const config = buildResumeConfig();
      await api.saveResume(config);
      setSaveMsg('✅ 已保存');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg(`❌ 保存失败: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = () => {
    // 前端按模板渲染 HTML → window.print()
    // CSS @media print 已在 index.css 配好 .print-area
    window.print();
  };

  const handleExportHTML = () => {
    const html = document.querySelector('.print-area')?.outerHTML;
    if (!html) return;
    const fullHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${resumeName}</title></head><body>${html}</body></html>`;
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
        <div className="flex items-center gap-3 px-4 py-2 border-b border-ink-200 bg-white no-print">
          <input
            type="text"
            value={resumeName}
            onChange={(e) => setResumeName(e.target.value)}
            className="text-sm font-medium px-2 py-1 border border-transparent hover:border-ink-200 rounded focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300 w-40"
          />
          <span className="text-ink-300">|</span>
          <TemplateSelector
            templates={templates}
            currentId={templateId}
            onChange={setTemplateId}
          />
          <span className="text-ink-300">|</span>
          <PrivacyControls config={privacy} onChange={setPrivacy} />
          <div className="flex-1" />
          {saveMsg && <span className="text-xs text-ink-500">{saveMsg}</span>}
          <button
            onClick={handleExportJSON}
            className="text-xs px-2 py-1 rounded text-ink-500 hover:bg-ink-100"
          >
            JSON
          </button>
          <button
            onClick={handleExportHTML}
            className="text-xs px-2 py-1 rounded text-ink-500 hover:bg-ink-100"
          >
            HTML
          </button>
          <button
            onClick={handleExportPDF}
            className="text-xs px-2 py-1 rounded bg-brand-500 text-white hover:bg-brand-600"
          >
            导出PDF
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1 rounded bg-ink-800 text-white hover:bg-ink-900 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={onRefreshWiki}
            className="text-xs px-2 py-1 rounded text-ink-400 hover:bg-ink-100"
            title="重新编译 wiki"
          >
            ↻
          </button>
        </div>

        {/* 三栏布局 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧模块库 */}
          <div className="w-60 border-r border-ink-200 overflow-hidden no-print">
            <ModuleLibrary />
          </div>

          {/* 中间编辑区 */}
          <div className="flex-1 border-r border-ink-200 overflow-hidden no-print">
            <EditPanel
              modules={modules}
              wikiEntities={wikiEntities}
              onReorder={() => {}}
              onToggleExpand={handleToggleExpand}
              onOverrideField={handleOverrideField}
              onRemoveModule={handleRemoveModule}
            />
          </div>

          {/* 右侧预览 */}
          <div className="flex-1 overflow-hidden">
            <PreviewPanel
              modules={modules}
              wikiEntities={wikiEntities}
              template={currentTemplate}
              privacy={privacy}
              resumeName={resumeName}
              onExportPDF={handleExportPDF}
              onExportHTML={handleExportHTML}
            />
          </div>
        </div>
      </div>

      {/* 拖拽 overlay */}
      <DragOverlay>
        {activeDrag ? (
          <div className="px-3 py-2 bg-brand-100 text-brand-700 text-sm rounded shadow-lg">
            拖拽中: {activeDrag.type}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
