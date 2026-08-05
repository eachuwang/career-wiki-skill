/**
 * useResumes — 多简历管理领域 hook
 *
 * 收敛 ResumeEditor 中的简历 CRUD（选择 / 新建 / 复制 / 删除 / 刷新列表）。
 * 简历加载到编辑器状态的协调（设置 name / template / privacy / modules）
 * 通过 onLoadResume 回调交回编排层，保持 hook 不跨域持有状态。
 */

import { useState, useEffect, useCallback } from 'react';
import type { ResumeConfig, TemplateConfig, EntityType, ModuleInstance } from '../types';
import { MODULE_LIBRARY } from '../constants';
import * as api from '../api/client';
import { createResumeConfig } from '../resume/config';
import { DEFAULT_EDITOR_PRIVACY } from '../resume/privacy';

let moduleIdCounter = 0;
/** 生成模块实例唯一 ID（与 useModules 共享同一计数器域） */
export function genId(): string {
  moduleIdCounter++;
  return `module-${moduleIdCounter}`;
}

interface UseResumesParams {
  initialResumes: ResumeConfig[];
  templates: TemplateConfig[];
  templateId: string;
  /** 将简历配置加载到编辑器状态（设置 name/template/privacy/modules） */
  onLoadResume: (config: ResumeConfig) => void;
  /** 无简历时重置编辑器为空状态 */
  onResetEmpty: () => void;
}

export function useResumes({
  initialResumes,
  templates,
  templateId,
  onLoadResume,
  onResetEmpty,
}: UseResumesParams) {
  const [currentResumeId, setCurrentResumeId] = useState('');
  const [resumeList, setResumeList] = useState<ResumeConfig[]>(initialResumes);

  // App 刷新数据时同步本地简历列表
  useEffect(() => {
    setResumeList(initialResumes);
  }, [initialResumes]);

  // 加载第一份简历
  useEffect(() => {
    if (resumeList.length > 0 && !currentResumeId) {
      setCurrentResumeId(resumeList[0].id);
      onLoadResume(resumeList[0]);
      return;
    }
  }, [resumeList, currentResumeId, onLoadResume]);

  const refreshResumeList = useCallback(async (): Promise<ResumeConfig[]> => {
    const fresh = await api.getResumes();
    setResumeList(fresh);
    return fresh;
  }, []);

  const handleSelectResume = useCallback(
    (id: string) => {
      const config = resumeList.find((r) => r.id === id);
      if (!config || id === currentResumeId) return;
      setCurrentResumeId(id);
      onLoadResume(config);
    },
    [resumeList, currentResumeId, onLoadResume],
  );

  const handleNewResume = useCallback(async () => {
    const newId = `resume-${Date.now()}`;
    const defaultTypes: EntityType[] = [
      'person',
      'experience',
      'project',
      'skill',
      'education',
    ];
    const config = createResumeConfig({
      resumeName: `新简历 ${resumeList.length + 1}`,
      resumeId: newId,
      templateId: templateId || templates[0]?.id || '',
      privacy: DEFAULT_EDITOR_PRIVACY,
      modules: defaultTypes.map((type) => {
        const def = MODULE_LIBRARY.find((m) => m.type === type);
        return {
          id: genId(),
          type,
          label: def?.label || type,
          expanded: false,
          overrides: {},
          hiddenItemIds: [],
        } satisfies ModuleInstance;
      }),
    });
    try {
      await api.saveResume(config);
      const fresh = await refreshResumeList();
      const created = fresh.find((r) => r.id === newId);
      if (created) {
        setCurrentResumeId(created.id);
        onLoadResume(created);
      }
    } catch (e) {
      alert(`新建简历失败: ${e instanceof Error ? e.message : e}`);
    }
  }, [resumeList.length, templateId, templates, onLoadResume, refreshResumeList]);

  const handleDuplicateResume = useCallback(async () => {
    const source = resumeList.find((r) => r.id === currentResumeId);
    if (!source) return;
    const newId = `${source.id}-copy`;
    const today = new Date().toISOString().slice(0, 10);
    const copy: ResumeConfig = {
      ...source,
      id: newId,
      name: `${source.name} 副本`,
      created: today,
      updated: today,
    };
    try {
      await api.saveResume(copy);
      const fresh = await refreshResumeList();
      const created = fresh.find((r) => r.id === newId);
      if (created) {
        setCurrentResumeId(created.id);
        onLoadResume(created);
      }
    } catch (e) {
      alert(`复制简历失败: ${e instanceof Error ? e.message : e}`);
    }
  }, [resumeList, currentResumeId, onLoadResume, refreshResumeList]);

  const handleDeleteResume = useCallback(async () => {
    const target = resumeList.find((r) => r.id === currentResumeId);
    if (!target || resumeList.length <= 1) return;
    if (!window.confirm(`确定删除简历「${target.name}」？仅删除配置，wiki 数据不受影响。`))
      return;
    try {
      await api.deleteResume(target.id);
      const fresh = await refreshResumeList();
      if (fresh.length > 0) {
        setCurrentResumeId(fresh[0].id);
        onLoadResume(fresh[0]);
      } else {
        setCurrentResumeId('');
        onResetEmpty();
      }
    } catch (e) {
      alert(`删除简历失败: ${e instanceof Error ? e.message : e}`);
    }
  }, [resumeList, currentResumeId, onLoadResume, onResetEmpty, refreshResumeList]);

  return {
    currentResumeId,
    resumeList,
    refreshResumeList,
    handleSelectResume,
    handleNewResume,
    handleDuplicateResume,
    handleDeleteResume,
  };
}
