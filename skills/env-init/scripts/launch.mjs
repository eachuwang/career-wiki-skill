#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { DATA_LAYOUT } from '../../wiki-engine/scripts/layout.mjs';
import { resolveWorkspaceRoot, rootArgument, workspaceLocator } from './workspace_root.mjs';

const skills = fileURLToPath(new URL('../../', import.meta.url));
const editor = join(skills, 'web-editor');
const windows = process.platform === 'win32';
const npm = windows ? 'npm.cmd' : 'npm';

function preflight() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major === 22 && minor >= 20 || major === 24 && minor >= 12 || major >= 25)) {
    throw new Error(`Node ${process.versions.node} 不支持；请安装 Node 22.20+ 或 24.12+（LTS）`);
  }
  if (spawnSync(npm, ['--version'], { shell: windows }).status !== 0) throw new Error('npm 不可用');
}

function ensureDependencies(directory) {
  const options = { cwd: directory, shell: windows };
  if (spawnSync(npm, ['ls', '--all'], options).status !== 0
      && spawnSync(npm, ['ci', '--engine-strict', '--no-audit'], { ...options, stdio: 'inherit' }).status !== 0) {
    throw new Error(`无法安装锁定依赖: ${directory}；请保留完整的 skill 包与锁文件`);
  }
}

async function writeNew(path, text) {
  try {
    await writeFile(path, text, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function initialize(input, initOnly) {
  let root = resolveWorkspaceRoot(input, { allowMissing: initOnly && input !== undefined ? true : 'default' });
  try {
    await lstat(join(root, 'wiki'));
    throw new Error(`检测到旧工作区 ${root}；先运行 okf_bundle.mjs migrate --root <此路径>，再初始化`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(root, { recursive: true });
  root = resolveWorkspaceRoot(root);
  await access(root, constants.W_OK);
  for (const path of [...Object.values(DATA_LAYOUT), join(DATA_LAYOUT.referencesRaw, 'uploads')]) {
    await mkdir(join(root, path), { recursive: true });
  }
  await writeNew(join(root, DATA_LAYOUT.bundle, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Career Wiki\n');
  await writeNew(join(root, DATA_LAYOUT.state, 'config.json'), JSON.stringify({
    version: '2.0', okf_version: '0.2', root, created: new Date().toISOString(),
  }, null, 2) + '\n');
  return root;
}

async function remember(root) {
  await mkdir(dirname(workspaceLocator), { recursive: true });
  const temporary = `${workspaceLocator}.${randomUUID()}`;
  try {
    await writeFile(temporary, JSON.stringify({ root }) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, workspaceLocator);
  } finally {
    await rm(temporary, { force: true });
  }
}

function readPort(value) {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) throw new Error(`无效端口: ${value}`);
  return port;
}

async function request(url) {
  try {
    return await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(2000) });
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return null;
    throw new Error(`无法验证本地服务 ${url}: ${error.message}`);
  }
}

async function checkHealth(url, root) {
  const response = await request(`${url}/api/health`);
  if (!response) return false;
  const health = await response.json().catch(() => null);
  if (!response.ok || health?.service !== 'career-wiki-skill-resume-generator' || health.status !== 'ok') {
    throw new Error(`${url} 不是可用的 Career Wiki API`);
  }
  if (health.wiki_root !== root) {
    throw new Error(`${url} 使用另一个 WorkspaceRoot: ${health.wiki_root}；期望 ${root}`);
  }
  return true;
}

async function checkEditor(url, root) {
  const response = await request(`${url}/`);
  if (!response) return false;
  if (!response.ok || !(await response.text()).includes('<title>Career-Wiki 简历编辑器</title>')
      || !await checkHealth(url, root)) {
    throw new Error(`${url} 不是连接到该 WorkspaceRoot 的 Career Wiki 编辑器`);
  }
  return true;
}

async function waitFor(check, child, url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await check()) return;
    if (child.exitCode !== null) break;
    await setTimeout(100);
  }
  throw new Error(`服务启动失败: ${url}`);
}

async function launch(root, open) {
  const apiPort = readPort(process.env.CAREER_WIKI_API_PORT ?? '3001');
  const editorPort = readPort(process.env.CAREER_WIKI_EDITOR_PORT ?? '5173');
  if (apiPort === editorPort) throw new Error('API 与编辑器需要不同端口');
  const api = `http://127.0.0.1:${apiPort}`;
  const frontend = `http://127.0.0.1:${editorPort}`;
  const env = { ...process.env, WIKI_ROOT: root, PORT: String(apiPort), CAREER_WIKI_API_PORT: String(apiPort) };
  const children = [];
  function start(script, args, cwd) {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, detached: true, stdio: 'ignore' });
    children.push(child);
    return child;
  }
  try {
    if (!await checkHealth(api, root)) {
      const child = start(join(skills, 'resume-generator/scripts/api_server.mjs'), [], skills);
      await waitFor(() => checkHealth(api, root), child, api);
    }
    if (!await checkEditor(frontend, root)) {
      const child = start(join(editor, 'node_modules/vite/bin/vite.js'),
        ['--host', '127.0.0.1', '--port', String(editorPort), '--strictPort'], editor);
      await waitFor(() => checkEditor(frontend, root), child, frontend);
    }
    await remember(root);
  } catch (error) {
    for (const child of children.reverse()) child.kill();
    throw error;
  }
  for (const child of children) child.unref();
  console.log(frontend);
  if (open) {
    const [program, ...args] = { darwin: ['open', frontend], win32: ['cmd', '/c', 'start', '', frontend] }[process.platform]
      ?? ['xdg-open', frontend];
    if (spawnSync(program, args, { stdio: 'ignore' }).status !== 0) console.error(`请手动打开 ${frontend}`);
  }
}

try {
  const args = process.argv.slice(2);
  const initOnly = args[0] === '--init';
  if (initOnly) args.shift();
  const open = !args.includes('--no-open');
  const input = rootArgument(open ? args : args.filter((arg) => arg !== '--no-open'));
  preflight();
  ensureDependencies(skills);
  if (!initOnly) ensureDependencies(editor);
  const root = await initialize(input, initOnly);
  console.log(`WorkspaceRoot: ${root}`);
  if (initOnly) await remember(root);
  else await launch(root, open);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
