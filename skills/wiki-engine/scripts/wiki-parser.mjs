/**
 * wiki-parser.mjs — Career-Wiki-Skill 共享 wiki 解析层
 *
 * wiki markdown → 实体对象的唯一实现，供以下脚本复用：
 *   - wiki-engine/scripts/okf_export.mjs（OKF 导出）
 *   - wiki-engine/scripts/lint.mjs（lint 检查）
 *   - resume-generator/scripts/api_server.mjs（API 读取）
 *
 * 依赖 gray-matter（声明在 wiki-engine/package.json）。
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import matter from 'gray-matter';

/** wikilink 正则：[[path|name]] 或 [[path]] */
export const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/** frontmatter 中已单独提取的元字段，组装 fields 时排除 */
export const META_KEYS = ['entity', 'confidence', 'sources', 'relations'];

/** 递归收集目录下所有 .md 文件，返回绝对路径数组 */
export async function collectMarkdown(dir, { tolerateMissing = false } = {}) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT' && tolerateMissing) return [];
    throw e;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      results.push(...(await collectMarkdown(full, { tolerateMissing })));
    } else if (s.isFile() && extname(entry) === '.md') {
      results.push(full);
    }
  }
  return results;
}

/** 从正文提取 wikilink，返回 {target, name}[] */
export function extractWikilinks(content) {
  const links = [];
  const re = new RegExp(WIKILINK_RE.source, 'g');
  let m;
  while ((m = re.exec(content)) !== null) {
    const target = m[1].trim();
    const name = (m[2] || '').trim() || target;
    links.push({ target, name });
  }
  return links;
}

/** relations 里的 target 统一格式：去掉 .md 后缀 */
export function normalizeRelationTarget(target) {
  return String(target || '').replace(/\.md$/i, '');
}

/** 解析单个 wiki markdown 文件 → 实体对象 */
export async function parseWikiFile(filePath, wikiRoot) {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  const fm = parsed.data || {};
  const content = parsed.content || '';

  const relPath = relative(wikiRoot, filePath).replace(/\\/g, '/');
  const links = extractWikilinks(content);

  const relations = Array.isArray(fm.relations)
    ? fm.relations.map((r) => ({ type: r.type, target: normalizeRelationTarget(r.target) }))
    : [];

  const fields = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!META_KEYS.includes(k)) fields[k] = v;
  }
  // responsibilities 等字段在 wiki 全量重建后由 compile 写进 frontmatter，
  // 旧版正文兼容提取已删（候选 G）：旧 wiki 若仍在正文用「**岗位职责：**」段落，
  // 需重跑 compile 落进 frontmatter 才能被解析。

  return {
    path: relPath,
    entity: fm.entity || null,
    confidence: fm.confidence || null,
    sources: Array.isArray(fm.sources) ? fm.sources : fm.sources ? [fm.sources] : [],
    fields,
    relations,
    links,
    content,
  };
}
