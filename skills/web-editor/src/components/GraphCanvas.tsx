/**
 * GraphCanvas — Wiki 图谱画布
 *
 * 用 vis-network 渲染实体关系图。
 * 点击节点查看详情。
 */

import { useEffect, useRef, useState } from 'react';
import type { Network, Node, Edge } from 'vis-network/standalone';
import type {
  WikiSnapshot,
  WikiEntity,
  GraphNode,
  GraphEdge,
  GapAnalysis,
} from '../types';
import { ENTITY_COLORS, ENTITY_LABELS } from '../types';
import { getReadableGraphTextColor } from '../graph/colors';
import UiIcon from './UiIcon';

interface GraphCanvasProps {
  wiki: WikiSnapshot | null;
  gapAnalysis: GapAnalysis | null;
  selectedNode: WikiEntity | null;
  onSelectNode: (entity: WikiEntity | null) => void;
}

/** 把 wiki 快照转成 vis-network 的 nodes + edges */
function buildGraph(wiki: WikiSnapshot): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = wiki.entities.map((e) => {
    const name =
      String(e.fields.name || e.fields.company || e.fields.title || e.path.split('/').pop() || e.entity);
    return {
      id: e.path,
      label: name,
      group: e.entity,
      title: `${ENTITY_LABELS[e.entity]}: ${name}`,
    };
  });

  const edges: GraphEdge[] = wiki.allRelations.map((r, i) => ({
    from: r.from,
    to: r.to,
    label: r.type.replace(/_/g, ' '),
    id: `edge-${i}`,
  }));

  return { nodes, edges };
}

export default function GraphCanvas({
  wiki,
  gapAnalysis,
  selectedNode,
  onSelectNode,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [showGaps, setShowGaps] = useState(false);

  // 初始化/更新图谱
  useEffect(() => {
    if (!containerRef.current || !wiki) return;

    // 动态导入 vis-network（避免 SSR 问题 + 按需加载）
    import('vis-network/standalone').then(({ Network, DataSet }) => {
      const { nodes: graphNodes, edges: graphEdges } = buildGraph(wiki);

      // 高亮缺口节点
      const gapPaths = new Set<string>();
      if (gapAnalysis && showGaps) {
        gapAnalysis.unusedSkills.forEach((e) => gapPaths.add(e.path));
        gapAnalysis.unusedProjects.forEach((e) => gapPaths.add(e.path));
        gapAnalysis.isolatedEntities.forEach((e) => gapPaths.add(e.path));
      }

      const visNodes = new DataSet<Node>(
        graphNodes.map((n) => ({
          ...n,
          color: {
            background: gapPaths.has(n.id)
              ? '#ff6b6b'
              : ENTITY_COLORS[n.group as keyof typeof ENTITY_COLORS],
            border: gapPaths.has(n.id) ? '#c0392b' : '#2c3e50',
          },
          font: {
            color: '#172033',
            size: 14,
            face: 'system-ui, PingFang SC, Microsoft YaHei, sans-serif',
            background: 'rgba(248, 250, 252, 0.92)',
            strokeWidth: 2,
            strokeColor: '#f8fafc',
          },
          shape: gapPaths.has(n.id) ? 'diamond' : 'dot',
          size: gapPaths.has(n.id) ? 20 : 15,
        })),
      );

      const visEdges = new DataSet<Edge>(
        graphEdges.map((e) => ({
          ...e,
          arrows: 'to',
          color: { color: '#94a3b8', highlight: '#2563eb' },
          font: {
            size: 11,
            color: '#475569',
            background: 'rgba(248, 250, 252, 0.9)',
            strokeWidth: 2,
            strokeColor: '#f8fafc',
          },
        })),
      );

      if (networkRef.current) {
        networkRef.current.destroy();
      }

      networkRef.current = new Network(
        containerRef.current!,
        { nodes: visNodes, edges: visEdges },
        {
          layout: { improvedLayout: true, hierarchical: false },
          physics: {
            barnesHut: {
              gravitationalConstant: -3000,
              springLength: 120,
              springConstant: 0.04,
            },
            stabilization: { iterations: 100 },
          },
          interaction: {
            hover: true,
            tooltipDelay: 200,
            zoomView: true,
            dragView: true,
          },
          nodes: { borderWidth: 2 },
          edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.5 } },
        },
      );

      networkRef.current.on('click', (params: { nodes: string[] }) => {
        if (params.nodes.length > 0) {
          const entity = wiki.entities.find((e) => e.path === params.nodes[0]);
          onSelectNode(entity || null);
        } else {
          onSelectNode(null);
        }
      });
    });

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [wiki, gapAnalysis, showGaps, onSelectNode]);

  // 图例
  const legend = Object.entries(ENTITY_COLORS);

  return (
    <div className="h-full flex">
      {/* 图谱画布 */}
      <div className="flex-1 relative bg-ink-50">
        <div ref={containerRef} className="w-full h-full" />
        <div className="graph-canvas-actions no-print">
          <label className="graph-toggle">
            <input
              type="checkbox"
              checked={showGaps}
              onChange={(e) => setShowGaps(e.target.checked)}
              className="rounded text-brand-500 focus:ring-brand-300"
            />
            高亮缺口
          </label>
        </div>
        {/* 图例 */}
        <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg shadow p-3 text-ink-800 no-print">
          <div className="text-xs font-semibold text-ink-800 mb-2">实体类型</div>
          <div className="space-y-1">
            {legend.map(([type, color]) => (
              <div key={type} className="flex items-center gap-2 text-xs text-ink-800">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: color }}
                />
                {ENTITY_LABELS[type as keyof typeof ENTITY_LABELS]}
              </div>
            ))}
            {showGaps && (
              <div className="flex items-center gap-2 text-xs text-ink-800 pt-1 border-t border-ink-200 mt-1">
                <span className="w-3 h-3 rotate-45 bg-red-400" />
                缺口/孤立
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 节点详情侧栏 */}
      {selectedNode && (
        <div className="w-80 border-l border-ink-200 bg-white overflow-y-auto p-4 no-print">
          <div className="flex items-center justify-between mb-3">
            <span
              className="px-2 py-0.5 rounded text-xs font-semibold"
              style={{
                background: ENTITY_COLORS[selectedNode.entity],
                color: getReadableGraphTextColor(ENTITY_COLORS[selectedNode.entity]),
              }}
            >
              {ENTITY_LABELS[selectedNode.entity]}
            </span>
            <button
              onClick={() => onSelectNode(null)}
              className="icon-button"
              title="关闭详情"
              aria-label="关闭节点详情"
            >
              <UiIcon name="close" size={17} />
            </button>
          </div>
          <NodeDetail entity={selectedNode} />
        </div>
      )}
    </div>
  );
}

/** 节点详情面板 */
function NodeDetail({ entity }: { entity: WikiEntity }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold text-ink-700 mb-1">字段</div>
        <div className="space-y-1">
          {Object.entries(entity.fields).map(([k, v]) => (
            <div key={k} className="text-sm flex gap-2">
              <span className="text-ink-600 w-20 shrink-0">{k}:</span>
              <span className="text-ink-900">{String(v || '')}</span>
            </div>
          ))}
        </div>
      </div>

      {entity.relations.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-ink-700 mb-1">关系</div>
          <div className="space-y-1">
            {entity.relations.map((r, i) => (
              <div key={i} className="text-xs text-ink-700">
                <span className="text-brand-700 font-medium">{r.type}</span> →{' '}
                {r.target}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-ink-700 mb-1">置信度</div>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            entity.confidence === 'verified'
              ? 'bg-green-100 text-green-700'
              : entity.confidence === 'extracted'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-orange-100 text-orange-700'
          }`}
        >
          {entity.confidence}
        </span>
      </div>

      <div>
        <div className="text-xs font-semibold text-ink-700 mb-1">来源</div>
        <div className="space-y-1">
          {entity.sources.map((s, i) => (
            <div key={i} className="text-xs text-ink-700 truncate">
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
