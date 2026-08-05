/**
 * resume-rules.mjs — 简历渲染确定性规则（单一实现）
 *
 * web-editor 前端预览与 resume-generator 后端 JSON 生成消费同一份规则，
 * 消除「一条规则两个实现」造成的行为分叉（脱敏/排序/字段选择/隐藏/分组）。
 * 纯函数、零依赖，Node 与浏览器均可直接 import。
 */

/** 默认脱敏开关（全部关闭） */
export const DEFAULT_PRIVACY = {
  mask_name: false,
  mask_phone: false,
  mask_email: false,
  mask_company: false,
  mask_salary: false,
  mask_github: false,
};

/** 模板未定义该模块时的兜底字段，避免条目只剩日期 */
export const FALLBACK_FIELDS = {
  summary: ['content'],
  experience: ['company', 'role', 'start', 'end', 'description'],
  project: ['name', 'role', 'start', 'end', 'description', 'responsibilities', 'tech_stack'],
  education: ['school', 'degree', 'major', 'start', 'end'],
};

/** 脱敏单个字段值：6 类字段统一语义，phone 自动识别 11 位数字串 */
export function maskValue(value, field, privacy) {
  const v = String(value ?? '');
  if (!v) return '';

  if (privacy.mask_phone && (field === 'phone' || /^\d{11}$/.test(v))) {
    return v.length >= 7 ? `${v.slice(0, 3)}****${v.slice(-4)}` : v;
  }
  if (privacy.mask_email && field === 'email') {
    const at = v.indexOf('@');
    return at > 0 ? `${v[0]}***${v.slice(at)}` : v;
  }
  if (privacy.mask_name && field === 'name') {
    return v.length > 1 ? `${v[0]}${'*'.repeat(v.length - 1)}` : v;
  }
  if (privacy.mask_company && field === 'company') return '[公司已隐藏]';
  if (privacy.mask_salary && field === 'salary') return '[薪资已隐藏]';
  if (privacy.mask_github && field === 'github') return '[GitHub已隐藏]';
  return v;
}

/** 日期排序键：present/至今 → 大值，YYYY-MM → 数值，无法解析 → null（排最后） */
export function dateSortKey(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (s.toLowerCase() === 'present' || s === '至今') return 999999;
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

/** 取条目的时间排序键：start → end → date 回退（兼容 fields 嵌套结构） */
function pickTimeKey(item) {
  for (const tf of ['start', 'end', 'date']) {
    const v = item[tf] ?? item.fields?.[tf];
    if (v != null && v !== '') {
      const k = dateSortKey(v);
      if (k !== null) return k;
    }
  }
  return null;
}

/** 按时间排序：asc/desc，缺失时间项恒排最后 */
export function sortEntities(items, orderDir = 'desc') {
  const dir = orderDir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const aKey = pickTimeKey(a);
    const bKey = pickTimeKey(b);
    if (aKey === null && bKey === null) return 0;
    if (aKey === null) return 1;
    if (bKey === null) return -1;
    return (aKey - bKey) * dir;
  });
}

/** 解析 section 展示字段：section.fields 或兜底；project 强制补 responsibilities/tech_stack（插在 description 后） */
export function getSectionFields(section, moduleType) {
  const base = section?.fields?.length ? [...section.fields] : [...(FALLBACK_FIELDS[moduleType] || [])];
  const fields = base.filter(Boolean);
  if (moduleType === 'project') {
    if (!fields.includes('responsibilities')) {
      const di = fields.indexOf('description');
      fields.splice(di >= 0 ? di + 1 : fields.length, 0, 'responsibilities');
    }
    if (!fields.includes('tech_stack')) {
      const ri = fields.indexOf('responsibilities');
      fields.splice(ri >= 0 ? ri + 1 : fields.length, 0, 'tech_stack');
    }
  }
  return fields;
}

/** 应用隐藏配置：items 按 _path/path 排除，fields 从条目删除；不修改原数组 */
export function applyHide(items, hideConfig, module) {
  if (!Array.isArray(hideConfig)) return items;
  const entries = hideConfig.filter((h) => h && h.module === module);
  const hiddenPaths = new Set(
    entries.flatMap((e) => (Array.isArray(e.items) ? e.items.map(String) : [])),
  );
  const hiddenFields = new Set(
    entries.flatMap((e) => (Array.isArray(e.fields) ? e.fields.map(String) : [])),
  );
  let result = items.filter((item) => !hiddenPaths.has(String(item._path ?? item.path ?? '')));
  if (hiddenFields.size > 0) {
    result = result.map((item) => {
      const copy = { ...item };
      for (const f of hiddenFields) delete copy[f];
      return copy;
    });
  }
  return result;
}

/** 按字段分组：key 取条目字段或 fields 嵌套，缺省归「其他」 */
export function groupByItems(items, keyField) {
  const groups = {};
  for (const item of items) {
    const key = String(item[keyField] ?? item.fields?.[keyField] ?? '其他');
    (groups[key] = groups[key] || []).push(item);
  }
  return Object.entries(groups).map(([key, groupItems]) => ({ key, items: groupItems }));
}

/** 对条目对象逐字段应用脱敏（跳过 _ 开头元字段），返回新对象 */
export function maskItemFields(item, privacy) {
  const masked = { ...item };
  for (const [k, v] of Object.entries(masked)) {
    if (k.startsWith('_')) continue;
    masked[k] = maskValue(v, k, privacy);
  }
  return masked;
}
