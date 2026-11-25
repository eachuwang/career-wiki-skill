import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const project = fileURLToPath(new URL('../..', import.meta.url));

const scratch = await mkdtemp(join(tmpdir(), 'career-wiki-editor-'));
const home = join(scratch, 'home');
const root = join(scratch, 'wiki');
const knowledge = join(root, 'knowledge');
const resumes = join(root, '.career-wiki-skill', 'resumes');
await Promise.all([home, resumes, join(knowledge, 'persons'), join(knowledge, 'experiences')]
  .map(path => mkdir(path, { recursive: true })));
await writeFile(join(knowledge, 'index.md'), '---\nokf_version: "0.2"\n---\n# Career Wiki\n');
await writeFile(join(knowledge, 'persons', 'synthetic.md'), `---
type: career.person
title: 案例候选人
name: 案例候选人
current_title: Product engineer
phone: '13912345678'
email: 'synthetic@example.test'
---
`);
for (let i = 1; i <= 9; i++) {
  await writeFile(join(knowledge, 'experiences', `sample-${i}.md`), `---
type: career.experience
title: Sample role ${i}
company: 示例团队 ${i}
role: Product engineer ${i}
start: '2020-01'
end: '2021-03'
description: '${('降低重复劳动，维护交付文档。Built the release workflow and worked with the support team. ').repeat(5)} RecordEnd${i}.'
---
`);
}
await writeFile(join(resumes, 'sample.json'), JSON.stringify({
  id: 'sample', name: 'Synthetic resume', template: '', modules: ['person', 'experience'],
  privacy: { mask_name: true, mask_phone: true, mask_email: true },
}));
const apiPort = process.env.SMOKE_API_PORT || '49301';
const webPort = process.env.SMOKE_WEB_PORT || '49517';
const api = `http://127.0.0.1:${apiPort}`;
const web = `http://127.0.0.1:${webPort}`;
const children = [];
function launch(args, env, cwd = project) {
  const child = spawn(process.execPath, args, {
    env: { PATH: process.env.PATH, HOME: home, ...env }, cwd, stdio: 'inherit',
  });
  children.push(child);
}
async function waitForReady(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Service did not start: ${url}`);
}
let browser;
try {
  launch(['skills/resume-generator/scripts/api_server.mjs'], { WIKI_ROOT: root, PORT: apiPort });
  const status = await (await waitForReady(`${api}/api/health`)).json();
  assert.equal(status.wiki_root, await realpath(root));
  launch(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', webPort, '--strictPort'],
    { CAREER_WIKI_API_PORT: apiPort }, join(project, 'skills/web-editor'));
  await waitForReady(`${web}/api/health`);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await page.addInitScript(() => { delete window.showSaveFilePicker; });
  await page.goto(web);
  const preview = page.locator('.print-area');
  await preview.getByText('RecordEnd9.', { exact: false }).waitFor();
  for (let i = 1; i <= 9; i++) assert.match(await preview.innerText(), new RegExp(`RecordEnd${i}\\.`));
  assert.doesNotMatch(await preview.innerText(), /13912345678|synthetic@example.test/);
  assert.ok((await preview.locator('.a4-page').count()) > 1, 'Long résumé spans multiple pages');
  const clipped = await preview.locator('.a4-page').evaluateAll(pages => pages.some(p => {
    const paper = p.getBoundingClientRect();
    const style = getComputedStyle(p);
    const innerBottom = paper.bottom - parseFloat(style.paddingBottom) * paper.height / p.offsetHeight;
    return [...p.querySelectorAll('.paginate-block')].some(child => child.getBoundingClientRect().bottom > innerBottom + 3);
  }));
  assert.equal(clipped, false, 'Rendered content fits within page insets');
  const name = 'Unsaved synthetic draft';
  async function openRename() {
    await page.getByRole('button', { name: '打开简历操作菜单' }).click();
    await page.getByRole('menuitem', { name: '重命名' }).click();
    return page.getByRole('textbox', { name: '编辑简历名称' });
  }
  const rename = await openRename();
  await rename.fill(name);
  await rename.press('Enter');
  await page.getByRole('tab', { name: '图谱' }).click();
  await page.getByRole('tab', { name: '简历' }).click();
  const retainedName = await openRename();
  assert.equal(await retainedName.inputValue(), name, 'Graph navigation preserves the unsaved draft');
  await retainedName.press('Enter');
  assert.equal(JSON.parse(await readFile(join(resumes, 'sample.json'), 'utf8')).name, 'Synthetic resume');
  const template = page.getByRole('combobox', { name: '选择排版模板' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const variants = new Set();
  for (const [id, preset] of [
    ['preset-compact', 'compact'], ['preset-editorial', 'editorial'],
    ['tech-minimal', 'index'], ['business-sidebar', 'split'],
    ['creative-color', 'band'], ['academic-plain', 'classic'], ['preset-clear', 'clear'],
  ]) {
    await template.selectOption(id);
    await page.locator(`.print-area.preset-${preset}[data-layout="ready"]`).waitFor();
    const metrics = await preview.evaluate((el) => {
      const header = el.querySelector('.resume-header');
      const date = getComputedStyle(el.querySelector('.entry-date'));
      const h = getComputedStyle(header);
      const title = getComputedStyle(el.querySelector('h1'));
      return { signature: [h.gridTemplateColumns, h.backgroundColor, h.textAlign, h.borderBottomStyle,
        title.fontFamily, title.fontSize].join('|'), numerals: date.fontVariantNumeric, font: date.fontFamily };
    });
    variants.add(metrics.signature);
    assert.match(metrics.numerals, /lining-nums.*tabular-nums/);
    assert.match(metrics.font, /Arial/);
    await page.screenshot({ path: join(scratch, `template-${preset}.png`) });
  }
  assert.equal(variants.size, 7, 'Official layouts have distinct header geometry and typography');
  await template.selectOption('creative-color');
  await page.locator('.print-area.preset-band[data-layout="ready"]').waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const outline = page.getByRole('navigation', { name: '简历章节' });
  const grips = outline.getByRole('button', { name: /拖拽排序/ });
  const first = await grips.first().getAttribute('aria-label');
  await grips.first().focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction((label) => document.querySelectorAll('.outline-grip')[1]?.getAttribute('aria-label') === label, first, { timeout: 5000 });
  const from = await grips.nth(1).boundingBox();
  const to = await grips.first().boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction((label) => document.querySelector('.outline-grip')?.getAttribute('aria-label') === label, first, {timeout: 3500});
  await page.screenshot({ path: join(scratch, 'desktop.png'), fullPage: true });
  for (const format of ['JSON', 'HTML', 'PDF']) {
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: new RegExp(format) }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: /下载|保存到|导出/ }).last().click(),
    ]);
    const output = join(scratch, `resume.${format.toLowerCase()}`);
    await download.saveAs(output);
    if (format === 'PDF' && process.platform === 'darwin') {
      const text = execFileSync('swift', ['-e', `
import Foundation
import PDFKit
let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
for i in 0..<doc.pageCount {
    let page = doc.page(at: i)!
    let size = page.bounds(for: .mediaBox).size
    precondition(abs(size.width - 595) < 2 && abs(size.height - 842) < 2)
    print(page.string ?? "")
}
`, output], { encoding: 'utf8' });
      for (let i = 1; i <= 9; i++) assert.match(text, new RegExp(`RecordEnd${i}\\.`));
      assert.doesNotMatch(text, /13912345678|synthetic@example.test/);
    } else if (format !== 'PDF') {
      const text = await readFile(output, 'utf8');
      assert.doesNotMatch(text, /13912345678|synthetic@example.test|experiences\/sample-9\.md/);
      if (format === 'HTML') assert.match(text, /print-area resume-pages resume-document preset-band/);
      for (let i = 1; i <= 9; i++) assert.match(text, new RegExp(`RecordEnd${i}\\.`));
    }
  }
  await page.setViewportSize({ width: 412, height: 860 });
  await page.screenshot({ path: join(scratch, 'narrow.png'), fullPage: true });
  assert.equal((await readFile(join(resumes, 'sample.json'), 'utf8')).includes('Synthetic resume'), true);
  console.log(`Editor smoke artifacts: ${scratch}`);
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
