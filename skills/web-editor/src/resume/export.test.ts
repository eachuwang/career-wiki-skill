import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStandaloneResumeHtml,
  createResumeJsonBlob,
  downloadResumePdf,
  type PdfLike,
} from './export.ts';
import type { ResumeView } from './projection.ts';

test('JSON 导出逐字序列化预览使用的 ResumeView', async () => {
  const view: ResumeView = {
    resume: { id: 'ai', name: 'AI 简历', template: 'technical' },
    person: null,
    sections: [],
    meta: { entity_count: 0, template: 'technical', resume_config: 'ai' },
  };

  const blob = createResumeJsonBlob(view);

  assert.equal(blob.type, 'application/json');
  assert.deepEqual(JSON.parse(await blob.text()), view);
});

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

/** 构建最小 PDF 替身，记录调用顺序与参数 */
function createFakePdf(calls: string[]): PdfLike {
  return {
    addPage() {
      calls.push('addPage');
    },
    addImage(imageData, format, x, y, width, height) {
      calls.push(`addImage:${imageData}:${format}:${x}:${y}:${width}:${height}`);
    },
    save(filename) {
      calls.push(`save:${filename}`);
    },
  };
}

test('PDF 导出按 A4 逐页渲染，一页对应一个 .a4-page', async () => {
  const calls: string[] = [];
  const page1 = { tag: 'page-1' } as unknown as HTMLElement;
  const page2 = { tag: 'page-2' } as unknown as HTMLElement;
  const element = {
    querySelectorAll: (selector: string) =>
      selector === '.a4-page' ? [page1, page2] : [],
  } as unknown as HTMLElement;

  const rendered: HTMLElement[] = [];
  await downloadResumePdf({
    element,
    filename: '产品经理简历.pdf',
    deps: {
      renderPage: async (pageElement) => {
        rendered.push(pageElement);
        return {
          toDataURL: (type: string) => `data:${type};base64,xxx`,
        } as HTMLCanvasElement;
      },
      createPdf: () => createFakePdf(calls),
    },
  });

  // 两页都被独立渲染
  assert.equal(rendered.length, 2);
  assert.equal(rendered[0], page1);
  assert.equal(rendered[1], page2);

  // 第 2 页前 addPage；每页 addImage；最后 save
  assert.equal(calls[0].startsWith('addImage:data:image/jpeg;base64,xxx:JPEG:0:0:210:297'), true);
  assert.equal(calls[1], 'addPage');
  assert.equal(calls[2].startsWith('addImage:data:image/jpeg;base64,xxx:JPEG:0:0:210:297'), true);
  assert.equal(calls[3], 'save:产品经理简历.pdf');
});

test('PDF 导出在没有 .a4-page 时退回渲染整个元素', async () => {
  const calls: string[] = [];
  const element = {
    querySelectorAll: () => [],
  } as unknown as HTMLElement;

  const rendered: HTMLElement[] = [];
  await downloadResumePdf({
    element,
    filename: '单页简历.pdf',
    deps: {
      renderPage: async (pageElement) => {
        rendered.push(pageElement);
        return {
          toDataURL: () => 'data:image/jpeg;base64,xxx',
        } as HTMLCanvasElement;
      },
      createPdf: () => createFakePdf(calls),
    },
  });

  assert.equal(rendered.length, 1);
  assert.equal(rendered[0], element);
  assert.equal(calls.filter((c) => c === 'addPage').length, 0);
  assert.equal(calls[0].startsWith('addImage:'), true);
});
