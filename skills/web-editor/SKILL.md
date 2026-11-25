---
name: web-editor
description: 打开 Career Wiki 简历编辑器，编辑或导出简历，应用模板和隐私设置，或查看 Wiki 图谱。通过本地工作区启动脚本打开同一个数据目录。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [web-editor, career-wiki-skill, frontend, react, resume, graph]
    related_skills: [resume-generator, wiki-engine]
    tickets: [F07]
---

# Web 编辑器 Skill（Career-Wiki-Skill）

## 概述

Career-Wiki-Skill 的前端 React 应用，包含两个页面：

1. **简历编辑器**。使用章节大纲、A4 实时预览和字段编辑区。
2. **Wiki 图谱** — vis-network 渲染实体关系图，点击节点查看详情，缺口分析

**核心理念：** React 页面只渲染快照并 dispatch 用户意图。`Resume Editing Session` 负责草稿、保存、切换、新建、复制、删除和异步润色合并事务；`Resume Projection` 负责所有展示规则。数据通过 resume-generator 获取，编辑覆盖和润色结果只存简历配置 JSON，不回写 Wiki。

## 何时触发

- 用户说"打开编辑器" / "启动前端" / "npm run dev" → 运行工作区启动脚本
- 用户说"看看简历预览" → 打开简历编辑器页面
- 用户说"查看知识图谱" / "看看 wiki 图谱" → 打开图谱页面
- 用户说"导出简历" → 打开「导出」，在导出面板选择 PDF / HTML / JSON、文件名与保存位置
- 用户说"新建/复制/删除简历""切换简历" → 顶栏「简历」下拉 + 操作按钮，调 resumes API
- 用户说"从当前简历隐藏项目" / "不在这份简历显示项目" → 当前简历的 `hide.items`；只影响当前简历，不删除 Wiki 实体
- 用户说"复制/删除模板" → 顶栏模板下拉 + 操作按钮，调 templates API
- 用户说"预览脱敏效果""隐藏敏感信息" → 隐私预览 6 个开关实时生效
- 用户说"润色简历""优化项目描述" → 用户在顶栏选择 OpenAI-compatible 或 Anthropic Messages 协议，再配置 Base URL、API Key、模型和润色内容；API Key 由本地 API 保存到用户目录，浏览器不持久化；前端调用 `/api/resume/polish` 生成并保存 `polish.entries`，只展示通过校验的结果
- 编辑器顶部「AI 润色」开关关闭时显示 Wiki 中的用户原始输入，开启时显示已生成且通过原文指纹校验的润色结果；没有润色结果时仍显示原文

**不用于：** 生成简历数据（用 resume-generator）；采访与 Wiki 编译（用 interview / wiki-engine）。模板管理、多简历管理、隐私脱敏已并入本前端，不再作为独立 skill。

## 打开工作区

在完整包的根目录运行：

```bash
node skills/env-init/scripts/launch.mjs
```

只在用户明确指定数据目录时传 `--root <path>`。如果启动失败，报告实际错误和数据目录。不要另起指向默认目录的服务。空工作区可回到 Agent 明确请求「导入这份简历到 Career Wiki」或「开始采访」。编译完成后，在编辑器刷新 Wiki 数据。不把普通文件读取当成导入。

## 编辑和导出

1. 在章节大纲选择、排列和定位内容。移除章节或隐藏条目只改变当前简历。
2. 点击纸面内容，在字段编辑区修改或恢复继承内容。编辑不回写 Wiki。
3. 根据保存状态区分当前草稿和已保存简历。切换模板只改变当前简历的布局。
4. 从「导出」选择 PDF、HTML 或 JSON。导出以当前预览和隐私设置为准，不另加一次对话确认。本地导出不代表已授权对外发送。

隐私设置只遮蔽指定字段，不匿名化自由文本。分享前核对预览中的内容。AI 润色独立于预览遮蔽。只在用户选择 Provider 并要求润色后向该 Provider 发送上下文。

## Wiki 图谱页面

### 功能

- **vis-network 渲染** — 所有 wiki 实体作为节点，关系作为边，力导向布局
- **节点着色** — 10 种实体类型各有颜色（person 红/experience 蓝/project 绿/skill 橙...）
- **点击节点** — 右侧侧栏显示实体详情（字段/关系/置信度/来源）
- **缺口分析** — 勾选"高亮缺口"后，未出现在任何简历中的技能/项目 + 孤立实体标记为红色菱形
- **图例** — 左下角显示实体类型颜色对照

### 缺口分析逻辑

前端自己计算（不需要后端接口）：

1. 遍历所有简历配置的 `emphasize` 字段，收集已使用的技能名和项目名
2. 遍历 wiki 中所有 skill/project 实体，不在已使用集合中的标记为"未使用"
3. 遍历 wiki 所有实体，不在任何关系中的（person 除外）标记为"孤立"

## API 调用

前端通过 `src/api/client.ts` 调用 resume-generator API server：

| 方法 | 接口 | 用途 |
|------|------|------|
| GET | `/api/wiki` | 获取整个 wiki 快照（所有实体 + 关系） |
| GET | `/api/wiki/:entity/:id` | 获取单个实体详情 |
| GET | `/api/resumes` | 获取所有简历配置 |
| GET | `/api/templates` | 获取所有模板 |
| GET | `/api/resume/polish-provider` | 获取不含 API Key 的本地 Provider 状态 |
| POST | `/api/resume/polish-provider` | 将 Provider 保存到本机用户目录 |
| POST | `/api/resume/polish-context` | 提供 Agent 润色所需的原始事实和用户口吻样本 |
| POST | `/api/resume/polish` | 生成当前简历的 AI 润色结果 |
| POST | `/api/resume/polish-models` | 拉取用户配置 provider 的模型列表 |
| POST | `/api/resume/save` | 保存简历配置 |
| PUT | `/api/wiki/refresh` | 返回 Agent 编译提示，不直接编译 |
| GET | `/api/health` | 健康检查 |

## Resume Projection

`src/resume/projection.ts` 的 `projectResume({ wiki, config, template })` 是简历展示规则的唯一接口。固定顺序为：选择模块 → 应用有效润色 → 手动覆盖 → 隐藏条目/字段 → 排序/强调 → 隐私 → 分组。预览、HTML、PDF 和分享 JSON 都从同一份投影生成。

脱敏在 Resume Projection 中执行：

| 字段 | 规则 | 示例 |
|------|------|------|
| 姓名 | 保留首字 + `**` | 王二 → 王* |
| 电话 | 前 3 后 4，中间掩码 | 13812345678 → 138****5678 |
| 邮箱 | 首字母 + `***` + 域名 | wang@example.com → w***@example.com |

用户在顶栏勾选脱敏开关，预览实时更新。导出时用同一份脱敏配置。

## Resume Editing Session

`src/resume/editingSession.ts` 的 `getSnapshot / subscribe / dispatch` 是简历编辑事务的唯一接口。React 页面通过命令表达修改、保存、切换、新建、复制、删除和生成润色；会话负责串行保存、失败保留草稿、破坏性操作保护，以及异步润色返回时合并请求期间的最新用户修改。

## 构建产物

```bash
npm run build    # 输出到 dist/
```

这个编辑器为本机工作区设计。浏览器通过同源 `/api` 代理连接本地服务。

## 跨 Agent 一致性

- 假设 Agent 有终端执行能力（运行本地启动脚本）
- 前端不直接读写文件系统，所有数据通过 API server
- 类型定义（`src/types/index.ts`）跟 wiki-engine schema / 模板 JSON / 简历配置 JSON 格式对齐
- Vite proxy 配置确保开发时前后端分离运行

## Common Pitfalls

1. **API server 没启动。** 运行工作区启动脚本，不要仅执行前端开发命令。

2. **每次启动都重新安装依赖。** 启动脚本检查当前依赖。不要为同一工作区反复手动安装。

3. **把删除编辑器模块当成删除 Wiki 实体。** 编辑区的删除只移除当前简历模块；项目仍会从 Wiki 读取。删除知识库实体必须使用 wiki-engine 的删除清单和全量 compile 流程。

4. **vis-network 动态导入。** `GraphCanvas.tsx` 用 `import('vis-network/standalone')` 动态加载，避免首屏加载 vis-network 的重量级代码。如果看到图谱不渲染，检查浏览器控制台是否有动态 import 错误。

5. **dnd-kit 拖拽需同时有 Sortable + Droppable。** 编辑区是 Droppable，模块卡片通过 `SortableContext` 支持排序；模块添加和移除通过「添加模块」选择器完成。

6. **PDF 生成范围。** 前端只提交 `.print-area` 的 HTML 和当前文档 CSS；本地 API 用 Chromium 的 screen media 与 A4 页面尺寸生成 PDF。不要把预览工具栏或缩放容器交给导出器。

7. **覆盖不回写 wiki。** 编辑区运行时按 Wiki 路径保存条目级 `overrides`，持久化时写入当前简历配置的 `content_overrides`，不修改 wiki 源数据。展示优先级是“手动覆盖 > 有效 AI 润色 > Wiki 原文”——改简历只改当前简历视角。

8. **预览与 HTML 样式分叉。** HTML 导出必须从当前文档样式表收集 CSS，并复用 `.print-area` 的同一渲染树；不要另写一套导出模板。

9. **TypeScript 严格模式。** `tsconfig.json` 开了 strict。API 返回的 `fields: Record<string, unknown>` 需要类型断言才能访问具体字段。不要用 `any` 绕过——用类型守卫或断言。

## Verification Checklist

- [ ] `npm install` 成功安装所有依赖
- [ ] 依赖已存在时未重复执行 `npm install`
- [ ] `npm run dev` 运行工作区启动脚本，`http://localhost:5173` 可访问
- [ ] `npm run build` 成功构建到 `dist/`
- [ ] API server 未启动时前端显示错误提示（不白屏）
- [ ] 编排区「添加模块」可多选并加入模块
- [ ] 编辑区内模块可拖拽排序
- [ ] 模块可展开/折叠/编辑/删除
- [ ] 编辑条目字段后右侧预览立即变化，保存并重新打开后仍能恢复
- [ ] 手动字段覆盖仅写入当前简历的 `content_overrides`，Wiki 原文件内容不变
- [ ] 模块子项可隐藏/恢复，计数与预览实时同步，保存后可恢复状态
- [ ] 右侧预览按选中模板渲染
- [ ] 模板切换实时更新预览
- [ ] 脱敏开关实时影响预览
- [ ] AI 润色开关关闭时显示原始用户输入，开启时显示已校验的润色结果
- [ ] AI 润色开关状态保存到当前简历配置，重新打开后恢复
- [ ] 当前简历选中的润色字段与 Wiki `source_hash` 匹配时，项目描述/个人优势/岗位职责在预览和导出中一致生效
- [ ] 已生成的润色字段旁可点击「换一换」，且只重新生成当前条目的当前字段
- [ ] Wiki 原文变化后，旧润色不会继续覆盖原文
- [ ] 导出 PDF 直接下载有效 `.pdf` 文件，且不调用打印对话框
- [ ] 导出 HTML 下载文件可打开
- [ ] HTML/PDF 与预览使用同一渲染树和过滤结果
- [ ] 图谱页面渲染 vis-network 图
- [ ] 点击图谱节点显示详情
- [ ] 缺口分析高亮未使用技能/项目
