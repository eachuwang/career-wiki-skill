import type { WikiEntity } from '../types';

/**
 * 将用户覆盖应用到 wiki 实体列表，返回新数组（不修改原对象）。
 *
 * EditPanel（编辑卡片）与 PreviewPanel（预览渲染）各自实现过一遍，
 * 现收敛为同一份纯函数。
 */
export function mergeOverrides(
  entities: WikiEntity[],
  overrides: Record<string, unknown>,
): WikiEntity[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return entities.map((e) => ({ ...e, fields: { ...e.fields } }));
  }
  return entities.map((e) => ({
    ...e,
    fields: { ...e.fields, ...overrides },
  }));
}
