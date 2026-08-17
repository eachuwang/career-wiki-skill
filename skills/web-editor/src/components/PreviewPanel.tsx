/**
 * PreviewPanel — 右侧实时预览
 *
 * 简历按「多张 A4 纸」模型渲染:先以隐藏测量容器计算每个内容块
 * 应归属的页码(块级分页,任何文字行都不会被页边界切断),
 * 再按页渲染多个 210×297mm 的 A4 页面,并实时显示总页数。
 * 每页四边为保护区域(上下 15mm、左右 16mm),内容只出现在保护区域内。
 *
 * 点击预览中的内容块可定位到对应模块/条目/字段(编辑入口在中央编辑窗)。
 */

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type {
  TemplateConfig,
  EntityType,
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

/** 预览内容块的编辑定位目标 */
export interface EditBlockTarget {
  module: EntityType;
  path?: string;
  field?: string;
}

interface PreviewPanelProps {
  view: ResumeView;
  template: TemplateConfig | null;
  onEditBlock?: (module: EntityType, path?: string, field?: string) => void;
}

/** 单页内容区高度(px),留 1px 余量防止块恰好溢出页面 */
const PAGE_CONTENT_HEIGHT_PX = Math.floor(mmToPx(CONTENT_HEIGHT_MM) - 1);

/** 一个可独立分页的内容块 */
interface ResumeBlock {
  key: string;
  node: ReactNode;
  edit?: EditBlockTarget;
  /** 所属条目路径:悬浮高亮以条目为粒度,同路径的块一起高亮 */
  itemPath?: string;
  /** 节标题块:内含节标题 + 首条 lead,高亮只作用于内部 lead */
  isSectionHead?: boolean;
}

/** 窄屏首次进入预览时自动适配 A4 宽度,避免页面级横向滚动。 */
function getInitialZoom(): number {
  if (typeof window === 'undefined' || window.innerWidth >= 900) return 0.72;
  return Math.max(0.4, Math.min(0.72, (window.innerWidth - 40) / (A4_WIDTH_MM * 3.7795)));
}

/** 格式化日期:present → 至今,YYYY-MM → YYYY.MM,其他原样返回 */
function formatDate(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.toLowerCase() === 'present' || s === '至今') return '至今';
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? m[1] + '.' + m[2] : s;
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
   * 把「标题 + 首条内容」合并为一个头部块,保证标题不会孤立在页尾;
   * 其余内容条各自成块,供分页算法按块移动。
   */
  const pushSection = (first: ResumeBlock, rest: ResumeBlock[]): void => {
    blocks.push(
      title
        ? {
            key: section.module + '-head',
            itemPath: first.itemPath,
            isSectionHead: true,
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

  // group_by 处理(技能按分类分组,组合文本不可单字段编辑)
  if (section.grouped) {
    const groupedBlocks = (section.groups || []).map((group) => ({
      key: section.module + '-group-' + group.key,
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
                return level ? name + '（' + level + '）' : name;
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

  // 单字段模块(如个人优势 content):没有标题/副标题结构,直接按段落渲染
  if (fields.length === 1) {
    const summaryBlocks = items.map((e, i) => ({
      key: section.module + '-summary-' + (e.path || i),
      edit: { module: section.module, path: e.path, field: fields[0] },
      itemPath: e.path,
      node: (
        <div className="entry resume-summary">
          {String(e.fields[fields[0]] || '')}
        </div>
      ),
    }));
    pushSection(summaryBlocks[0], summaryBlocks.slice(1));
    return blocks;
  }

  // 普通模块:逐条列出。
  // 版式约定:第一行主标题(公司/项目名/学校),
  // 第二行左侧副标题(职位/角色/学位),右侧日期区间,
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

  // 细粒度分块:title+sub 独占一个 entry-lead 块,每个描述字段各自成块。
  const headItems = items.map((e, i) => {
    const startText = formatDate(e.fields.start);
    const endText = formatDate(e.fields.end);
    const dateRange = startText ? startText + ' - ' + (endText || '至今') : endText;
    return {
      key: section.module + '-entry-' + (e.path || i) + '-head',
      edit: { module: section.module, path: e.path, field: titleField },
      itemPath: e.path,
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
    key: section.module + '-entry-' + (e.path || i) + '-desc-' + f,
    edit: { module: section.module, path: e.path, field: f },
    itemPath: e.path,
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
  onEditBlock,
}: PreviewPanelProps) {
  const [zoom, setZoom] = useState(getInitialZoom);
  // 悬浮高亮:以条目为粒度,同 path 的块一起高亮
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  // 每页一个单一覆盖框元素(rAF 驱动实时定位)
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!hoveredPath) return undefined;
    let raf = 0;
    const update = () => {
      const scroll = scrollRef.current;
      const panning = scroll?.classList.contains('panning');
      if (panning) {
        for (const frame of frameRefs.current) {
          if (frame) frame.style.display = 'none';
        }
        raf = requestAnimationFrame(update);
        return;
      }
      const hoveredBlocks = Array.from(
        document.querySelectorAll<HTMLElement>('.paginate-block.block-hovered'),
      );
      // 按所属页分组
      const byPage = new Map<number, HTMLElement[]>();
      for (const el of hoveredBlocks) {
        const pageEl = el.closest<HTMLElement>('.a4-page');
        const page = pageEl ? Number(pageEl.dataset.page || 1) : 1;
        const list = byPage.get(page);
        if (list) list.push(el);
        else byPage.set(page, [el]);
      }
      // 先全部隐藏
      for (const frame of frameRefs.current) {
        if (frame) frame.style.display = 'none';
      }
      for (const [page, els] of byPage) {
        const frame = frameRefs.current[page - 1];
        const pageEl = els[0].closest<HTMLElement>('.a4-page');
        if (!frame || !pageEl) continue;
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        const pageRect = pageEl.getBoundingClientRect();
        for (const el of els) {
          // 节标题块只取内部 lead,排除节标题本身
          const target = el.classList.contains('is-section-head')
            ? el.querySelector<HTMLElement>('.entry-lead') || el
            : el;
          const r = target.getBoundingClientRect();
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
        // frame 位于缩放容器内,视口坐标需换算为布局坐标(除以 zoom)
        const stage = document.querySelector<HTMLElement>('.preview-stage');
        const zoomNow = stage
          ? stage.getBoundingClientRect().width / (A4_WIDTH_MM * mmToPx(1))
          : 1;
        frame.style.left = (left - pageRect.left) / zoomNow + 'px';
        frame.style.top = (top - pageRect.top) / zoomNow + 'px';
        frame.style.width = (right - left) / zoomNow + 'px';
        frame.style.height = (bottom - top) / zoomNow + 'px';
        frame.style.display = 'block';
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [hoveredPath]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef({ down: false, moved: false, x: 0, y: 0, sl: 0, st: 0 });
  const prevZoomRef = useRef(zoom);

  /** 原地缩放:仅改变 zoom,纸张位置不动 */
  const applyZoom = (next: number) => {
    setZoom(Math.max(0.35, Math.min(2, next)));
  };

  // Ctrl/Cmd + 滚轮,以及 Mac 触控板捏合(浏览器以 ctrlKey wheel 派发)= 缩放;
  // 普通滚轮/双指滚动保持原生页面滚动。步长限幅,抑制捏合事件跳跃。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = Math.max(-50, Math.min(50, event.deltaY));
      const factor = Math.exp(-delta * 0.002);
      setZoom((prev) => Math.max(0.35, Math.min(2, prev * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击拖动平移纸张:按下(空白/纸张)→ 拖动超过阈值进入平移模式;
  // 未拖动时保持原点击行为(如点击文字打开编辑窗)。
  // 拖动监听挂到 window,避免 pointer capture 与合成事件互相干扰。
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select, label, a')) return;
    const el = scrollRef.current;
    if (!el) return;
    panRef.current = {
      down: true,
      moved: false,
      x: event.clientX,
      y: event.clientY,
      sl: el.scrollLeft,
      st: el.scrollTop,
    };
    el.classList.add('pan-ready');

    const onMove = (moveEvent: PointerEvent) => {
      const pan = panRef.current;
      if (!pan.down) return;
      const dx = moveEvent.clientX - pan.x;
      const dy = moveEvent.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      if (!pan.moved) {
        pan.moved = true;
        el.classList.remove('pan-ready');
        el.classList.add('panning');
      }
      el.scrollLeft = pan.sl - dx;
      el.scrollTop = pan.st - dy;
    };
    const onUp = () => {
      el.classList.remove('pan-ready');
      el.classList.remove('panning');
      panRef.current.down = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // 平移结束后抑制本次 click,避免拖动误触「点击编辑」
  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (panRef.current.moved) {
      event.stopPropagation();
      event.preventDefault();
      panRef.current.moved = false;
    }
  };

  useEffect(() => {
    /** 仅在视口尺寸变化时重新适配,日常缩放仍由用户控制。 */
    const fitPreviewToViewport = () => setZoom(getInitialZoom());
    window.addEventListener('resize', fitPreviewToViewport);
    fitPreviewToViewport();
    return () => window.removeEventListener('resize', fitPreviewToViewport);
  }, []);

  const templateClass = template?.id || 'default';
  /** 生成全部可分页内容块(头部 + 各模块) */
  const blocks = useMemo(() => {
    const list: ResumeBlock[] = [];
    if (view.person) {
      list.push({
        key: 'person-header',
        edit: { module: 'person', path: view.person.path },
        itemPath: view.person.path,
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

  // 测量容器与块元素的引用,供分页计算读取真实排版高度
  const measureRef = useRef<HTMLDivElement>(null);
  const blockElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [pageIndexes, setPageIndexes] = useState<number[] | null>(null);

  /**
   * 读取测量容器中每个块的真实排版位置,计算各自页码。
   * 页码结果相同则保留旧引用,避免 setState 触发无谓重渲染。
   */
  const runPagination = useCallback(() => {
    const rects = blockElsRef.current
      .filter((el): el is HTMLDivElement => el != null)
      .map((el) => ({ top: el.offsetTop, height: el.offsetHeight }));
    if (rects.length === 0) {
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

  // 内容或模板变化后重新测量并分页(同步执行,避免闪烁)
  useLayoutEffect(() => {
    runPagination();
  }, [runPagination, blocks, templateClass]);

  // 测量容器尺寸变化(编辑/预览视图切换、字体加载等)时重新分页
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => runPagination());
    observer.observe(el);
    return () => observer.disconnect();
  }, [runPagination]);

  /** 按页码分组内容块;未分页前先按一页兜底渲染 */
  const pageGroups = useMemo(() => {
    if (!pageIndexes) return null;
    // 页码必须与内容块一一对应;长度不一致说明分页结果已过期
    if (pageIndexes.length !== blocks.length) return null;
    const groups: ResumeBlock[][] = [];
    pageIndexes.forEach((page, i) => {
      (groups[page] = groups[page] || []).push(blocks[i]);
    });
    // 无内容时也保留一张空白 A4 页,避免「共 0 页」的歧义
    return groups.length > 0 ? groups : [[]];
  }, [pageIndexes, blocks]);

  const pageCount = pageGroups?.length ?? 1;

  /**
   * 中心保持不动的缩放:
   * - 水平:纸张视觉中心 = 容器中心(stage 宽度 = 纸张视觉宽度且水平居中),
   *   缩放时中心天然不动,无需补偿;
   * - 垂直:保持「缩放前视口中心所指向的内容点」始终位于视口中心,
   *   即缩放围绕可视区域中心进行;接近顶部/底部时受滚动范围钳制。
   */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevZoomRef.current;
    if (prev === zoom) return;
    const viewportCenter = el.scrollTop + el.clientHeight / 2;
    el.scrollTop = viewportCenter * (zoom / prev) - el.clientHeight / 2;
    prevZoomRef.current = zoom;
  }, [zoom]);

  return (
    <div className="h-full flex flex-col relative">
      {/* 隐藏测量容器:portal 到 body */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="paginate-measure" aria-hidden ref={measureRef}>
            <div className={'resume-document ' + templateClass}>
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
      <div
        ref={scrollRef}
        className="resume-preview-scroll no-print"
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
      >
        <div
          className="preview-stage"
          style={{
            width: A4_WIDTH_MM * zoom + 'mm',
            minHeight: A4_HEIGHT_MM * pageCount * zoom + 'mm',
          }}
        >
          <div
            className="preview-page-shell"
            style={{ transform: 'scale(' + zoom + ')' }}
          >
            <div className={'print-area resume-pages resume-document ' + templateClass}>
              {(pageGroups ?? [blocks]).map((group, pageIndex) => (
                <section
                  className="a4-page"
                  key={pageIndex}
                  data-page={pageIndex + 1}
                >
                  <div className="a4-content">
                    {hoveredPath && (
                      <div
                        className="hover-frame"
                        data-page={pageIndex + 1}
                        ref={(el) => {
                          frameRefs.current[pageIndex] = el;
                        }}
                      />
                    )}
                    {group.map((block) => (
                      <div
                        key={block.key}
                        className={
                          'paginate-block' +
                          (hoveredPath && hoveredPath === block.itemPath
                            ? ' block-hovered'
                            : '') +
                          (block.isSectionHead ? ' is-section-head' : '')
                        }
                        data-edit={block.edit ? '1' : undefined}
                        title={block.edit ? '点击编辑' : undefined}
                        onMouseEnter={
                          block.itemPath && !block.isSectionHead
                            ? () => setHoveredPath(block.itemPath || null)
                            : undefined
                        }
                        onMouseLeave={
                          block.itemPath && !block.isSectionHead
                            ? () => setHoveredPath((current) =>
                                current === block.itemPath ? null : current)
                            : undefined
                        }
                        onClick={
                          block.edit && onEditBlock
                            ? () =>
                                onEditBlock(
                                  block.edit!.module,
                                  block.edit!.path,
                                  block.edit!.field,
                                )
                            : undefined
                        }
                      >
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

      {/* 悬浮缩放控件(含页数) */}
      <div className="zoom-controls floating-zoom no-print" role="group" aria-label="预览缩放">
        <span className="preview-meta floating-page-count">{pageCount} 页</span>
        <div className="preview-toolbar-divider" />
        <button
          onClick={() => applyZoom(zoom - 0.1)}
          className="icon-button"
          aria-label="缩小预览"
        >
          <UiIcon name="minus" size={17} />
        </button>
        <span className="text-xs text-ink-400 w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => applyZoom(zoom + 0.1)}
          className="icon-button"
          aria-label="放大预览"
        >
          <UiIcon name="plus" size={17} />
        </button>
      </div>
    </div>
  );
}

/** 简历头部(个人信息) */
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
