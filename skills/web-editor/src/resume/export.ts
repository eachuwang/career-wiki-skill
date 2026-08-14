/**
 * resume/export.ts — HTML/PDF 导出
 *
 * HTML 与 PDF 复用预览中的同一棵 DOM 和同一份 CSS。
 * PDF 交给服务端 Chromium 原生打印引擎生成，避免 canvas 二次重绘
 * 导致字体、Flex 与 SVG 的布局偏差。
 */

import type { ResumeView } from './projection.ts';

interface StandaloneResumeHtmlInput {
  title: string;
  resumeMarkup: string;
  cssText: string;
  pdf?: boolean;
}

export interface SaveExportBlobInput {
  blob: Blob;
  filename: string;
  description: string;
  mimeType: string;
  extension: string;
}

/** JSON、预览、HTML 和 PDF 共用同一个 ResumeView，不在 adapter 中重算领域规则。 */
export function createResumeJsonBlob(view: ResumeView): Blob {
  return new Blob([JSON.stringify(view, null, 2)], { type: 'application/json' });
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<FileSystemFileHandle>;

/**
 * 优先使用浏览器原生“另存为”窗口，让用户选择目录与文件名；
 * 不支持 File System Access API 时退回标准浏览器下载。
 */
export async function saveExportBlob({
  blob,
  filename,
  description,
  mimeType,
  extension,
}: SaveExportBlobInput): Promise<'saved' | 'cancelled'> {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description, accept: { [mimeType]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return 'saved';
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
  pdf = false,
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
    .a4-page { box-shadow: none; margin: ${pdf ? '0' : '0 auto 16px'}; }
    body { background: #fff; }
    ${pdf ? `
    @page { size: A4 portrait; margin: 0; }
    html, body { width: 210mm; margin: 0; }
    .a4-page { break-after: page; page-break-after: always; }
    .a4-page:last-child { break-after: auto; page-break-after: auto; }
    ` : ''}
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
