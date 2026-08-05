/**
 * Career-Wiki-Skill 前端类型定义
 *
 * 对应 wiki-engine schema（10 实体 + 13 关系）、
 * 模板配置 JSON、多简历配置 JSON。
 * 前端通过 resume-generator API server 拿到这些数据。
 */

// ---------- Wiki 实体类型 ----------

export type EntityType =
  | 'person'
  | 'experience'
  | 'project'
  | 'skill'
  | 'education'
  | 'certificate'
  | 'award'
  | 'publication'
  | 'activity'
  | 'summary';

export type Confidence = 'verified' | 'extracted' | 'inferred';

/** 关系类型，对应 wiki-engine 的 13 种关系 */
export type RelationType =
  | 'has_experience'
  | 'has_skill'
  | 'has_education'
  | 'has_certificate'
  | 'has_award'
  | 'has_publication'
  | 'has_activity'
  | 'has_summary'
  | 'used_skill'
  | 'did_project'
  | 'at_company'
  | 'took_course'
  | 'references';

/** 一个 wiki 关系（frontmatter relations 数组项） */
export interface Relation {
  type: RelationType;
  target: string; // 相对 wiki 根的路径，如 wiki/skills/go
}

/** 正文中的 wikilink */
export interface WikiLink {
  target: string; // wiki/skills/go
  name: string; // 显示名 "Go"
}

/** Wiki 实体——通用结构，fields 是各实体类型的 frontmatter 字段 */
export interface WikiEntity {
  path: string; // wiki/experiences/bytedance-2023.md
  entity: EntityType;
  confidence: Confidence;
  sources: string[];
  fields: Record<string, unknown>;
  relations: Relation[];
  links: WikiLink[];
  content?: string; // 正文 markdown
}

/** 整个 wiki 的快照（GET /api/wiki 返回） */
export interface WikiSnapshot {
  entities: WikiEntity[];
  /** 所有关系，扁平化，供图谱使用 */
  allRelations: Array<{ from: string; to: string; type: RelationType }>;
  /** 导出时间戳 */
  exportedAt?: string;
}

// ---------- 模板配置 ----------

export type LayoutType = 'single-column' | 'double-column';

export interface TemplateSection {
  module: EntityType;
  title: string;
  fields: string[];
  order?: 'asc' | 'desc';
  group_by?: string;
  /** double-column 模板用：sidebar 或 main */
  column?: 'sidebar' | 'main';
}

export interface TemplateConfig {
  name: string;
  id: string;
  style: string; // CSS 文件名
  layout: LayoutType;
  has_photo?: boolean;
  font?: {
    family: string;
    size_base: string;
    size_h1: string;
    size_h2: string;
  };
  sections: TemplateSection[];
}

// ---------- 简历配置 ----------

export interface ResumeEmphasize {
  module: EntityType;
  items: string[];
  reason?: string;
}

export interface ResumeHide {
  module: EntityType;
  /** 隐藏整个实体时保存 Wiki 相对路径；不删除源数据。 */
  items?: string[];
  /** 兼容原有字段级隐藏配置。 */
  fields?: string[];
  reason?: string;
}

export interface PrivacyConfig {
  mask_name?: boolean;
  mask_phone?: boolean;
  mask_email?: boolean;
  /** 薪资：整段隐藏为 [薪资已隐藏] */
  mask_salary?: boolean;
  /** 公司名：整段隐藏为 [公司已隐藏] */
  mask_company?: boolean;
  /** GitHub：整段隐藏为 [GitHub已隐藏] */
  mask_github?: boolean;
  /** 自定义脱敏规则扩展 */
  custom?: unknown[];
}

export interface ResumeConfig {
  name: string;
  id: string;
  template: string;
  created: string;
  updated: string;
  target?: {
    company?: string;
    position?: string;
  };
  modules: EntityType[];
  emphasize?: ResumeEmphasize[];
  hide?: ResumeHide[];
  order?: Record<string, 'asc' | 'desc'>;
  privacy?: PrivacyConfig;
  notes?: string;
}

// ---------- 简历模块定义（左侧模块库） ----------

/** 模块库里的一个模块类型 */
export interface ModuleDef {
  type: EntityType;
  label: string; // 中文名 "个人信息"
  description: string;
}

/** 简历里已添加的模块实例（编辑区用） */
export interface ModuleInstance {
  id: string; // 唯一 ID（前端生成）
  type: EntityType;
  label: string;
  expanded: boolean;
  /** 用户覆盖的字段值（不回写 wiki，只存在简历配置里） */
  overrides: Record<string, unknown>;
  /** 该模块从 wiki 拉取的实体数据 */
  wikiData?: WikiEntity[];
  /** 当前简历中隐藏的 Wiki 子项路径 */
  hiddenItemIds: string[];
}

// ---------- 图谱相关 ----------

/** vis-network 节点 */
export interface GraphNode {
  id: string;
  label: string;
  group: EntityType; // 用实体类型做分组着色
  title?: string; // 鼠标悬停提示
}

/** vis-network 边 */
export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  title?: string;
}

/** 缺口分析结果 */
export interface GapAnalysis {
  /** 未出现在任何简历中的技能 */
  unusedSkills: WikiEntity[];
  /** 未出现在任何简历中的项目 */
  unusedProjects: WikiEntity[];
  /** 孤立实体（没有任何关系连接） */
  isolatedEntities: WikiEntity[];
}

// ---------- API 通用响应 ----------

export interface ApiError {
  error: string;
  message?: string;
}

// 运行时常量（MODULE_LIBRARY / ENTITY_LABELS / ENTITY_COLORS）已移到 src/constants.ts（候选 G）。
// 本文件回归纯类型定义，避免「类型文件带运行时副作用」混层。
