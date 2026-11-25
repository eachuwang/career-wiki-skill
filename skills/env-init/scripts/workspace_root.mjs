import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const home = homedir();
const defaultRoot = join(home, '.career_wiki');
export const workspaceLocator = join(home, '.career-wiki-skill', 'workspace.json');

function readConfiguredRoot(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const { root } = JSON.parse(text);
    if (typeof root === 'string' && isAbsolute(root)) return root;
  } catch {
    // Report a malformed locator instead of falling back to another workspace.
  }
  throw new Error(`无效的 WorkspaceRoot 配置: ${file}`);
}

export function resolveWorkspaceRoot(input = process.env.WIKI_ROOT, { allowMissing = false } = {}) {
  const configured = input ?? readConfiguredRoot(workspaceLocator)
    ?? readConfiguredRoot(join(defaultRoot, '.career-wiki-skill', 'config.json'));
  const selected = configured ?? defaultRoot;
  if (typeof selected !== 'string' || !selected.trim()) throw new Error('WorkspaceRoot 不能为空');
  const expanded = selected === '~' ? home : selected.startsWith('~/') ? join(home, selected.slice(2)) : selected;
  const path = resolve(expanded);
  try {
    if (!statSync(path).isDirectory()) throw new Error('不是目录');
    return realpathSync(path);
  } catch (error) {
    if ((allowMissing === true || (allowMissing === 'default' && configured === undefined)) && error.code === 'ENOENT') return path;
    throw new Error(`无效的 WorkspaceRoot: ${path} (${error.message})`);
  }
}

export function rootArgument(args) {
  if (args.length === 0) return undefined;
  if (args.length === 2 && args[0] === '--root' && !args[1].startsWith('--')) return args[1];
  throw new Error('用法: [--root <数据根目录>]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(resolveWorkspaceRoot(rootArgument(process.argv.slice(2)), { allowMissing: 'default' }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
