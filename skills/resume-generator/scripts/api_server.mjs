/**
 * Career Wiki HTTP entrypoint.
 *
 * This file is intentionally limited to runtime configuration, production
 * module composition, and socket lifecycle. Application behavior lives behind
 * the knowledge, app-state, and resume-polish interfaces.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
import { chromium } from 'playwright-core';
import { createResumePdfRenderer } from './resume_pdf.mjs';

const DEFAULT_PORT = 3001;

async function resolveWikiRoot() {
  if (process.env.WIKI_ROOT) return process.env.WIKI_ROOT;
  const configPath = join(homedir(), '.career_wiki', '.career-wiki-skill', 'config.json');
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    if (config.root) return config.root;
  } catch {
    // Missing or malformed configuration falls back to the standard local root.
  }
  return join(homedir(), '.career_wiki');
}

async function start() {
  const root = await resolveWikiRoot();
  const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const appState = createCareerWikiAppState({ root });
  const adapter = createCareerWikiHttpAdapter({
    knowledge: createCareerKnowledge({ root }),
    appState,
    polish: createResumePolish({ root, appState }),
    pdf: createResumePdfRenderer({ chromium }),
  });
  const server = createServer(adapter);

  server.listen(port, () => {
    console.log(`Career Wiki API v${VERSION}`);
    console.log(`Root: ${root}`);
    console.log(`URL: http://localhost:${port}/api/health`);
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
