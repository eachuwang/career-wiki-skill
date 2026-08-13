#!/usr/bin/env node

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bundleDirectory } from './layout.mjs';

export const DELETION_MANIFEST = '.career-wiki-skill/deletions.json';

/** 解析数据根目录，优先使用显式参数，其次读取 env-init 配置。 */
export async function resolveDataRoot(input) {
  if (input) return String(input);
  const configPath = join(homedir(), '.career_wiki', '.career-wiki-skill', 'config.json');
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    if (config.root) return String(config.root);
  } catch {
    // 配置不存在时使用默认数据目录。
  }
  return join(homedir(), '.career_wiki');
}

/** 统一 Wiki 实体路径，确保删除记录按精确路径匹配。 */
export function normalizeEntityPath(value) {
  let path = String(value || '').trim().replaceAll('\\', '/');
  path = path.replace(/^wiki\//, '').replace(/^\/+|\/+$/g, '');
  if (path && !path.endsWith('.md')) path += '.md';
  return path;
}

/** 校验 Wiki 相对路径，防止删除登记越出数据根目录。 */
function assertSafeEntityPath(path) {
  if (!path || path === '..' || path.startsWith('../') || path.includes('/../') || path.includes('\0')) {
    throw new Error(`非法 Wiki 实体路径: ${path}`);
  }
}

/** 读取删除清单；文件不存在时返回空清单。 */
export async function readDeletionManifest(root) {
  try {
    const raw = await readFile(join(root, DELETION_MANIFEST), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.deletions) ? parsed.deletions : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`读取 Wiki 删除清单失败: ${error.message}`);
  }
}

/** 判断实体是否被实体类型和精确 Wiki 路径标记为删除。 */
export function isEntityDeleted(entity, deletions) {
  const entityPath = normalizeEntityPath(entity.path);
  return deletions.some((record) => {
    if (record.entity !== entity.entity) return false;
    return Boolean(record.path && normalizeEntityPath(record.path) === entityPath);
  });
}

/** 将实体加入删除清单，操作幂等且不删除原始材料。 */
export async function addDeletion(root, record) {
  if (!record?.entity || !record?.path) {
    throw new Error('删除记录必须包含 entity 和 path');
  }
  const normalized = {
    entity: String(record.entity),
    path: normalizeEntityPath(record.path),
    ...(record.name ? { name: String(record.name) } : {}),
    ...(record.reason ? { reason: String(record.reason) } : {}),
    deleted_at: record.deleted_at || new Date().toISOString(),
  };
  assertSafeEntityPath(normalized.path);
  const existing = await readDeletionManifest(root);
  const duplicate = existing.some(
    (item) =>
      item.entity === normalized.entity &&
      normalizeEntityPath(item.path) === normalized.path,
  );
  const deletions = duplicate ? existing : [...existing, normalized];
  const manifestPath = join(root, DELETION_MANIFEST);
  await mkdir(join(root, '.career-wiki-skill'), { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify({ version: 1, deletions }, null, 2)}\n`,
    'utf8',
  );
  try {
    await unlink(join(bundleDirectory(root), normalized.path));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`删除 Wiki 生成页失败: ${error.message}`);
    }
  }
  return normalized;
}

/** 解析删除命令行参数，并写入删除清单。 */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

/** 执行命令行删除登记，立即移除生成页并等待后续全量 compile 清理关系。 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = await resolveDataRoot(String(args.root || '').trim());
  if (!args.entity || !args.path) {
    console.error(
      '用法: node delete_entity.mjs --root <数据根目录> --entity <实体类型> --path <Wiki相对路径> [--name <名称>] [--reason <原因>]',
    );
    process.exitCode = 1;
    return;
  }
  const record = await addDeletion(root, {
    entity: args.entity,
    path: args.path,
    name: args.name,
    reason: args.reason,
  });
  console.log(`已登记删除: ${record.entity} ${record.path}`);
  console.log(`已移除当前 Wiki 生成页；请随后执行全量 compile，清理关系和其他派生内容。`);
}

if (process.argv[1] && process.argv[1].endsWith('delete_entity.mjs')) {
  await main();
}
