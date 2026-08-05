/**
 * okf_export.mjs — Wiki markdown → OKF JSON
 *
 * 用法:
 *   node skills/wiki-engine/scripts/okf_export.mjs <wiki_dir> [-o output.json]
 *
 * 默认 wiki_dir = ~/.career_wiki/wiki/
 * 默认输出 = okf-export.json
 *
 * 流程:
 *   1. 递归扫描 wiki/ 下所有 .md 文件（复用 wiki-parser 的 collectMarkdown）
 *   2. gray-matter 解析 frontmatter（复用 wiki-parser 的 parseWikiFile）
 *   3. 提取正文 wikilink [[path|name]]（复用 wiki-parser 的 extractWikilinks）
 *   4. 组装 OKF JSON
 *   5. 写输出文件
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { collectMarkdown, parseWikiFile } from './wiki-parser.mjs';

/** 解析命令行参数：wiki_dir 与 -o/--output，-h 打印帮助 */
function parseArgs(argv) {
  const args = argv.slice(2);
  let wikiDir = null;
  let output = 'okf-export.json';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--output') {
      output = args[++i];
    } else if (a === '-h' || a === '--help') {
      console.log('用法: node okf_export.mjs <wiki_dir> [-o output.json]');
      process.exit(0);
    } else {
      wikiDir = a;
    }
  }
  return { wikiDir: wikiDir || join(homedir(), '.career_wiki', 'wiki'), output };
}

async function main() {
  const { wikiDir, output } = parseArgs(process.argv);
  console.log(`扫描 wiki 目录: ${wikiDir}`);

  let files;
  try {
    files = await collectMarkdown(wikiDir);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`错误: 目录不存在: ${wikiDir}`);
      process.exit(1);
    }
    throw e;
  }
  console.log(`找到 ${files.length} 个 markdown 文件`);

  const entities = [];
  for (const filePath of files) {
    entities.push(await parseWikiFile(filePath, wikiDir));
  }

  const okf = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    entity_count: entities.length,
    entities,
  };

  const json = JSON.stringify(okf, null, 2);
  await writeFile(output, json, 'utf-8');
  console.log(`导出完成: ${output}`);
  console.log(`  ${entities.length} 个实体`);
  console.log(`  ${entities.reduce((s, e) => s + e.links.length, 0)} 个 wikilink`);
  console.log(`  ${entities.reduce((s, e) => s + e.relations.length, 0)} 个 relation`);
}

main().catch((err) => {
  console.error('导出失败:', err);
  process.exit(1);
});
