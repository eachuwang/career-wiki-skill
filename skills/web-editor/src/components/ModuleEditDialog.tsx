/**
 * ModuleEditDialog — 中央悬浮编辑窗
 *
 * 承载单个模块的字段编辑:左侧条目列表,右侧字段编辑器。
 * 支持从预览文字点击定位到具体条目与字段并聚焦。
 */

import { useEffect, useMemo, useState } from 'react';
import { getOrderedEntityFieldEntries } from '../resume/fields';
import { temporalKey } from '../resume/projection';
import { getSelectedPolishFields } from '../resume/polish';
import type {
  ModuleInstance,
  ResumePolishConfig,
  ResumePolishField,
  WikiEntity,
} from '../types';
import type { EditTarget } from '../pages/ResumeEditor';
import FieldEditor from './FieldEditor';
import UiIcon from './UiIcon';

interface ModuleEditDialogProps {
  module: ModuleInstance;
  wikiEntities: WikiEntity[];
  initialTarget: EditTarget;
  onClose: () => void;
  onOverrideField: (moduleId: string, itemPath: string, field: string, value: unknown) => void;
  onRestoreField: (moduleId: string, itemPath: string, field: string) => void;
  onToggleItemVisibility: (moduleId: string, itemId: string) => void;
  polish?: ResumePolishConfig;
  polishGeneratingKey?: string | null;
  onRegeneratePolish?: (path: string, field: ResumePolishField) => void;
}

/** 条目展示名 */
function getItemLabel(item: WikiEntity): string {
  const name = item.fields.name ?? item.fields.title;
  if (name) return String(name);
  const pathName = String(item.path || '').split('/').pop() || '';
  return pathName.replace(/\.md$/, '') || '(未命名)';
}

/** 字段输入框 id(与条目索引、字段名对应,用于定位聚焦) */
function fieldInputId(moduleId: string, index: number, field: string): string {
  return moduleId + '-' + index + '-' + field;
}

export default function ModuleEditDialog({
  module,
  wikiEntities,
  initialTarget,
  onClose,
  onOverrideField,
  onRestoreField,
  onToggleItemVisibility,
  polish,
  polishGeneratingKey,
  onRegeneratePolish,
}: ModuleEditDialogProps) {
  const items = useMemo(() => {
    const list = wikiEntities.filter((e) => e.entity === module.type);
    // 与预览一致:按结束时间降序,进行中排最前
    return [...list].sort((a, b) =>
      temporalKey(b.fields).localeCompare(temporalKey(a.fields)),
    );
  }, [wikiEntities, module.type]);

  const initialPath =
    initialTarget.path && items.some((e) => e.path === initialTarget.path)
      ? initialTarget.path
      : items[0]?.path ?? null;

  const [selectedPath, setSelectedPath] = useState<string | null>(initialPath);
  const selectedIndex = items.findIndex((e) => e.path === selectedPath);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;

  const polishSelectedFields = getSelectedPolishFields(polish);

  // 从预览点击进入时,滚动并聚焦目标字段
  useEffect(() => {
    if (!initialTarget.field || selectedIndex < 0) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(
        fieldInputId(module.id, selectedIndex, initialTarget.field || ''),
      );
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        (el as HTMLElement).focus();
      }
    }, 80);
    return () => clearTimeout(timer);
    // 只在打开时定位一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="module-dialog-backdrop" role="presentation">
      <div
        className="module-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={'编辑' + module.label}
      >
        <div className="module-dialog-head">
          <span className="module-dialog-icon">
            <UiIcon name={module.type} size={18} />
          </span>
          <h2 className="module-dialog-title">{module.label}</h2>
          <span className="module-dialog-count">
            {items.length - module.hiddenItemIds.length} / {items.length} 条显示
          </span>
          <button
            type="button"
            className="icon-button module-dialog-close"
            onClick={onClose}
            title="关闭编辑窗"
            aria-label="关闭编辑窗"
          >
            <UiIcon name="close" size={18} />
          </button>
        </div>
        <div className="module-dialog-body">
          <div className="module-item-list" role="listbox" aria-label={module.label + '条目列表'}>
            {items.map((item) => {
              const hidden = module.hiddenItemIds.includes(item.path);
              return (
                <div
                  key={item.path}
                  role="option"
                  aria-selected={selectedPath === item.path}
                  className={
                    'module-item-option' +
                    (selectedPath === item.path ? ' active' : '') +
                    (hidden ? ' is-hidden' : '')
                  }
                >
                  <button
                    type="button"
                    className="module-item-select"
                    onClick={() => setSelectedPath(item.path)}
                  >
                    <span className="module-item-label">{getItemLabel(item)}</span>
                    {hidden && <span className="module-item-hidden-tag">已隐藏</span>}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onToggleItemVisibility(module.id, item.path)}
                    title={hidden ? '恢复显示' : '从当前简历隐藏'}
                    aria-label={(hidden ? '恢复' : '隐藏') + getItemLabel(item)}
                  >
                    <UiIcon name={hidden ? 'eye-off' : 'eye'} size={16} />
                  </button>
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="module-item-empty">该模块暂无条目</div>
            )}
          </div>
          <div className="module-item-fields">
            {selected ? (
              <>
                <div className="module-item-fields-title">{getItemLabel(selected)}</div>
                {getOrderedEntityFieldEntries(selected.entity, selected.fields).map(
                  ([field, value], index) => (
                    <FieldEditor
                      key={field}
                      field={field}
                      value={value}
                      moduleId={module.id}
                      itemPath={selected.path}
                      inputId={fieldInputId(module.id, selectedIndex, field)}
                      onOverride={onOverrideField}
                      isOverridden={Object.prototype.hasOwnProperty.call(
                        module.overrides[selected.path] || {},
                        field,
                      )}
                      onRestore={onRestoreField}
                      polish={polish}
                      polishSelectedFields={polishSelectedFields}
                      polishGeneratingKey={polishGeneratingKey}
                      onRegeneratePolish={onRegeneratePolish}
                    />
                  ),
                )}
              </>
            ) : (
              <div className="module-item-empty">请选择左侧条目</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
