/**
 * TemplateSelector — 模板选择 + 管理（原 template-manager 能力并入编辑器）
 *
 * 下拉选择当前模板，并提供「复制当前模板」「删除当前模板」操作。
 * 复制会生成新 id/name 并携带源模板 CSS；预设模板同样可删（删除的是
 * ~/.career_wiki/templates/ 下的副本，不影响 skill 包内预设文件）。
 */

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

  return (
    <div className="template-selector">
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
        onClick={onDuplicate}
        className="toolbar-icon-button"
        title="复制当前模板"
        aria-label="复制当前模板"
      >
        <UiIcon name="copy" size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!deletable}
        className="toolbar-icon-button"
        title={deletable ? '删除当前模板' : '至少保留一个模板'}
        aria-label="删除当前模板"
      >
        <UiIcon name="trash" size={16} />
      </button>
    </div>
  );
}
