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
  deps?: {
    generatePdf?: (html: string) => Promise<Blob>;
    saveBlob?: typeof saveExportBlob;
  };
}

/** 浏览器导出适配器：隔离 DOM 查询、Blob 和文件选择器能力。 */
export async function exportResumePreview({
  format,
  filename,
  resumeName,
  resumeView,
  deps = {},
}: ExportResumePreviewInput): Promise<ExportResult> {
  const fullFilename = `${filename}.${format}`;
  const saveBlob = deps.saveBlob ?? saveExportBlob;
  if (format === 'pdf') {
    const resumeMarkup = document.querySelector('.print-area')?.outerHTML;
    if (!resumeMarkup) throw new Error('预览尚未准备好，请稍后重试');
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

  const resumeMarkup = document.querySelector('.print-area')?.outerHTML;
  if (!resumeMarkup) throw new Error('预览尚未准备好，请稍后重试');
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
