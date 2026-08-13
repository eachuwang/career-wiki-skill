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

export type TrustTier = 'unverified' | 'machine-confirmed' | 'human-reviewed';

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

/** 从标准 Markdown 链接上下文派生的关系。 */
export interface Relation {
  type: RelationType;
  target: string; // 相对 OKF bundle 根的路径，如 skills/go.md
}

/** 正文中的标准 Markdown concept link。 */
export interface WikiLink {
  target: string; // skills/go.md
  name: string; // 显示名 "Go"
  type: RelationType;
}

/** Wiki 实体——通用结构，fields 是各实体类型的 frontmatter 字段 */
export interface WikiEntity {
  path: string; // experiences/bytedance-2023.md
  entity: EntityType;
  title: string;
  trustTier: TrustTier;
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

export type ResumePolishField = 'description' | 'responsibilities' | 'content';

/** Agent 为当前简历生成的轻量润色缓存，不回写 Wiki。 */
export interface ResumePolishEntry {
  source_hash: string;
  fields: Partial<Record<ResumePolishField, string>>;
  updated_at?: string;
}

export interface ResumePolishConfig {
  enabled?: boolean;
  /** 用户选择要生成的内容字段；缺失时兼容旧配置，默认生成全部支持的字段。 */
  selected_fields?: ResumePolishField[];
  entries?: Record<string, ResumePolishEntry>;
}

/** 当前简历对 Wiki 条目字段的展示覆盖；key 为 Wiki 相对路径，不回写 Wiki。 */
export type ResumeContentOverrides = Record<string, Record<string, unknown>>;

/** 用户在浏览器中配置的模型协议。请求与响应解析必须使用同一协议。 */
export type ResumePolishProtocol = 'openai' | 'anthropic';

/** 用户在浏览器中配置的模型连接信息；不会写入简历 JSON。 */
export interface ResumePolishProviderConfig {
  protocol: ResumePolishProtocol;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms: number;
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
  polish?: ResumePolishConfig;
  content_overrides?: ResumeContentOverrides;
  notes?: string;
}

// ---------- 简历模块定义（按需添加） ----------

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
  overrides: ResumeContentOverrides;
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

// ---------- 可添加模块（10 个模块） ----------

export const MODULE_LIBRARY: ModuleDef[] = [
  { type: 'person', label: '个人信息', description: '姓名、职位、联系方式' },
  { type: 'experience', label: '工作经历', description: '公司、职位、起止时间' },
  { type: 'project', label: '项目经验', description: '项目名、角色、描述、岗位职责' },
  { type: 'skill', label: '技能', description: '技能名、分类、熟练度' },
  { type: 'education', label: '教育背景', description: '学校、学历、专业' },
  { type: 'certificate', label: '证书', description: '证书名、机构、日期' },
  { type: 'award', label: '获奖', description: '奖项名、机构、日期' },
  { type: 'publication', label: '发表', description: '文章标题、刊物、日期' },
  { type: 'activity', label: '活动', description: '开源/社区活动' },
  { type: 'summary', label: '个人优势', description: '个人优势总结' },
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
  activity: '#c2185b',
  summary: '#526875',
};
