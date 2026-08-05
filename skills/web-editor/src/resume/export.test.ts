import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStandaloneResumeHtml, downloadResumePdf } from './export.ts';

test('HTML 导出复用预览标记并内嵌相同样式', () => {
  const html = buildStandaloneResumeHtml({
    title: 'AI & Data 简历',
    resumeMarkup: '<article class="resume-document">预览中的项目</article>',
    cssText: '.resume-document { color: #172033; }',
  });

  assert.match(html, /<title>AI &amp; Data 简历<\/title>/);
  assert.match(html, /\.resume-document \{ color: #172033; \}/);
  assert.match(html, /<article class="resume-document">预览中的项目<\/article>/);
  assert.match(html, /<meta name="viewport"/);
});

test('PDF 导出按 A4 参数直接保存当前预览', async () => {
  const element = {} as HTMLElement;
  let source: HTMLElement | null = null;
  let options: Record<string, unknown> | null = null;
  let saved = false;

  /** 用最小 Worker 替身记录调用链，避免测试依赖浏览器画布。 */
  const createWorker = () => ({
    set(nextOptions: Record<string, unknown>) {
      options = nextOptions;
      return this;
    },
    from(nextSource: HTMLElement) {
      source = nextSource;
      return this;
    },
    async save() {
      saved = true;
    },
  });

  await downloadResumePdf({
    element,
    filename: '产品经理简历.pdf',
    createWorker,
  });

  assert.equal(source, element);
  assert.equal(saved, true);
  assert.deepEqual(options?.filename, '产品经理简历.pdf');
  assert.deepEqual(options?.jsPDF, {
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  });
});
