import { useEffect, useRef, useState } from 'react';
import { MODULE_LIBRARY } from '../types';
import type { EntityType, ModuleDef } from '../types';
import UiIcon from './UiIcon';

interface ModulePickerProps {
  addedTypes: EntityType[];
  onApply: (types: EntityType[]) => boolean | Promise<boolean>;
}

function ModuleOption({
  module,
  checked,
  added,
  onChange,
}: {
  module: ModuleDef;
  checked: boolean;
  added: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`module-picker-option ${added ? 'is-added' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      <span className="module-picker-option-icon">
        <UiIcon name={module.type} size={17} />
      </span>
      <span className="module-picker-option-copy">
        <span className="module-picker-option-label">{module.label}</span>
        <span className="module-picker-option-description">{module.description}</span>
      </span>
      {added && (
        <span className="module-picker-option-status">
          {checked ? '已添加' : '将移除'}
        </span>
      )}
    </label>
  );
}

export default function ModulePicker({ addedTypes, onApply }: ModulePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<EntityType[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const applyingRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const addedTypeSet = new Set(addedTypes);
  const selectionChanged = selectedTypes.length !== addedTypeSet.size
    || selectedTypes.some((type) => !addedTypeSet.has(type));

  const closePicker = (force = false) => {
    if (applyingRef.current && !force) return;
    setOpen(false);
    setSelectedTypes([]);
    setApplyError('');
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        closePicker();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.querySelector<HTMLElement>('input')?.focus();
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleType = (type: EntityType) => {
    setSelectedTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  };

  const handleApply = async () => {
    if (applying || !selectionChanged) return;
    applyingRef.current = true;
    setApplying(true);
    setApplyError('');
    try {
      const applied = await onApply(selectedTypes);
      if (applied) {
        closePicker(true);
      } else {
        setApplyError('应用失败，当前选择未保存，请重试。');
      }
    } catch {
      setApplyError('应用失败，当前选择未保存，请重试。');
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  return (
    <div ref={pickerRef} className="module-picker">
      <button
        type="button"
        ref={triggerRef}
        className={`module-picker-trigger ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          setSelectedTypes(nextOpen ? [...addedTypes] : []);
          setApplyError('');
        }}
      >
        <UiIcon name="plus" size={16} />
        添加模块
      </button>

      {open && (
        <div
          ref={dialogRef}
          className="module-picker-popover"
          role="dialog"
          aria-label="选择简历模块"
        >
          <div className="module-picker-heading">
            <div>
              <h3>选择简历中要保留的模块</h3>
              <p>勾选需要出现在预览和导出的模块，应用后立即同步。</p>
            </div>
            <button
              type="button"
              className="module-picker-close"
              aria-label="关闭添加模块"
              onClick={() => closePicker()}
            >
              <UiIcon name="close" size={17} />
            </button>
          </div>
          <div className="module-picker-list">
            {MODULE_LIBRARY.map((module) => (
              <ModuleOption
                key={module.type}
                module={module}
                checked={selectedTypes.includes(module.type)}
                added={addedTypeSet.has(module.type)}
                onChange={() => toggleType(module.type)}
              />
            ))}
          </div>
          {applyError && (
            <div className="module-picker-error" role="alert">
              {applyError}
            </div>
          )}
          <div className="module-picker-footer">
            <span>
              {selectionChanged
                ? selectedTypes.length > 0
                  ? `将保留 ${selectedTypes.length} 个模块`
                  : '将移除全部模块'
                : `已保留 ${selectedTypes.length} 个模块`}
            </span>
            <button
              type="button"
              className="module-picker-confirm"
              disabled={applying || !selectionChanged}
              onClick={() => void handleApply()}
            >
              {applying ? '应用中…' : '应用变更'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
