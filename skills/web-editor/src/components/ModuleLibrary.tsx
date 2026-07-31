/**
 * ModuleLibrary — 左侧拖拽模块库
 *
 * 列出 10 个可拖拽的简历模块。用户拖拽到中间编辑区添加。
 */

import { MODULE_LIBRARY } from '../types';
import type { ModuleDef } from '../types';
import { useDraggable } from '@dnd-kit/core';

/** 单个可拖拽的模块卡片 */
function ModuleCard({ module }: { module: ModuleDef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${module.type}`,
    data: { source: 'library', moduleType: module.type },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-start gap-2 rounded-lg border bg-white p-3 cursor-grab hover:border-brand-400 hover:shadow-sm transition-all ${
        isDragging ? 'opacity-40' : 'border-ink-200'
      }`}
    >
      <span className="text-xl">{module.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink-800">{module.label}</div>
        <div className="text-xs text-ink-400 mt-0.5 truncate">
          {module.description}
        </div>
      </div>
      <span className="text-ink-300 text-sm">⋮⋮</span>
    </div>
  );
}

export default function ModuleLibrary() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-ink-200 bg-white">
        <h2 className="text-sm font-semibold text-ink-800">模块库</h2>
        <p className="text-xs text-ink-400 mt-1">拖拽模块到编辑区添加</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-ink-50">
        {MODULE_LIBRARY.map((m) => (
          <ModuleCard key={m.type} module={m} />
        ))}
      </div>
    </div>
  );
}
