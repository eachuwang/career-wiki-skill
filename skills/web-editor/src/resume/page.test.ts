import assert from 'node:assert/strict';
import test from 'node:test';
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  CONTENT_WIDTH_MM,
  CONTENT_HEIGHT_MM,
  mmToPx,
  paginateBlocks,
  paragraphBlocks,
} from './page.ts';

test('A4 常量与保护区域尺寸正确', () => {
  assert.equal(A4_WIDTH_MM, 210);
  assert.equal(A4_HEIGHT_MM, 297);
  // 左右保护区域 16mm、上下 15mm
  assert.equal(CONTENT_WIDTH_MM, 178);
  assert.equal(CONTENT_HEIGHT_MM, 267);
});

test('mmToPx 按 96dpi 换算', () => {
  assert.ok(Math.abs(mmToPx(297) - 1122.519) < 0.01);
  assert.equal(mmToPx(0), 0);
});

test('分页使用每页的剩余空间，而不是连续文档上的固定边界', () => {
  assert.deepEqual(paginateBlocks([600, 600, 300, 100], 1000), { indexes: [0, 1, 1, 1], overflow: false });
  assert.deepEqual(paginateBlocks([900, 100, 800, 900], 1000), { indexes: [0, 0, 1, 2], overflow: false });
  assert.deepEqual(paginateBlocks([999.5, 0.75], 1000), { indexes: [0, 1], overflow: false });
});

test('不可拆的超高块明确标记为溢出，而非静默切掉内容', () => {
  assert.deepEqual(paginateBlocks([2500, 100], 1000), { indexes: [0, 1], overflow: true });
  assert.deepEqual(paginateBlocks([], 1000), { indexes: [], overflow: false });
});

test('长文本仅在明确换行处分块，并支持中英混排与长链接', () => {
  const url = 'https://example.test/' + 'a'.repeat(250);
  assert.deepEqual(paragraphBlocks(`中文 English\r\n\r\n${url}\n最后一段`), ['中文 English', url, '最后一段']);
});
