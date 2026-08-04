/**
 * PreviewPanel — 右侧实时预览
 *
 * 按选中的模板渲染简历 HTML。
 * 支持模板切换、缩放。
 * 导出 PDF 用 window.print()（CSS @media print 已配好）。
 */

import { useState, useMemo, Fragment } from 'react';
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

/** 格式化日期：present → 至今，YYYY-MM → YYYY.MM，其他原样返回 */
function formatDate(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.toLowerCase() === 'present' || s === '至今') return '至今';
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}.${m[2]}` : s;
}

/** 日期排序键：用于按开始时间倒序，缺失的排最后 */
function dateSortKey(value: unknown): number {
  const s = String(value ?? '').trim();
  if (!s) return -1;
  if (s.toLowerCase() === 'present') return 999999;
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? Number(m[1]) * 100 + Number(m[2]) : -1;
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
  // 模板未定义该模块时的兜底字段，避免条目只剩日期
  const FALLBACK_FIELDS: Record<string, string[]> = {
    summary: ['content'],
    experience: ['company', 'role', 'start', 'end', 'description'],
    project: ['name', 'role', 'start', 'end', 'description'],
    education: ['school', 'degree', 'major', 'start', 'end'],
  };
  const fields = section?.fields?.length
    ? section.fields
    : FALLBACK_FIELDS[module.type] || [];

  if (wikiData.length === 0) return null;

  // 有开始时间的条目按时间倒序（工作经历、项目经验、教育背景）
  const sorted =
    section?.order === 'asc'
      ? wikiData
      : [...wikiData].sort(
          (a, b) => dateSortKey(b.fields.start) - dateSortKey(a.fields.start),
        );

  // group_by 处理（技能按分类分组）
  if (section?.group_by) {
    const groups: Record<string, WikiEntity[]> = {};
    for (const e of sorted) {
      const key = String(e.fields[section.group_by] || '其他');
      (groups[key] = groups[key] || []).push(e);
    }
    return (
      <div className="preview-section" data-module={module.type}>
        {title && (
          <h2 className="section-title text-lg font-bold text-ink-900 border-b border-ink-200 pb-1 mb-3 mt-6 first:mt-0">
            {title}
          </h2>
        )}
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="skill-group">
            <div className="skill-group-title text-sm font-medium text-ink-700 mt-2">
              {cat}
            </div>
            <div className="skill-tags">
              {items.map((e, i) => (
                <span
                  key={i}
                  className="skill-tag inline-block bg-ink-100 rounded px-2 py-0.5 text-sm mr-1 mb-1"
                >
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

  // 单字段模块（如个人优势 content）：没有标题/副标题结构，直接按段落渲染
  if (fields.length === 1) {
    return (
      <div className="preview-section" data-module={module.type}>
        {title && (
          <h2 className="section-title text-lg font-bold text-ink-900 border-b border-ink-200 pb-1 mb-3 mt-6 first:mt-0">
            {title}
          </h2>
        )}
        {sorted.map((e, i) => (
          <div
            key={i}
            className="entry mb-4 text-sm text-ink-600 whitespace-pre-line"
          >
            {maskValue(fields[0], e.fields[fields[0]], privacy)}
          </div>
        ))}
      </div>
    );
  }

  // 普通模块：逐条列出。
  // 版式约定：第一行主标题（公司/项目名/学校），
  // 第二行左侧副标题（职位/角色/学位），右侧日期区间，
  // 其余字段作为详细内容逐行展示。
  const startIdx = fields.indexOf('start');
  const titleField = fields[0];
  const subFields =
    startIdx > 1 ? fields.slice(1, startIdx) : fields.slice(1, 3);
  const descFields = fields.filter(
    (f) =>
      f !== titleField &&
      !subFields.includes(f) &&
      f !== 'start' &&
      f !== 'end',
  );

  return (
    <div className="preview-section" data-module={module.type}>
      {title && (
        <h2 className="section-title text-lg font-bold text-ink-900 border-b border-ink-200 pb-1 mb-3 mt-6 first:mt-0">
          {title}
        </h2>
      )}
      {sorted.map((e, i) => {
        const startText = formatDate(e.fields.start);
        const endText = formatDate(e.fields.end);
        const dateRange = startText ? `${startText} - ${endText || '至今'}` : endText;
        return (
          <div key={i} className="entry mb-4">
            <div className="entry-title font-semibold text-[15px] text-ink-900">
              {maskValue(titleField, e.fields[titleField], privacy)}
            </div>
            <div className="entry-sub flex items-baseline justify-between mt-0.5">
              <span className="text-sm text-ink-700">
                {subFields
                  .map((f) => maskValue(f, e.fields[f], privacy))
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {dateRange && (
                <span className="entry-date text-sm text-ink-500 whitespace-nowrap ml-4">
                  {dateRange}
                </span>
              )}
            </div>
            {descFields.map(
              (f) =>
                e.fields[f] != null && (
                  <div key={f} className="entry-desc text-sm text-ink-600 mt-1 whitespace-pre-line">
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

            {/* 各模块（person 由 ResumeHeader 渲染，这里跳过避免重复） */}
            {previewHTML
              .filter(({ module }) => module.type !== 'person')
              .map(({ module, data }) => (
                <Fragment key={module.id}>
                  {renderModule(module, data, templateSections, privacy)}
                </Fragment>
              ))}
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
