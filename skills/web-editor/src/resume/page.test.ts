import assert from 'node:assert/strict';
import test from 'node:test';
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  CONTENT_WIDTH_MM,
  CONTENT_HEIGHT_MM,
  mmToPx,
  computePageIndexes,
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

test('全部内容在一页内时所有块页码为 0', () => {
  const pageHeight = mmToPx(CONTENT_HEIGHT_MM);
  const indexes = computePageIndexes(
    [
      { top: 0, height: 200 },
      { top: 200, height: 300 },
      { top: 500, height: 100 },
    ],
    pageHeight,
  );
  assert.deepEqual(indexes, [0, 0, 0]);
});

test('块起点越过页底时换页', () => {
  const pageHeight = 1000;
  const indexes = computePageIndexes(
    [
      { top: 0, height: 600 },
      { top: 600, height: 500 }, // 起点 600 < 1000，但终点 1100 > 1000 → 跨页移入下一页
      { top: 1100, height: 100 }, // 起点已越过第一页底 → 下一页
    ],
    pageHeight,
  );
  // 第 2 块跨页移入第 1 页；第 3 块紧随其后也在第 1 页
  assert.deepEqual(indexes, [0, 1, 1]);
});

test('连续多页正确换页', () => {
  const pageHeight = 1000;
  const indexes = computePageIndexes(
    [
      { top: 0, height: 900 },
      { top: 900, height: 100 }, // 终点 1000，未越过页底 → 第 0 页
      { top: 1000, height: 800 }, // 起点越过页底 → 第 1 页
      { top: 1800, height: 900 }, // 起点越过第二页底（2000）→ 第 2 页
    ],
    pageHeight,
  );
  assert.deepEqual(indexes, [0, 0, 1, 2]);
});

test('超高块独占一页且不无限换页', () => {
  const pageHeight = 1000;
  const indexes = computePageIndexes(
    [
      { top: 0, height: 2500 }, // 超过一页高：移入下一页并独占
      { top: 2500, height: 100 }, // 起点越过 → 再下一页
    ],
    pageHeight,
  );
  assert.deepEqual(indexes, [1, 2]);
});

test('空块列表返回空页码', () => {
  assert.deepEqual(computePageIndexes([], 1000), []);
});
