/**
 * 缺口分析 — 标记未出现在任何简历中的技能/项目 + 孤立实体。
 *
 * 纯前端计算，不调后端接口。从 api/client.ts 抽出（候选 G）：
 * client.ts 回归纯 HTTP 封装，业务分析逻辑归本模块，可脱离 client 单测。
 */

import type { WikiSnapshot, ResumeConfig, GapAnalysis } from '../types';

/**
 * 缺口分析：标记未出现在任何简历中的技能/项目 + 孤立实体。
 * 前端自己算，不需要后端接口。
 */
export function analyzeGaps(
  wiki: WikiSnapshot,
  resumes: ResumeConfig[],
): GapAnalysis {
  // 收集所有简历中出现的技能名和项目名
  const usedSkillNames = new Set<string>();
  const usedProjectNames = new Set<string>();

  for (const resume of resumes) {
    for (const emp of resume.emphasize || []) {
      if (emp.module === 'skill') {
        emp.items.forEach((i) => usedSkillNames.add(i));
      }
      if (emp.module === 'project') {
        emp.items.forEach((i) => usedProjectNames.add(i));
      }
    }
  }

  const allSkills = wiki.entities.filter((e) => e.entity === 'skill');
  const allProjects = wiki.entities.filter((e) => e.entity === 'project');

  const unusedSkills = allSkills.filter((e) => {
    const name = String(e.fields.name || '');
    return !usedSkillNames.has(name);
  });

  const unusedProjects = allProjects.filter((e) => {
    const name = String(e.fields.name || '');
    return !usedProjectNames.has(name);
  });

  // 孤立实体：没有任何关系指向或发出
  // allRelations 的 from/to 已归一化为 entity.path 的形式（带 .md 后缀）
  const connectedPaths = new Set<string>();
  for (const rel of wiki.allRelations) {
    connectedPaths.add(rel.from);
    connectedPaths.add(rel.to);
  }
  // person 是根，不算孤立
  const isolatedEntities = wiki.entities.filter(
    (e) => e.entity !== 'person' && !connectedPaths.has(e.path),
  );

  return { unusedSkills, unusedProjects, isolatedEntities };
}
