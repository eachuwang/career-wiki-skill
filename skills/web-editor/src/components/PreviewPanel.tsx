/**
 * PreviewPanel — 右侧实时预览
 *
 * 简历按「多张 A4 纸」模型渲染：先以隐藏测量容器计算每个内容块
 * 应归属的页码（块级分页，任何文字行都不会被页边界切断），
 * 再按页渲染多个 210×297mm 的 A4 页面，并实时显示总页数。
 * 每页四边为保护区域（上下 15mm、左右 16mm），内容只出现在保护区域内。
 */

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type {
  TemplateConfig,
} from '../types';
import type { ResumeView, ResumeViewItem, ResumeViewSection } from '../resume/projection.ts';

import { getResumeContactItems } from '../resume/contact';
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  CONTENT_WIDTH_MM,
  CONTENT_HEIGHT_MM,
  mmToPx,
  computePageIndexes,
} from '../resume/page.ts';
import UiIcon from './UiIcon';

interface PreviewPanelProps {
  view: ResumeView;
  template: TemplateConfig | null;
  onOpenExport: () => void;
}

/** 单页内容区高度（px），留 1px 余量防止块恰好溢出页面 */
const PAGE_CONTENT_HEIGHT_PX = Math.floor(mmToPx(CONTENT_HEIGHT_MM) - 1);

/** 一个可独立分页的内容块 */
interface ResumeBlock {
  key: string;
  node: ReactNode;
}

/** 窄屏首次进入预览时自动适配 A4 宽度，避免页面级横向滚动。 */
function getInitialZoom(): number {
  if (typeof window === 'undefined' || window.innerWidth >= 900) return 0.72;
  return Math.max(0.4, Math.min(0.72, (window.innerWidth - 40) / (A4_WIDTH_MM * 3.7795)));
}

/** 格式化日期：present → 至今，YYYY-MM → YYYY.MM，其他原样返回 */
function formatDate(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.toLowerCase() === 'present' || s === '至今') return '至今';
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}.${m[2]}` : s;
}

/** 把已完成领域规则处理的 ResumeView section 渲染成可分页内容块。 */
function renderModuleBlocks(
  section: ResumeViewSection,
): ResumeBlock[] {
  const { fields, title } = section;
  const items = section.grouped
    ? (section.groups || []).flatMap((group) => group.items)
    : section.items || [];
  if (items.length === 0) return [];

  const blocks: ResumeBlock[] = [];

  /**
   * 把「标题 + 首条内容」合并为一个头部块，保证标题不会孤立在页尾；
   * 其余内容条各自成块，供分页算法按块移动。
   */
  const pushSection = (first: ResumeBlock, rest: ResumeBlock[]): void => {
    blocks.push(
      title
        ? {
            key: `${section.module}-head`,
            node: (
              <div className="section-head">
                <h2 className="section-title">{title}</h2>
                {first.node}
              </div>
            ),
          }
        : first,
    );
    blocks.push(...rest);
  };

  // group_by 处理（技能按分类分组）
  if (section.grouped) {
    const groupedBlocks = (section.groups || []).map((group) => ({
      key: `${section.module}-group-${group.key}`,
      node: (
        <div className="skill-group resume-skill-row">
          <div className="skill-group-title resume-skill-category">
            {group.key}
          </div>
          <div className="skill-tags resume-skill-list">
            {group.items
              .map((entity) => {
                const name = String(entity.fields.name || '');
                const level = String(entity.fields.level || '');
                return level ? `${name}（${level}）` : name;
              })
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      ),
    }));
    pushSection(groupedBlocks[0], groupedBlocks.slice(1));
    return blocks;
  }

  // 单字段模块（如个人优势 content）：没有标题/副标题结构，直接按段落渲染
  if (fields.length === 1) {
    const summaryBlocks = items.map((e, i) => ({
      key: `${section.module}-summary-${e.path || i}`,
      node: (
        <div className="entry resume-summary">
          {String(e.fields[fields[0]] || '')}
        </div>
      ),
    }));
    pushSection(summaryBlocks[0], summaryBlocks.slice(1));
    return blocks;
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

  // 细粒度分块：title+sub 独占一个 entry-lead 块，每个描述字段各自成块。
  // 跨页边界下移的只是单个描述字段（高度小），留白大幅缩小，第一页内容区
  // 被尽量填满；title+sub 块很小、极少跨页，不会孤行。
  const headItems = items.map((e, i) => {
    const startText = formatDate(e.fields.start);
    const endText = formatDate(e.fields.end);
    const dateRange = startText ? `${startText} - ${endText || '至今'}` : endText;
    return {
      key: `${section.module}-entry-${e.path || i}-head`,
      node: (
        <div className="entry entry-lead">
          <div className="entry-title">
            {String(e.fields[titleField] || '')}
          </div>
          <div className="entry-sub">
            <span className="entry-role">
              {subFields
                .map((f) => String(e.fields[f] || ''))
                .filter(Boolean)
                .join(' · ')}
            </span>
            {dateRange && (
              <span className="entry-date">
                {dateRange}
              </span>
            )}
          </div>
        </div>
      ),
    };
  });
  const descItem = (e: ResumeViewItem, i: number, f: string): ResumeBlock => ({
    key: `${section.module}-entry-${e.path || i}-desc-${f}`,
    node: (
      <div className="entry-desc entry-desc-block">
        {section.module === 'project' && f === 'description' && (
          <span className="entry-desc-label">项目描述：</span>
        )}
        {f === 'responsibilities' && (
          <span className="entry-desc-label">岗位职责：</span>
        )}
        {f === 'tech_stack' && (
          <span className="entry-desc-label">技术栈：</span>
        )}
        {String(e.fields[f] || '')}
      </div>
    ),
  });
  const entryBlocks: ResumeBlock[] = [];
  items.forEach((e, i) => {
    entryBlocks.push(headItems[i]);
    descFields.forEach((f) => {
      if (e.fields[f] != null) entryBlocks.push(descItem(e, i, f));
    });
  });
  pushSection(entryBlocks[0], entryBlocks.slice(1));
  return blocks;
}

export default function PreviewPanel({
  view,
  template,
  onOpenExport,
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
  /** 生成全部可分页内容块（头部 + 各模块） */
  const blocks = useMemo(() => {
    const list: ResumeBlock[] = [];
    if (view.person) {
      list.push({
        key: 'person-header',
        node: (
          <ResumeHeader
            personData={view.person}
            resumeName={view.resume.name}
          />
        ),
      });
    }
    for (const section of view.sections) {
      list.push(...renderModuleBlocks(section));
    }
    return list;
  }, [view]);

  // 测量容器与块元素的引用，供分页计算读取真实排版高度
  const measureRef = useRef<HTMLDivElement>(null);
  const blockElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [pageIndexes, setPageIndexes] = useState<number[] | null>(null);

  /**
   * 读取测量容器中每个块的真实排版位置，计算各自页码。
   * 页码结果相同则保留旧引用，避免 setState 触发无谓重渲染。
   */
  const runPagination = useCallback(() => {
    const rects = blockElsRef.current
      .filter((el): el is HTMLDivElement => el != null)
      .map((el) => ({ top: el.offsetTop, height: el.offsetHeight }));
    if (rects.length === 0) {
      // 保持相同引用，避免 setState 触发无谓重渲染
      setPageIndexes((prev) => (prev && prev.length === 0 ? prev : []));
      return;
    }
    const next = computePageIndexes(rects, PAGE_CONTENT_HEIGHT_PX);
    setPageIndexes((prev) => {
      if (
        prev &&
        prev.length === next.length &&
        prev.every((value, i) => value === next[i])
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  // 内容或模板变化后重新测量并分页（同步执行，避免闪烁）
  useLayoutEffect(() => {
    runPagination();
  }, [runPagination, blocks, templateClass]);

  // 测量容器尺寸变化（编辑/预览视图切换、字体加载等）时重新分页
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => runPagination());
    observer.observe(el);
    return () => observer.disconnect();
  }, [runPagination]);

  /** 按页码分组内容块；未分页前先按一页兜底渲染 */
  const pageGroups = useMemo(() => {
    if (!pageIndexes) return null;
    // 页码必须与内容块一一对应；长度不一致说明分页结果已过期
    // （如删除/新增模块后尚未重算），此时回退单页兜底渲染，
    // 避免按旧页码越界访问 blocks 导致渲染崩溃。
    if (pageIndexes.length !== blocks.length) return null;
    const groups: ResumeBlock[][] = [];
    pageIndexes.forEach((page, i) => {
      (groups[page] = groups[page] || []).push(blocks[i]);
    });
    // 无内容时也保留一张空白 A4 页，避免「共 0 页」的歧义
    return groups.length > 0 ? groups : [[]];
  }, [pageIndexes, blocks]);

  const pageCount = pageGroups?.length ?? 1;

  return (
    <div className="h-full flex flex-col">
      {/* 预览工具栏 */}
      <div className="preview-toolbar no-print">
        <div className="preview-heading">
          <div className="text-sm font-semibold text-ink-800">预览</div>
          <div className="preview-meta">A4 · {pageCount} 页</div>
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
        <button
          onClick={onOpenExport}
          className="toolbar-button primary"
          title="导出简历"
        >
          <UiIcon name="download" size={16} /> 导出
        </button>
      </div>

      {/* 隐藏测量容器：portal 到 body，避免被 display:none 的预览容器影响布局，
          与分页容器使用同一块结构，仅用于读取排版高度 */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="paginate-measure" aria-hidden ref={measureRef}>
            {/* 套上与可见页一致的 resume-document + templateClass 作用域，
                否则 .resume-document 下设定的 font-size/line-height/色彩在
                测量容器中失效，块高被高估、分页把过多块挤进下一页，
                可见页内容区底部出现大段空白。 */}
            <div className={`resume-document ${templateClass}`}>
              <div className="a4-content">
                {blocks.map((block, i) => (
                  <div
                    key={block.key}
                    className="paginate-block"
                    ref={(el) => {
                      blockElsRef.current[i] = el;
                    }}
                  >
                    {block.node}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* 预览内容 */}
      <div className="resume-preview-scroll no-print">
        <div
          className="preview-stage"
          style={{
            width: `${A4_WIDTH_MM * zoom}mm`,
            minHeight: `${A4_HEIGHT_MM * pageCount * zoom}mm`,
          }}
        >
          <div
            className="preview-page-shell"
            style={{ transform: `scale(${zoom})` }}
          >
            <div className={`print-area resume-pages resume-document ${templateClass}`}>
              {(pageGroups ?? [blocks]).map((group, pageIndex) => (
                <section
                  className="a4-page"
                  key={pageIndex}
                  data-page={pageIndex + 1}
                >
                  <div className="a4-content">
                    {group.map((block) => (
                      <div key={block.key} className="paginate-block">
                        {block.node}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 简历头部（个人信息） */
function ResumeHeader({
  personData,
  resumeName,
}: {
  personData?: ResumeViewItem;
  resumeName: string;
}) {
  if (!personData) {
    return <h1>{resumeName}</h1>;
  }
  const f = personData.fields;
  const contacts = getResumeContactItems(f);
  return (
    <header className="person-info resume-header">
      <h1>{String(f.name || '')}</h1>
      <div className="resume-headline">
        {String(f.current_title || '')}
      </div>
      <div className="resume-contact">
        {contacts.map((contact) => (
          <span key={contact.field} className="resume-contact-item">
            <UiIcon
              name={contact.icon}
              size={13}
              className="resume-contact-icon"
            />
            {String(contact.value || '')}
          </span>
        ))}
      </div>
    </header>
  );
}
