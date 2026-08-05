import type { WikiEntity } from '../types';

/** 使用 Wiki 相对路径作为简历子项标识，避免同名条目互相影响。 */
export function getEntityItemId(entity: WikiEntity): string {
  return entity.path;
}

/** 切换当前简历中的隐藏状态，不修改 Wiki 实体本身。 */
export function toggleHiddenItem(
  hiddenItemIds: string[],
  itemId: string,
): string[] {
  return hiddenItemIds.includes(itemId)
    ? hiddenItemIds.filter((id) => id !== itemId)
    : [...hiddenItemIds, itemId];
}

/** 为预览和导出提供同一份可见条目集合。 */
export function getVisibleEntities(
  entities: WikiEntity[],
  hiddenItemIds: string[],
): WikiEntity[] {
  const hidden = new Set(hiddenItemIds);
  return entities.filter((entity) => !hidden.has(getEntityItemId(entity)));
}
