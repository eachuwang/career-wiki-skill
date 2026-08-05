/**
 * wiki-reader.mjs — wiki 读取域
 *
 * 负责把 wiki markdown 读成 API 可返回的实体集合：路径解析、实体目录映射、
 * 关系归一化、单个实体读取、health 的实体计数、wiki refresh 提示。
 * 解析层复用 wiki-engine/scripts/wiki-parser.mjs（候选 A 已抽出）。
 *
 * 本模块只依赖 wiki-parser + resume-rules，不含 HTTP 壳 —— handler 由 http.mjs 注入 sendJson。
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { collectMarkdown, parseWikiFile } from '../../wiki-engine/scripts/wiki-parser.mjs';

// ── 常量 ──────────────────────────────────────────────

export const VERSION = '1.0.0';

/** 实体类型 → 目录名映射（module 名用单数，目录用复数） */
export const ENTITY_DIRS = {
  person: 'persons',
  experience: 'experiences',
  project: 'projects',
  skill: 'skills',
  education: 'education',
  certificate: 'certificates',
  award: 'awards',
  publication: 'publications',
  activity: 'activities',
  summary: 'summaries',
};

// ── 路径解析 ──────────────────────────────────────────

/** 解析 wiki 根路径：env WIKI_ROOT > config.json.root > ~/.career_wiki/ */
export async function resolveWikiRoot() {
  // 1. 环境变量优先
  if (process.env.WIKI_ROOT) return process.env.WIKI_ROOT;

  // 2. 读 config.json 的 root 字段
  const configPath = join(homedir(), '.career_wiki', '.career-wiki-skill', 'config.json');
  try {
    const raw = await readFile(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    if (cfg.root) return cfg.root;
  } catch {
    // config.json 不存在或解析失败，fallback
  }

  // 3. fallback 到默认
  return join(homedir(), '.career_wiki');
}

// ── 文件系统辅助 ──────────────────────────────────────

/** 递归收集目录下所有 .json 文件 */
export async function collectJson(dir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      results.push(...(await collectJson(full)));
    } else if (s.isFile() && entry.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

// responsibilities 等字段由 compile 写进 frontmatter，旧版正文兼容提取已删（候选 G）。

// ── wiki 读取 handler ─────────────────────────────────

/** GET /api/health — 服务状态 + 数据目录信息 */
export async function handleHealth(wikiRoot, res, sendJson) {
  const wikiPath = join(wikiRoot, 'wiki');
  const resumesPath = join(wikiRoot, 'resumes');
  const templatesPath = join(wikiRoot, 'templates');

  // 统计各实体目录文件数
  const entityCounts = {};
  for (const [, dir] of Object.entries(ENTITY_DIRS)) {
    const fullDir = join(wikiPath, dir);
    try {
      const files = await readdir(fullDir);
      entityCounts[dir] = files.filter((f) => f.endsWith('.md')).length;
    } catch {
      entityCounts[dir] = 0;
    }
  }

  // 统计简历配置数
  let resumesCount = 0;
  try {
    const files = await readdir(resumesPath);
    resumesCount = files.filter((f) => f.endsWith('.json')).length;
  } catch {}

  // 统计模板数
  let templatesCount = 0;
  try {
    const files = await readdir(templatesPath);
    templatesCount = files.filter((f) => f.endsWith('.json')).length;
  } catch {}

  sendJson(res, 200, {
    status: 'ok',
    service: 'career-wiki-skill-resume-generator',
    version: VERSION,
    wiki_root: wikiRoot,
    wiki_exists: existsSync(wikiPath),
    entity_counts: entityCounts,
    resumes_count: resumesCount,
    templates_count: templatesCount,
  });
}

/** GET /api/wiki — 所有 wiki 实体 */
export async function handleGetWiki(wikiRoot, res, query, sendJson) {
  const wikiPath = join(wikiRoot, 'wiki');
  const files = await collectMarkdown(wikiPath, { tolerateMissing: true });

  let entities = [];
  for (const f of files) {
    try {
      const ent = await parseWikiFile(f, wikiPath);
      entities.push(ent);
    } catch {
      // 跳过解析失败的文件
    }
  }

  // 按 entity 过滤
  if (query.entity) {
    entities = entities.filter((e) => e.entity === query.entity);
  }

  // 扁平化所有关系，供图谱和缺口分析使用。
  // 归一化到 entity.path 的形式（相对 wiki/，带 .md 后缀），
  // 并过滤掉指向不存在实体的关系，避免图谱边指向空节点。
  const entityPaths = new Set(entities.map((e) => e.path));
  const allRelations = [];
  for (const e of entities) {
    for (const r of e.relations) {
      const to = `${String(r.target).replace(/^wiki\//, '')}.md`;
      if (entityPaths.has(to)) {
        allRelations.push({ from: e.path, to, type: r.type });
      }
    }
  }

  sendJson(res, 200, { entities, allRelations, total: entities.length });
}

/** GET /api/wiki/:entity/:id — 单个实体详情 */
export async function handleGetWikiEntity(wikiRoot, res, entityDir, id, sendJson) {
  // entityDir 是复数目录名（persons/experiences/...），直接用
  const filePath = join(wikiRoot, 'wiki', entityDir, `${id}.md`);

  try {
    await stat(filePath);
  } catch {
    return sendJson(res, 404, { error: '实体不存在', path: `${entityDir}/${id}.md` });
  }

  try {
    const ent = await parseWikiFile(filePath, join(wikiRoot, 'wiki'));
    sendJson(res, 200, ent);
  } catch (e) {
    sendJson(res, 500, { error: '解析失败', message: e.message });
  }
}

/** PUT /api/wiki/refresh — 触发 wiki 重新 compile（提示用户调 Agent） */
export async function handleRefresh(wikiRoot, res, sendJson) {
  sendJson(res, 200, {
    status: 'needs_agent',
    message:
      'Wiki 重新编译需要 Agent 执行（LLM 操作）。请在 Hermes 中说"编译 wiki"触发 wiki-engine skill。编译完成后 API server 会自动读到新数据。',
    skill: 'wiki-engine',
    trigger_phrase: '编译 wiki',
  });
}
