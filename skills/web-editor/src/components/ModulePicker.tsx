import { useEffect, useRef, useState } from 'react';
import { MODULE_LIBRARY } from '../types';
import type { EntityType, ModuleDef } from '../types';
import UiIcon from './UiIcon';

interface ModulePickerProps {
  addedTypes: EntityType[];
  onAdd: (types: EntityType[]) => void;
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

export default function ModulePicker({ addedTypes, onAdd }: ModulePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<EntityType[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);
  const addedTypeSet = new Set(addedTypes);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSelectedTypes([]);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const toggleType = (type: EntityType) => {
    setSelectedTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  };

  const handleAdd = () => {
    onAdd(selectedTypes);
    setSelectedTypes([]);
    setOpen(false);
  };

  return (
    <div ref={pickerRef} className="module-picker">
      <button
        type="button"
        className={`module-picker-trigger ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          setSelectedTypes(nextOpen ? [...addedTypes] : []);
        }}
      >
        <UiIcon name="plus" size={16} />
        添加模块
      </button>

      {open && (
        <div className="module-picker-popover" role="dialog" aria-label="选择简历模块">
          <div className="module-picker-heading">
            <div>
              <h3>选择简历中要保留的模块</h3>
              <p>勾选需要出现在预览和导出的模块，应用后立即同步。</p>
            </div>
            <button
              type="button"
              className="module-picker-close"
              aria-label="关闭添加模块"
              onClick={() => {
                setOpen(false);
                setSelectedTypes([]);
              }}
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
          <div className="module-picker-footer">
            <span>{selectedTypes.length > 0 ? `已选择 ${selectedTypes.length} 个` : '未选择模块'}</span>
            <button
              type="button"
              className="module-picker-confirm"
              onClick={handleAdd}
            >
              应用选择
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
