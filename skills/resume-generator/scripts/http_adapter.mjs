export const VERSION = '1.0.0';

export const ENDPOINTS = Object.freeze([
  'GET /api/health',
  'GET /api/wiki',
  'GET /api/wiki/:entity/:id',
  'GET /api/resumes',
  'GET /api/templates',
  'GET /api/resume/polish-provider',
  'POST /api/resume/polish-provider',
  'POST /api/resume/polish-context',
  'POST /api/resume/polish',
  'POST /api/resume/polish-models',
  'POST /api/resume/pdf',
  'POST /api/resume/save',
  'POST /api/resume/delete',
  'POST /api/template/save',
  'POST /api/template/delete',
  'GET /api/template/css',
  'PUT /api/wiki/refresh',
]);

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::([1-9][0-9]{0,4}))?$/i;

function isLocalRequest(request) {
  const { host, origin, 'sec-fetch-site': fetchSite } = request.headers;
  const local = LOOPBACK_HOST.exec(host || '');
  return local && !(Number(local[1]) > 65535)
    && request.headersDistinct.host?.length === 1
    && (origin === undefined || origin === `http://${host.toLowerCase()}`)
    && (fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none');
}

function sendJson(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(value, null, 2));
}

function sendPdf(response, pdf) {
  response.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
  });
  response.end(pdf);
}

function requestError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function readBody(request) {
  const tooLarge = () => requestError('请求体超过 2 MiB', 413);
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) throw tooLarge();
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw requestError('请求体须使用 application/json', 415);
  }
  const chunks = [];
  let size = 0;
  // Keep the socket open long enough to send 413 when a streamed body crosses the limit.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw requestError('JSON 解析失败', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw requestError('请求体须为 JSON 对象', 400);
  }
  return body;
}

function saveInput(body, key) {
  const { create_only, ...fields } = body;
  if (create_only !== undefined && typeof create_only !== 'boolean') {
    throw requestError('create_only 须为布尔值', 400);
  }
  const input = fields[key] || fields;
  if (input !== fields && input && typeof input === 'object' && !Array.isArray(input)) {
    const { create_only: _ignored, ...config } = input;
    return { config, createOnly: create_only === true };
  }
  return { config: input, createOnly: create_only === true };
}

function publicError(error, fallback) {
  return {
    error: fallback,
    message: error.statusCode ? error.message : fallback,
    ...(error.code ? { code: error.code } : {}),
    ...(error.id ? { id: error.id } : {}),
    ...(error.statusCode && error.path ? { path: error.path } : {}),
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
  if (pathname === '/api/resume/polish-provider') return 'AI Provider 配置失败';
  if (pathname === '/api/resume/pdf') return '生成 PDF 失败';
  if (pathname === '/api/wiki') return '读取 Wiki 失败';
  return '服务器错误';
}

export function createCareerWikiHttpAdapter({ knowledge, appState, polish, pdf }) {
  return async function careerWikiHttpAdapter(request, response) {
    if (!isLocalRequest(request)) {
      return sendJson(response, 403, { error: '仅允许本地同源请求' }, { Connection: 'close' });
    }
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) {
      return sendJson(response, 400, { error: '请求路径无效' }, { Connection: 'close' });
    }
    const url = new URL(`http://localhost${request.url}`);
    const { pathname } = url;
    const method = request.method;
    const segments = pathname.split('/').filter(Boolean);

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
      if (method === 'GET' && pathname === '/api/resume/polish-provider') {
        return sendJson(response, 200, await polish.getProvider());
      }
      if (method === 'POST' && pathname === '/api/resume/polish-provider') {
        return sendJson(response, 200, await polish.saveProvider(await readBody(request)));
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
      if (method === 'POST' && pathname === '/api/resume/pdf') {
        return sendPdf(response, await pdf.render(await readBody(request)));
      }
      if (method === 'POST' && pathname === '/api/resume/save') {
        const { config, createOnly } = saveInput(await readBody(request), 'config');
        return sendJson(response, 200, await appState.saveResume(config, { createOnly }));
      }
      if (method === 'POST' && pathname === '/api/resume/delete') {
        const body = await readBody(request);
        return sendJson(response, 200, await appState.deleteResume(body.id));
      }
      if (method === 'POST' && pathname === '/api/template/save') {
        const body = await readBody(request);
        const { config: template, createOnly } = saveInput(body, 'template');
        return sendJson(response, 200, await appState.saveTemplate({ template, css: body.css, createOnly }));
      }
      if (method === 'POST' && pathname === '/api/template/delete') {
        const body = await readBody(request);
        return sendJson(response, 200, await appState.deleteTemplate(body.id));
      }
      if (method === 'GET' && pathname === '/api/template/css') {
        const css = await appState.readTemplateCss(url.searchParams.get('id'));
        response.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
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
        [413, 415].includes(error.statusCode) ? { Connection: 'close' } : {},
      );
    }
  };
}
