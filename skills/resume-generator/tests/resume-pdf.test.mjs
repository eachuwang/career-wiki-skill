import assert from 'node:assert/strict';
import test from 'node:test';
import { createResumePdfRenderer } from '../scripts/resume_pdf.mjs';

test('PDF 生成器使用浏览器 screen 排版引擎输出 A4 PDF', async () => {
  const calls = [];
  const renderer = createResumePdfRenderer({
    chromium: {
      launch: async (options) => {
        calls.push(['launch', options]);
        return {
          newContext: async (contextOptions) => {
            calls.push(['newContext', contextOptions]);
            return {
              newPage: async () => ({
                route: async (pattern) => calls.push(['route', pattern]),
                setContent: async (html, options) => calls.push(['setContent', html, options]),
                emulateMedia: async (options) => calls.push(['emulateMedia', options]),
                evaluate: async () => {
                  calls.push(['fontsReady']);
                  return true;
                },
                pdf: async (options) => {
                  calls.push(['pdf', options]);
                  return new Uint8Array(Buffer.from('%PDF-1.7 chromium'));
                },
              }),
              close: async () => calls.push(['context.close']),
            };
          },
          close: async () => calls.push(['browser.close']),
        };
      },
    },
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const pdf = await renderer.render({
    html: '<!doctype html><html><body><article class="a4-page">简历正文</article></body></html>',
  });

  assert.match(pdf.toString(), /^%PDF-1\.7 chromium/);
  assert.deepEqual(calls.find(([name]) => name === 'emulateMedia'), [
    'emulateMedia',
    { media: 'screen' },
  ]);
  assert.deepEqual(calls.find(([name]) => name === 'pdf'), [
    'pdf',
    {
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  ]);
  assert.deepEqual(calls.slice(-2), [['context.close'], ['browser.close']]);
});

test('PDF 生成器不向客户端泄露 Chrome 启动日志和本地路径', async () => {
  const renderer = createResumePdfRenderer({
    chromium: {
      launch: async () => {
        throw new Error('launch failed at /Users/private/path with browser logs');
      },
    },
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  await assert.rejects(
    renderer.render({ html: '<article class="a4-page">简历正文</article>' }),
    (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, 'CHROME_LAUNCH_FAILED');
      assert.equal(error.message, 'Chrome/Chromium 启动失败，无法生成 PDF');
      return true;
    },
  );
});
