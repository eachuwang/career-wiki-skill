import {
  buildStandaloneResumeHtml,
  collectDocumentCss,
  createResumeJsonBlob,
  saveExportBlob,
} from './export.ts';
import { generateResumePdf } from '../api/client.ts';
import type { ResumeView } from './projection.ts';

export type ResumeExportFormat = 'pdf' | 'html' | 'json';
export type ExportResult = 'saved' | 'cancelled';

interface ExportResumePreviewInput {
  format: ResumeExportFormat;
  filename: string;
  resumeName: string;
  resumeView: ResumeView | null;
  documentRoot?: ParentNode | null;
  deps?: {
    generatePdf?: (html: string) => Promise<Blob>;
    saveBlob?: typeof saveExportBlob;
  };
}

function getStaticMarkup(root: ParentNode): string {
  const preview = root.querySelector('.print-area');
  const layout = preview?.getAttribute('data-layout');
  if (!preview || layout !== 'ready') {
    throw new Error(layout === 'overflow'
      ? '有内容超过 A4 页面，请拆短长段落后重试。仍可导出 JSON。'
      : '预览尚未准备好，请稍后重试');
  }
  const clone = preview.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-layout');
  clone.querySelectorAll('[data-edit]').forEach((field) => {
    for (const attribute of ['data-edit', 'tabindex', 'role', 'title']) field.removeAttribute(attribute);
  });
  clone.querySelectorAll('[data-section]').forEach((block) => block.removeAttribute('data-section'));
  return clone.outerHTML;
}

/** 浏览器导出适配器：隔离 DOM 查询、Blob 和文件选择器能力。 */
export async function exportResumePreview({
  format,
  filename,
  resumeName,
  resumeView,
  documentRoot,
  deps = {},
}: ExportResumePreviewInput): Promise<ExportResult> {
  const fullFilename = `${filename}.${format}`;
  const saveBlob = deps.saveBlob ?? saveExportBlob;
  if (format === 'pdf') {
    const resumeMarkup = getStaticMarkup(documentRoot ?? document);
    const html = buildStandaloneResumeHtml({
      title: resumeName,
      resumeMarkup,
      cssText: collectDocumentCss(),
      pdf: true,
    });
    const blob = await (deps.generatePdf ?? generateResumePdf)(html);
    return saveBlob({
      blob,
      filename: fullFilename,
      description: 'PDF 简历',
      mimeType: 'application/pdf',
      extension: '.pdf',
    });
  }

  if (format === 'json') {
    if (!resumeView) throw new Error('没有可导出的简历视图');
    return saveBlob({
      blob: createResumeJsonBlob(resumeView),
      filename: fullFilename,
      description: 'JSON 简历数据',
      mimeType: 'application/json',
      extension: '.json',
    });
  }

  const resumeMarkup = getStaticMarkup(documentRoot ?? document);
  const fullHTML = buildStandaloneResumeHtml({
    title: resumeName,
    resumeMarkup,
    cssText: collectDocumentCss(),
  });
  return saveBlob({
    blob: new Blob([fullHTML], { type: 'text/html' }),
    filename: fullFilename,
    description: 'HTML 简历',
    mimeType: 'text/html',
    extension: '.html',
  });
}
