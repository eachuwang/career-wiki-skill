/**
 * Career-Wiki 前端类型定义
 *
 * 对应 wiki-engine schema（10 实体 + 13 关系）、
 * template-manager（模板 JSON）、multi-resume（简历配置 JSON）。
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

// ---------- 模板配置（template-manager） ----------

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

// ---------- 简历配置（multi-resume） ----------

export interface ResumeEmphasize {
  module: EntityType;
  items: string[];
  reason?: string;
}

export interface ResumeHide {
  module: EntityType;
  fields: string[];
  reason?: string;
}

export interface PrivacyConfig {
  mask_name?: boolean;
  mask_phone?: boolean;
  mask_email?: boolean;
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
  icon: string; // emoji 图标
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

// ---------- 可拖拽模块库（10 个模块） ----------

export const MODULE_LIBRARY: ModuleDef[] = [
  { type: 'person', label: '个人信息', icon: '👤', description: '姓名、职位、联系方式' },
  { type: 'experience', label: '工作经历', icon: '💼', description: '公司、职位、起止时间' },
  { type: 'project', label: '项目经验', icon: '📁', description: '项目名、角色、描述' },
  { type: 'skill', label: '技能', icon: '⚡', description: '技能名、分类、熟练度' },
  { type: 'education', label: '教育背景', icon: '🎓', description: '学校、学历、专业' },
  { type: 'certificate', label: '证书', icon: '📜', description: '证书名、机构、日期' },
  { type: 'award', label: '获奖', icon: '🏆', description: '奖项名、机构、日期' },
  { type: 'publication', label: '发表', icon: '📝', description: '文章标题、刊物、日期' },
  { type: 'activity', label: '活动', icon: '🌟', description: '开源/社区活动' },
  { type: 'summary', label: '个人优势', icon: '✨', description: '个人优势总结' },
];

/** 实体类型 → 中文名 */
export const ENTITY_LABELS: Record<EntityType, string> = {
  person: '个人信息',
  experience: '工作经历',
  project: '项目经验',
  skill: '技能',
  education: '教育背景',
  certificate: '证书',
  award: '获奖',
  publication: '发表',
  activity: '活动',
  summary: '个人优势',
};

/** 实体类型 → 颜色（图谱用） */
export const ENTITY_COLORS: Record<EntityType, string> = {
  person: '#e74c3c',
  experience: '#3498db',
  project: '#2ecc71',
  skill: '#f39c12',
  education: '#9b59b6',
  certificate: '#1abc9c',
  award: '#e67e22',
  publication: '#34495e',
  activity: '#e91e63',
  summary: '#607d8b',
};
