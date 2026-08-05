interface StandaloneResumeHtmlInput {
  title: string;
  resumeMarkup: string;
  cssText: string;
}

interface PdfWorker {
  set(options: Record<string, unknown>): PdfWorker;
  from(source: HTMLElement): PdfWorker;
  save(): Promise<void>;
}

interface DownloadResumePdfInput {
  element: HTMLElement;
  filename: string;
  createWorker?: () => PdfWorker;
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

/** 直接把当前 A4 预览保存为 PDF，避免依赖系统打印机或打印对话框。 */
export async function downloadResumePdf({
  element,
  filename,
  createWorker,
}: DownloadResumePdfInput): Promise<void> {
  let workerFactory = createWorker;
  if (!workerFactory) {
    const { default: html2pdf } = await import('html2pdf.js');
    workerFactory = () => html2pdf() as unknown as PdfWorker;
  }

  await workerFactory()
    .set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
      pagebreak: { mode: ['css', 'legacy'] },
    })
    .from(element)
    .save();
}
