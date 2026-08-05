/**
 * useTemplates — 模板管理领域 hook
 *
 * 收敛 ResumeEditor 中的模板 CRUD（复制 / 删除 / 切换 / 刷新列表）。
 */

import { useState, useEffect, useCallback } from 'react';
import type { TemplateConfig } from '../types';
import * as api from '../api/client';

interface UseTemplatesParams {
  initialTemplates: TemplateConfig[];
}

export function useTemplates({ initialTemplates }: UseTemplatesParams) {
  const [templateList, setTemplateList] = useState<TemplateConfig[]>(initialTemplates);
  const [templateId, setTemplateId] = useState('');

  // App 刷新数据时同步本地模板列表
  useEffect(() => {
    setTemplateList(initialTemplates);
  }, [initialTemplates]);

  // 默认模板（仅在没有简历配置时兜底）
  useEffect(() => {
    if (initialTemplates.length > 0 && !templateId) {
      setTemplateId(initialTemplates[0].id);
    }
  }, [initialTemplates, templateId]);

  const handleDuplicateTemplate = useCallback(async () => {
    const source = templateList.find((t) => t.id === templateId);
    if (!source) return;
    const newId = `${source.id}-copy`;
    const copy: TemplateConfig = {
      ...source,
      id: newId,
      name: `${source.name} 副本`,
    };
    try {
      const css = await api.getTemplateCss(source.id);
      await api.saveTemplate(copy, css);
      const fresh = await api.getTemplates();
      setTemplateList(fresh);
      setTemplateId(newId);
    } catch (e) {
      alert(`复制模板失败: ${e instanceof Error ? e.message : e}`);
    }
  }, [templateList, templateId]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!templateId || templateList.length <= 1) return;
    const target = templateList.find((t) => t.id === templateId);
    if (!target) return;
    if (!window.confirm(`确定删除模板「${target.name}」？`)) return;
    try {
      await api.deleteTemplate(target.id);
      const fresh = await api.getTemplates();
      setTemplateList(fresh);
      setTemplateId(fresh[0]?.id || '');
    } catch (e) {
      alert(`删除模板失败: ${e instanceof Error ? e.message : e}`);
    }
  }, [templateId, templateList]);

  const currentTemplate =
    templateList.find((t) => t.id === templateId) || null;

  return {
    templateList,
    templateId,
    setTemplateId,
    currentTemplate,
    handleDuplicateTemplate,
    handleDeleteTemplate,
  };
}
