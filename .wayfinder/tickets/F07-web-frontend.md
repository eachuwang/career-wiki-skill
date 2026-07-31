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

已确认。F07 决议：

**技术栈：** React 18 + Vite + dnd-kit + Tailwind CSS

**图表库：** B — vis-network（开箱即用，拖拽/缩放/点击/高亮自带）

**两个页面：** 简历编辑器 + Wiki 图谱，共用组件和数据层

**简历编辑器交互流程：**
- 左侧模块库（可拖拽）：个人信息/工作经历/项目经验/技能/教育/证书/获奖/发表/活动/个人优势 + 脱敏设置
- 中间编辑区（接收拖入+排序）：每个模块从 wiki 拉取默认值，用户可编辑覆盖（覆盖不回写 wiki，只存在简历配置里），可展开/折叠/删除，↑↓拖拽排序
- 右侧实时预览：按选中模板实时渲染，支持模板切换和缩放

**Wiki 图谱页面：**
- vis-network 渲染实体关系图（person/experience/project/skill/... 节点 + 连线）
- 点击节点查看详情
- 缺口分析：标记未出现在任何简历中的技能/项目

**隐私脱敏：** Web 预览时实时脱敏（Q16 选 C），用户勾选字段，实时看效果

**导出：** 前端按模板渲染 HTML → 浏览器 print 导出 PDF / HTML 直接保存 / JSON 从 API server 拿

**源码分发：** A — 源码放 skill 目录，用户 npm install + npm run dev

**Skill 形式：** SKILL.md + React 前端项目
