/**
 * ResumeSelector — 多简历管理（原 multi-resume 能力并入编辑器）
 *
 * 列出所有简历配置，支持切换、新建、复制、删除。
 * 删除仅删配置 JSON，wiki 源数据不受影响。
 */

import type { ResumeConfig } from '../types';
import UiIcon from './UiIcon';

interface ResumeSelectorProps {
  resumes: ResumeConfig[];
  currentId: string;
  onChange: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function ResumeSelector({
  resumes,
  currentId,
  onChange,
  onNew,
  onDuplicate,
  onDelete,
}: ResumeSelectorProps) {
  return (
    <div className="resume-selector">
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
        onClick={onNew}
        className="toolbar-icon-button"
        title="新建简历"
        aria-label="新建简历"
      >
        <UiIcon name="plus" size={16} />
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className="toolbar-icon-button"
        title="复制当前简历"
        aria-label="复制当前简历"
      >
        <UiIcon name="copy" size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={resumes.length <= 1}
        className="toolbar-icon-button"
        title={resumes.length <= 1 ? '至少保留一份简历' : '删除当前简历'}
        aria-label="删除当前简历"
      >
        <UiIcon name="trash" size={16} />
      </button>
    </div>
  );
}
