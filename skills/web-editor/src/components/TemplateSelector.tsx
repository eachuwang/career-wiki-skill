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
    <select
      value={currentId || ''}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-ink-200 rounded px-2 py-1 bg-white text-ink-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
    >
      <option value="" disabled>
        选择模板...
      </option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.layout === 'single-column' ? '单栏' : '双栏'})
        </option>
      ))}
    </select>
  );
}
