/**
 * useModules — 模块操作与拖拽领域 hook
 *
 * 收敛 ResumeEditor 中的模块增删改排序 + dnd-kit 交互。
 * 删除模块时触发即时保存（通过 onRemoveSave 回调交回编排层）。
 */

import { useState, useCallback } from 'react';
import {
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import type { ModuleInstance, EntityType } from '../types';
import { MODULE_LIBRARY } from '../constants';
import { toggleHiddenItem } from '../resume/visibility';
import { genId } from './useResumes';

interface UseModulesParams {
  /** 删除模块后立即保存（传入删除后的模块列表） */
  onRemoveSave?: (modules: ModuleInstance[]) => Promise<void>;
}

export function useModules({ onRemoveSave }: UseModulesParams = {}) {
  const [modules, setModules] = useState<ModuleInstance[]>([]);
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveDrag({
      id: String(e.active.id),
      type: String(e.active.data.current?.source),
    });
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over } = e;
      if (!over) return;

      // 从模块库拖入编辑区
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
        setModules((prev) => {
          const oldIndex = prev.findIndex((m) => m.id === active.id);
          const newIndex = prev.findIndex((m) => m.id === over.id);
          if (oldIndex >= 0 && newIndex >= 0) {
            return arrayMove(prev, oldIndex, newIndex);
          }
          return prev;
        });
      }
    },
    [],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m)),
    );
  }, []);

  const handleOverrideField = useCallback(
    (moduleId: string, field: string, value: unknown) => {
      setModules((prev) =>
        prev.map((m) =>
          m.id === moduleId
            ? { ...m, overrides: { ...m.overrides, [field]: value } }
            : m,
        ),
      );
    },
    [],
  );

  const handleRemoveModule = useCallback(
    async (id: string) => {
      const nextModules = modules.filter((m) => m.id !== id);
      setModules(nextModules);
      if (onRemoveSave) {
        await onRemoveSave(nextModules);
      }
    },
    [modules, onRemoveSave],
  );

  const handleReorderModule = useCallback(
    (oldIndex: number, newIndex: number) => {
      if (newIndex < 0 || newIndex >= modules.length || oldIndex === newIndex) return;
      setModules((prev) => arrayMove(prev, oldIndex, newIndex));
    },
    [modules.length],
  );

  const handleToggleItemVisibility = useCallback(
    (moduleId: string, itemId: string) => {
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
    },
    [],
  );

  return {
    modules,
    setModules,
    activeDrag,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleToggleExpand,
    handleOverrideField,
    handleRemoveModule,
    handleReorderModule,
    handleToggleItemVisibility,
  };
}
