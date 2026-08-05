/**
 * TemplateSelector — 模板选择下拉框
 *
 * 从 API 获取模板列表，让用户切换模板。
 */

import type { TemplateConfig } from '../types';

interface TemplateSelectorProps {
  templates: TemplateConfig[];
  currentId: string | null;
  onChange: (id: string) => void;
}

export default function TemplateSelector({
  templates,
  currentId,
  onChange,
}: TemplateSelectorProps) {
  return (
    <label className="toolbar-field">
      <span>排版模板</span>
      <select
        value={currentId || ''}
        onChange={(e) => onChange(e.target.value)}
        className="toolbar-select"
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
  );
}
