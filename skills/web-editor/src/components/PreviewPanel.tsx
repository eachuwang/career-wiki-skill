/**
 * PreviewPanel — 右侧实时预览
 *
 * 按选中的模板渲染简历 HTML。
 * 支持模板切换、缩放。
 * 导出 PDF 用 window.print()（CSS @media print 已配好）。
 */

import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import type {
  ModuleInstance,
  WikiEntity,
  TemplateConfig,
  PrivacyConfig,
} from '../types';
import { ENTITY_LABELS } from '../types';

interface PreviewPanelProps {
  modules: ModuleInstance[];
  wikiEntities: WikiEntity[];
  template: TemplateConfig | null;
  privacy: PrivacyConfig;
  resumeName: string;
  onExportPDF: () => void;
  onExportHTML: () => void;
}

/** 脱敏单个值 */
function maskValue(field: string, value: unknown, privacy: PrivacyConfig): string {
  const v = String(value || '');
  if (!v) return '';

  // phone
  if (privacy.mask_phone && (field === 'phone' || /^\d{11}$/.test(v))) {
    return v.length >= 7 ? `${v.slice(0, 3)}****${v.slice(-4)}` : v;
  }
  // email
  if (privacy.mask_email && field === 'email') {
    const at = v.indexOf('@');
    return at > 0 ? `${v[0]}***${v.slice(at)}` : v;
  }
  // name
  if (privacy.mask_name && (field === 'name' || field === 'company')) {
    return v.length > 1 ? `${v[0]}${'*'.repeat(v.length - 1)}` : v;
  }
  return v;
}

/** 按模板 section 渲染一个模块 */
function renderModule(
  module: ModuleInstance,
  wikiData: WikiEntity[],
  templateSections: TemplateConfig['sections'],
  privacy: PrivacyConfig,
): ReactNode {
  // 找模板里这个 module 的 section 配置
  const section = templateSections.find((s) => s.module === module.type);
  const title = section?.title || module.label;
  const fields = section?.fields || [];

  if (wikiData.length === 0) return null;

  // group_by 处理（技能按分类分组）
  if (section?.group_by) {
    const groups: Record<string, WikiEntity[]> = {};
    for (const e of wikiData) {
      const key = String(e.fields[section.group_by] || '其他');
      (groups[key] = groups[key] || []).push(e);
    }
    return (
      <div className="preview-section" data-module={module.type}>
        {title && <h2 className="section-title">{title}</h2>}
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="skill-group">
            <div className="skill-group-title">{cat}</div>
            <div className="skill-tags">
              {items.map((e, i) => (
                <span key={i} className="skill-tag">
                  {maskValue('name', e.fields.name, privacy)}{' '}
                  <span className="text-ink-400 text-xs">
                    {maskValue('level', e.fields.level, privacy)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 普通模块：逐条列出
  return (
    <div className="preview-section" data-module={module.type}>
      {title && <h2 className="section-title">{title}</h2>}
      {wikiData.map((e, i) => {
        const headerFields = fields.slice(0, 3);
        const descFields = fields.slice(3);
        return (
          <div key={i} className="entry">
            <div className="entry-header">
              <span className="entry-title">
                {headerFields
                  .map((f) => maskValue(f, e.fields[f], privacy))
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {e.fields.start != null && (
                <span className="entry-date">
                  {maskValue('start', e.fields.start, privacy)} —{' '}
                  {maskValue('end', e.fields.end, privacy)}
                </span>
              )}
            </div>
            {descFields.map(
              (f) =>
                e.fields[f] != null && (
                  <div key={f} className="entry-desc">
                    {maskValue(f, e.fields[f], privacy)}
                  </div>
                ),
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PreviewPanel({
  modules,
  wikiEntities,
  template,
  privacy,
  resumeName,
  onExportPDF,
  onExportHTML,
}: PreviewPanelProps) {
  const [zoom, setZoom] = useState(1);

  const templateClass = template?.id || 'default';
  const templateSections = template?.sections || [];

  const previewHTML = useMemo(() => {
    return modules.map((m) => {
      const data = wikiEntities.filter((e) => e.entity === m.type);
      // 应用用户覆盖
      const merged = data.map((e) => ({
        ...e,
        fields: { ...e.fields, ...m.overrides },
      }));
      return { module: m, data: merged };
    });
  }, [modules, wikiEntities]);

  return (
    <div className="h-full flex flex-col">
      {/* 预览工具栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-ink-200 bg-white no-print">
        <span className="text-sm font-medium text-ink-800">预览</span>
        <div className="flex-1" />
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          className="text-ink-400 hover:text-ink-600 w-7 h-7 flex items-center justify-center rounded hover:bg-ink-100"
        >
          −
        </button>
        <span className="text-xs text-ink-400 w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          className="text-ink-400 hover:text-ink-600 w-7 h-7 flex items-center justify-center rounded hover:bg-ink-100"
        >
          +
        </button>
        <div className="w-px h-5 bg-ink-200 mx-1" />
        <button
          onClick={onExportHTML}
          className="text-xs px-2 py-1 rounded text-ink-500 hover:bg-ink-100"
          title="导出 HTML"
        >
          HTML
        </button>
        <button
          onClick={onExportPDF}
          className="text-xs px-3 py-1 rounded bg-brand-500 text-white hover:bg-brand-600"
          title="导出 PDF（浏览器打印）"
        >
          导出 PDF
        </button>
      </div>

      {/* 预览内容 */}
      <div className="flex-1 overflow-y-auto bg-ink-100 p-6 no-print">
        <div
          className="preview-container print-area bg-white shadow-lg mx-auto"
          style={{
            transform: `scale(${zoom})`,
            width: '210mm',
            minHeight: '297mm',
            padding: '40px',
          }}
        >
          <div className={templateClass}>
            {/* 简历标题 */}
            {modules.some((m) => m.type === 'person') && (
              <ResumeHeader
                personData={previewHTML.find((p) => p.module.type === 'person')?.data?.[0]}
                privacy={privacy}
                resumeName={resumeName}
              />
            )}

            {/* 各模块 */}
            {previewHTML.map(({ module, data }) =>
              renderModule(module, data, templateSections, privacy),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 简历头部（个人信息） */
function ResumeHeader({
  personData,
  privacy,
  resumeName,
}: {
  personData?: WikiEntity;
  privacy: PrivacyConfig;
  resumeName: string;
}) {
  if (!personData) {
    return <h1>{resumeName}</h1>;
  }
  const f = personData.fields;
  return (
    <div className="person-info">
      <h1>{maskValue('name', f.name, privacy)}</h1>
      <div className="text-sm text-ink-400 mt-1">
        {maskValue('title', f.title, privacy)}
      </div>
      <div className="text-xs mt-2 space-x-3">
        {f.email != null && <span>{maskValue('email', f.email, privacy)}</span>}
        {f.phone != null && <span>{maskValue('phone', f.phone, privacy)}</span>}
        {f.github != null && <span>{maskValue('github', f.github, privacy)}</span>}
        {f.website != null && <span>{maskValue('website', f.website, privacy)}</span>}
      </div>
    </div>
  );
}
