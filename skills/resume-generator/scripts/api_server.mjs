/**
 * Career Wiki HTTP entrypoint.
 *
 * This file is intentionally limited to runtime configuration, production
 * module composition, and socket lifecycle. Application behavior lives behind
 * the knowledge, app-state, and resume-polish interfaces.
 */

import { createServer } from 'node:http';
import { resolveWorkspaceRoot } from '../../env-init/scripts/workspace_root.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCareerWikiAppState } from './app_state.mjs';
import { createCareerKnowledge } from './career_knowledge_application.mjs';
import {
  createCareerWikiHttpAdapter,
  ENDPOINTS,
  VERSION,
} from './http_adapter.mjs';
import { createResumePolish } from './resume_polish_application.mjs';
import { createResumePolishProviderStore } from './resume_polish_provider_store.mjs';
import { chromium } from 'playwright-core';
import { createResumePdfRenderer } from './resume_pdf.mjs';

const DEFAULT_PORT = 3001;

async function start() {
  const root = resolveWorkspaceRoot();
  const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const appState = createCareerWikiAppState({ root });
  const environmentProvider = {
    protocol: process.env.RESUME_POLISH_PROTOCOL || '',
    base_url: process.env.RESUME_POLISH_BASE_URL || '',
    api_key: process.env.RESUME_POLISH_API_KEY || '',
    model: process.env.RESUME_POLISH_MODEL || '',
  };
  const providerStore = createResumePolishProviderStore({
    filePath: join(homedir(), '.career_wiki', '.career-wiki-skill', 'polish-provider.json'),
    fallbackProvider: Object.values(environmentProvider).every(Boolean)
      ? environmentProvider
      : null,
  });
  const adapter = createCareerWikiHttpAdapter({
    knowledge: createCareerKnowledge({ root }),
    appState,
    polish: createResumePolish({ root, appState, providerStore }),
    pdf: createResumePdfRenderer({ chromium }),
  });
  const server = createServer(adapter);

  server.listen(port, '127.0.0.1', () => {
    console.log(`Career Wiki API v${VERSION}`);
    console.log(`Root: ${root}`);
    console.log(`URL: http://127.0.0.1:${server.address().port}/api/health`);
    console.log(`Endpoints:\n${ENDPOINTS.map((endpoint) => `  ${endpoint}`).join('\n')}`);
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`错误: 端口 ${port} 已被占用。请用 PORT=xxxx 环境变量指定其他端口。`);
    } else {
      console.error('服务器错误:', error);
    }
    process.exit(1);
  });
}

start();
