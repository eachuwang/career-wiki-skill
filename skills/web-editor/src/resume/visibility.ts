/** 切换当前简历中的隐藏状态，不修改 Wiki 实体本身。 */
export function toggleHiddenItem(
  hiddenItemIds: string[],
  itemId: string,
): string[] {
  return hiddenItemIds.includes(itemId)
    ? hiddenItemIds.filter((id) => id !== itemId)
    : [...hiddenItemIds, itemId];
}
