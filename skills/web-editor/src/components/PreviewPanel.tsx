/**
 * PreviewPanel — 右侧实时预览
 *
 * 简历按「多张 A4 纸」模型渲染：先以隐藏测量容器计算每个内容块
 * 应归属的页码（块级分页，任何文字行都不会被页边界切断），
 * 再按页渲染多个 210×297mm 的 A4 页面，并实时显示总页数。
 * 每页四边为保护区域（上下 15mm、左右 16mm），内容只出现在保护区域内。
 *
 * 渲染管线（renderModuleBlocks / ResumeHeader / formatDate）抽至
 * resume/renderBlocks.tsx，脱敏规则复用后端 resume-rules.mjs。
 */

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  ModuleInstance,
  WikiEntity,
  TemplateConfig,
  PrivacyConfig,
} from '../types';

import { getVisibleEntities } from '../resume/visibility';
import { mergeOverrides } from '../resume/mergeOverrides';
import {
  renderModuleBlocks,
  ResumeHeader,
  type ResumeBlock,
} from '../resume/renderBlocks';
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  CONTENT_HEIGHT_MM,
  mmToPx,
  computePageIndexes,
} from '../resume/page.ts';
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

/** 单页内容区高度（px），留 1px 余量防止块恰好溢出页面 */
const PAGE_CONTENT_HEIGHT_PX = Math.floor(mmToPx(CONTENT_HEIGHT_MM) - 1);

/** 窄屏首次进入预览时自动适配 A4 宽度，避免页面级横向滚动。 */
function getInitialZoom(): number {
  if (typeof window === 'undefined' || window.innerWidth >= 900) return 0.72;
  return Math.max(0.4, Math.min(0.72, (window.innerWidth - 40) / (A4_WIDTH_MM * 3.7795)));
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
  // 稳定引用：避免每次渲染生成新数组导致分页 effect 反复触发
  const templateSections = useMemo(() => template?.sections || [], [template]);

  const previewHTML = useMemo(() => {
    return modules.map((m) => {
      const data = getVisibleEntities(
        wikiEntities.filter((e) => e.entity === m.type),
        m.hiddenItemIds,
      );
      // 应用用户覆盖（与 EditPanel 共用 mergeOverrides）
      const merged = mergeOverrides(data, m.overrides);
      return { module: m, data: merged };
    });
  }, [modules, wikiEntities]);

  /** 生成全部可分页内容块（头部 + 各模块） */
  const blocks = useMemo(() => {
    const list: ResumeBlock[] = [];
    if (modules.some((m) => m.type === 'person')) {
      list.push({
        key: 'person-header',
        node: (
          <ResumeHeader
            personData={previewHTML.find((p) => p.module.type === 'person')?.data?.[0]}
            privacy={privacy}
            resumeName={resumeName}
          />
        ),
      });
    }
    for (const { module, data } of previewHTML.filter(
      (p) => p.module.type !== 'person',
    )) {
      list.push(...renderModuleBlocks(module, data, templateSections, privacy));
    }
    return list;
  }, [previewHTML, templateSections, privacy, resumeName, modules]);

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
        <div>
          <div className="text-sm font-semibold text-ink-800">实时预览</div>
          <div className="text-[11px] text-ink-400">
            A4 · 共 {pageCount} 页 · 导出与当前内容一致
          </div>
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

      {/* 隐藏测量容器：portal 到 body，避免被 display:none 的预览容器影响布局，
          与分页容器使用同一块结构，仅用于读取排版高度 */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="paginate-measure" aria-hidden ref={measureRef}>
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
