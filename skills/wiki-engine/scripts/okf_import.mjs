/**
 * okf_import.mjs — OKF JSON → wiki markdown
 *
 * 用法:
 *   node skills/wiki-engine/scripts/okf_import.mjs <okf.json> [-o wiki_dir]
 *
 * 默认 wiki_dir = ~/.career_wiki/wiki/
 *
 * 流程:
 *   1. 读 OKF JSON
 *   2. 逐实体拆分
 *   3. 组装 frontmatter（entity/confidence/sources + 实体字段 + relations）
 *   4. 拼正文（content 原样）
 *   5. 写回 wiki/ 对应路径
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname, normalize, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import matter from 'gray-matter';

// ── helpers ───────────────────────────────────────────

function defaultWikiDir() {
  return join(homedir(), '.career_wiki', 'wiki');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let input = null;
  let wikiDir = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--output') {
      wikiDir = args[++i];
    } else if (a === '-h' || a === '--help') {
      console.log('用法: node okf_import.mjs <okf.json> [-o wiki_dir]');
      process.exit(0);
    } else {
      input = a;
    }
  }

  if (!input) {
    console.error('错误: 缺少输入文件参数');
    console.log('用法: node okf_import.mjs <okf.json> [-o wiki_dir]');
    process.exit(1);
  }

  return { input, wikiDir: wikiDir || defaultWikiDir() };
}

/**
 * 安全解析实体路径：OKF JSON 里 path 是相对 wiki 根的相对路径。
 * 防止路径穿越：确保最终路径在 wikiDir 内。
 */
function safeEntityPath(wikiDir, entityPath) {
  const target = isAbsolute(entityPath)
    ? entityPath
    : join(wikiDir, entityPath);
  const normalized = normalize(target);
  const normalizedBase = normalize(wikiDir);
  if (!normalized.startsWith(normalizedBase)) {
    throw new Error(`路径穿越检测: ${entityPath} 不在 wiki 目录内`);
  }
  return normalized;
}

/** 把 relations 写回 frontmatter 格式 */
function buildRelations(relations) {
  if (!Array.isArray(relations) || relations.length === 0) return undefined;
  return relations.map((r) => ({
    type: r.type,
    target: r.target,
  }));
}

// ── main ──────────────────────────────────────────────

async function main() {
  const { input, wikiDir } = parseArgs(process.argv);
  console.log(`导入 OKF: ${input} → ${wikiDir}`);

  // 读 JSON
  const raw = await readFile(input, 'utf-8');
  let okf;
  try {
    okf = JSON.parse(raw);
  } catch (e) {
    console.error(`JSON 解析失败: ${e.message}`);
    process.exit(1);
  }

  const entities = okf.entities || [];
  if (entities.length === 0) {
    console.log('OKF JSON 中无实体，退出。');
    return;
  }

  console.log(`待导入 ${entities.length} 个实体`);

  // 清空 wiki 目录（全量重建语义）
  console.log(`清空 wiki 目录: ${wikiDir}`);
  try {
    await rm(wikiDir, { recursive: true, force: true });
  } catch (e) {
    // 目录不存在没关系，继续
  }

  let written = 0;
  let skipped = 0;

  for (const ent of entities) {
    if (!ent.path) {
      console.warn(`  跳过: 实体缺少 path 字段 (entity=${ent.entity})`);
      skipped++;
      continue;
    }

    // 组装 frontmatter
    const fm = {};
    if (ent.entity) fm.entity = ent.entity;
    if (ent.confidence) fm.confidence = ent.confidence;
    if (ent.sources && ent.sources.length > 0) fm.sources = ent.sources;

    // 合并实体特有字段
    if (ent.fields && typeof ent.fields === 'object') {
      Object.assign(fm, ent.fields);
    }

    // relations
    const relations = buildRelations(ent.relations);
    if (relations) fm.relations = relations;

    // 组装 markdown
    const content = ent.content || '';
    const md = matter.stringify(content, fm);

    // 写文件
    const targetPath = safeEntityPath(wikiDir, ent.path);
    const dir = dirname(targetPath);
    await mkdir(dir, { recursive: true });
    await writeFile(targetPath, md, 'utf-8');
    written++;
  }

  console.log(`导入完成:`);
  console.log(`  写入 ${written} 个页面`);
  if (skipped > 0) console.log(`  跳过 ${skipped} 个无效实体`);
}

main().catch((err) => {
  console.error('导入失败:', err);
  process.exit(1);
});
