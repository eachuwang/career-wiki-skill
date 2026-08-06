/**
 * ResumeSelector — 多简历管理（原 multi-resume 能力并入编辑器）
 *
 * 列出所有简历配置，支持切换、新建、复制、删除。
 * 删除仅删配置 JSON，wiki 源数据不受影响。
 */

import { useState } from 'react';
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

  /** 结束名称编辑，保留已经同步到父级的最新名称。 */
  const finishNameEditing = () => setEditingName(false);

  /** 允许回车或 Escape 快速结束名称编辑。 */
  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' || event.key === 'Enter') finishNameEditing();
  };

  return (
    <div className="resume-selector" data-editing-name={editingName}>
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
      <button
        type="button"
        onClick={() => setEditingName((value) => !value)}
        className="toolbar-icon-button toolbar-icon-button-subtle"
        title="编辑简历名称"
        aria-label="编辑简历名称"
        aria-pressed={editingName}
      >
        <UiIcon name="pencil" size={16} />
      </button>
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
        onClick={onNew}
        className="toolbar-icon-button toolbar-icon-button-subtle"
        title="新建简历"
        aria-label="新建简历"
      >
        <UiIcon name="plus" size={16} />
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className="toolbar-icon-button toolbar-icon-button-subtle"
        title="复制当前简历"
        aria-label="复制当前简历"
      >
        <UiIcon name="copy" size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={resumes.length <= 1}
        className="toolbar-icon-button toolbar-icon-button-subtle"
        title={resumes.length <= 1 ? '至少保留一份简历' : '删除当前简历'}
        aria-label="删除当前简历"
      >
        <UiIcon name="trash" size={16} />
      </button>
    </div>
  );
}
