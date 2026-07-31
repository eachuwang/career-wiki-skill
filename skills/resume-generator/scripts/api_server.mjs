/**
 * api_server.mjs — Career-Wiki 简历生成 API Server
 *
 * 用法:
 *   node skills/resume-generator/scripts/api_server.mjs
 *   PORT=4000 node skills/resume-generator/scripts/api_server.mjs
 *   WIKI_ROOT=/path/to/data node skills/resume-generator/scripts/api_server.mjs
 *
 * 环境变量:
 *   PORT      — 监听端口，默认 3001
 *   WIKI_ROOT — 数据目录根路径，默认读 ~/.career_wiki/.career-wiki-skill/config.json 的 root，再 fallback 到 ~/.career_wiki/
 *
 * 9 个接口:
 *   GET    /api/health              — 健康检查
 *   GET    /api/wiki                — 所有 wiki 实体
 *   GET    /api/wiki/:entity/:id    — 单个实体详情
 *   GET    /api/resumes             — 所有简历配置
 *   GET    /api/templates           — 所有模板
 *   POST   /api/resume/generate     — 按模板+配置生成结构化简历 JSON
 *   POST   /api/resume/export       — 导出 PDF/HTML/JSON
 *   POST   /api/resume/save         — 保存简历配置
 *   PUT    /api/wiki/refresh        — 触发 wiki 重新 compile（提示用户调 Agent）
 */

import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

// ── 常量 ──────────────────────────────────────────────

const VERSION = '1.0.0';
const DEFAULT_PORT = 3001;

// 实体类型 → 目录名映射（module 名用单数，目录用复数）
const ENTITY_DIRS = {
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

// wikilink 正则：[[path|name]] 或 [[path]]
const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

// ── 路径解析 ──────────────────────────────────────────

async function resolveWikiRoot() {
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

/** 递归收集目录下所有 .md 文件，返回绝对路径数组 */
async function collectMarkdown(dir) {
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
      results.push(...(await collectMarkdown(full)));
    } else if (s.isFile() && extname(entry) === '.md') {
      results.push(full);
    }
  }
  return results;
}

/** 递归收集目录下所有 .json 文件 */
async function collectJson(dir) {
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
    } else if (s.isFile() && extname(entry) === '.json') {
      results.push(full);
    }
  }
  return results;
}

/** 从正文中提取 wikilink，返回 {target, name}[] */
function extractWikilinks(content) {
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

/** 解析单个 wiki markdown 文件 → 实体对象 */
async function parseWikiFile(filePath, wikiRoot) {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  const fm = parsed.data || {};
  const content = parsed.content || '';

  // 相对路径（相对于 wiki/）
  const relPath = filePath.slice(wikiRoot.length + 1).replace(/\\/g, '/');

  // 提取 wikilink
  const links = extractWikilinks(content);

  // 处理 relations
  const relations = Array.isArray(fm.relations)
    ? fm.relations.map((r) => ({
        type: r.type,
        target: String(r.target || '').replace(/\.md$/i, ''),
      }))
    : [];

  // fields = frontmatter 除 meta 键以外的字段
  const META_KEYS = ['entity', 'confidence', 'sources', 'relations'];
  const fields = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!META_KEYS.includes(k)) fields[k] = v;
  }

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

// ── 请求处理辅助 ──────────────────────────────────────

/** 读取请求 body（JSON） */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

/** 发送 JSON 响应 */
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

/** 路径参数解析：从 URL pathname 提取段 */
function getSegments(url) {
  const pathname = new URL(url, 'http://localhost').pathname;
  return pathname.split('/').filter(Boolean);
}

// ── 接口处理器 ────────────────────────────────────────

/** GET /api/health */
async function handleHealth(wikiRoot, res) {
  const wikiPath = join(wikiRoot, 'wiki');
  const resumesPath = join(wikiRoot, 'resumes');
  const templatesPath = join(wikiRoot, 'templates');

  // 统计各实体目录文件数
  const entityCounts = {};
  for (const [module, dir] of Object.entries(ENTITY_DIRS)) {
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
async function handleGetWiki(wikiRoot, res, query) {
  const wikiPath = join(wikiRoot, 'wiki');
  const files = await collectMarkdown(wikiPath);

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

  sendJson(res, 200, { entities, total: entities.length });
}

/** GET /api/wiki/:entity/:id — 单个实体详情 */
async function handleGetWikiEntity(wikiRoot, res, entityDir, id) {
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

/** GET /api/resumes — 所有简历配置 */
async function handleGetResumes(wikiRoot, res) {
  const resumesPath = join(wikiRoot, 'resumes');
  const files = await collectJson(resumesPath);

  const resumes = [];
  for (const f of files) {
    try {
      const raw = await readFile(f, 'utf-8');
      const cfg = JSON.parse(raw);
      resumes.push({
        name: cfg.name,
        id: cfg.id,
        template: cfg.template,
        target: cfg.target || null,
        modules: cfg.modules || [],
        updated: cfg.updated || null,
      });
    } catch {}
  }

  sendJson(res, 200, { resumes, total: resumes.length });
}

/** GET /api/templates — 所有模板 */
async function handleGetTemplates(wikiRoot, res) {
  const templatesPath = join(wikiRoot, 'templates');
  const files = await collectJson(templatesPath);

  const templates = [];
  for (const f of files) {
    try {
      const raw = await readFile(f, 'utf-8');
      const cfg = JSON.parse(raw);
      templates.push({
        name: cfg.name,
        id: cfg.id,
        layout: cfg.layout,
        has_photo: cfg.has_photo || false,
        sections_count: Array.isArray(cfg.sections) ? cfg.sections.length : 0,
      });
    } catch {}
  }

  sendJson(res, 200, { templates, total: templates.length });
}

// ── 核心：简历生成 ────────────────────────────────────

/**
 * 数据组装核心函数
 * @param {object} config — 简历配置
 * @param {object} template — 模板配置 JSON
 * @param {string} wikiRoot — wiki 根路径
 * @returns {object} 结构化简历 JSON
 */
async function assembleResume(config, template, wikiRoot) {
  const wikiPath = join(wikiRoot, 'wiki');
  const sections = [];

  // 简历配置的 modules 覆盖模板 sections 顺序
  let orderedSections;
  if (Array.isArray(config.modules) && config.modules.length > 0) {
    // 按配置的 modules 顺序过滤模板 sections
    orderedSections = config.modules
      .map((mod) => template.sections.find((s) => s.module === mod))
      .filter(Boolean);
  } else {
    orderedSections = template.sections || [];
  }

  for (const section of orderedSections) {
    const module = section.module;
    const dirName = ENTITY_DIRS[module];
    if (!dirName) continue; // 未知 module，跳过

    const entityDir = join(wikiPath, dirName);
    const mdFiles = await collectMarkdown(entityDir);

    // 解析所有该类实体
    let items = [];
    for (const f of mdFiles) {
      try {
        const ent = await parseWikiFile(f, wikiPath);
        // 按 fields 配置抽取字段
        const sectionFields = section.fields || [];
        const item = {};
        for (const field of sectionFields) {
          if (ent.fields[field] !== undefined) {
            item[field] = ent.fields[field];
          }
        }
        // 保留 wikilink 供前端展示关系
        item._links = ent.links;
        item._path = ent.path;
        items.push(item);
      } catch {}
    }

    // 排序
    const orderDir = (config.order && config.order[module]) || section.order || 'desc';
    const timeFields = ['start', 'end', 'date'];
    items.sort((a, b) => {
      let aTime = null;
      let bTime = null;
      for (const tf of timeFields) {
        if (a[tf]) aTime = a[tf];
        if (b[tf]) bTime = b[tf];
      }
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      const cmp = String(aTime).localeCompare(String(bTime));
      return orderDir === 'asc' ? cmp : -cmp;
    });

    // emphasize — 强调项排前面
    if (Array.isArray(config.emphasize)) {
      const emph = config.emphasize.find((e) => e.module === module);
      if (emph && Array.isArray(emph.items)) {
        items.sort((a, b) => {
          const aName = a.name || a.title || a.company || '';
          const bName = b.name || b.title || b.company || '';
          const aEmph = emph.items.some((i) => String(aName).includes(String(i)));
          const bEmph = emph.items.some((i) => String(bName).includes(String(i)));
          if (aEmph && !bEmph) return -1;
          if (!aEmph && bEmph) return 1;
          return 0;
        });
      }
    }

    // hide — 删除隐藏字段
    if (Array.isArray(config.hide)) {
      const hideEntry = config.hide.find((h) => h.module === module);
      if (hideEntry && Array.isArray(hideEntry.fields)) {
        for (const f of hideEntry.fields) {
          items.forEach((item) => delete item[f]);
        }
      }
    }

    // privacy — 脱敏
    const privacy = config.privacy || {};
    if (privacy.mask_phone || privacy.mask_email || privacy.mask_name) {
      items = items.map((item) => {
        const masked = { ...item };
        if (privacy.mask_name && masked.name) {
          masked.name = maskValue(masked.name, 'name');
        }
        if (privacy.mask_phone && masked.phone) {
          masked.phone = maskValue(masked.phone, 'phone');
        }
        if (privacy.mask_email && masked.email) {
          masked.email = maskValue(masked.email, 'email');
        }
        return masked;
      });
    }

    // group_by 分组
    if (section.group_by) {
      const groups = {};
      for (const item of items) {
        const key = item[section.group_by] || '其他';
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }
      sections.push({
        module,
        title: section.title,
        grouped: true,
        group_by: section.group_by,
        groups: Object.entries(groups).map(([key, groupItems]) => ({ key, items: groupItems })),
      });
    } else {
      sections.push({
        module,
        title: section.title,
        grouped: false,
        items,
      });
    }
  }

  // person 单独处理（取第一个 person 实体）
  let personData = null;
  const personDir = join(wikiPath, 'persons');
  const personFiles = await collectMarkdown(personDir);
  if (personFiles.length > 0) {
    try {
      const ent = await parseWikiFile(personFiles[0], wikiPath);
      personData = { ...ent.fields };
      personData._links = ent.links;
      personData._path = ent.path;

      // person 也应用脱敏
      const privacy = config.privacy || {};
      if (privacy.mask_name && personData.name) {
        personData.name = maskValue(personData.name, 'name');
      }
      if (privacy.mask_phone && personData.phone) {
        personData.phone = maskValue(personData.phone, 'phone');
      }
      if (privacy.mask_email && personData.email) {
        personData.email = maskValue(personData.email, 'email');
      }

      // person 隐藏字段
      if (Array.isArray(config.hide)) {
        const hideEntry = config.hide.find((h) => h.module === 'person');
        if (hideEntry && Array.isArray(hideEntry.fields)) {
          for (const f of hideEntry.fields) {
            delete personData[f];
          }
        }
      }
    } catch {}
  }

  // 统计实体数
  let entityCount = 0;
  for (const s of sections) {
    entityCount += s.grouped
      ? s.groups.reduce((sum, g) => sum + g.items.length, 0)
      : s.items.length;
  }

  return {
    resume: {
      name: config.name || '',
      id: config.id || '',
      template: config.template || template.id,
    },
    person: personData,
    sections,
    meta: {
      generated_at: new Date().toISOString(),
      entity_count: entityCount,
      template: template.id,
      resume_config: config.id || '',
    },
  };
}

/** 脱敏函数 */
function maskValue(value, type) {
  const str = String(value);
  switch (type) {
    case 'name':
      if (str.length <= 1) return str[0] + '*';
      return str[0] + '*'.repeat(str.length - 1);
    case 'phone':
      if (str.length < 4) return '****';
      return str.slice(0, 3) + '****' + str.slice(-4);
    case 'email':
      const [name, domain] = str.split('@');
      if (!domain) return '***';
      return name[0] + '***@' + domain;
    default:
      return '***';
  }
}

/** POST /api/resume/generate */
async function handleGenerate(wikiRoot, res, body) {
  let config;

  // 读简历配置
  if (body.resume_id) {
    const configPath = join(wikiRoot, 'resumes', `${body.resume_id}.json`);
    try {
      const raw = await readFile(configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch {
      return sendJson(res, 404, { error: '简历配置不存在', id: body.resume_id });
    }
  } else if (body.config && typeof body.config === 'object') {
    config = body.config;
  } else {
    return sendJson(res, 400, { error: '缺少 resume_id 或 config' });
  }

  // 读模板
  const templateId = config.template;
  if (!templateId) {
    return sendJson(res, 400, { error: '简历配置缺少 template 字段' });
  }
  const templatePath = join(wikiRoot, 'templates', `${templateId}.json`);
  let template;
  try {
    const raw = await readFile(templatePath, 'utf-8');
    template = JSON.parse(raw);
  } catch {
    return sendJson(res, 404, { error: '模板不存在', template: templateId });
  }

  // 组装
  try {
    const result = await assembleResume(config, template, wikiRoot);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, 500, { error: '生成失败', message: e.message });
  }
}

/** POST /api/resume/export */
async function handleExport(wikiRoot, res, body) {
  const format = body.format || 'json';

  // 先生成简历 JSON（复用 generate 逻辑）
  let config;
  if (body.resume_id) {
    const configPath = join(wikiRoot, 'resumes', `${body.resume_id}.json`);
    try {
      const raw = await readFile(configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch {
      return sendJson(res, 404, { error: '简历配置不存在', id: body.resume_id });
    }
  } else if (body.config && typeof body.config === 'object') {
    config = body.config;
  } else {
    return sendJson(res, 400, { error: '缺少 resume_id 或 config' });
  }

  const templateId = config.template;
  if (!templateId) {
    return sendJson(res, 400, { error: '简历配置缺少 template 字段' });
  }
  const templatePath = join(wikiRoot, 'templates', `${templateId}.json`);
  let template;
  try {
    const raw = await readFile(templatePath, 'utf-8');
    template = JSON.parse(raw);
  } catch {
    return sendJson(res, 404, { error: '模板不存在', template: templateId });
  }

  try {
    const data = await assembleResume(config, template, wikiRoot);

    if (format === 'json') {
      return sendJson(res, 200, data);
    }

    // html / pdf — 返回数据 + 指令，前端负责渲染
    return sendJson(res, 200, {
      format,
      data,
      template_id: templateId,
      css_path: `templates/${templateId}.css`,
      instruction:
        format === 'pdf'
          ? '前端用模板 CSS 渲染 HTML 页面，用 window.print() 导出 PDF'
          : '前端用模板 CSS 渲染 HTML 页面，保存为 .html 文件',
    });
  } catch (e) {
    sendJson(res, 500, { error: '导出失败', message: e.message });
  }
}

/** POST /api/resume/save */
async function handleSave(wikiRoot, res, body) {
  const config = body.config || body;
  if (!config.id || !config.name) {
    return sendJson(res, 400, { error: '缺少 id 或 name' });
  }

  const resumesDir = join(wikiRoot, 'resumes');
  const filePath = join(resumesDir, `${config.id}.json`);

  // 确保 resumes/ 目录存在
  await mkdir(resumesDir, { recursive: true });

  // 补全 created/updated
  const today = new Date().toISOString().slice(0, 10);
  if (!config.created) config.created = today;
  config.updated = today;

  try {
    await writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
    sendJson(res, 200, {
      status: 'saved',
      path: filePath,
      id: config.id,
    });
  } catch (e) {
    sendJson(res, 500, { error: '保存失败', message: e.message });
  }
}

/** PUT /api/wiki/refresh */
async function handleRefresh(wikiRoot, res) {
  sendJson(res, 200, {
    status: 'needs_agent',
    message:
      'Wiki 重新编译需要 Agent 执行（LLM 操作）。请在 Hermes 中说"编译 wiki"触发 wiki-engine skill。编译完成后 API server 会自动读到新数据。',
    skill: 'wiki-engine',
    trigger_phrase: '编译 wiki',
  });
}

// ── 路由分发 ──────────────────────────────────────────

async function handleRequest(req, wikiRoot, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);
  const method = req.method;
  const segs = pathname.split('/').filter(Boolean);

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // 非路由
  if (segs[0] !== 'api') {
    // 根路径返回服务信息
    if (segs.length === 0) {
      return sendJson(res, 200, {
        service: 'career-wiki-skill-resume-generator',
        version: VERSION,
        endpoints: [
          'GET /api/health',
          'GET /api/wiki',
          'GET /api/wiki/:entity/:id',
          'GET /api/resumes',
          'GET /api/templates',
          'POST /api/resume/generate',
          'POST /api/resume/export',
          'POST /api/resume/save',
          'PUT /api/wiki/refresh',
        ],
      });
    }
    return sendJson(res, 404, { error: 'Not Found', path: pathname });
  }

  try {
    // /api/health
    if (method === 'GET' && segs[1] === 'health') {
      return await handleHealth(wikiRoot, res);
    }

    // /api/wiki
    if (method === 'GET' && segs[1] === 'wiki' && segs.length === 2) {
      return await handleGetWiki(wikiRoot, res, query);
    }

    // /api/wiki/:entity/:id
    if (method === 'GET' && segs[1] === 'wiki' && segs.length === 4) {
      return await handleGetWikiEntity(wikiRoot, res, segs[2], segs[3]);
    }

    // /api/wiki/refresh (PUT)
    if (method === 'PUT' && segs[1] === 'wiki' && segs[2] === 'refresh') {
      return await handleRefresh(wikiRoot, res);
    }

    // /api/resumes
    if (method === 'GET' && segs[1] === 'resumes' && segs.length === 2) {
      return await handleGetResumes(wikiRoot, res);
    }

    // /api/templates
    if (method === 'GET' && segs[1] === 'templates' && segs.length === 2) {
      return await handleGetTemplates(wikiRoot, res);
    }

    // /api/resume/generate
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'generate') {
      const body = await readBody(req);
      return await handleGenerate(wikiRoot, res, body);
    }

    // /api/resume/export
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'export') {
      const body = await readBody(req);
      return await handleExport(wikiRoot, res, body);
    }

    // /api/resume/save
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'save') {
      const body = await readBody(req);
      return await handleSave(wikiRoot, res, body);
    }

    // 未匹配
    return sendJson(res, 404, { error: '接口不存在', method, path: pathname });
  } catch (e) {
    return sendJson(res, 500, { error: '服务器错误', message: e.message });
  }
}

// ── 启动 ──────────────────────────────────────────────

async function start() {
  const wikiRoot = await resolveWikiRoot();
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

  const server = createServer((req, res) => {
    handleRequest(req, wikiRoot, res);
  });

  server.listen(port, () => {
    console.log(`┌─────────────────────────────────────────────┐`);
    console.log(`│  Career-Wiki Resume Generator API Server   │`);
    console.log(`├─────────────────────────────────────────────┤`);
    console.log(`│  Version:    ${VERSION.padEnd(28)} │`);
    console.log(`│  Port:       ${String(port).padEnd(28)} │`);
    console.log(`│  Wiki Root:  ${wikiRoot.slice(0, 28).padEnd(28)} │`);
    console.log(`└─────────────────────────────────────────────┘`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /api/health`);
    console.log(`  GET  /api/wiki`);
    console.log(`  GET  /api/wiki/:entity/:id`);
    console.log(`  GET  /api/resumes`);
    console.log(`  GET  /api/templates`);
    console.log(`  POST /api/resume/generate`);
    console.log(`  POST /api/resume/export`);
    console.log(`  POST /api/resume/save`);
    console.log(`  PUT  /api/wiki/refresh`);
    console.log(`\n→ http://localhost:${port}/api/health`);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`错误: 端口 ${port} 已被占用。请用 PORT=xxxx 环境变量指定其他端口。`);
    } else {
      console.error('服务器错误:', e);
    }
    process.exit(1);
  });
}

start();
