import {
  buildStandaloneResumeHtml,
  collectDocumentCss,
  createResumeJsonBlob,
  createResumePdfBlob,
  saveExportBlob,
} from './export.ts';
import type { ResumeView } from './projection.ts';

export type ResumeExportFormat = 'pdf' | 'html' | 'json';
export type ExportResult = 'saved' | 'cancelled';

interface ExportResumePreviewInput {
  format: ResumeExportFormat;
  filename: string;
  resumeName: string;
  resumeView: ResumeView | null;
}

/** 浏览器导出适配器：隔离 DOM 查询、Blob 和文件选择器能力。 */
export async function exportResumePreview({
  format,
  filename,
  resumeName,
  resumeView,
}: ExportResumePreviewInput): Promise<ExportResult> {
  const fullFilename = `${filename}.${format}`;
  if (format === 'pdf') {
    const resumeElement = document.querySelector<HTMLElement>('.print-area');
    if (!resumeElement) throw new Error('预览尚未准备好，请稍后重试');
    const blob = await createResumePdfBlob({ element: resumeElement });
    return saveExportBlob({
      blob,
      filename: fullFilename,
      description: 'PDF 简历',
      mimeType: 'application/pdf',
      extension: '.pdf',
    });
  }

  if (format === 'json') {
    if (!resumeView) throw new Error('没有可导出的简历视图');
    return saveExportBlob({
      blob: createResumeJsonBlob(resumeView),
      filename: fullFilename,
      description: 'JSON 简历数据',
      mimeType: 'application/json',
      extension: '.json',
    });
  }

  const resumeMarkup = document.querySelector('.print-area')?.outerHTML;
  if (!resumeMarkup) throw new Error('预览尚未准备好，请稍后重试');
  const fullHTML = buildStandaloneResumeHtml({
    title: resumeName,
    resumeMarkup,
    cssText: collectDocumentCss(),
  });
  return saveExportBlob({
    blob: new Blob([fullHTML], { type: 'text/html' }),
    filename: fullFilename,
    description: 'HTML 简历',
    mimeType: 'text/html',
    extension: '.html',
  });
}
