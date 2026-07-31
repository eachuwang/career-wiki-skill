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
 *   1. 递归扫描 wiki/ 下所有 .md 文件
 *   2. gray-matter 解析 frontmatter
 *   3. 正则提取正文 wikilink [[path|name]]
 *   4. 组装 OKF JSON
 *   5. 写输出文件
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { homedir } from 'node:os';
import matter from 'gray-matter';

// ── helpers ───────────────────────────────────────────

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

function defaultWikiDir() {
  return join(homedir(), '.career_wiki', 'wiki');
}

function parseArgs(argv) {
  const args = argv.slice(2); // drop node + script path
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
  return { wikiDir: wikiDir || defaultWikiDir(), output };
}

/** 递归收集目录下所有 .md 文件 */
async function collectMarkdown(dir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`错误: 目录不存在: ${dir}`);
      process.exit(1);
    }
    throw e;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      results.push(...(await collectMarkdown(full)));
    } else if (s.isFile() && extname(entry) === '.md') {
      results.push(full);
    }
  }
  return results;
}

/** 从正文提取 wikilink，返回 {target, name}[] */
function extractWikilinks(content) {
  const links = [];
  let m;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(content)) !== null) {
    const target = m[1].trim();
    const name = (m[2] || '').trim() || target;
    links.push({ target, name });
  }
  return links;
}

/** relations 里的 target 统一格式：去掉 .md 后缀 */
function normalizeRelationTarget(target) {
  return target.replace(/\.md$/i, '');
}

// ── main ──────────────────────────────────────────────

async function main() {
  const { wikiDir, output } = parseArgs(process.argv);
  console.log(`扫描 wiki 目录: ${wikiDir}`);

  const files = await collectMarkdown(wikiDir);
  console.log(`找到 ${files.length} 个 markdown 文件`);

  const entities = [];

  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = matter(raw);
    const fm = parsed.data || {};
    const content = parsed.content || '';
    const relPath = relative(wikiDir, filePath).replace(/\\/g, '/'); // wiki 相对路径

    // 提取 wikilink
    const links = extractWikilinks(content);

    // 处理 relations：统一 target 格式
    const relations = Array.isArray(fm.relations)
      ? fm.relations.map((r) => ({
          type: r.type,
          target: normalizeRelationTarget(String(r.target || '')),
        }))
      : [];

    entities.push({
      path: relPath,
      entity: fm.entity || null,
      confidence: fm.confidence || null,
      sources: Array.isArray(fm.sources) ? fm.sources : fm.sources ? [fm.sources] : [],
      fields: { ...fm },
      relations,
      links,
      content,
    });
  }

  // 从 fields 中移除已单独提取的键，避免冗余
  const META_KEYS = ['entity', 'confidence', 'sources', 'relations'];
  for (const e of entities) {
    const cleanFields = {};
    for (const [k, v] of Object.entries(e.fields)) {
      if (!META_KEYS.includes(k)) cleanFields[k] = v;
    }
    e.fields = cleanFields;
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
