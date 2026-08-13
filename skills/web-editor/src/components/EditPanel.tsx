/**
 * EditPanel — 中间编辑区
 *
 * 管理已加入编排区的模块，支持：
 * - 拖拽排序（dnd-kit sortable）
 * - 展开/折叠
 * - 编辑覆盖字段（不回写 wiki，只存简历配置）
 * - 删除模块
 */

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import { getOrderedEntityFieldEntries } from '../resume/fields';
import { getSelectedPolishFields } from '../resume/polish';
import type { ModuleInstance, WikiEntity, EntityType, ResumePolishConfig, ResumePolishField } from '../types';
import { ENTITY_LABELS } from '../types';
import ModulePicker from './ModulePicker';
import UiIcon from './UiIcon';

interface EditPanelProps {
  modules: ModuleInstance[];
  wikiEntities: WikiEntity[];
  onApplyModules: (types: EntityType[]) => boolean | Promise<boolean>;
  onMove: (moduleId: string, direction: 'up' | 'down') => void;
  onToggleExpand: (id: string) => void;
  onOverrideField: (moduleId: string, itemPath: string, field: string, value: unknown) => void;
  onToggleItemVisibility: (moduleId: string, itemId: string) => void;
  onRemoveModule: (id: string) => void;
  polish?: ResumePolishConfig;
  polishGeneratingKey?: string | null;
  onRegeneratePolish?: (path: string, field: ResumePolishField) => void;
}

/** 获取某模块类型在 wiki 中的默认数据 */
function getWikiDataForModule(
  type: EntityType,
  wikiEntities: WikiEntity[],
): WikiEntity[] {
  return wikiEntities.filter((e) => e.entity === type);
}

/** 渲染单个模块的编辑卡片 */
function ModuleEditCard({
  module,
  wikiData,
  onToggleExpand,
  onMove,
  moduleIndex,
  moduleCount,
  onOverrideField,
  onToggleItemVisibility,
  onRemoveModule,
  polish,
  polishGeneratingKey,
  onRegeneratePolish,
}: {
  module: ModuleInstance;
  wikiData: WikiEntity[];
  onToggleExpand: (id: string) => void;
  onMove: (moduleId: string, direction: 'up' | 'down') => void;
  moduleIndex: number;
  moduleCount: number;
  onOverrideField: (moduleId: string, itemPath: string, field: string, value: unknown) => void;
  onToggleItemVisibility: (moduleId: string, itemId: string) => void;
  onRemoveModule: (id: string) => void;
  polish?: ResumePolishConfig;
  polishGeneratingKey?: string | null;
  onRegeneratePolish?: (path: string, field: ResumePolishField) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 合并 wiki 数据和用户覆盖
  const mergedData = wikiData.map((entity) => ({
    ...entity,
    fields: { ...entity.fields },
  }));
  for (const entity of mergedData) {
    if (module.overrides && Object.keys(module.overrides).length > 0) {
      entity.fields = { ...entity.fields, ...(module.overrides[entity.path] || {}) };
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-module-type={module.type}
      className={`module-edit-card rounded-lg border bg-white shadow-sm transition-shadow hover:shadow ${
        isDragging ? 'opacity-50 border-brand-400' : 'border-ink-200'
      }`}
    >
      {/* 头部：拖拽手柄 + 模块名 + 展开/删除 */}
      <div className="module-card-header">
        <button
          {...attributes}
          {...listeners}
          className="icon-button cursor-grab active:cursor-grabbing"
          title="拖拽排序"
          aria-label={`拖拽${module.label}排序`}
        >
          <UiIcon name="grip" size={19} />
        </button>
        <span className="text-sm font-medium text-ink-800 flex-1">
          {module.label}
        </span>
        {mergedData.length > 0 && (
          <span className="text-xs text-ink-400 bg-ink-100 px-2 py-0.5 rounded">
            {mergedData.length - module.hiddenItemIds.length} / {mergedData.length} 条
          </span>
        )}
        <div className="module-card-actions" role="group" aria-label={`${module.label}排序和操作`}>
          <button
            type="button"
            onClick={() => onMove(module.id, 'up')}
            disabled={moduleIndex === 0}
            className="icon-button"
            title="上移模块"
            aria-label={`上移${module.label}`}
          >
            <UiIcon name="arrow-up" size={17} />
          </button>
          <button
            type="button"
            onClick={() => onMove(module.id, 'down')}
            disabled={moduleIndex === moduleCount - 1}
            className="icon-button"
            title="下移模块"
            aria-label={`下移${module.label}`}
          >
            <UiIcon name="arrow-down" size={17} />
          </button>
          <button
            onClick={() => onToggleExpand(module.id)}
            className="icon-button"
            title={module.expanded ? '折叠' : '展开'}
            aria-label={`${module.expanded ? '折叠' : '展开'}${module.label}`}
            aria-expanded={module.expanded}
            aria-controls={`module-content-${module.id}`}
          >
            <UiIcon name={module.expanded ? 'chevron-down' : 'chevron-right'} size={18} />
          </button>
          <button
            onClick={() => onRemoveModule(module.id)}
            className="icon-button destructive"
            title="删除模块"
            aria-label={`从简历删除${module.label}模块`}
          >
            <UiIcon name="trash" size={17} />
          </button>
        </div>
      </div>

      {/* 展开后的编辑区 */}
      {module.expanded && (
        <div id={`module-content-${module.id}`}>
          <ModuleEditForm
            module={module}
            wikiData={mergedData}
            onOverrideField={onOverrideField}
            onToggleItemVisibility={onToggleItemVisibility}
            polish={polish}
            polishGeneratingKey={polishGeneratingKey}
            onRegeneratePolish={onRegeneratePolish}
          />
        </div>
      )}
    </div>
  );
}

/** 模块编辑表单 — 列出 wiki 实体的字段，允许覆盖 */
function ModuleEditForm({
  module,
  wikiData,
  onOverrideField,
  onToggleItemVisibility,
  polish,
  polishGeneratingKey,
  onRegeneratePolish,
}: {
  module: ModuleInstance;
  wikiData: WikiEntity[];
  onOverrideField: (moduleId: string, itemPath: string, field: string, value: unknown) => void;
  onToggleItemVisibility: (moduleId: string, itemId: string) => void;
  polish?: ResumePolishConfig;
  polishGeneratingKey?: string | null;
  onRegeneratePolish?: (path: string, field: ResumePolishField) => void;
}) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(
    wikiData[0]?.path || null,
  );
  const selectedPolishFields = getSelectedPolishFields(polish);

  if (wikiData.length === 0) {
    return (
      <div className="p-4 text-sm text-ink-400">
        Wiki 中暂无 {module.label} 数据。请先采集信息。
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {wikiData.map((entity, idx) => {
        const entityLabel = entity.title || `${ENTITY_LABELS[entity.entity]} ${idx + 1}`;
        const isHidden = module.hiddenItemIds.includes(entity.path);
        const isExpanded = expandedItemId === entity.path;
        return (
          <div
            key={entity.path}
            data-resume-item={entity.path}
            className={`resume-item-card rounded-lg border transition-colors ${
              isHidden
                ? 'border-ink-200 bg-ink-50'
                : 'border-ink-100 bg-white'
            }`}
          >
            <div className="resume-item-header">
              <button
                type="button"
                onClick={() => setExpandedItemId(isExpanded ? null : entity.path)}
                className="resume-item-expand"
                aria-expanded={isExpanded}
                aria-controls={`resume-item-fields-${module.id}-${idx}`}
              >
                <UiIcon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={17} />
                <span className={`min-w-0 flex-1 text-left text-sm font-medium ${isHidden ? 'text-ink-400' : 'text-ink-700'}`}>
                  {entityLabel}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={isHidden}
                aria-label={`${isHidden ? '恢复当前简历显示' : '从当前简历隐藏'}${entityLabel}`}
                onClick={() => onToggleItemVisibility(module.id, entity.path)}
                className={`visibility-button ${
                  isHidden
                    ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                    : 'border-ink-200 bg-white text-ink-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <UiIcon name={isHidden ? 'eye' : 'eye-off'} size={16} />
                {isHidden ? '恢复' : '隐藏'}
              </button>
            </div>
            {isExpanded && (
              <div
                id={`resume-item-fields-${module.id}-${idx}`}
                className={`resume-item-fields ${isHidden ? 'opacity-45' : ''}`}
              >
                {getOrderedEntityFieldEntries(entity.entity, entity.fields).map(([field, value]) => (
                  <FieldEditor
                    key={field}
                    field={field}
                    value={value}
                    moduleId={module.id}
                    itemPath={entity.path}
                    inputId={`${module.id}-${idx}-${field}`}
                    onOverride={onOverrideField}
                    polishEntry={polish?.entries?.[entity.path]}
                    polishSelectedFields={selectedPolishFields}
                    polishGeneratingKey={polishGeneratingKey}
                    onRegeneratePolish={onRegeneratePolish}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 单个字段编辑器 */
function FieldEditor({
  field,
  value,
  moduleId,
  itemPath,
  inputId,
  onOverride,
  polishEntry,
  polishSelectedFields,
  polishGeneratingKey,
  onRegeneratePolish,
}: {
  field: string;
  value: unknown;
  moduleId: string;
  itemPath: string;
  inputId: string;
  onOverride: (moduleId: string, itemPath: string, field: string, value: unknown) => void;
  polishEntry?: { fields?: Partial<Record<ResumePolishField, string>> };
  polishSelectedFields: ResumePolishField[];
  polishGeneratingKey?: string | null;
  onRegeneratePolish?: (path: string, field: ResumePolishField) => void;
}) {
  const externalValue = String(value ?? '');
  const [localVal, setLocalVal] = useState(externalValue);
  useEffect(() => {
    setLocalVal(externalValue);
  }, [externalValue]);
  const fieldLabel = field === 'responsibilities'
    ? '岗位职责'
    : field === 'description'
      ? '项目描述'
      : field === 'content'
        ? '个人优势'
        : field === 'tech_stack'
          ? '技术栈'
          : field;
  const isPolishField = field === 'description' || field === 'responsibilities' || field === 'content';
  const polishField = isPolishField ? field as ResumePolishField : null;
  const canRegenerate = Boolean(
    polishField &&
      polishSelectedFields.includes(polishField) &&
      polishEntry?.fields?.[polishField],
  );
  const isRegenerating = polishField ? polishGeneratingKey === `${itemPath}:${polishField}` : false;

  return (
    <div className="field-editor">
      <label htmlFor={inputId} className="field-editor-label">
        {fieldLabel}
      </label>
      {field === 'responsibilities' || field === 'content' ? (
        <textarea
          id={inputId}
          rows={3}
          value={localVal}
          onChange={(e) => {
            setLocalVal(e.target.value);
            onOverride(moduleId, itemPath, field, e.target.value);
          }}
          className="field-editor-input resize-y"
        />
      ) : (
        <input
          id={inputId}
          type="text"
          value={localVal}
          onChange={(e) => {
            setLocalVal(e.target.value);
            onOverride(moduleId, itemPath, field, e.target.value);
          }}
          className="field-editor-input"
        />
      )}
      {canRegenerate && polishField && onRegeneratePolish && (
        <button
          type="button"
          className="polish-regenerate-button"
          disabled={isRegenerating}
          onClick={() => onRegeneratePolish(itemPath, polishField)}
        >
          {isRegenerating ? '生成中…' : '换一换'}
        </button>
      )}
    </div>
  );
}

export default function EditPanel({
  modules,
  wikiEntities,
  onApplyModules,
  onMove,
  onToggleExpand,
  onOverrideField,
  onToggleItemVisibility,
  onRemoveModule,
  polish,
  polishGeneratingKey,
  onRegeneratePolish,
}: EditPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'edit-area',
    data: { source: 'edit-area' },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="pane-heading">
        <div className="pane-heading-row">
          <div>
            <h2 className="pane-heading-title">内容编排</h2>
            <p className="pane-heading-description">
              拖拽排序 · 点击展开编辑 · 仅影响当前简历预览和导出
            </p>
          </div>
          <ModulePicker
            addedTypes={modules.map((module) => module.type)}
            onApply={onApplyModules}
          />
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-3 space-y-2 ${
          isOver ? 'bg-brand-50' : 'bg-ink-50'
        }`}
      >
        {modules.length === 0 ? (
          <div className="edit-drop-empty" data-over={isOver}>
            <div className="empty-state-icon"><UiIcon name="file" size={24} /></div>
            <div className="text-sm">
              从这里开始搭建简历内容
            </div>
            <div className="text-xs opacity-70">
              点击右上角「添加模块」，勾选需要的模块
            </div>
          </div>
        ) : (
          <SortableContext
            items={modules.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {modules.map((m, index) => (
              <ModuleEditCard
                key={m.id}
                module={m}
                wikiData={getWikiDataForModule(m.type, wikiEntities)}
                onToggleExpand={onToggleExpand}
                onMove={onMove}
                moduleIndex={index}
                moduleCount={modules.length}
                onOverrideField={onOverrideField}
                onToggleItemVisibility={onToggleItemVisibility}
                onRemoveModule={onRemoveModule}
                polish={polish}
                polishGeneratingKey={polishGeneratingKey}
                onRegeneratePolish={onRegeneratePolish}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}
