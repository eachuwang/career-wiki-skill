/**
 * crud.mjs — 简历与模板 CRUD + 共享加载逻辑
 *
 * 简历配置 / 模板的增删改读，以及 generate 与 export 共用的
 * 「按 resume_id 或内联 config 解析配置 + 按 config.template 加载模板」逻辑。
 * 文件 I/O 走 fs/promises，不含 HTTP 壳 —— handler 由 http.mjs 注入 sendJson。
 */

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { collectJson } from './wiki-reader.mjs';

// ── 读取列表 ──────────────────────────────────────────

/** GET /api/resumes — 所有简历配置（完整配置，前端编辑器需要 modules/privacy/emphasize 等字段） */
export async function handleGetResumes(wikiRoot, res, sendJson) {
  const resumesPath = join(wikiRoot, 'resumes');
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
export async function handleGetTemplates(wikiRoot, res, sendJson) {
  const templatesPath = join(wikiRoot, 'templates');
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

// ── 共享加载逻辑（generate / export 复用） ────────────

/**
 * 解析请求体得到简历配置。resume_id 读盘，内联 config 直用，两者皆无则 400。
 * @returns {{ config?: object, error?: { status, body } }}
 */
export async function loadResumeConfig(wikiRoot, body) {
  if (body.resume_id) {
    const configPath = join(wikiRoot, 'resumes', `${body.resume_id}.json`);
    try {
      const raw = await readFile(configPath, 'utf-8');
      return { config: JSON.parse(raw) };
    } catch {
      return { error: { status: 404, body: { error: '简历配置不存在', id: body.resume_id } } };
    }
  }
  if (body.config && typeof body.config === 'object') {
    return { config: body.config };
  }
  return { error: { status: 400, body: { error: '缺少 resume_id 或 config' } } };
}

/**
 * 按 config.template 加载模板 JSON。template 缺失 → 400，读盘失败 → 404。
 * @returns {{ template?: object, templateId?: string, error?: { status, body } }}
 */
export async function loadTemplate(wikiRoot, config) {
  const templateId = config.template;
  if (!templateId) {
    return { error: { status: 400, body: { error: '简历配置缺少 template 字段' } } };
  }
  const templatePath = join(wikiRoot, 'templates', `${templateId}.json`);
  try {
    const raw = await readFile(templatePath, 'utf-8');
    return { template: JSON.parse(raw), templateId };
  } catch {
    return { error: { status: 404, body: { error: '模板不存在', template: templateId } } };
  }
}

// ── 简历 CRUD ─────────────────────────────────────────

/** POST /api/resume/save — 保存简历配置 */
export async function handleSave(wikiRoot, res, body, sendJson) {
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

/** POST /api/resume/delete — 删除简历配置（仅删配置，不删 wiki 数据） */
export async function handleDeleteResume(wikiRoot, res, body, sendJson) {
  const id = String(body.id || '');
  if (!isSafeId(id)) {
    return sendJson(res, 400, { error: '非法简历 id' });
  }
  const filePath = join(wikiRoot, 'resumes', `${id}.json`);
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

// ── 模板 CRUD ────────────────────────────────────────

/** 校验 id，仅允许安全字符，防止路径穿越 */
export function isSafeId(id) {
  return /^[a-z0-9-]+$/i.test(String(id || ''));
}

/** POST /api/template/save — 创建/更新模板（JSON + 可选 CSS），id 即文件名前缀 */
export async function handleSaveTemplate(wikiRoot, res, body, sendJson) {
  const template = body.template || body;
  if (!template.id || !template.name || !Array.isArray(template.sections)) {
    return sendJson(res, 400, { error: '模板缺少 id/name/sections' });
  }
  if (!isSafeId(template.id)) {
    return sendJson(res, 400, { error: '非法模板 id，仅允许字母数字与连字符' });
  }

  const templatesDir = join(wikiRoot, 'templates');
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
export async function handleDeleteTemplate(wikiRoot, res, body, sendJson) {
  const id = String(body.id || '');
  if (!isSafeId(id)) {
    return sendJson(res, 400, { error: '非法模板 id' });
  }
  const templatesDir = join(wikiRoot, 'templates');
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
export async function handleGetTemplateCss(wikiRoot, res, query, sendJson) {
  const id = String(query.id || '');
  if (!isSafeId(id)) {
    return sendJson(res, 400, { error: '非法模板 id' });
  }
  const cssPath = join(wikiRoot, 'templates', `${id}.css`);
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
