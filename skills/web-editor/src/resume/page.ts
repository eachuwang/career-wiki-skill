/**
 * resume/page.ts — A4 分页常量与分页算法
 *
 * 简历以「多张 A4 纸」为渲染模型：每页 210×297mm，
 * 四边预留保护区域（上下 15mm、左右 16mm），
 * 内容只允许出现在保护区域内部，杜绝文字被页面边界截断。
 */

/** A4 纸宽（mm） */
export const A4_WIDTH_MM = 210;
/** A4 纸高（mm） */
export const A4_HEIGHT_MM = 297;

/** 页面顶部保护区域（mm） */
export const PAGE_PADDING_TOP_MM = 15;
/** 页面底部保护区域（mm） */
export const PAGE_PADDING_BOTTOM_MM = 15;
/** 页面左侧保护区域（mm） */
export const PAGE_PADDING_LEFT_MM = 16;
/** 页面右侧保护区域（mm） */
export const PAGE_PADDING_RIGHT_MM = 16;

/** 单页内容区宽度（mm）= 纸宽 - 左右保护区域 */
export const CONTENT_WIDTH_MM =
  A4_WIDTH_MM - PAGE_PADDING_LEFT_MM - PAGE_PADDING_RIGHT_MM;
/** 单页内容区高度（mm）= 纸高 - 上下保护区域 */
export const CONTENT_HEIGHT_MM =
  A4_HEIGHT_MM - PAGE_PADDING_TOP_MM - PAGE_PADDING_BOTTOM_MM;

/** 浏览器 96dpi 下 mm → px 的换算系数 */
export const MM_TO_PX = 96 / 25.4;

/** 毫米转像素（供测量/分页计算使用） */
export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

/** 参与分页计算的内容块：top/height 均相对测量容器内容区顶部（px） */
export interface PaginateBlockRect {
  top: number;
  height: number;
}

/**
 * 贪心计算每个内容块所属页码。
 *
 * 块在测量容器中连续流式排列，top/height 反映真实排版；
 * 若块起点已越过当前页底部，或块跨越页边界，则整体移入下一页，
 * 保证块（进而其中的文字行）永远不会被页边界切断。
 * 返回与输入等长的页码数组（从 0 开始）。
 */
export function computePageIndexes(
  blocks: PaginateBlockRect[],
  pageContentHeight: number,
): number[] {
  const indexes: number[] = [];
  let page = 0;
  let pageEnd = pageContentHeight;

  for (const block of blocks) {
    const top = block.top;
    const bottom = top + block.height;

    // 块起点已越过当前页底部 → 从下一页开始
    if (top >= pageEnd) {
      page += 1;
      pageEnd = pageContentHeight * (page + 1);
    }
    // 块跨越页边界（起点在本页、终点超出）→ 整块移入下一页
    if (top < pageEnd && bottom > pageEnd) {
      page += 1;
      pageEnd = pageContentHeight * (page + 1);
    }

    indexes.push(page);
  }

  return indexes;
}
