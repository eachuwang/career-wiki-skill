/**
 * ResumeSelector — 多简历管理（原 multi-resume 能力并入编辑器）
 *
 * 列出所有简历配置，支持切换、新建、复制、删除。
 * 删除仅删配置 JSON，wiki 源数据不受影响。
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ResumeConfig } from '../types';
import UiIcon from './UiIcon';

interface ResumeSelectorProps {
  resumes: ResumeConfig[];
  currentId: string;
  onChange: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  name: string;
  onNameChange: (name: string) => void;
}

export default function ResumeSelector({
  resumes,
  currentId,
  onChange,
  onNew,
  onDuplicate,
  onDelete,
  name,
  onNameChange,
}: ResumeSelectorProps) {
  const [editingName, setEditingName] = useState(false);
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

  /** 结束名称编辑，保留已经同步到父级的最新名称。 */
  const finishNameEditing = () => setEditingName(false);

  /** 允许回车或 Escape 快速结束名称编辑。 */
  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' || event.key === 'Enter') finishNameEditing();
  };

  return (
    <div className="resume-selector selector-with-menu" data-editing-name={editingName} ref={rootRef}>
      <label className="toolbar-field">
        <span>简历</span>
        <select
          value={currentId}
          onChange={(e) => onChange(e.target.value)}
          className="toolbar-select"
          aria-label="选择简历"
        >
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {editingName && (
        <label className="toolbar-field resume-name-editor">
          <span>重命名</span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            onBlur={finishNameEditing}
            onKeyDown={handleNameKeyDown}
            className="resume-name-input"
            aria-label="编辑简历名称"
            autoFocus
          />
        </label>
      )}
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="toolbar-icon-button toolbar-icon-button-subtle"
        title="简历操作"
        aria-label="打开简历操作菜单"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <UiIcon name="more" size={18} />
      </button>
      {menuOpen && (
        <div className="selector-action-menu" role="menu" aria-label="简历操作">
          <button type="button" role="menuitem" onClick={() => { setEditingName(true); setMenuOpen(false); }}>
            <UiIcon name="pencil" size={15} /> 重命名
          </button>
          <button type="button" role="menuitem" onClick={() => { onNew(); setMenuOpen(false); }}>
            <UiIcon name="plus" size={15} /> 新建简历
          </button>
          <button type="button" role="menuitem" onClick={() => { onDuplicate(); setMenuOpen(false); }}>
            <UiIcon name="copy" size={15} /> 创建副本
          </button>
          <div className="selector-action-separator" />
          <button type="button" role="menuitem" className="destructive" disabled={resumes.length <= 1} onClick={() => { onDelete(); setMenuOpen(false); }}>
            <UiIcon name="trash" size={15} /> 删除简历
          </button>
        </div>
      )}
    </div>
  );
}
