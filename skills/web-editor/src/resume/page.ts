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

/** Greedily place measured blocks into the actual remaining space on each page. */
export function paginateBlocks(heights: number[], pageHeight: number): { indexes: number[]; overflow: boolean } {
  let page = 0;
  let used = 0;
  let overflow = false;
  const indexes = heights.map((height) => {
    if (height > pageHeight) overflow = true;
    if (used > 0 && used + height > pageHeight) {
      page += 1;
      used = 0;
    }
    used += height;
    return page;
  });
  return { indexes, overflow };
}

/** Split long fields at explicit line boundaries, preserving non-empty lines in order. */
export function paragraphBlocks(value: unknown): string[] {
  return String(value ?? '').split(/\r?\n/).filter((line) => line.trim());
}
