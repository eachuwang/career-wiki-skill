import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleHiddenItem } from './visibility.ts';

test('隐藏项目使用 Wiki 路径切换当前简历草稿状态', () => {
  const hidden = toggleHiddenItem([], 'projects/legacy-console.md');
  assert.deepEqual(hidden, ['projects/legacy-console.md']);

  const restored = toggleHiddenItem(hidden, 'projects/legacy-console.md');
  assert.deepEqual(restored, []);
});
