import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { resolveWorkspaceRoot, rootArgument } from '../env-init/scripts/workspace_root.mjs';
import { DATA_LAYOUT } from '../wiki-engine/scripts/layout.mjs';

try {
  const [command, file, ...args] = process.argv.slice(2);
  const extraction = command === 'reference' ? args.shift() : undefined;
  if (!file || !(command === 'archive' || (command === 'reference' && extraction))) {
    throw new Error('用法: import_source.mjs <archive 原文件 | reference 归档文件名 提取稿.md> [--root <数据根目录>]');
  }
  const root = resolveWorkspaceRoot(rootArgument(args));
  const attachments = join(root, DATA_LAYOUT.referencesUploads);
  if (command === 'archive') {
    const target = join(attachments, `${randomUUID()}-${basename(file)}`);
    await mkdir(attachments, { recursive: true });
    await copyFile(file, target, constants.COPYFILE_EXCL);
    console.log(target);
  } else {
    if (!/^[\da-f-]{36}-.+$/u.test(file) || file !== basename(file)) throw new Error('需要归档文件名');
    if (!(await stat(join(attachments, file))).isFile()) throw new Error('归档不是文件');
    const content = await readFile(extraction, 'utf8');
    if (!content.trim()) throw new Error('提取稿为空；请用已有归档重试');
    const now = new Date().toISOString();
    const directory = join(root, DATA_LAYOUT.referencesRaw, 'uploads');
    const target = join(directory, `${file.slice(0, 36)}.md`);
    await mkdir(directory, { recursive: true });
    const frontmatter = JSON.stringify({
      type: 'Reference', title: file.slice(37), status: 'stable',
      generated: { by: 'career-wiki-agent', at: now },
      sources: [{ resource: `/references/uploads/${file}` }],
      upload_date: now.slice(0, 10), original_file: file, file_type: extname(file).slice(1),
    });
    await writeFile(target, `---\n${frontmatter}\n---\n\n${content}`, { flag: 'wx' });
    console.log(target);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
