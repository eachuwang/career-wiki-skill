/**
 * lint.mjs — Wiki 完整性检查脚本（7 项确定性检查）
 *
 * 替代 SKILL.md 中「Agent 手工解析 frontmatter 建双向索引」的指令，
 * 把确定性判定收敛为脚本；Agent 只负责按报告修复 raw 或重跑 compile。
 *
 * 用法:
 *   node skills/wiki-engine/scripts/lint.mjs [wiki_dir]
 *
 * 默认 wiki_dir = ~/.career_wiki/wiki/
 * 退出码: 有 error → 1；仅 warn 或无问题 → 0
 */

import { readFile } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { homedir } from 'node:os';
import matter from 'gray-matter';
import { collectMarkdown, extractWikilinks } from './wiki-parser.mjs';

/** wikilink target 归一化为页面相对 wiki 根路径（如 wiki/skills/go → skills/go.md） */
function toPageRef(target) {
  const t = String(target).replace(/^wiki\//, '').replace(/\.md$/i, '');
  return t + '.md';
}

/** 读取并解析单个 wiki 页面（保留原始 frontmatter 以区分「缺失」与「空数组」） */
async function readPage(filePath, wikiRoot) {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  return {
    path: relative(wikiRoot, filePath).replace(/\\/g, '/'),
    fm: parsed.data || {},
    content: parsed.content || '',
  };
}

/** 解析 start 年份（YYYY-MM 前缀），非字符串或格式不符返回 null */
function startYear(start) {
  if (typeof start !== 'string') return null;
  const m = /^(\d{4})/.exec(start);
  return m ? Number(m[1]) : null;
}

async function main() {
  const wikiDir = process.argv[2] || join(homedir(), '.career_wiki', 'wiki');

  const files = await collectMarkdown(wikiDir, { tolerateMissing: false });
  const pages = [];
  for (const f of files) pages.push(await readPage(f, wikiDir));

  const byPath = new Set(pages.map((p) => p.path));
  const inlinks = new Map(); // 归一化 ref -> [{path, line}]

  for (const page of pages) {
    const lines = page.content.split('\n');
    lines.forEach((line, i) => {
      for (const link of extractWikilinks(line)) {
        const ref = toPageRef(link.target);
        if (!inlinks.has(ref)) inlinks.set(ref, []);
        inlinks.get(ref).push({ path: page.path, line: i + 1 });
      }
    });
  }

  const errors = [];
  const warns = [];

  // 1. 孤儿页面：无入链（person 除外，person 是根）
  for (const page of pages) {
    if (page.fm.entity === 'person') continue;
    if (!inlinks.has(page.path) || inlinks.get(page.path).length === 0) {
      warns.push(`[WARN]  孤儿页面: ${page.path} 无入链`);
    }
  }

  // 2. 断链：wikilink 指向的页面不存在
  for (const [ref, refs] of inlinks) {
    if (!byPath.has(ref)) {
      errors.push(`[ERROR] 断链: ${ref} 被引用但不存在`);
      for (const r of refs.slice(0, 3)) errors.push(`  - ${r.path} line ${r.line}`);
    }
  }

  // 3. frontmatter 缺失必填字段：entity / confidence / sources
  for (const page of pages) {
    if (!page.fm.entity) errors.push(`[ERROR] frontmatter 缺失: ${page.path} 缺少 entity 字段`);
    if (!page.fm.confidence) errors.push(`[ERROR] frontmatter 缺失: ${page.path} 缺少 confidence 字段`);
    if (!('sources' in page.fm)) errors.push(`[ERROR] frontmatter 缺失: ${page.path} 缺少 sources 字段`);
  }

  // 4. confidence 偏低：单个 inferred，或全库 inferred 占比 > 30%
  const inferredPages = pages.filter((p) => p.fm.confidence === 'inferred');
  for (const page of inferredPages) {
    warns.push(`[WARN]  confidence 偏低: ${page.path} confidence=inferred`);
  }
  if (pages.length > 0 && inferredPages.length / pages.length > 0.3) {
    warns.push(`[WARN]  confidence 偏低: 全库 inferred 占比 ${Math.round((inferredPages.length / pages.length) * 100)}% > 30%`);
  }

  // 5. 无来源：sources 字段存在但为空数组（缺失已在检查 3 覆盖）
  for (const page of pages) {
    const s = page.fm.sources;
    if ('sources' in page.fm && (!Array.isArray(s) || s.length === 0)) {
      warns.push(`[WARN]  无来源: ${page.path} sources 为空`);
    }
  }

  // 6. 重复实体：同类型 + 同名（name 字段）出现在不同文件（语义重复留给 Agent 兜底）
  const byName = new Map(); // `${entity}|${name}` -> [paths]
  for (const page of pages) {
    if (!page.fm.entity || !page.fm.name) continue;
    const key = `${page.fm.entity}|${page.fm.name}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(page.path);
  }
  for (const [key, paths] of byName) {
    if (paths.length > 1) {
      const [entity, name] = key.split('|');
      errors.push(`[ERROR] 重复实体: ${paths.join(' 与 ')} 疑似重复（${entity} / ${name}）`);
    }
  }

  // 7. 过期信息：end=present 但 start 距今已超 5 年
  const currentYear = new Date().getFullYear();
  for (const page of pages) {
    const { start, end } = page.fm;
    if (String(end).toLowerCase() === 'present') {
      const sy = startYear(start);
      if (sy !== null && currentYear - sy > 5) {
        warns.push(`[WARN]  过期信息: ${page.path} end=present 但 start=${start}`);
      }
    }
  }

  // 输出报告
  console.log('=== Wiki Lint Report ===');
  for (const e of errors) console.log(e);
  for (const w of warns) console.log(w);
  console.log('');
  console.log(`总计: ${errors.length} errors, ${warns.length} warnings`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('lint 失败:', err.message || err);
  process.exit(2);
});
