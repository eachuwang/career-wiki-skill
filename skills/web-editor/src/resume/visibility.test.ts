import assert from 'node:assert/strict';
import test from 'node:test';
import type { WikiEntity } from '../types/index.ts';
import {
  getVisibleEntities,
  toggleHiddenItem,
} from './visibility.ts';

const projects: WikiEntity[] = [
  {
    path: 'projects/search-platform.md',
    entity: 'project',
    title: '',
    trustTier: 'unverified',
    sources: [],
    relations: [],
    links: [],
    fields: { name: '搜索平台' },
  },
  {
    path: 'projects/legacy-console.md',
    entity: 'project',
    title: '',
    trustTier: 'unverified',
    sources: [],
    relations: [],
    links: [],
    fields: { name: '旧版控制台' },
  },
];

test('隐藏项目只从当前简历预览移除，恢复后重新显示', () => {
  const hidden = toggleHiddenItem([], 'projects/legacy-console.md');
  const visibleAfterHide = getVisibleEntities(projects, hidden);

  assert.deepEqual(hidden, ['projects/legacy-console.md']);
  assert.deepEqual(
    visibleAfterHide.map((entity) => entity.fields.name),
    ['搜索平台'],
  );
  assert.equal(projects.length, 2);

  const restored = toggleHiddenItem(hidden, 'projects/legacy-console.md');
  assert.deepEqual(getVisibleEntities(projects, restored), projects);
});
