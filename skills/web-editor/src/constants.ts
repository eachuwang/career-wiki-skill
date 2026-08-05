/**
 * Career-Wiki-Skill 运行时常量（实体元数据 / 模块库 / 图谱配色）。
 *
 * 从 types/index.ts 抽出（候选 G）：types 层回归纯类型定义，
 * 运行时常量归 constants，避免「类型文件带运行时副作用」混层。
 */

import type { EntityType, ModuleDef } from './types';

// ---------- 可拖拽模块库（10 个模块） ----------

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
