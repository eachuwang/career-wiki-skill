export type ResumeContactField = 'email' | 'phone' | 'github' | 'website';

export type ResumeContactIcon = 'mail' | 'phone' | 'github' | 'globe';

export interface ResumeContactItem {
  field: ResumeContactField;
  icon: ResumeContactIcon;
  value: unknown;
}

const CONTACT_DEFINITIONS: ReadonlyArray<
  Readonly<{ field: ResumeContactField; icon: ResumeContactIcon }>
> = [
  { field: 'email', icon: 'mail' },
  { field: 'phone', icon: 'phone' },
  { field: 'github', icon: 'github' },
  { field: 'website', icon: 'globe' },
];

/**
 * 将个人字段转换为稳定的联系方式视图模型，让预览与图标语义保持一一对应。
 */
export function getResumeContactItems(
  fields: Record<string, unknown>,
): ResumeContactItem[] {
  const contacts: ResumeContactItem[] = [];

  for (const definition of CONTACT_DEFINITIONS) {
    const value = fields[definition.field];
    if (value == null || String(value).trim() === '') continue;
    contacts.push({ ...definition, value });
  }

  return contacts;
}
