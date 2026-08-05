import type { EntityType } from '../types';

type EntityFieldEntry = [string, unknown];

/** 固定项目描述、岗位职责和技术栈的顺序，避免接口字段顺序影响编辑体验。 */
export function getOrderedEntityFieldEntries(
  entityType: EntityType,
  fields: Record<string, unknown>,
): EntityFieldEntry[] {
  const entries = Object.entries(fields);
  if (entityType !== 'project') return entries;

  const responsibilities = entries.find(([field]) => field === 'responsibilities');
  const techStack = entries.find(([field]) => field === 'tech_stack') ?? ['tech_stack', ''];
  const orderedEntries = entries.filter(
    ([field]) => field !== 'responsibilities' && field !== 'tech_stack',
  );
  const descriptionIndex = orderedEntries.findIndex(([field]) => field === 'description');
  const insertIndex = descriptionIndex >= 0 ? descriptionIndex + 1 : orderedEntries.length;
  orderedEntries.splice(
    insertIndex,
    0,
    ...([responsibilities, techStack].filter(Boolean) as EntityFieldEntry[]),
  );
  return orderedEntries;
}
