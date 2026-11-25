import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { EntityType, TemplateConfig } from '../types';
import type { ResumeView, ResumeViewSection } from '../resume/projection';
import { getResumeContactItems } from '../resume/contact';
import { A4_HEIGHT_MM, A4_WIDTH_MM, CONTENT_HEIGHT_MM, mmToPx, paginateBlocks, paragraphBlocks } from '../resume/page';
import { getTemplatePreset } from '../resume/templates';
import UiIcon from './UiIcon';

type EditBlock = (module: EntityType, path?: string, field?: string) => void;
interface PreviewPanelProps {
  view: ResumeView;
  template: TemplateConfig | null;
  onEditBlock?: EditBlock;
}

interface PageBlock {
  key: string;
  module: EntityType;
  node: ReactNode;
}

function fieldText(children: ReactNode, activate?: () => void) {
  if (!activate) return children;
  return <span role="button" tabIndex={0} data-edit="1" title="点击编辑"
    onClick={activate} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    }}>{children}</span>;
}

function dateText(value: unknown): string {
  const text = String(value ?? '').trim();
  if (text.toLowerCase() === 'present') return '至今';
  const match = /^(\d{4})-(\d{2})/.exec(text);
  return match ? `${match[1]}.${match[2]}` : text;
}

const FIELD_LABELS: Record<string, string> = { description: '项目描述：', responsibilities: '岗位职责：', tech_stack: '技术栈：' };

function sectionBlocks(section: ResumeViewSection, edit?: EditBlock): PageBlock[] {
  const { module, title, fields } = section;
  const blocks: PageBlock[] = [];
  const add = (key: string, node: ReactNode) => blocks.push({ key: module + key, module, node });
  if (section.grouped) {
    for (const group of section.groups ?? []) {
      add(group.key, <div className="resume-skill-row">
        <strong className="resume-skill-category">{group.key}</strong>
        <div className="resume-skill-list">{group.items.map((item, index) => (
          <span key={item.path}>
            {index > 0 && ' · '}
            {fieldText(String(item.fields.name ?? ''), edit && (() => edit(module, item.path, 'name')))}
            {item.fields.level != null && fieldText('（' + item.fields.level + '）', edit && (() => edit(module, item.path, 'level')))}
          </span>
        ))}</div>
      </div>);
    }
  } else {
    const [heading, ...remaining] = fields;
    const detailFields = new Set(['description', 'responsibilities', 'content', 'tech_stack', 'url', 'location']);
    const sub = remaining.filter((field) => !detailFields.has(field) && field !== 'start' && field !== 'end').slice(0, 2);
    for (const item of section.items ?? []) {
      const at = (field: string) => edit && (() => edit(module, item.path, field));
      const value = (field: string) => String(item.fields[field] ?? '');
      const paragraphs = (field: string, single: boolean) => {
        const label = field === 'description' && module !== 'project' ? '' : FIELD_LABELS[field];
        paragraphBlocks(item.fields[field]).forEach((text, index) => add(`${item.path}-${field}-${index}`,
          <div className={single ? 'resume-summary' : 'entry-desc entry-desc-block'}>
            {fieldText(<>{index === 0 && label && <span className="entry-desc-label">{label}</span>}{text}</>, at(field))}
          </div>,
        ));
      };
      if (fields.length === 1) {
        paragraphs(heading, true);
        continue;
      }
      const start = dateText(item.fields.start);
      const end = dateText(item.fields.end);
      if (value(heading) || sub.some(value) || start || end) {
        add(item.path + '-head', <div className="entry entry-lead">
          {value(heading) && <div className="entry-title">{fieldText(value(heading), at(heading))}</div>}
          <div className="entry-sub">
            <span className="entry-role">{sub.filter(value).map((field, index) => (
              <span key={field}>{index > 0 && ' · '}{fieldText(value(field), at(field))}</span>
            ))}</span>
            {(start || end) && <span className="entry-date">
              {start && fieldText(start, at('start'))}{start && ' – '}{end ? fieldText(end, at('end')) : '至今'}
            </span>}
          </div>
        </div>);
      }
      remaining.filter((field) => !sub.includes(field) && field !== 'start' && field !== 'end').forEach((field) => paragraphs(field, false));
    }
  }
  if (blocks.length && title) {
    blocks[0].node = <div className="section-head"><h2 className="section-title">{title}</h2>{blocks[0].node}</div>;
  }
  return blocks;
}

function documentBlocks(view: ResumeView, edit?: EditBlock): PageBlock[] {
  const blocks: PageBlock[] = [];
  if (view.person) {
    const { fields, path } = view.person;
    const at = (field: string) => edit && (() => edit('person', path, field));
    blocks.push({ key: 'person', module: 'person', node: (
      <header className="resume-header">
        <div className="resume-identity">
          {fields.name != null && <h1>{fieldText(String(fields.name), at('name'))}</h1>}
          {fields.current_title != null && <div className="resume-headline">{fieldText(String(fields.current_title), at('current_title'))}</div>}
        </div>
        <div className="resume-contact">
          {getResumeContactItems(fields).map((contact) => <span key={contact.field} className="resume-contact-item">
            <UiIcon name={contact.icon} size={13} className="resume-contact-icon" />
            {fieldText(String(contact.value), at(contact.field))}
          </span>)}
        </div>
      </header>
    ) });
  }
  for (const [index, section] of view.sections.entries()) {
    const sectionContent = sectionBlocks(section, edit);
    if (view.person && index < (view.personSectionIndex ?? 0)) {
      blocks.splice(blocks.length - 1, 0, ...sectionContent);
    } else {
      blocks.push(...sectionContent);
    }
  }
  return blocks;
}

export default function PreviewPanel({ view, template, onEditBlock }: PreviewPanelProps) {
  // Measurement has the exact same tree and CSS as the paper, but no interactive attributes.
  const editRef = useRef(onEditBlock);
  editRef.current = onEditBlock;
  const interactive = Boolean(onEditBlock);
  const blocks = useMemo(() => documentBlocks(view, interactive ? (...args) => editRef.current?.(...args) : undefined), [view, interactive]);
  const measureBlocks = useMemo(() => documentBlocks(view), [view]);
  const measureRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.86);
  const [zoom, setZoom] = useState<number | null>(null);
  const [layout, setLayout] = useState<{ blocks: PageBlock[]; preset: string; indexes: number[]; overflow: boolean } | null>(null);
  const preset = getTemplatePreset(template);
  const scale = zoom ?? fit;

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const fitToWidth = () => setFit(Math.min(0.95, Math.max(0.2, (element.clientWidth - 34) / mmToPx(A4_WIDTH_MM))));
    const observer = new ResizeObserver(fitToWidth);
    observer.observe(element);
    fitToWidth();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const measure = () => {
      const children = Array.from(element.children);
      const height = mmToPx(CONTENT_HEIGHT_MM) - 1;
      const result = paginateBlocks(children.map((child) => child.getBoundingClientRect().height), height);
      result.overflow ||= element.scrollWidth > element.clientWidth + 1;
      setLayout((previous) => previous?.blocks === blocks && previous.preset === preset &&
        previous.overflow === result.overflow && previous.indexes.every((page, index) => page === result.indexes[index])
        ? previous : { blocks, preset, ...result });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [blocks, preset]);

  const ready = layout?.blocks === blocks && layout.preset === preset;
  const pages: PageBlock[][] = [[]];
  blocks.forEach((block, index) => {
    const page = ready ? layout.indexes[index] : 0;
    (pages[page] ??= []).push(block);
  });
  const overflow = ready && layout.overflow;
  const documentClass = `resume-document preset-${preset}`;

  return <div className="h-full flex flex-col relative">
    {typeof document !== 'undefined' && createPortal(
      <div className={'paginate-measure ' + documentClass} aria-hidden="true">
        <div className="a4-content" ref={measureRef}>{measureBlocks.map((block) => <div className="paginate-block" key={block.key}>{block.node}</div>)}</div>
      </div>, document.body,
    )}
    {overflow && <div className="workspace-notice" role="alert">有一段内容超过 A4 页面。请拆短长段落后再导出 HTML 或 PDF。</div>}
    <div ref={scrollRef} className="resume-preview-scroll no-print">
      <div className="preview-stage" style={{ width: A4_WIDTH_MM * scale + 'mm' }}>
        <div className="preview-page-shell" style={{ zoom: scale }}>
          <div className={'print-area resume-pages ' + documentClass} data-layout={ready ? overflow ? 'overflow' : 'ready' : 'pending'}>
            {pages.map((page, index) => <section className="a4-page" key={index} data-page={index + 1} style={overflow ? { height: 'auto', minHeight: A4_HEIGHT_MM + 'mm' } : undefined}>
              <div className="a4-content">{page.map((block) => <div className="paginate-block" key={block.key} data-section={block.module}>{block.node}</div>)}</div>
            </section>)}
          </div>
        </div>
      </div>
    </div>
    <div className="zoom-controls floating-zoom no-print" role="group" aria-label="预览缩放">
      <span className="preview-meta floating-page-count">{pages.length} 页</span>
      <button type="button" className="icon-button" aria-label="缩小预览" onClick={() => setZoom(Math.max(0.2, scale - 0.1))}><UiIcon name="minus" size={16} /></button>
      <button type="button" className="toolbar-button ghost" aria-label="适合宽度" onClick={() => setZoom(null)}>{Math.round(scale * 100)}%</button>
      <button type="button" className="icon-button" aria-label="放大预览" onClick={() => setZoom(Math.min(2, scale + 0.1))}><UiIcon name="plus" size={16} /></button>
    </div>
  </div>;
}
