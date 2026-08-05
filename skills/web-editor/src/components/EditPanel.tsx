/**
 * EditPanel — 中间编辑区
 *
 * 接收从左侧拖入的模块，支持：
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
import { useState } from 'react';
import { getOrderedEntityFieldEntries } from '../resume/fields';
import { mergeOverrides } from '../resume/mergeOverrides';
import type { ModuleInstance, WikiEntity, EntityType } from '../types';
import { ENTITY_LABELS } from '../constants';
import UiIcon from './UiIcon';

interface EditPanelProps {
  modules: ModuleInstance[];
  wikiEntities: WikiEntity[];
  onReorder: (oldIndex: number, newIndex: number) => void;
  onToggleExpand: (id: string) => void;
  onOverrideField: (moduleId: string, field: string, value: unknown) => void;
  onToggleItemVisibility: (moduleId: string, itemId: string) => void;
  onRemoveModule: (id: string) => void;
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
  onReorder,
  moduleIndex,
  moduleCount,
  onOverrideField,
  onToggleItemVisibility,
  onRemoveModule,
}: {
  module: ModuleInstance;
  wikiData: WikiEntity[];
  onToggleExpand: (id: string) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
  moduleIndex: number;
  moduleCount: number;
  onOverrideField: (moduleId: string, field: string, value: unknown) => void;
  onToggleItemVisibility: (moduleId: string, itemId: string) => void;
  onRemoveModule: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 合并 wiki 数据和用户覆盖（与 PreviewPanel 共用 mergeOverrides）
  const mergedData = mergeOverrides(wikiData, module.overrides);

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
            onClick={() => onReorder(moduleIndex, moduleIndex - 1)}
            disabled={moduleIndex === 0}
            className="icon-button"
            title="上移模块"
            aria-label={`上移${module.label}`}
          >
            <UiIcon name="arrow-up" size={17} />
          </button>
          <button
            type="button"
            onClick={() => onReorder(moduleIndex, moduleIndex + 1)}
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
}: {
  module: ModuleInstance;
  wikiData: WikiEntity[];
  onOverrideField: (moduleId: string, field: string, value: unknown) => void;
  onToggleItemVisibility: (moduleId: string, itemId: string) => void;
}) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(
    wikiData[0]?.path || null,
  );

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
        const entityLabel =
          String(entity.fields.name || entity.fields.company || entity.fields.title || `${ENTITY_LABELS[entity.entity]} ${idx + 1}`);
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
                    inputId={`${module.id}-${idx}-${field}`}
                    onOverride={onOverrideField}
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
  inputId,
  onOverride,
}: {
  field: string;
  value: unknown;
  moduleId: string;
  inputId: string;
  onOverride: (moduleId: string, field: string, value: unknown) => void;
}) {
  const [localVal, setLocalVal] = useState(String(value || ''));
  const fieldLabel = field === 'responsibilities'
    ? '岗位职责'
    : field === 'tech_stack'
      ? '技术栈'
      : field;

  return (
    <div className="field-editor">
      <label htmlFor={inputId} className="field-editor-label">
        {fieldLabel}
      </label>
      {field === 'responsibilities' ? (
        <textarea
          id={inputId}
          rows={3}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={() => onOverride(moduleId, field, localVal)}
          className="field-editor-input resize-y"
        />
      ) : (
        <input
          id={inputId}
          type="text"
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={() => onOverride(moduleId, field, localVal)}
          className="field-editor-input"
        />
      )}
    </div>
  );
}

export default function EditPanel({
  modules,
  wikiEntities,
  onReorder,
  onToggleExpand,
  onOverrideField,
  onToggleItemVisibility,
  onRemoveModule,
}: EditPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'edit-area',
    data: { source: 'edit-area' },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="pane-heading">
        <h2 className="pane-heading-title">内容编排</h2>
        <p className="pane-heading-description">
          拖拽排序 · 点击展开编辑 · 覆盖不回写 wiki
        </p>
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
              将左侧模块拖到这里开始编排
            </div>
            <div className="text-xs opacity-70">
              可添加工作经历、项目经验、技能等模块
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
                onReorder={onReorder}
                moduleIndex={index}
                moduleCount={modules.length}
                onOverrideField={onOverrideField}
                onToggleItemVisibility={onToggleItemVisibility}
                onRemoveModule={onRemoveModule}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}
