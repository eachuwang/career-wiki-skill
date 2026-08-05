/**
 * resume-rules.d.mts — resume-rules.mjs 的类型声明（供 web-editor TS 前端使用）
 */
export interface PrivacyConfig {
  mask_name?: boolean;
  mask_phone?: boolean;
  mask_email?: boolean;
  mask_company?: boolean;
  mask_salary?: boolean;
  mask_github?: boolean;
}

export const DEFAULT_PRIVACY: Required<PrivacyConfig>;

export const FALLBACK_FIELDS: Record<string, string[]>;

export function maskValue(value: unknown, field: string, privacy: PrivacyConfig): string;

export function dateSortKey(value: unknown): number | null;

export function sortEntities<T>(items: T[], orderDir?: 'asc' | 'desc'): T[];

export function getSectionFields(
  section: { fields?: string[] } | undefined,
  moduleType: string,
): string[];

export function applyHide<T extends Record<string, unknown>>(
  items: T[],
  hideConfig: Array<{ module: string; items?: string[]; fields?: string[] }> | undefined,
  module: string,
): T[];

export function groupByItems<T>(items: T[], keyField: string): Array<{ key: string; items: T[] }>;

export function maskItemFields<T extends Record<string, unknown>>(
  item: T,
  privacy: PrivacyConfig,
): T;
