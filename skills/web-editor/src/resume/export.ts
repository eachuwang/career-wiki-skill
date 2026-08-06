/**
 * resume/export.ts — HTML/PDF 导出
 *
 * PDF 导出按「逐页渲染」实现：预览中每个 `.a4-page` 对应 PDF 的一页，
 * 用 html2canvas 单独渲染成图、jsPDF 逐页写入。
 * 由于预览已按 A4 分页且每页带保护区域（padding），
 * 导出的 PDF 与预览完全一致，文字不会被页面边界截断。
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { A4_WIDTH_MM, A4_HEIGHT_MM } from './page.ts';

interface StandaloneResumeHtmlInput {
  title: string;
  resumeMarkup: string;
  cssText: string;
}

/** jsPDF 最小接口（便于测试注入替身） */
export interface PdfLike {
  addPage(format?: string, orientation?: string): void;
  addImage(
    imageData: string,
    format: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
  save(filename: string): void;
}

interface DownloadResumePdfInput {
  element: HTMLElement;
  filename: string;
  deps?: {
    /** 渲染单个 A4 页面为 canvas；默认使用 html2canvas */
    renderPage?: (element: HTMLElement) => Promise<HTMLCanvasElement>;
    /** 创建 jsPDF 文档；默认使用 jspdf */
    createPdf?: () => PdfLike;
  };
}

/** 转义文档标题，避免用户输入破坏导出 HTML 结构。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** 用预览渲染树和当前样式生成可独立打开的 HTML 简历。 */
export function buildStandaloneResumeHtml({
  title,
  resumeMarkup,
  cssText,
}: StandaloneResumeHtmlInput): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${cssText}</style>
  <style>
    /* 防御性覆盖：确保编辑器工具栏等 .no-print 元素在屏幕查看时也不可见
       （collectDocumentCss 收集的 .no-print 规则仅在 @media print 下生效，
       独立 HTML 用浏览器打开默认是屏幕视图，工具栏会泄漏进来）。 */
    .no-print { display: none !important; }
    .paginate-measure { display: none !important; }
    /* 独立 HTML 文档视图：去掉预览用的阴影和外边距，接近最终文档外观 */
    .a4-page { box-shadow: none; margin: 0 auto 16px; }
    body { background: #fff; }
  </style>
</head>
<body>${resumeMarkup}</body>
</html>`;
}

/** 汇总当前页面同源样式，确保 HTML 导出与实时预览一致。 */
export function collectDocumentCss(): string {
  return Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join('\n');
}

/**
 * 直接把预览中的多张 A4 页面保存为 PDF。
 *
 * 每个 `.a4-page` 独立渲染为图片后按顺序写入 jsPDF，
 * 一页对一页，不依赖系统打印机或打印对话框。
 */
export async function downloadResumePdf({
  element,
  filename,
  deps = {},
}: DownloadResumePdfInput): Promise<void> {
  const renderPage =
    deps.renderPage ??
    (async (pageElement: HTMLElement) =>
      html2canvas(pageElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      }));
  const createPdf =
    deps.createPdf ??
    (() =>
      new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      }) as unknown as PdfLike);

  // 优先取分页容器内的 A4 页面；无分页结构时退回渲染整个元素
  const pages = Array.from(element.querySelectorAll<HTMLElement>('.a4-page'));
  if (pages.length === 0) {
    pages.push(element);
  }

  // 预览缩放（transform）会被 html2canvas 渲染进图片，
  // 导出前临时移除，保证图片按 A4 原尺寸输出、文字清晰。
  const shell = (element.closest?.('.preview-page-shell') as HTMLElement | null) ?? null;
  const previousTransform = shell?.style.transform ?? null;
  if (shell) {
    shell.style.transform = 'none';
  }

  // 防御性隐藏：html2canvas 渲染时会克隆整个文档计算样式，
  // 隐藏 .no-print 和 .paginate-measure 避免它们干扰渲染产物。
  const hiddenEls = typeof document !== 'undefined'
    ? Array.from(document.querySelectorAll<HTMLElement>('.no-print, .paginate-measure'))
    : [];
  const prevDisplay = hiddenEls.map((el) => el.style.display);
  hiddenEls.forEach((el) => { el.style.display = 'none'; });

  try {
    const pdf = createPdf();
    for (let i = 0; i < pages.length; i += 1) {
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      const canvas = await renderPage(pages[i]);
      const imageData = canvas.toDataURL('image/jpeg', 0.98);
      // 图片铺满整张 A4 页面；保护区域由页面自身的 padding 保证
      pdf.addImage(imageData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
    }
    pdf.save(filename);
  } finally {
    // 无论成败都恢复预览缩放，避免影响用户界面
    if (shell) {
      if (previousTransform) {
        shell.style.transform = previousTransform;
      } else {
        shell.style.removeProperty('transform');
      }
    }
    hiddenEls.forEach((el, i) => {
      if (prevDisplay[i]) {
        el.style.display = prevDisplay[i];
      } else {
        el.style.removeProperty('display');
      }
    });
  }
}
