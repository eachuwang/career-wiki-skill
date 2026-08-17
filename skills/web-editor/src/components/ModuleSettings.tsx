/**
 * ModuleSettings — 顶栏「模块设置」面板
 *
 * 两个区域:「已显示」与「已隐藏」。
 * - 已显示:拖拽排序、点击打开中央编辑窗、− 号移入已隐藏
 * - 已隐藏:+ 号移入已显示
 * 移动后自动滚动到目标区域中的该模块。
 */

import { useEffect, useRef, useState } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MODULE_LIBRARY } from '../types';
import type { EntityType, ModuleDef, ModuleInstance, WikiEntity } from '../types';
import UiIcon from './UiIcon';

interface ModuleSettingsProps {
  modules: ModuleInstance[];
  wikiEntities: WikiEntity[];
  onApplyModules: (types: EntityType[]) => boolean | Promise<boolean>;
  onOpenModule: (moduleId: string) => void;
}

/** 已显示模块行:拖拽排序 + 打开编辑 + − 移入已隐藏 */
function DisplayedModuleRow({
  module,
  count,
  onOpenModule,
  onHide,
}: {
  module: ModuleInstance;
  count: number;
  onOpenModule: (moduleId: string) => void;
  onHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        'module-card rounded-lg border transition-colors ' +
        (isDragging ? 'opacity-50 border-brand-400' : 'border-ink-200')
      }
    >
      <button
        {...attributes}
        {...listeners}
        className="icon-button cursor-grab active:cursor-grabbing"
        title="拖拽排序"
        aria-label={'拖拽' + module.label + '排序'}
      >
        <UiIcon name="grip" size={18} />
      </button>
      <button
        type="button"
        className="module-card-main"
        onClick={() => onOpenModule(module.id)}
        title={'编辑' + module.label}
        aria-label={'打开' + module.label + '编辑窗'}
      >
        <span className="module-card-icon">
          <UiIcon name={module.type} size={16} />
        </span>
        <span className="module-card-label">{module.label}</span>
        {count > 0 && (
          <span className="module-card-count">{count}</span>
        )}
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={onHide}
        title="移入已隐藏"
        aria-label={'隐藏' + module.label + '模块'}
      >
        <UiIcon name="minus" size={17} />
      </button>
    </div>
  );
}

/** 已隐藏模块行:+ 移入已显示 */
function HiddenModuleRow({
  def,
  onShow,
}: {
  def: ModuleDef;
  onShow: () => void;
}) {
  return (
    <div className="module-hidden-row">
      <span className="module-card-icon">
        <UiIcon name={def.type} size={16} />
      </span>
      <span className="module-hidden-label" title={def.description}>
        {def.label}
      </span>
      <button
        type="button"
        className="icon-button"
        onClick={onShow}
        title="移入已显示"
        aria-label={'显示' + def.label + '模块'}
      >
        <UiIcon name="plus" size={17} />
      </button>
    </div>
  );
}

export default function ModuleSettings({
  modules,
  wikiEntities,
  onApplyModules,
  onOpenModule,
}: ModuleSettingsProps) {
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const closePanel = () => {
    if (applyingRef.current) return;
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closePanel();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hiddenDefs = MODULE_LIBRARY.filter(
    (def) => !modules.some((m) => m.type === def.type),
  );

  /** 变更模块集合后,把目标模块滚入视野(跨区域移动) */
  const scrollToRow = (type: EntityType) => {
    setTimeout(() => {
      rowRefs.current.get(type)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }, 80);
  };

  const handleShow = (type: EntityType) => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    const next = [...modules.map((m) => m.type), type];
    void Promise.resolve(onApplyModules(next))
      .then((ok) => {
        if (ok) scrollToRow(type);
      })
      .finally(() => {
        applyingRef.current = false;
        setApplying(false);
      });
  };

  const handleHide = (type: EntityType) => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    const next = modules
      .filter((m) => m.type !== type)
      .map((m) => m.type);
    void Promise.resolve(onApplyModules(next))
      .then((ok) => {
        if (ok) scrollToRow(type);
      })
      .finally(() => {
        applyingRef.current = false;
        setApplying(false);
      });
  };

  return (
    <div ref={rootRef} className="module-settings">
      <button
        type="button"
        ref={triggerRef}
        className={'module-picker-trigger ' + (open ? 'is-open' : '')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <UiIcon name="settings" size={16} />
        模块设置
      </button>

      {open && (
        <div
          className="module-settings-popover"
          role="dialog"
          aria-label="模块设置"
        >
          <div className="module-picker-heading">
            <div>
              <h3>模块设置</h3>
              <p>已显示模块支持拖拽排序;± 号在两组之间移动模块</p>
            </div>
            <button
              type="button"
              className="module-picker-close"
              aria-label="关闭模块设置"
              onClick={() => closePanel()}
            >
              <UiIcon name="close" size={17} />
            </button>
          </div>

          {/* 已显示区域 */}
          <div className="module-settings-section-title">
            已显示模块 · {modules.length}
          </div>
          <div className="module-settings-list" aria-label="已显示模块">
            {modules.length === 0 ? (
              <div className="module-settings-empty">
                暂无显示的模块,点击下方 + 号添加
              </div>
            ) : (
              <SortableContext
                items={modules.map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                {modules.map((m) => (
                  <div
                    key={m.id}
                    ref={(el) => {
                      rowRefs.current.set(m.type, el);
                    }}
                  >
                    <DisplayedModuleRow
                      module={m}
                      count={wikiEntities.filter((e) => e.entity === m.type).length}
                      onOpenModule={(moduleId) => {
                        onOpenModule(moduleId);
                        closePanel();
                      }}
                      onHide={() => handleHide(m.type)}
                    />
                  </div>
                ))}
              </SortableContext>
            )}
          </div>

          {/* 已隐藏区域 */}
          <div className="module-settings-divider" />
          <div className="module-settings-section-title">
            已隐藏模块 · {hiddenDefs.length}
          </div>
          <div className="module-settings-hidden-list" aria-label="已隐藏模块">
            {hiddenDefs.length === 0 ? (
              <div className="module-settings-empty">全部模块已显示</div>
            ) : (
              hiddenDefs.map((def) => (
                <div
                  key={def.type}
                  ref={(el) => {
                    rowRefs.current.set(def.type, el);
                  }}
                >
                  <HiddenModuleRow
                    def={def}
                    onShow={() => handleShow(def.type)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
