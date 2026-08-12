/**
 * TemplateSelector — 模板选择 + 管理（原 template-manager 能力并入编辑器）
 *
 * 下拉选择当前模板，并提供「复制当前模板」「删除当前模板」操作。
 * 复制会生成新 id/name 并携带源模板 CSS；预设模板同样可删（删除的是
 * ~/.career_wiki/templates/ 下的副本，不影响 skill 包内预设文件）。
 */

import { useEffect, useRef, useState } from 'react';
import type { TemplateConfig } from '../types';
import UiIcon from './UiIcon';

interface TemplateSelectorProps {
  templates: TemplateConfig[];
  currentId: string | null;
  onChange: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function TemplateSelector({
  templates,
  currentId,
  onChange,
  onDuplicate,
  onDelete,
}: TemplateSelectorProps) {
  const deletable = templates.length > 1;
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [menuOpen]);

  return (
    <div className="template-selector selector-with-menu" ref={rootRef}>
      <label className="toolbar-field">
        <span>排版模板</span>
        <select
          value={currentId || ''}
          onChange={(e) => onChange(e.target.value)}
          className="toolbar-select"
          aria-label="选择排版模板"
        >
          <option value="" disabled>
            选择模板...
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}（{t.layout === 'single-column' ? '单栏' : '双栏'}）
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="toolbar-icon-button toolbar-icon-button-subtle"
        title="模板操作"
        aria-label="打开模板操作菜单"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <UiIcon name="more" size={18} />
      </button>
      {menuOpen && (
        <div className="selector-action-menu" role="menu" aria-label="模板操作">
          <button type="button" role="menuitem" onClick={() => { onDuplicate(); setMenuOpen(false); }}>
            <UiIcon name="copy" size={15} /> 复制模板
          </button>
          <div className="selector-action-separator" />
          <button type="button" role="menuitem" className="destructive" disabled={!deletable} onClick={() => { onDelete(); setMenuOpen(false); }}>
            <UiIcon name="trash" size={15} /> 删除模板
          </button>
        </div>
      )}
    </div>
  );
}
