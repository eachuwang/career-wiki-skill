import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStandaloneResumeHtml,
  createResumeJsonBlob,
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

test('导出 HTML 与 JSON 都包含简历正文', async () => {
  const view: ResumeView = {
    resume: { id: 'ai', name: 'AI 简历', template: 'technical' },
    person: {
      path: 'person/wang',
      type: 'person',
      fields: { name: '王羿邱', headline: 'AI 应用工程师' },
    },
    sections: [],
    meta: { entity_count: 1, template: 'technical', resume_config: 'ai' },
  };
  const json = createResumeJsonBlob(view);
  const html = buildStandaloneResumeHtml({
    title: view.resume.name,
    resumeMarkup: '<article class="resume-document">王羿邱</article>',
    cssText: '',
  });

  assert.match(await json.text(), /王羿邱/);
  assert.match(html, /王羿邱/);
});
