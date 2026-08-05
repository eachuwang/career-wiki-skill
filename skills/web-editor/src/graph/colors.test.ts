import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTITY_COLORS } from '../types/index.ts';
import { getContrastRatio, getReadableGraphTextColor } from './colors.ts';

test('每种实体徽章文字都满足 WCAG AA 对比度', () => {
  for (const [entity, background] of Object.entries(ENTITY_COLORS)) {
    const foreground = getReadableGraphTextColor(background);
    assert.ok(
      getContrastRatio(background, foreground) >= 4.5,
      `${entity} 的文字对比度不足`,
    );
  }
});
