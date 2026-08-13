export const VERSION = '1.0.0';

export const ENDPOINTS = Object.freeze([
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
]);

const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(value, null, 2));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('JSON 解析失败'), { statusCode: 400 });
  }
}

function publicError(error, fallback) {
  return {
    error: fallback,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.id ? { id: error.id } : {}),
    ...(error.path ? { path: error.path } : {}),
  };
}

function routeErrorLabel(pathname) {
  if (pathname === '/api/resume/save') return '保存失败';
  if (pathname === '/api/resume/delete') return '删除失败';
  if (pathname === '/api/template/save') return '模板保存失败';
  if (pathname === '/api/template/delete') return '模板删除失败';
  if (pathname === '/api/template/css') return '读取 CSS 失败';
  if (pathname === '/api/resume/polish') return 'AI 润色失败';
  if (pathname === '/api/resume/polish-models') return '读取模型列表失败';
  if (pathname === '/api/wiki') return '读取 Wiki 失败';
  return '服务器错误';
}

export function createCareerWikiHttpAdapter({ knowledge, appState, polish }) {
  return async function careerWikiHttpAdapter(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const { pathname } = url;
    const method = request.method;
    const segments = pathname.split('/').filter(Boolean);

    if (method === 'OPTIONS') {
      response.writeHead(204, JSON_HEADERS);
      return response.end();
    }
    if (segments.length === 0) {
      return sendJson(response, 200, {
        service: 'career-wiki-skill-resume-generator',
        version: VERSION,
        endpoints: ENDPOINTS,
      });
    }
    if (segments[0] !== 'api') {
      return sendJson(response, 404, { error: 'Not Found', path: pathname });
    }

    try {
      if (method === 'GET' && pathname === '/api/health') {
        const [status, resumes, templates] = await Promise.all([
          knowledge.status(),
          appState.listResumes(),
          appState.listTemplates(),
        ]);
        return sendJson(response, 200, {
          status: 'ok',
          service: 'career-wiki-skill-resume-generator',
          version: VERSION,
          wiki_root: status.root,
          wiki_exists: status.exists,
          entity_counts: status.entity_counts,
          resumes_count: resumes.length,
          templates_count: templates.length,
          okf_valid: status.okf_valid,
          okf_errors: status.okf_errors,
        });
      }
      if (method === 'GET' && pathname === '/api/wiki') {
        const entity = url.searchParams.get('entity');
        return sendJson(response, 200, await knowledge.load(entity ? { entity } : {}));
      }
      if (method === 'GET' && segments[1] === 'wiki' && segments.length === 4) {
        return sendJson(response, 200, await knowledge.get(segments[2], segments[3]));
      }
      if (method === 'PUT' && pathname === '/api/wiki/refresh') {
        return sendJson(response, 200, {
          status: 'needs_agent',
          message: 'Wiki 重新编译需要 Agent 执行（LLM 操作）。请说“编译 wiki”触发 wiki-engine skill。编译完成后服务会自动读到新数据。',
          skill: 'wiki-engine',
          trigger_phrase: '编译 wiki',
        });
      }
      if (method === 'GET' && pathname === '/api/resumes') {
        const resumes = await appState.listResumes();
        return sendJson(response, 200, { resumes, total: resumes.length });
      }
      if (method === 'GET' && pathname === '/api/templates') {
        const templates = await appState.listTemplates();
        return sendJson(response, 200, { templates, total: templates.length });
      }
      if (method === 'POST' && pathname === '/api/resume/polish-context') {
        return sendJson(response, 200, await polish.buildContext(await readBody(request)));
      }
      if (method === 'POST' && pathname === '/api/resume/polish') {
        return sendJson(response, 200, await polish.generate(await readBody(request)));
      }
      if (method === 'POST' && pathname === '/api/resume/polish-models') {
        const models = await polish.listModels(await readBody(request));
        return sendJson(response, 200, { models });
      }
      if (method === 'POST' && pathname === '/api/resume/save') {
        const body = await readBody(request);
        return sendJson(response, 200, await appState.saveResume(body.config || body));
      }
      if (method === 'POST' && pathname === '/api/resume/delete') {
        const body = await readBody(request);
        return sendJson(response, 200, await appState.deleteResume(body.id));
      }
      if (method === 'POST' && pathname === '/api/template/save') {
        const body = await readBody(request);
        const template = body.template || body;
        return sendJson(response, 200, await appState.saveTemplate({ template, css: body.css }));
      }
      if (method === 'POST' && pathname === '/api/template/delete') {
        const body = await readBody(request);
        return sendJson(response, 200, await appState.deleteTemplate(body.id));
      }
      if (method === 'GET' && pathname === '/api/template/css') {
        const css = await appState.readTemplateCss(url.searchParams.get('id'));
        response.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        return response.end(css);
      }
      return sendJson(response, 404, { error: '接口不存在', method, path: pathname });
    } catch (error) {
      const fallback = routeErrorLabel(pathname);
      return sendJson(
        response,
        error.statusCode || (pathname === '/api/resume/polish' ? 502 : 500),
        publicError(error, fallback),
      );
    }
  };
}
