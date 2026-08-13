import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  addDeletion,
  isEntityDeleted,
  readDeletionManifest,
  resolveDataRoot,
} from '../scripts/delete_entity.mjs';

/** 创建最小实体，覆盖删除清单的路径和名称匹配边界。 */
function entity(path, name = '目标项目') {
  return { entity: 'project', path, fields: { name } };
}

test('删除清单按实体类型和精确路径幂等登记', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-deletion-'));
  try {
    await mkdir(join(root, 'knowledge', 'projects'), { recursive: true });
    await writeFile(join(root, 'knowledge', 'projects', '目标项目.md'), '旧 Wiki 页面');
    await addDeletion(root, {
      entity: 'project',
      path: 'wiki/projects/目标项目.md',
      name: '目标项目',
    });
    await addDeletion(root, {
      entity: 'project',
      path: 'projects/目标项目.md',
      name: '目标项目',
    });

    const deletions = await readDeletionManifest(root);
    assert.equal(deletions.length, 1);
    await assert.rejects(readFile(join(root, 'knowledge', 'projects', '目标项目.md')));
    assert.equal(isEntityDeleted(entity('projects/目标项目.md'), deletions), true);
    assert.equal(isEntityDeleted(entity('projects/目标项目-副本.md', '其他项目'), deletions), false);
    assert.equal(isEntityDeleted(entity('projects/另一个项目.md', '目标项目'), deletions), false);
    await assert.rejects(
      addDeletion(root, { entity: 'project', path: '../../outside.md' }),
      /非法 Wiki 实体路径/,
    );
    assert.equal(
      isEntityDeleted({ entity: 'skill', path: 'skills/目标项目.md', fields: { name: '目标项目' } }, deletions),
      false,
    );
    assert.match(await readFile(join(root, '.career-wiki-skill/deletions.json'), 'utf8'), /目标项目/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('显式数据根目录优先于默认配置', async () => {
  const root = await mkdtemp(join(tmpdir(), 'career-wiki-root-'));
  try {
    assert.equal(await resolveDataRoot(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
