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
import type { ModuleInstance, WikiEntity, EntityType } from '../types';
import { ENTITY_LABELS } from '../types';

interface EditPanelProps {
  modules: ModuleInstance[];
  wikiEntities: WikiEntity[];
  onReorder: (oldIndex: number, newIndex: number) => void;
  onToggleExpand: (id: string) => void;
  onOverrideField: (moduleId: string, field: string, value: unknown) => void;
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
  onOverrideField,
  onRemoveModule,
}: {
  module: ModuleInstance;
  wikiData: WikiEntity[];
  onToggleExpand: (id: string) => void;
  onOverrideField: (moduleId: string, field: string, value: unknown) => void;
  onRemoveModule: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 合并 wiki 数据和用户覆盖
  const mergedData = [...wikiData];
  for (const entity of mergedData) {
    if (module.overrides && Object.keys(module.overrides).length > 0) {
      entity.fields = { ...entity.fields, ...module.overrides };
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white shadow-sm ${
        isDragging ? 'opacity-50 border-brand-400' : 'border-ink-200'
      }`}
    >
      {/* 头部：拖拽手柄 + 模块名 + 展开/删除 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
        <button
          {...attributes}
          {...listeners}
          className="text-ink-300 hover:text-ink-600 cursor-grab active:cursor-grabbing"
          title="拖拽排序"
        >
          ⋮⋮
        </button>
        <span className="text-sm font-medium text-ink-800 flex-1">
          {module.label}
        </span>
        {mergedData.length > 0 && (
          <span className="text-xs text-ink-400 bg-ink-100 px-2 py-0.5 rounded">
            {mergedData.length} 条
          </span>
        )}
        <button
          onClick={() => onToggleExpand(module.id)}
          className="text-ink-400 hover:text-brand-500 text-sm"
          title={module.expanded ? '折叠' : '展开'}
        >
          {module.expanded ? '▼' : '▶'}
        </button>
        <button
          onClick={() => onRemoveModule(module.id)}
          className="text-ink-400 hover:text-red-500 text-sm"
          title="删除模块"
        >
          ✕
        </button>
      </div>

      {/* 展开后的编辑区 */}
      {module.expanded && (
        <ModuleEditForm
          module={module}
          wikiData={mergedData}
          onOverrideField={onOverrideField}
        />
      )}
    </div>
  );
}

/** 模块编辑表单 — 列出 wiki 实体的字段，允许覆盖 */
function ModuleEditForm({
  module,
  wikiData,
  onOverrideField,
}: {
  module: ModuleInstance;
  wikiData: WikiEntity[];
  onOverrideField: (moduleId: string, field: string, value: unknown) => void;
}) {
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
        return (
          <div key={idx} className="border border-ink-100 rounded-lg p-3">
            <div className="text-xs font-medium text-ink-500 mb-2">
              {entityLabel}
            </div>
            <div className="space-y-2">
              {Object.entries(entity.fields).map(([field, value]) => (
                <FieldEditor
                  key={field}
                  field={field}
                  value={value}
                  moduleId={module.id}
                  onOverride={onOverrideField}
                />
              ))}
            </div>
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
  onOverride,
}: {
  field: string;
  value: unknown;
  moduleId: string;
  onOverride: (moduleId: string, field: string, value: unknown) => void;
}) {
  const [localVal, setLocalVal] = useState(String(value || ''));

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-ink-400 w-24 shrink-0 text-right">
        {field}:
      </label>
      <input
        type="text"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={() => onOverride(moduleId, field, localVal)}
        className="flex-1 text-sm px-2 py-1 border border-ink-200 rounded focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
      />
    </div>
  );
}

export default function EditPanel({
  modules,
  wikiEntities,
  onReorder: _onReorder,
  onToggleExpand,
  onOverrideField,
  onRemoveModule,
}: EditPanelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'edit-area',
    data: { source: 'edit-area' },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-ink-200 bg-white">
        <h2 className="text-sm font-semibold text-ink-800">编辑区</h2>
        <p className="text-xs text-ink-400 mt-1">
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
          <div className="flex flex-col items-center justify-center h-full text-ink-300">
            <div className="text-4xl mb-2">📋</div>
            <div className="text-sm">
              从左侧拖拽模块到此处开始编辑
            </div>
          </div>
        ) : (
          <SortableContext
            items={modules.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {modules.map((m) => (
              <ModuleEditCard
                key={m.id}
                module={m}
                wikiData={getWikiDataForModule(m.type, wikiEntities)}
                onToggleExpand={onToggleExpand}
                onOverrideField={onOverrideField}
                onRemoveModule={onRemoveModule}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}
