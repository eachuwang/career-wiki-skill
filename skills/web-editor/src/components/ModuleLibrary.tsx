/**
 * ModuleLibrary — 左侧拖拽模块库
 *
 * 列出 10 个可拖拽的简历模块。用户拖拽到中间编辑区添加。
 */

import { MODULE_LIBRARY } from '../types';
import type { ModuleDef } from '../types';
import { useDraggable } from '@dnd-kit/core';
import UiIcon from './UiIcon';

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
      className={`module-library-card group flex min-h-16 items-center gap-3 rounded-xl border bg-white p-3 cursor-grab hover:border-brand-300 hover:shadow-sm transition-all ${
        isDragging ? 'opacity-40' : 'border-ink-200'
      }`}
    >
      <span className="module-library-icon">
        <UiIcon name={module.type} size={19} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink-800">{module.label}</div>
        <div className="text-xs text-ink-400 mt-0.5 truncate">
          {module.description}
        </div>
      </div>
      <UiIcon
        name="grip"
        size={18}
        className="shrink-0 text-ink-300 transition-colors group-hover:text-brand-500"
      />
    </div>
  );
}

export default function ModuleLibrary() {
  return (
    <div className="h-full flex flex-col">
      <div className="pane-heading">
        <div className="pane-heading-kicker">构建简历</div>
        <h2 className="pane-heading-title">模块库</h2>
        <p className="pane-heading-description">拖拽模块到编辑区添加</p>
      </div>
      <div className="module-library-list flex-1 overflow-y-auto p-3 space-y-2 bg-ink-50">
        {MODULE_LIBRARY.map((m) => (
          <ModuleCard key={m.type} module={m} />
        ))}
      </div>
    </div>
  );
}
