---
name: web-editor
description: 用途：Career-Wiki-Skill 前端 React 应用（简历编辑器 + Wiki 图谱），集成了模板管理、多简历管理与隐私脱敏。用户说"打开编辑器""启动前端""看看简历预览""创建模板""创建字节版简历""预览脱敏效果""查看知识图谱"时触发。源码随 skill 包分发；首次使用或依赖变更时执行 npm install，依赖已存在时直接 npm run dev。调 resume-generator 的 API server（默认 localhost:3001）拿数据。支持拖拽排序、实时预览、多简历切换/新建/复制/删除、模板复制/删除、6 字段脱敏开关、PDF/HTML/JSON 直接下载。
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

1. **简历编辑器** — 左侧拖拽模块库 → 中间编辑区（排序/编辑/删除）→ 右侧实时预览（按模板渲染）
2. **Wiki 图谱** — vis-network 渲染实体关系图，点击节点查看详情，缺口分析

**核心理念：** 前端是展示层，不做数据持久化。所有数据通过 resume-generator API server 获取，编辑覆盖只存简历配置 JSON。

## 何时触发

- 用户说"打开编辑器" / "启动前端" / "npm run dev" → 启动开发服务器
- 用户说"看看简历预览" → 打开简历编辑器页面
- 用户说"查看知识图谱" / "看看 wiki 图谱" → 打开图谱页面
- 用户说"导出 PDF" → 前端用 `html2pdf.js` 将当前 A4 预览直接下载为 PDF
- 用户说"导出 HTML" → 前端保存渲染的 HTML 到文件
- 用户说"导出 JSON" → 调 API server 的 export 接口
- 用户说"新建/复制/删除简历""切换简历" → 顶栏「简历」下拉 + 操作按钮，调 resumes API
- 用户说"从当前简历隐藏项目" / "不在这份简历显示项目" → 当前简历的 `hide.items`；只影响当前简历，不删除 Wiki 实体
- 用户说"复制/删除模板" → 顶栏模板下拉 + 操作按钮，调 templates API
- 用户说"预览脱敏效果""隐藏敏感信息" → 隐私预览 6 个开关实时生效

**不用于：** 生成简历数据（用 resume-generator）；采访与 Wiki 编译（用 interview / wiki-engine）。模板管理、多简历管理、隐私脱敏已并入本前端，不再作为独立 skill。

## 技术栈

- **React 18** + **TypeScript**
- **Vite** — 构建工具 + 开发服务器
- **dnd-kit** — 拖拽排序（模块库拖入 + 编辑区内排序）
- **Tailwind CSS** — 样式
- **vis-network** — 图谱可视化
- **html2pdf.js** — 浏览器端生成并下载 PDF

## 启动方式

```bash
cd skills/web-editor

# 仅在依赖缺失，或 package-lock.json 比 node_modules 的安装锁更新时安装
if [ ! -x node_modules/.bin/vite ] || [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install --no-audit --no-fund
fi

npm run dev          # 启动开发服务器（http://localhost:5173）
```

### 启动决策

按以下顺序执行，不要每次启动都无条件运行 `npm install`：

1. 先检查 `http://localhost:5173` 是否已经有可用的 Vite 服务；已有服务时直接告知用户编辑器已运行，不要再启动第二个进程。
2. 检查 `node_modules/.bin/vite` 是否存在且可执行；存在时复用当前依赖，直接运行 `npm run dev`。
3. 依赖目录不存在、Vite 二进制缺失，或 `package-lock.json` 比 `node_modules/.package-lock.json` 更新时，才运行 `npm install --no-audit --no-fund`。
4. 依赖安装完成后再运行 `npm run dev`，并确认 5173 端口已监听。
5. 服务停止只代表停止进程，不要因为上次服务停止就重新安装依赖。

**前提：** resume-generator 的 API server 需先启动（默认 `http://localhost:3001`）。Vite 开发服务器已配置代理，将 `/api` 请求转发到 API server。

**环境变量：**
- `VITE_API_URL` — API server 地址（默认 `http://localhost:3001`，留空走 Vite proxy）

```bash
VITE_API_URL=http://localhost:3001 npm run dev
```

## 项目结构

```
skills/web-editor/
├── SKILL.md              ← 本文件
├── package.json
├── vite.config.ts        ← Vite 配置（含 /api proxy）
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx          ← React 入口
    ├── App.tsx          ← 主入口（页面切换 + 数据加载）
    ├── index.css        ← 全局样式 + Tailwind + 打印样式
    ├── pages/
    │   ├── ResumeEditor.tsx    ← 简历编辑器页面
    │   └── WikiGraph.tsx       ← Wiki 图谱页面
    ├── components/
    │   ├── ModuleLibrary.tsx    ← 左侧可拖拽模块库
    │   ├── EditPanel.tsx        ← 中间编辑区（拖拽排序/编辑/删除）
    │   ├── PreviewPanel.tsx     ← 右侧实时预览（按模板渲染）
    │   ├── TemplateSelector.tsx ← 模板选择下拉框
    │   ├── PrivacyControls.tsx  ← 脱敏开关面板
    │   └── GraphCanvas.tsx      ← vis-network 图谱画布
    ├── api/
    │   └── client.ts            ← API client（封装 fetch 调用）
    └── types/
        └── index.ts            ← TypeScript 类型定义
```

## 简历编辑器页面

### 布局

```
┌──────────────────────────────────────────────────────────────────┐
│ 顶栏：简历名称 | 模板选择 | 脱敏设置 | 编辑/预览 | 保存配置      │
├──────────┬───────────────────────────────┬──────────────────────┤
│ 左侧栏   │ 中间编辑区                      │ 右侧预览              │
│          │                                │                      │
│ 模块库   │ ┌─────────────────────────┐   │ ┌──────────────────┐ │
│          │ │ ⋮⋮ 个人信息     ▼  ✕   │   │ │  简历预览          │ │
│ 👤 个人  │ │   name: [王二____]      │   │ │                    │ │
│ 💼 经历  │ │   title: [后端___]      │   │ │  王二              │ │
│ 📁 项目  │ └─────────────────────────┘   │ │  后端开发工程师     │ │
│ ⚡ 技能  │ ┌─────────────────────────┐   │ │                    │ │
│ 🎓 教育  │ │ ⋮⋮ 工作经历     ▶  ✕   │   │ │  工作经历           │ │
│ 📜 证书  │ └─────────────────────────┘   │ │  字节跳动 · 后端   │ │
│ 🏆 获奖  │   ...                          │ │  ...               │ │
│ 📝 发表  │                                │ │                    │ │
│ 🌟 活动  │  拖拽到此处添加模块              │ │  [100%] [−][+]    │ │
│ ✨ 优势  │                                │ └──────────────────┘ │
└──────────┴───────────────────────────────┴──────────────────────┘
```

### 交互流程

1. **左侧模块库** — 10 个可拖拽模块（个人信息/工作经历/项目/技能/教育/证书/获奖/发表/活动/个人优势），每个模块从 wiki 拉取默认值
2. **拖拽到编辑区** — 从左侧拖拽模块到中间编辑区，模块自动添加到列表末尾
3. **编辑覆盖** — 点击模块展开，可编辑字段。覆盖值只存在简历配置里，**不回写 wiki**
4. **子项隐藏/恢复** — 项目、经历等条目可从当前简历隐藏并恢复；保存为 `hide.items`，预览与导出同步生效，Wiki 数据不变。要从知识库删除实体，必须退出编辑器并触发 wiki-engine 的删除流程。
5. **排序** — 编辑区内拖拽模块卡片上下排序
6. **删除** — 点击模块卡片右上角 ✕ 删除
7. **右侧实时预览** — 按选中模板渲染，编辑改动实时反映到预览
8. **模板切换** — 顶栏下拉框切换模板，预览即时更新
9. **缩放** — 预览区有 +/− 按钮缩放
10. **脱敏** — 顶栏脱敏开关实时控制预览中的字段脱敏

### 导出

> 🔴 **CHECKPOINT** — 导出前必须让用户确认
>
> 点击导出按钮后，**必须**先向用户确认：
> - 当前模板、脱敏设置、模块顺序是否符合预期
> - PDF 导出会直接下载当前预览生成的 `.pdf` 文件
> - HTML 导出会下载文件到本地
> - JSON 导出会调 API server 返回结构化数据
>
> 🛑 不要在用户未确认前直接触发导出。导出是不可逆操作，导出后才发现脱敏没开会泄露隐私。

| 格式 | 方式 | 说明 |
|------|------|------|
| PDF | `html2pdf.js` | 将 `.print-area` 的 A4 预览在浏览器端生成并直接下载，不调用打印对话框 |
| HTML | `Blob` 下载 | 取 `.print-area` 的 outerHTML，包成完整 HTML 文件下载 |
| JSON | API server | 调 `/api/resume/export` 接口，后端组装结构化简历 JSON |

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
| POST | `/api/resume/generate` | 生成结构化简历 JSON |
| POST | `/api/resume/save` | 保存简历配置 |
| POST | `/api/resume/export` | 导出简历（JSON 格式） |
| PUT | `/api/wiki/refresh` | 触发 wiki 重新 compile |
| GET | `/api/health` | 健康检查 |

## 脱敏实现

前端预览时实时脱敏（对应 F07 决议 Q16 选 C）。脱敏逻辑在 `PreviewPanel.tsx` 的 `maskValue()` 函数中：

| 字段 | 规则 | 示例 |
|------|------|------|
| 姓名 | 保留首字 + `**` | 王二 → 王* |
| 电话 | 前 3 后 4，中间掩码 | 13812345678 → 138****5678 |
| 邮箱 | 首字母 + `***` + 域名 | wang@example.com → w***@example.com |

用户在顶栏勾选脱敏开关，预览实时更新。导出时用同一份脱敏配置。

## 构建产物

```bash
npm run build    # 输出到 dist/
```

`dist/` 可部署到任意静态文件服务器。部署时需配置 `/api` 反向代理到 resume-generator API server。

## 跨 Agent 一致性

- 假设 Agent 有终端执行能力（跑 `npm install` + `npm run dev`）
- 前端不直接读写文件系统，所有数据通过 API server
- 类型定义（`src/types/index.ts`）跟 wiki-engine schema / 模板 JSON / 简历配置 JSON 格式对齐
- Vite proxy 配置确保开发时前后端分离运行

## Common Pitfalls

1. **API server 没启动。** 前端启动后会报连接错误。必须先启动 resume-generator 的 API server（`http://localhost:3001`）。Vite proxy 只在开发模式生效，生产部署需配 nginx 反代。

2. **每次启动都重新安装依赖。** 停止 Vite 不会删除 `node_modules`。先检查 `node_modules/.bin/vite` 和锁文件状态，只有缺失或依赖声明变化时才安装。

3. **把删除编辑器模块当成删除 Wiki 实体。** 编辑区的删除只移除当前简历模块；项目仍会从 Wiki 读取。删除知识库实体必须使用 wiki-engine 的删除清单和全量 compile 流程。

4. **vis-network 动态导入。** `GraphCanvas.tsx` 用 `import('vis-network/standalone')` 动态加载，避免首屏加载 vis-network 的重量级代码。如果看到图谱不渲染，检查浏览器控制台是否有动态 import 错误。

5. **dnd-kit 拖拽需同时有 Draggable + Droppable。** 模块库的卡片是 Draggable，编辑区是 Droppable。少了任一方拖拽都不生效。排序用的是 `SortableContext`。

6. **PDF 生成范围。** `html2pdf.js` 只接收 `.print-area`，不要传入预览工具栏或缩放容器，否则导出内容会带入界面控件或缩放比例。

7. **覆盖不回写 wiki。** 编辑区的字段编辑只存到简历配置的 `overrides` 字段，不修改 wiki 源数据。这是设计意图——改简历不改 wiki，只改视角。

8. **预览与 HTML 样式分叉。** HTML 导出必须从当前文档样式表收集 CSS，并复用 `.print-area` 的同一渲染树；不要另写一套导出模板。

9. **TypeScript 严格模式。** `tsconfig.json` 开了 strict。API 返回的 `fields: Record<string, unknown>` 需要类型断言才能访问具体字段。不要用 `any` 绕过——用类型守卫或断言。

## Verification Checklist

- [ ] `npm install` 成功安装所有依赖
- [ ] 依赖已存在时未重复执行 `npm install`
- [ ] `npm run dev` 启动开发服务器，`http://localhost:5173` 可访问
- [ ] `npm run build` 成功构建到 `dist/`
- [ ] API server 未启动时前端显示错误提示（不白屏）
- [ ] 拖拽模块库到编辑区可添加模块
- [ ] 编辑区内模块可拖拽排序
- [ ] 模块可展开/折叠/编辑/删除
- [ ] 模块子项可隐藏/恢复，计数与预览实时同步，保存后可恢复状态
- [ ] 右侧预览按选中模板渲染
- [ ] 模板切换实时更新预览
- [ ] 脱敏开关实时影响预览
- [ ] 导出 PDF 直接下载有效 `.pdf` 文件，且不调用打印对话框
- [ ] 导出 HTML 下载文件可打开
- [ ] HTML/PDF 与预览使用同一渲染树和过滤结果
- [ ] 图谱页面渲染 vis-network 图
- [ ] 点击图谱节点显示详情
- [ ] 缺口分析高亮未使用技能/项目
