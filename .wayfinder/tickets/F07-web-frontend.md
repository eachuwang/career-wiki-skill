---
id: F07
type: grilling
status: open
assignee:
blocked-by: ["F06", "F08", "F09", "F10"]
created: 2026-07-31
title: Web 编辑前端（React 架构/拖拽/实时预览/脱敏/图谱页面）
---

## Question

Web 前端的完整设计：

1. **架构**：React 18 + Vite + dnd-kit + Tailwind，源码随 skill 包分发
2. **两个页面**：简历编辑器 + Wiki 可视化图谱，共用组件和数据层
3. **简历编辑器交互**：左侧拖拽模块库 → 中间编辑 → 右侧实时预览
4. **Wiki 图谱**：D3.js/vis-network 渲染实体关系图，缺口分析
5. **实时脱敏**：预览时勾选字段脱敏
6. **导出**：前端调 API server 的 export 接口
7. **状态管理**：React state / context
8. **组件拆分**：模块卡片/编辑面板/预览面板/图谱画布

## Notes

- 用户在 Q18 选 A（源码放 skill 目录，npm install + npm run dev）
- 用户在 Q5 的 Web 编辑问题里确认：两个前端合并为一个项目两个页面
- 隐私脱敏在 Web 预览时实时做（Q16 选 C）
- 图谱页面用 D3.js / vis-network / cytoscape

## Resolution

待用户确认
