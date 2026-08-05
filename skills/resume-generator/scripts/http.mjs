/**
 * http.mjs — HTTP 壳：请求/响应原语、路由分发、generate/export 处理器、服务启动
 *
 * 路由表把 URL 路由到各领域 handler（wiki-reader / crud / assembler）。
 * generate 与 export 共用 crud.mjs 的 loadResumeConfig + loadTemplate，
 * 再调 assembler.mjs 的纯函数组装，避免两处加载逻辑分叉。
 */

import { createServer } from 'node:http';
import { VERSION, resolveWikiRoot, handleHealth, handleGetWiki, handleGetWikiEntity, handleRefresh } from './wiki-reader.mjs';
import {
  handleGetResumes,
  handleGetTemplates,
  handleSave,
  handleDeleteResume,
  handleSaveTemplate,
  handleDeleteTemplate,
  handleGetTemplateCss,
  loadResumeConfig,
  loadTemplate,
} from './crud.mjs';
import { assembleResume } from './assembler.mjs';

const DEFAULT_PORT = 3001;

// ── 请求/响应原语 ──────────────────────────────────────

/** 读取请求 body（JSON） */
export function readBody(req) {
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
export function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

// ── generate / export（共用加载逻辑 + 纯函数组装） ────

/** POST /api/resume/generate — 按模板+配置生成结构化简历 JSON */
export async function handleGenerate(wikiRoot, res, body) {
  const { config, error: cfgErr } = await loadResumeConfig(wikiRoot, body);
  if (cfgErr) return sendJson(res, cfgErr.status, cfgErr.body);

  const { template, error: tplErr } = await loadTemplate(wikiRoot, config);
  if (tplErr) return sendJson(res, tplErr.status, tplErr.body);

  try {
    const result = await assembleResume(config, template, wikiRoot);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, 500, { error: '生成失败', message: e.message });
  }
}

/** POST /api/resume/export — 导出 PDF/HTML/JSON（JSON 直接返回，HTML/PDF 前端渲染） */
export async function handleExport(wikiRoot, res, body) {
  const format = body.format || 'json';

  // 先生成简历 JSON（复用 generate 的加载逻辑）
  const { config, error: cfgErr } = await loadResumeConfig(wikiRoot, body);
  if (cfgErr) return sendJson(res, cfgErr.status, cfgErr.body);

  const { template, templateId, error: tplErr } = await loadTemplate(wikiRoot, config);
  if (tplErr) return sendJson(res, tplErr.status, tplErr.body);

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

// ── 路由分发 ──────────────────────────────────────────

export async function handleRequest(req, wikiRoot, res) {
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
      return await handleHealth(wikiRoot, res, sendJson);
    }

    // /api/wiki
    if (method === 'GET' && segs[1] === 'wiki' && segs.length === 2) {
      return await handleGetWiki(wikiRoot, res, query, sendJson);
    }

    // /api/wiki/:entity/:id
    if (method === 'GET' && segs[1] === 'wiki' && segs.length === 4) {
      return await handleGetWikiEntity(wikiRoot, res, segs[2], segs[3], sendJson);
    }

    // /api/wiki/refresh (PUT)
    if (method === 'PUT' && segs[1] === 'wiki' && segs[2] === 'refresh') {
      return await handleRefresh(wikiRoot, res, sendJson);
    }

    // /api/resumes
    if (method === 'GET' && segs[1] === 'resumes' && segs.length === 2) {
      return await handleGetResumes(wikiRoot, res, sendJson);
    }

    // /api/templates
    if (method === 'GET' && segs[1] === 'templates' && segs.length === 2) {
      return await handleGetTemplates(wikiRoot, res, sendJson);
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
      return await handleSave(wikiRoot, res, body, sendJson);
    }

    // /api/resume/delete
    if (method === 'POST' && segs[1] === 'resume' && segs[2] === 'delete') {
      const body = await readBody(req);
      return await handleDeleteResume(wikiRoot, res, body, sendJson);
    }

    // /api/template/save
    if (method === 'POST' && segs[1] === 'template' && segs[2] === 'save') {
      const body = await readBody(req);
      return await handleSaveTemplate(wikiRoot, res, body, sendJson);
    }

    // /api/template/delete
    if (method === 'POST' && segs[1] === 'template' && segs[2] === 'delete') {
      const body = await readBody(req);
      return await handleDeleteTemplate(wikiRoot, res, body, sendJson);
    }

    // /api/template/css
    if (method === 'GET' && segs[1] === 'template' && segs[2] === 'css') {
      return await handleGetTemplateCss(wikiRoot, res, query, sendJson);
    }

    // 未匹配
    return sendJson(res, 404, { error: '接口不存在', method, path: pathname });
  } catch (e) {
    return sendJson(res, 500, { error: '服务器错误', message: e.message });
  }
}

// ── 启动 ──────────────────────────────────────────────

export async function start() {
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
    console.log(`  POST /api/resume/generate`);
    console.log(`  POST /api/resume/export`);
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
