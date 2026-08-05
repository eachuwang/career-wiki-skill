/**
 * WikiGraph — Wiki 图谱页面
 *
 * vis-network 渲染实体关系图。
 * 点击节点查看详情。
 * 缺口分析：标记未出现在任何简历中的技能/项目。
 */

import { useState, useMemo } from 'react';
import GraphCanvas from '../components/GraphCanvas';
import UiIcon from '../components/UiIcon';
import type { WikiSnapshot, WikiEntity, ResumeConfig, GapAnalysis } from '../types';
import * as api from '../api/client';

interface WikiGraphProps {
  wiki: WikiSnapshot | null;
  resumes: ResumeConfig[];
  onRefreshWiki: () => void;
}

export default function WikiGraph({ wiki, resumes, onRefreshWiki }: WikiGraphProps) {
  const [selectedNode, setSelectedNode] = useState<WikiEntity | null>(null);

  // 缺口分析
  const gapAnalysis: GapAnalysis | null = useMemo(() => {
    if (!wiki) return null;
    return api.analyzeGaps(wiki, resumes);
  }, [wiki, resumes]);

  // 缺口统计
  const gapStats = useMemo(() => {
    if (!gapAnalysis) return null;
    return {
      unusedSkills: gapAnalysis.unusedSkills.length,
      unusedProjects: gapAnalysis.unusedProjects.length,
      isolated: gapAnalysis.isolatedEntities.length,
    };
  }, [gapAnalysis]);

  return (
    <div className="h-full flex flex-col bg-ink-50">
      {/* 图谱页工具栏，与编辑器保持同一视觉层级 */}
      <div className="graph-toolbar no-print">
        <span className="graph-title">Wiki 知识图谱</span>
        {wiki && (
          <span className="graph-meta">
            {wiki.entities.length} 个实体 · {wiki.allRelations.length} 条关系
          </span>
        )}
        <div className="graph-toolbar-spacer" />
        {gapStats && (
          <div className="flex items-center gap-2">
            <span className="graph-badge warn">未用技能 {gapStats.unusedSkills}</span>
            <span className="graph-badge warn">未用项目 {gapStats.unusedProjects}</span>
            <span className="graph-badge danger">孤立实体 {gapStats.isolated}</span>
          </div>
        )}
        <button
          onClick={onRefreshWiki}
          className="toolbar-icon-button"
          title="重新编译 Wiki"
          aria-label="重新编译 Wiki"
        >
          <UiIcon name="refresh" size={17} />
        </button>
      </div>

      {/* 图谱画布 */}
      <div className="flex-1 overflow-hidden">
        {wiki ? (
          <GraphCanvas
            wiki={wiki}
            gapAnalysis={gapAnalysis}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-ink-500">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
                <UiIcon name="graph" size={24} />
              </div>
              <div className="text-sm">正在加载图谱数据...</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
