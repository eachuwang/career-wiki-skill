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
              route: async (...args) => calls.push(['route', ...args]),
              newPage: async () => ({
                goto: async (url, options) => calls.push(['goto', url, options]),
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
  assert.equal(calls.find(([name]) => name === 'launch')[1].chromiumSandbox, true);
  assert.deepEqual(calls.find(([name]) => name === 'newContext')[1], {
    javaScriptEnabled: false,
    offline: true,
    serviceWorkers: 'block',
  });
  const [denyRoute, documentRoute] = calls.filter(([name]) => name === 'route');
  assert.equal(denyRoute[1], '**/*');
  assert.equal(denyRoute[2]({ abort: () => 'blocked' }), 'blocked');
  const url = calls.find(([name]) => name === 'goto')[1];
  assert.equal(documentRoute[1], url);
  assert.deepEqual(documentRoute[3], { times: 1 });
  const document = documentRoute[2]({ fulfill: (value) => value });
  assert.match(document.headers['Content-Security-Policy'], /sandbox; default-src 'none'/);
  assert.match(document.body, /简历正文/);
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
