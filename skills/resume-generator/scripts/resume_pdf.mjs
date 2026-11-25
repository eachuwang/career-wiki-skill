import { access } from 'node:fs/promises';

const DOCUMENT_URL = 'https://resume-pdf.invalid/';
const PDF_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

async function findChromeExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue with the next conventional installation path.
    }
  }
  throw Object.assign(
    new Error('未找到 Chrome/Chromium，无法生成所见即所得 PDF。请安装 Chrome 或设置 CHROME_PATH。'),
    { statusCode: 503, code: 'CHROME_NOT_FOUND' },
  );
}

function validateHtml(html) {
  if (typeof html !== 'string' || !html.includes('a4-page')) {
    throw Object.assign(new Error('PDF 内容为空或缺少 A4 页面'), {
      statusCode: 400,
      code: 'EMPTY_RESUME_PDF',
    });
  }
}

export function createResumePdfRenderer({ chromium, executablePath } = {}) {
  return {
    async render({ html }) {
      validateHtml(html);
      const chromePath = executablePath || await findChromeExecutable();
      let browser;
      try {
        browser = await chromium.launch({
          headless: true,
          chromiumSandbox: true,
          executablePath: chromePath,
        });
      } catch {
        throw Object.assign(
          new Error('Chrome/Chromium 启动失败，无法生成 PDF'),
          { statusCode: 503, code: 'CHROME_LAUNCH_FAILED' },
        );
      }
      let context;
      try {
        context = await browser.newContext({
          javaScriptEnabled: false,
          offline: true,
          serviceWorkers: 'block',
        });
        // Serve supplied HTML as a document with a response CSP, not on a local file or application origin.
        await context.route('**/*', (route) => route.abort());
        await context.route(DOCUMENT_URL, (route) => route.fulfill({
          contentType: 'text/html; charset=utf-8',
          headers: { 'Content-Security-Policy': PDF_CSP },
          body: html,
        }), { times: 1 });
        const page = await context.newPage();
        await page.emulateMedia({ media: 'screen' });
        await page.goto(DOCUMENT_URL, { waitUntil: 'load' });
        const hasContent = await page.evaluate(async () => {
          await document.fonts.ready;
          return Array.from(document.querySelectorAll('.a4-page'))
            .some((element) => (element.textContent || '').trim().length > 0);
        });
        if (!hasContent) {
          throw Object.assign(new Error('PDF 页面没有可导出的简历正文'), {
            statusCode: 400,
            code: 'EMPTY_RESUME_PDF',
          });
        }
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        return Buffer.from(pdf);
      } finally {
        try {
          await context?.close();
        } finally {
          await browser.close();
        }
      }
    },
  };
}
