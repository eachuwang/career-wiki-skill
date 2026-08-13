/**
 * api_server.mjs — Career-Wiki-Skill 简历生成 API Server
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
 * 14 个接口:
 *   GET    /api/health              — 健康检查
 *   GET    /api/wiki                — 所有 wiki 实体
 *   GET    /api/wiki/:entity/:id    — 单个实体详情
 *   GET    /api/resumes             — 所有简历配置
 *   GET    /api/templates           — 所有模板
 *   POST   /api/resume/polish-context — 为 Agent 准备简历润色上下文
 *   POST   /api/resume/polish         — 生成并返回当前简历的润色结果
 *   POST   /api/resume/polish-models  — 拉取 OpenAI-compatible 模型列表
 *   POST   /api/resume/save         — 保存简历配置
 *   POST   /api/resume/delete       — 删除简历配置
 *   POST   /api/template/save       — 保存模板 JSON/CSS
 *   POST   /api/template/delete     — 删除模板 JSON/CSS
 *   GET    /api/template/css        — 读取模板 CSS
 *   PUT    /api/wiki/refresh        — 触发 wiki 重新 compile（提示用户调 Agent）
 */

import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';
import {
  CAREER_ENTITY_DIRECTORIES,
  loadCareerKnowledge,
} from 'career-wiki-wiki-engine/career-knowledge';
import {
  buildPolishSourceHash,
  getPolishStatus,
  getSelectedPolishFields,
  POLISH_FIELDS,
} from './resume_polish.mjs';
import { generatePolishEntries, listProviderModels } from './resume_polish_provider.mjs';
import {
  bundleDirectory,
  resumesDirectory,
  templatesDirectory,
} from '../../wiki-engine/scripts/layout.mjs';

// ── 常量 ──────────────────────────────────────────────

const VERSION = '1.0.0';
const DEFAULT_PORT = 3001;

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

/** 读取润色请求中的简历配置。 */
async function resolveResumeConfig(wikiRoot, body) {
  if (body.resume_id) {
    const configPath = join(resumesDirectory(wikiRoot), `${body.resume_id}.json`);
    try {
      const raw = await readFile(configPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      const error = new Error('简历配置不存在');
      error.statusCode = 404;
      error.id = body.resume_id;
      throw error;
    }
  }
  if (body.config && typeof body.config === 'object') return body.config;
  const error = new Error('缺少 resume_id 或 config');
  error.statusCode = 400;
  throw error;
}

/** 读取一个实体类型的 Wiki 页面，跳过删除清单中的实体。 */
async function collectWikiEntities(wikiRoot, module) {
  if (!Object.hasOwn(CAREER_ENTITY_DIRECTORIES, module)) return [];
  return (await loadCareerKnowledge(wikiRoot, { entity: module })).entities;
}

/** 将简历配置中的 hide.items 应用到 Agent 要处理的实体集合。 */
function filterHiddenEntities(entities, config, module) {
  const hidden = new Set(
    (config.hide || [])
      .filter((entry) => entry.module === module)
      .flatMap((entry) => (Array.isArray(entry.items) ? entry.items.map(String) : [])),
  );
  return entities.filter((entity) => !hidden.has(String(entity.path)));
}

/** 构造润色候选、原始事实、口吻样本和指纹；only 用于“换一换”。 */
async function buildPolishContext(wikiRoot, config, only = null) {
  const modules = Array.isArray(config.modules) && config.modules.length > 0
    ? config.modules
    : ['experience', 'project'];
  const targetModules = modules.filter((module) =>
    ['experience', 'project', 'summary'].includes(module),
  );
  const candidates = [];
  const styleSamples = [];
  const selectedFields = only?.field
    ? [only.field]
    : getSelectedPolishFields(config);

  for (const module of targetModules) {
    const entities = filterHiddenEntities(
      await collectWikiEntities(wikiRoot, module),
      config,
      module,
    );
    for (const entity of entities) {
      const source = {};
      for (const field of [
        'description',
        'responsibilities',
        'role',
        'tech_stack',
        'challenges',
        'solutions',
        'outcomes',
        'learnings',
        'content',
      ]) {
        if (entity.fields[field] !== undefined) source[field] = entity.fields[field];
      }
      if (only?.path && entity.path !== only.path) continue;
      const status = getPolishStatus(entity.fields, entity.path, {
        ...config,
        polish: { ...(config.polish || {}), selected_fields: selectedFields },
      });
      candidates.push({
        path: entity.path,
        entity: module,
        name: entity.fields.name || entity.fields.company || '',
        source,
        source_hash: buildPolishSourceHash(entity.fields),
        target_fields: selectedFields.filter((field) => source[field]),
        status,
      });

      for (const field of selectedFields) {
        const value = entity.fields[field];
        if (typeof value === 'string' && value.trim()) {
          styleSamples.push({ entity: module, field, text: value });
        }
      }
    }
  }

  return {
    resume: {
      id: config.id || '',
      name: config.name || '',
      target: config.target || null,
    },
    candidates,
    selected_fields: selectedFields,
    style_samples: styleSamples,
    instructions: {
      output_path: 'polish.entries[<wiki path>]',
      output_shape: {
        source_hash: 'candidate.source_hash',
        fields: {
          description: '润色后的项目描述',
          content: '润色后的个人优势',
          responsibilities: '润色后的岗位职责',
        },
      },
      rules: [
        '只基于 source 和 style_samples 改写，不补造事实、数字、技术或结果。',
        '可以结合 resume.target 调整信息排序和表达重点，但不能改变事实内容。',
        '优先保留用户原有词汇、句式和语气；短输入只做必要的语义补全。',
        '项目描述和岗位职责分别处理，不把职责改成项目介绍。',
        '如果原文已经完整，只做语病、结构和简历可读性调整。',
        '输出简洁、自然、像用户自己写的中文，不使用空泛的 AI 套话。',
      ],
    },
  };
}

/**
 * 为 Agent 准备简历专用润色上下文。
 * 该接口只读，不调用模型，也不写入 Wiki。
 */
async function handlePolishContext(wikiRoot, res, body) {
  let config;
  try {
    config = await resolveResumeConfig(wikiRoot, body);
    return sendJson(res, 200, await buildPolishContext(wikiRoot, config));
  } catch (e) {
    return sendJson(res, e.statusCode || 500, {
      error: e.message,
      ...(e.id ? { id: e.id } : {}),
    });
  }
}

/**
 * 点击「AI 润色」时生成当前简历视角的润色结果，并返回可直接保存的配置。
 * 生成失败不会修改 Wiki，也不会返回半成品配置。
 */
async function handlePolish(wikiRoot, res, body) {
  let config;
  try {
    config = await resolveResumeConfig(wikiRoot, body);
    const only = body.only && typeof body.only === 'object' ? body.only : null;
    if (only && (!POLISH_FIELDS.includes(String(only.field)) || typeof only.path !== 'string')) {
      const error = new Error('换一换参数无效');
      error.statusCode = 400;
      throw error;
    }
    const context = await buildPolishContext(wikiRoot, config, only);
    const entries = await generatePolishEntries(context, body.provider);
    const existingEntries = config.polish?.entries || {};
    const mergedEntries = { ...existingEntries };
    for (const entry of entries) {
      mergedEntries[entry.path] = {
        source_hash: entry.source_hash,
        fields: {
          ...(existingEntries[entry.path]?.fields || {}),
          ...entry.fields,
        },
        updated_at: new Date().toISOString(),
      };
    }

    const nextConfig = {
      ...config,
      polish: {
        ...(config.polish || {}),
        enabled: true,
        entries: mergedEntries,
      },
    };
    return sendJson(res, 200, {
      config: nextConfig,
      generated_count: entries.length,
      candidate_count: context.candidates.length,
    });
  } catch (e) {
    return sendJson(res, e.statusCode || 502, {
      error: 'AI 润色失败',
      message: e.message,
    });
  }
}

/** POST /api/resume/polish-models — 读取用户 OpenAI-compatible provider 的模型列表。 */
async function handlePolishModels(res, body) {
  try {
    const models = await listProviderModels(body.provider || {});
    return sendJson(res, 200, { models });
  } catch (e) {
    return sendJson(res, e.statusCode || 502, {
      error: '读取模型列表失败',
      message: e.message,
    });
  }
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
  const wikiPath = bundleDirectory(wikiRoot);
  const resumesPath = resumesDirectory(wikiRoot);
  const templatesPath = templatesDirectory(wikiRoot);
  const okfErrors = [];

  const entityCounts = Object.fromEntries(
    Object.values(CAREER_ENTITY_DIRECTORIES).map((directory) => [directory, 0]),
  );
  try {
    const snapshot = await loadCareerKnowledge(wikiRoot, { includeContent: false });
    for (const entity of snapshot.entities) {
      entityCounts[CAREER_ENTITY_DIRECTORIES[entity.entity]] += 1;
    }
  } catch (error) {
    okfErrors.push(error.message);
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
    okf_valid: okfErrors.length === 0,
    okf_errors: okfErrors,
  });
}

/** GET /api/wiki — 所有 wiki 实体 */
async function handleGetWiki(wikiRoot, res, query) {
  try {
    const snapshot = await loadCareerKnowledge(wikiRoot, {
      ...(query.entity ? { entity: query.entity } : {}),
    });
    sendJson(res, 200, snapshot);
  } catch (error) {
    sendJson(res, 400, { error: '读取 Wiki 失败', message: error.message });
  }
}

/** GET /api/wiki/:entity/:id — 单个实体详情 */
async function handleGetWikiEntity(wikiRoot, res, entityDir, id) {
  const entity = Object.entries(CAREER_ENTITY_DIRECTORIES)
    .find(([, directory]) => directory === entityDir)?.[0];
  const path = `${entityDir}/${id.replace(/\.md$/i, '')}.md`;
  if (!entity) return sendJson(res, 404, { error: '实体不存在', path });

  try {
    const snapshot = await loadCareerKnowledge(wikiRoot, { entity });
    const found = snapshot.entities.find((item) => item.path === path);
    if (!found) return sendJson(res, 404, { error: '实体不存在', path });
    return sendJson(res, 200, found);
  } catch (error) {
    return sendJson(res, 500, { error: '读取失败', message: error.message });
  }
}

/** GET /api/resumes — 所有简历配置（完整配置，前端编辑器需要 modules/privacy/emphasize 等字段） */
async function handleGetResumes(wikiRoot, res) {
  const resumesPath = resumesDirectory(wikiRoot);
  const files = await collectJson(resumesPath);

  const resumes = [];
  for (const f of files) {
    try {
      const raw = await readFile(f, 'utf-8');
      resumes.push(JSON.parse(raw));
    } catch {}
  }

  sendJson(res, 200, { resumes, total: resumes.length });
}

/** GET /api/templates — 所有模板（完整配置，前端预览渲染需要 sections 定义） */
async function handleGetTemplates(wikiRoot, res) {
  const templatesPath = templatesDirectory(wikiRoot);
  const files = await collectJson(templatesPath);

  const templates = [];
  for (const f of files) {
    try {
      const raw = await readFile(f, 'utf-8');
      templates.push(JSON.parse(raw));
    } catch {}
  }

  sendJson(res, 200, { templates, total: templates.length });
}

/** POST /api/resume/save */
async function handleSave(wikiRoot, res, body) {
  const config = body.config || body;
  if (!config.id || !config.name) {
    return sendJson(res, 400, { error: '缺少 id 或 name' });
  }

  const resumesDir = resumesDirectory(wikiRoot);
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
    const permissionDenied = e?.code === 'EACCES' || e?.code === 'EPERM';
    sendJson(res, 500, {
      error: '保存失败',
      message: permissionDenied
        ? '数据目录不可写，请确认 API 服务拥有简历目录的写入权限后重试。'
        : e.message,
      code: e?.code,
    });
  }
}

/** POST /api/resume/delete — 删除简历配置（仅删配置，不删 wiki 数据） */
async function handleDeleteResume(wikiRoot, res, body) {
  const id = String(body.id || '');
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return sendJson(res, 400, { error: '非法简历 id' });
  }
  const filePath = join(resumesDirectory(wikiRoot), `${id}.json`);
  try {
    await unlink(filePath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return sendJson(res, 404, { error: '简历配置不存在', id });
    }
    return sendJson(res, 500, { error: '删除失败', message: e.message });
  }
  sendJson(res, 200, { status: 'deleted', id });
}

/** 校验模板 id，仅允许安全字符，防止路径穿越 */
function isSafeId(id) {
  return /^[a-z0-9-]+$/i.test(String(id || ''));
}

/** POST /api/template/save — 创建/更新模板（JSON + 可选 CSS），id 即文件名前缀 */
async function handleSaveTemplate(wikiRoot, res, body) {
  const template = body.template || body;
  if (!template.id || !template.name || !Array.isArray(template.sections)) {
    return sendJson(res, 400, { error: '模板缺少 id/name/sections' });
  }
  if (!isSafeId(template.id)) {
    return sendJson(res, 400, { error: '非法模板 id，仅允许字母数字与连字符' });
  }

  const templatesDir = templatesDirectory(wikiRoot);
  await mkdir(templatesDir, { recursive: true });

  // 补全 style 字段：未指定时按模板 id 生成
  if (!template.style) {
    template.style = `${template.id}.css`;
  }

  try {
    await writeFile(
      join(templatesDir, `${template.id}.json`),
      JSON.stringify(template, null, 2),
      'utf-8',
    );
    // 可选：同时写 CSS 文件（复制模板时携带源 CSS）
    if (typeof body.css === 'string') {
      await writeFile(
        join(templatesDir, `${template.id}.css`),
        body.css,
        'utf-8',
      );
    }
    sendJson(res, 200, { status: 'saved', id: template.id });
  } catch (e) {
    sendJson(res, 500, { error: '模板保存失败', message: e.message });
  }
}

/** POST /api/template/delete — 删除模板（JSON + 同名 CSS） */
async function handleDeleteTemplate(wikiRoot, res, body) {
  const id = String(body.id || '');
  if (!isSafeId(id)) {
    return sendJson(res, 400, { error: '非法模板 id' });
  }
  const templatesDir = templatesDirectory(wikiRoot);
  const jsonPath = join(templatesDir, `${id}.json`);
  const cssPath = join(templatesDir, `${id}.css`);
  try {
    await unlink(jsonPath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return sendJson(res, 404, { error: '模板不存在', id });
    }
    return sendJson(res, 500, { error: '模板删除失败', message: e.message });
  }
  // CSS 文件可能不存在，忽略删除错误
  try {
    await unlink(cssPath);
  } catch {}
  sendJson(res, 200, { status: 'deleted', id });
}

/** GET /api/template/css?id=xxx — 返回模板 CSS 文本（供复制/预览使用） */
async function handleGetTemplateCss(wikiRoot, res, query) {
  const id = String(query.id || '');
  if (!isSafeId(id)) {
    return sendJson(res, 400, { error: '非法模板 id' });
  }
  const cssPath = join(templatesDirectory(wikiRoot), `${id}.css`);
  try {
    const css = await readFile(cssPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    return res.end(css);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return sendJson(res, 404, { error: '模板 CSS 不存在', id });
    }
    return sendJson(res, 500, { error: '读取 CSS 失败', message: e.message });
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
          'POST /api/resume/polish-context',
          'POST /api/resume/polish',
          'POST /api/resume/polish-models',
          'POST /api/resume/save',
          'POST /api/resume/delete',
          'POST /api/template/save',
          'POST /api/template/delete',
          'GET /api/template/css',
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

    // /api/resume/polish-context
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'polish-context') {
      const body = await readBody(req);
      return await handlePolishContext(wikiRoot, res, body);
    }

    // /api/resume/polish
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'polish') {
      const body = await readBody(req);
      return await handlePolish(wikiRoot, res, body);
    }

    // /api/resume/polish-models
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'polish-models') {
      const body = await readBody(req);
      return await handlePolishModels(res, body);
    }

    // /api/resume/save
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'save') {
      const body = await readBody(req);
      return await handleSave(wikiRoot, res, body);
    }

    // /api/resume/delete
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'delete') {
      const body = await readBody(req);
      return await handleDeleteResume(wikiRoot, res, body);
    }

    // /api/template/save
    if (method === 'POST' && segs[1] === 'template' && segs[2] === 'save') {
      const body = await readBody(req);
      return await handleSaveTemplate(wikiRoot, res, body);
    }

    // /api/template/delete
    if (method === 'POST' && segs[1] === 'template' && segs[2] === 'delete') {
      const body = await readBody(req);
      return await handleDeleteTemplate(wikiRoot, res, body);
    }

    // /api/template/css
    if (method === 'GET' && segs[1] === 'template' && segs[2] === 'css') {
      return await handleGetTemplateCss(wikiRoot, res, query);
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
    console.log(`│  Career-Wiki-Skill Resume Generator API Server   │`);
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
    console.log(`  POST /api/resume/polish-context`);
    console.log(`  POST /api/resume/polish`);
    console.log(`  POST /api/resume/polish-models`);
    console.log(`  POST /api/resume/save`);
    console.log(`  POST /api/resume/delete`);
    console.log(`  POST /api/template/save`);
    console.log(`  POST /api/template/delete`);
    console.log(`  GET  /api/template/css`);
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
