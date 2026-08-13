import { readFile, readdir, mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  resumesDirectory,
  templatesDirectory,
} from '../../wiki-engine/scripts/layout.mjs';

function applicationError(message, statusCode, details = {}) {
  return Object.assign(new Error(message), { statusCode, ...details });
}

function assertSafeId(id, subject) {
  const normalized = String(id || '');
  if (!/^[a-z0-9-]+$/i.test(normalized)) {
    throw applicationError(`非法${subject} id`, 400);
  }
  return normalized;
}

async function collectJson(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJson(path));
    else if (entry.isFile() && extname(entry.name) === '.json') files.push(path);
  }
  return files.sort();
}

async function readJsonCollection(directory) {
  const values = [];
  for (const path of await collectJson(directory)) {
    try {
      values.push(JSON.parse(await readFile(path, 'utf8')));
    } catch {
      // A malformed file is ignored so one local draft cannot hide all valid state.
    }
  }
  return values;
}

function persistenceError(error, fallbackMessage) {
  if (error?.code === 'EACCES' || error?.code === 'EPERM') {
    return applicationError(
      '数据目录不可写，请确认 API 服务拥有简历目录的写入权限后重试。',
      500,
      { code: error.code },
    );
  }
  return applicationError(error?.message || fallbackMessage, 500, { code: error?.code });
}

export function createCareerWikiAppState({ root, now = () => new Date() }) {
  const resumeDirectory = resumesDirectory(root);
  const templateDirectory = templatesDirectory(root);

  return {
    async listResumes() {
      return readJsonCollection(resumeDirectory);
    },

    async getResume(id) {
      const safeId = assertSafeId(id, '简历');
      try {
        return JSON.parse(await readFile(join(resumeDirectory, `${safeId}.json`), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw applicationError('简历配置不存在', 404, { id: safeId });
        }
        throw error;
      }
    },

    async saveResume(input) {
      const config = structuredClone(input || {});
      if (!config.id || !config.name) throw applicationError('缺少 id 或 name', 400);
      const id = assertSafeId(config.id, '简历');
      const today = now().toISOString().slice(0, 10);
      config.created ||= today;
      config.updated = today;
      try {
        await mkdir(resumeDirectory, { recursive: true });
        await writeFile(
          join(resumeDirectory, `${id}.json`),
          JSON.stringify(config, null, 2),
          'utf8',
        );
      } catch (error) {
        throw persistenceError(error, '保存失败');
      }
      return { status: 'saved', id };
    },

    async deleteResume(id) {
      const safeId = assertSafeId(id, '简历');
      try {
        await unlink(join(resumeDirectory, `${safeId}.json`));
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw applicationError('简历配置不存在', 404, { id: safeId });
        }
        throw applicationError(error.message, 500);
      }
      return { status: 'deleted', id: safeId };
    },

    async listTemplates() {
      return readJsonCollection(templateDirectory);
    },

    async saveTemplate({ template: input, css } = {}) {
      const template = structuredClone(input || {});
      if (!template.id || !template.name || !Array.isArray(template.sections)) {
        throw applicationError('模板缺少 id/name/sections', 400);
      }
      const id = assertSafeId(template.id, '模板');
      template.style ||= `${id}.css`;
      try {
        await mkdir(templateDirectory, { recursive: true });
        await writeFile(
          join(templateDirectory, `${id}.json`),
          JSON.stringify(template, null, 2),
          'utf8',
        );
        if (typeof css === 'string') {
          await writeFile(join(templateDirectory, `${id}.css`), css, 'utf8');
        }
      } catch (error) {
        throw applicationError(error.message, 500);
      }
      return { status: 'saved', id };
    },

    async deleteTemplate(id) {
      const safeId = assertSafeId(id, '模板');
      try {
        await unlink(join(templateDirectory, `${safeId}.json`));
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw applicationError('模板不存在', 404, { id: safeId });
        }
        throw applicationError(error.message, 500);
      }
      await unlink(join(templateDirectory, `${safeId}.css`)).catch(() => undefined);
      return { status: 'deleted', id: safeId };
    },

    async readTemplateCss(id) {
      const safeId = assertSafeId(id, '模板');
      try {
        return await readFile(join(templateDirectory, `${safeId}.css`), 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw applicationError('模板 CSS 不存在', 404, { id: safeId });
        }
        throw applicationError(error.message, 500);
      }
    },
  };
}
