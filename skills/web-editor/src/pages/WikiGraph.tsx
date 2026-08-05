/**
 * WikiGraph — Wiki 图谱页面
 *
 * vis-network 渲染实体关系图。
 * 点击节点查看详情。
 * 缺口分析：标记未出现在任何简历中的技能/项目。
 */

import { useState, useMemo } from 'react';
import GraphCanvas from '../components/GraphCanvas';
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
    <div className="h-full flex flex-col">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-ink-200 bg-white no-print">
        <span className="text-sm font-semibold text-ink-900">Wiki 知识图谱</span>
        {wiki && (
          <span className="text-xs text-ink-600">
            {wiki.entities.length} 个实体 · {wiki.allRelations.length} 条关系
          </span>
        )}
        <div className="flex-1" />
        {gapStats && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-orange-800 font-medium">
              未用技能: {gapStats.unusedSkills}
            </span>
            <span className="text-orange-800 font-medium">
              未用项目: {gapStats.unusedProjects}
            </span>
            <span className="text-red-700 font-medium">
              孤立实体: {gapStats.isolated}
            </span>
          </div>
        )}
        <button
          onClick={onRefreshWiki}
          className="text-xs px-2 py-1 rounded text-ink-700 hover:text-ink-900 hover:bg-ink-100"
          title="重新编译 wiki"
        >
          ↻ 刷新
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
          <div className="h-full flex items-center justify-center text-ink-600">
            <div className="text-center">
              <div className="text-4xl mb-2">🕸️</div>
              <div className="text-sm">加载 wiki 数据中...</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
