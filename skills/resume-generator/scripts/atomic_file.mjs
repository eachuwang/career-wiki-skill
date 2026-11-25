import { randomUUID } from 'node:crypto';
import { link, rename, unlink, writeFile } from 'node:fs/promises';

export async function writeAtomicFile(path, contents, { createOnly = false } = {}) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx', mode: 0o600 });
    // A hard link publishes the complete file without replacing an existing entry.
    if (createOnly) await link(temporaryPath, path);
    else await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}
