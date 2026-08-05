/**
 * PreviewPanel — 右侧实时预览
 *
 * 按选中的模板渲染简历 HTML。
 * 支持模板切换、缩放。
 */

import { useState, useMemo, useEffect, Fragment } from 'react';
import type { ReactNode } from 'react';
import type {
  ModuleInstance,
  WikiEntity,
  TemplateConfig,
  PrivacyConfig,
} from '../types';
import { ENTITY_LABELS } from '../types';
import { getResumeContactItems } from '../resume/contact';
import { getVisibleEntities } from '../resume/visibility';
import UiIcon from './UiIcon';

interface PreviewPanelProps {
  modules: ModuleInstance[];
  wikiEntities: WikiEntity[];
  template: TemplateConfig | null;
  privacy: PrivacyConfig;
  resumeName: string;
  onExportPDF: () => void;
  onExportHTML: () => void;
  onExportJSON: () => void;
}

/** 窄屏首次进入预览时自动适配 A4 宽度，避免页面级横向滚动。 */
function getInitialZoom(): number {
  if (typeof window === 'undefined' || window.innerWidth >= 900) return 0.72;
  return Math.max(0.4, Math.min(0.72, (window.innerWidth - 40) / (210 * 3.7795)));
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
    project: ['name', 'role', 'start', 'end', 'description', 'responsibilities', 'tech_stack'],
    education: ['school', 'degree', 'major', 'start', 'end'],
  };
  const fields = section?.fields?.length
    ? [...section.fields]
    : FALLBACK_FIELDS[module.type] || [];
  if (module.type === 'project' && !fields.includes('responsibilities')) {
    const descriptionIndex = fields.indexOf('description');
    fields.splice(descriptionIndex >= 0 ? descriptionIndex + 1 : fields.length, 0, 'responsibilities');
  }
  if (module.type === 'project' && !fields.includes('tech_stack')) {
    const responsibilitiesIndex = fields.indexOf('responsibilities');
    fields.splice(responsibilitiesIndex >= 0 ? responsibilitiesIndex + 1 : fields.length, 0, 'tech_stack');
  }

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
          <h2 className="section-title">
            {title}
          </h2>
        )}
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat} className="skill-group resume-skill-row">
            <div className="skill-group-title resume-skill-category">
              {cat}
            </div>
            <div className="skill-tags resume-skill-list">
              {items
                .map((entity) => {
                  const name = maskValue('name', entity.fields.name, privacy);
                  const level = maskValue('level', entity.fields.level, privacy);
                  return level ? `${name}（${level}）` : name;
                })
                .filter(Boolean)
                .join(' · ')}
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
          <h2 className="section-title">
            {title}
          </h2>
        )}
        {sorted.map((e, i) => (
          <div
            key={i}
            className="entry resume-summary"
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
        <h2 className="section-title">
          {title}
        </h2>
      )}
      {sorted.map((e, i) => {
        const startText = formatDate(e.fields.start);
        const endText = formatDate(e.fields.end);
        const dateRange = startText ? `${startText} - ${endText || '至今'}` : endText;
        return (
          <div key={e.path || i} className="entry">
            <div className="entry-title">
              {maskValue(titleField, e.fields[titleField], privacy)}
            </div>
            <div className="entry-sub">
              <span className="entry-role">
                {subFields
                  .map((f) => maskValue(f, e.fields[f], privacy))
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {dateRange && (
                <span className="entry-date">
                  {dateRange}
                </span>
              )}
            </div>
            {descFields.map(
              (f) =>
                e.fields[f] != null && (
                  <div key={f} className="entry-desc">
                    {module.type === 'project' && f === 'description' && (
                      <span className="entry-desc-label">项目描述：</span>
                    )}
                    {f === 'responsibilities' && (
                      <span className="entry-desc-label">岗位职责：</span>
                    )}
                    {f === 'tech_stack' && (
                      <span className="entry-desc-label">技术栈：</span>
                    )}
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
  onExportJSON,
}: PreviewPanelProps) {
  const [zoom, setZoom] = useState(getInitialZoom);

  useEffect(() => {
    /** 仅在视口尺寸变化时重新适配，日常缩放仍由用户控制。 */
    const fitPreviewToViewport = () => setZoom(getInitialZoom());
    window.addEventListener('resize', fitPreviewToViewport);
    fitPreviewToViewport();
    return () => window.removeEventListener('resize', fitPreviewToViewport);
  }, []);

  const templateClass = template?.id || 'default';
  const templateSections = template?.sections || [];

  const previewHTML = useMemo(() => {
    return modules.map((m) => {
      const data = getVisibleEntities(
        wikiEntities.filter((e) => e.entity === m.type),
        m.hiddenItemIds,
      );
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
      <div className="preview-toolbar no-print">
        <div>
          <div className="text-sm font-semibold text-ink-800">实时预览</div>
          <div className="text-[11px] text-ink-400">A4 · 导出与当前内容一致</div>
        </div>
        <div className="preview-toolbar-spacer" />
        <div className="zoom-controls" role="group" aria-label="预览缩放">
        <button
          onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))}
          className="icon-button"
          aria-label="缩小预览"
        >
          <UiIcon name="minus" size={17} />
        </button>
        <span className="text-xs text-ink-400 w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          className="icon-button"
          aria-label="放大预览"
        >
          <UiIcon name="plus" size={17} />
        </button>
        </div>
        <div className="preview-toolbar-divider" />
        <button
          onClick={onExportJSON}
          className="toolbar-button ghost compact"
          title="导出 JSON"
        >
          <UiIcon name="file" size={16} /> JSON
        </button>
        <button
          onClick={onExportHTML}
          className="toolbar-button ghost compact"
          title="导出 HTML"
        >
          <UiIcon name="code" size={16} /> HTML
        </button>
        <button
          onClick={onExportPDF}
          className="toolbar-button primary"
          title="导出 PDF"
        >
          <UiIcon name="download" size={16} /> 导出 PDF
        </button>
      </div>

      {/* 预览内容 */}
      <div className="resume-preview-scroll no-print">
        <div
          className="preview-stage"
          style={{ width: `${210 * zoom}mm`, minHeight: `${297 * zoom}mm` }}
        >
          <div
            className="preview-page-shell"
            style={{ transform: `scale(${zoom})` }}
          >
            <article className={`preview-container print-area resume-document ${templateClass}`}>
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
            </article>
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
  const contacts = getResumeContactItems(f);
  return (
    <header className="person-info resume-header">
      <h1>{maskValue('name', f.name, privacy)}</h1>
      <div className="resume-headline">
        {maskValue('title', f.title, privacy)}
      </div>
      <div className="resume-contact">
        {contacts.map((contact) => (
          <span key={contact.field} className="resume-contact-item">
            <UiIcon
              name={contact.icon}
              size={13}
              className="resume-contact-icon"
            />
            {maskValue(contact.field, contact.value, privacy)}
          </span>
        ))}
      </div>
    </header>
  );
}
