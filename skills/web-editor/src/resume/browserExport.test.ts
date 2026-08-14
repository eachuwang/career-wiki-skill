import assert from 'node:assert/strict';
import test from 'node:test';
import { exportResumePreview } from './browserExport.ts';

test('PDF 导出将当前预览的同一份 HTML 和 CSS 交给浏览器 PDF 引擎', async () => {
  const previousDocument = globalThis.document;
  const resumeMarkup = '<article class="print-area"><svg></svg><span>i***@163.com</span></article>';
  const fakeDocument = {
    querySelector: (selector: string) => selector === '.print-area'
      ? { outerHTML: resumeMarkup }
      : null,
    styleSheets: [{
      cssRules: [{ cssText: '.resume-contact-item { display: inline-flex; align-items: center; }' }],
    }],
  } as unknown as Document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
  });

  let submittedHtml = '';
  let savedBlob: Blob | null = null;
  try {
    const result = await exportResumePreview({
      format: 'pdf',
      filename: 'AI-简历',
      resumeName: 'AI 简历',
      resumeView: null,
      deps: {
        generatePdf: async (html) => {
          submittedHtml = html;
          return new Blob(['%PDF-1.7 native-browser'], { type: 'application/pdf' });
        },
        saveBlob: async (input) => {
          savedBlob = input.blob;
          return 'saved';
        },
      },
    });

    assert.equal(result, 'saved');
    assert.match(submittedHtml, new RegExp(resumeMarkup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(submittedHtml, /\.resume-contact-item \{ display: inline-flex; align-items: center; \}/);
    assert.equal(savedBlob?.type, 'application/pdf');
    assert.match(await savedBlob!.text(), /native-browser/);
  } finally {
    if (previousDocument) {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: previousDocument,
      });
    } else {
      delete (globalThis as { document?: Document }).document;
    }
  }
});
