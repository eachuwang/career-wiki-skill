import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStandaloneResumeHtml,
  createResumeJsonBlob,
} from './export.ts';
import type { ResumeView } from './projection.ts';

test('分享 JSON 保留文档字段，移除路径、内部 ID、交叉链接及简历名称', async () => {
  const view: ResumeView = {
    resume: { id: 'ai', name: 'AI 简历', template: 'technical' },
    person: { path: 'private/person.md', fields: { name: '李*', email: 'l***@example.test', salary: 'hidden' }, links: [] },
    sections: [{ module: 'project', grouped: false, title: '项目', fields: ['name', 'id', 'path', 'links'], items: [{
      path: 'private/project.md', fields: { name: '合成项目', id: 'internal', path: 'internal', links: 'internal' }, links: [],
    }] }],
    meta: { entity_count: 0, template: 'technical', resume_config: 'ai' },
  };

  const blob = createResumeJsonBlob(view);

  assert.equal(blob.type, 'application/json');
  assert.deepEqual(JSON.parse(await blob.text()), { person: { name: '李*', email: 'l***@example.test' }, sections: [{ title: '项目', items: [{ name: '合成项目' }] }] });
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
      fields: { name: '王羿邱', current_title: 'AI 应用工程师' },
      links: [],
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
