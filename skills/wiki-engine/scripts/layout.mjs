import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_LAYOUT = JSON.parse(
  readFileSync(new URL('../layout.json', import.meta.url), 'utf8'),
);

export function bundleDirectory(root) {
  return join(root, DATA_LAYOUT.bundle);
}

export function resumesDirectory(root) {
  return join(root, DATA_LAYOUT.resumes);
}

export function templatesDirectory(root) {
  return join(root, DATA_LAYOUT.templates);
}
