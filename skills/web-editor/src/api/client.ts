/**
 * Career-Wiki-Skill API client — 封装对 resume-generator API server 的调用。
 *
 * 开发时 Vite proxy 把 /api 代理到 http://localhost:3001。
 * 生产环境通过 VITE_API_URL 环境变量配置。
 */

import type {
  WikiSnapshot,
  WikiEntity,
  TemplateConfig,
  ResumeConfig,
  GapAnalysis,
  ResumePolishField,
  ResumePolishProviderConfig,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '';

/** 通用请求函数 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = BASE_URL + path;
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      msg = body.message || body.error || msg;
    } catch {
      // 非 JSON 响应
    }
    throw new Error(`API ${path} 失败: ${msg}`);
  }

  // 204 No Content
  if (resp.status === 204) {
    return undefined as T;
  }
  return resp.json();
}

// ---------- Wiki 数据 ----------

/** 获取整个 wiki 快照（所有实体 + 关系） */
export async function getWiki(): Promise<WikiSnapshot> {
  const data = await request<WikiSnapshot>('/api/wiki');
  // 兼容旧版 API server（不返回 allRelations）
  return { ...data, allRelations: data.allRelations ?? [] };
}

/** 获取单个实体详情 */
export async function getEntity(
  entity: string,
  id: string,
): Promise<WikiEntity> {
  return request<WikiEntity>(`/api/wiki/${entity}/${id}`);
}

// ---------- 简历配置 ----------

/** 获取所有简历配置 */
export async function getResumes(): Promise<ResumeConfig[]> {
  // API 返回 { resumes: [...], total } 信封格式
  const data = await request<{ resumes: ResumeConfig[] }>('/api/resumes');
  return data.resumes ?? [];
}

/** 获取单份简历配置 */
export async function getResume(id: string): Promise<ResumeConfig> {
  return request<ResumeConfig>(`/api/resumes/${id}`);
}

/** 保存简历配置 */
export async function saveResume(config: ResumeConfig): Promise<void> {
  await request<void>('/api/resume/save', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

/** 删除简历配置（仅删配置，不删 wiki 数据） */
export async function deleteResume(id: string): Promise<void> {
  await request<void>('/api/resume/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

// ---------- 模板 ----------

/** 获取模板 CSS 文本（用于复制模板时携带样式） */
export async function getTemplateCss(id: string): Promise<string> {
  const resp = await fetch(
    `${BASE_URL}/api/template/css?id=${encodeURIComponent(id)}`,
  );
  if (!resp.ok) throw new Error('读取模板 CSS 失败');
  return resp.text();
}

/** 保存/更新模板（可携带 CSS 文本） */
export async function saveTemplate(
  template: TemplateConfig,
  css?: string,
): Promise<void> {
  await request<void>('/api/template/save', {
    method: 'POST',
    body: JSON.stringify({ template, css }),
  });
}

/** 删除模板 */
export async function deleteTemplate(id: string): Promise<void> {
  await request<void>('/api/template/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}


/** 获取所有模板 */
export async function getTemplates(): Promise<TemplateConfig[]> {
  // API 返回 { templates: [...], total } 信封格式
  const data = await request<{ templates: TemplateConfig[] }>('/api/templates');
  return data.templates ?? [];
}

// ---------- 生成 + 导出 ----------

/** 生成结构化简历 JSON */
export async function generateResume(
  config: ResumeConfig,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/resume/generate', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

/** 获取 Agent 进行简历润色所需的原始事实和用户口吻样本。 */
export async function getResumePolishContext(
  config: ResumeConfig,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/resume/polish-context', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

/** 点击 AI 润色后生成当前简历视角的润色结果。 */
export async function polishResume(
  config: ResumeConfig,
  provider: ResumePolishProviderConfig,
  options?: { only?: { path: string; field: ResumePolishField } },
): Promise<{ config: ResumeConfig; generated_count: number; candidate_count: number }> {
  return request<{ config: ResumeConfig; generated_count: number; candidate_count: number }>(
    '/api/resume/polish',
    {
      method: 'POST',
      body: JSON.stringify({ config, provider, ...options }),
    },
  );
}

/** 从 OpenAI-compatible provider 拉取模型列表。 */
export async function getPolishModels(
  provider: ResumePolishProviderConfig,
): Promise<string[]> {
  const result = await request<{ models: string[] }>('/api/resume/polish-models', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
  return result.models ?? [];
}

/** 导出简历（json 格式直接下载，html/pdf 由前端处理） */
export async function exportResumeJson(
  config: ResumeConfig,
): Promise<Blob> {
  const resp = await fetch(BASE_URL + '/api/resume/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, format: 'json' }),
  });
  if (!resp.ok) throw new Error('导出 JSON 失败');
  return resp.blob();
}

// ---------- Wiki 编译 ----------

/** 触发 wiki 重新 compile */
export async function refreshWiki(): Promise<void> {
  await request<void>('/api/wiki/refresh', { method: 'PUT' });
}

// ---------- 缺口分析（前端计算） ----------

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

// ---------- 健康检查 ----------

export async function healthCheck(): Promise<boolean> {
  try {
    const resp = await fetch(BASE_URL + '/api/health');
    return resp.ok;
  } catch {
    return false;
  }
}
