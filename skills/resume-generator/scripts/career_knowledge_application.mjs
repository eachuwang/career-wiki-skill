import { existsSync } from 'node:fs';
import {
  CAREER_ENTITY_DIRECTORIES,
  loadCareerKnowledge,
} from 'career-wiki-wiki-engine/career-knowledge';
import { bundleDirectory } from '../../wiki-engine/scripts/layout.mjs';

function applicationError(message, statusCode, details = {}) {
  return Object.assign(new Error(message), { statusCode, ...details });
}

export function createCareerKnowledge({ root }) {
  return {
    async load(query = {}) {
      try {
        return await loadCareerKnowledge(root, query);
      } catch (error) {
        if (query.entity && /不支持的 Career 实体类型/.test(error.message)) {
          throw applicationError(error.message, 400);
        }
        throw error;
      }
    },

    async get(entityDirectory, id) {
      const entity = Object.entries(CAREER_ENTITY_DIRECTORIES)
        .find(([, directory]) => directory === entityDirectory)?.[0];
      const path = `${entityDirectory}/${String(id).replace(/\.md$/i, '')}.md`;
      if (!entity) throw applicationError('实体不存在', 404, { path });
      const snapshot = await loadCareerKnowledge(root, { entity });
      const found = snapshot.entities.find((item) => item.path === path);
      if (!found) throw applicationError('实体不存在', 404, { path });
      return found;
    },

    async status() {
      const entityCounts = Object.fromEntries(
        Object.values(CAREER_ENTITY_DIRECTORIES).map((directory) => [directory, 0]),
      );
      const errors = [];
      try {
        const snapshot = await loadCareerKnowledge(root, { includeContent: false });
        for (const entity of snapshot.entities) {
          entityCounts[CAREER_ENTITY_DIRECTORIES[entity.entity]] += 1;
        }
      } catch (error) {
        errors.push(error.message);
      }
      return {
        root,
        exists: existsSync(bundleDirectory(root)),
        entity_counts: entityCounts,
        okf_valid: errors.length === 0,
        okf_errors: errors,
      };
    },
  };
}
