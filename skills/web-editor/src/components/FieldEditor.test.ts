import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

async function renderFieldEditor(isOverridden: boolean): Promise<string> {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const fieldEditorModule = await server.ssrLoadModule('/src/components/FieldEditor.tsx');
    return renderToStaticMarkup(createElement(fieldEditorModule.default, {
      field: 'content',
      value: '手动编辑的个人优势',
      moduleId: 'module-summary',
      itemPath: 'summaries/auto-summary.md',
      inputId: 'summary-content',
      onOverride: () => {},
      polishSelectedFields: ['content'],
      isOverridden,
      onRestore: () => {},
    }));
  } finally {
    await server.close();
  }
}

test('手动覆盖字段显示优先级提示和恢复入口', async () => {
  const overridden = await renderFieldEditor(true);
  const inherited = await renderFieldEditor(false);

  assert.match(overridden, /手动内容优先/);
  assert.match(overridden, /恢复 AI\/Wiki 内容/);
  assert.doesNotMatch(inherited, /手动内容优先/);
  assert.doesNotMatch(inherited, /恢复 AI\/Wiki 内容/);
});
