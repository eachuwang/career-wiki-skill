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

1. **简历编辑器** — 内容编排区（按需添加/排序/编辑/删除）→ 右侧实时预览（按模板渲染）
2. **Wiki 图谱** — vis-network 渲染实体关系图，点击节点查看详情，缺口分析

**核心理念：** 前端是展示层，不做数据持久化。所有数据通过 resume-generator API server 获取，编辑覆盖和 Agent 生成的轻量润色结果都只存简历配置 JSON，不回写 Wiki。

## 何时触发

- 用户说"打开编辑器" / "启动前端" / "npm run dev" → 启动开发服务器
- 用户说"看看简历预览" → 打开简历编辑器页面
- 用户说"查看知识图谱" / "看看 wiki 图谱" → 打开图谱页面
- 用户说"导出简历" → 点击预览栏唯一的「导出」入口，在导出面板选择 PDF / HTML / JSON、文件名与保存位置
- 用户说"新建/复制/删除简历""切换简历" → 顶栏「简历」下拉 + 操作按钮，调 resumes API
- 用户说"从当前简历隐藏项目" / "不在这份简历显示项目" → 当前简历的 `hide.items`；只影响当前简历，不删除 Wiki 实体
- 用户说"复制/删除模板" → 顶栏模板下拉 + 操作按钮，调 templates API
- 用户说"预览脱敏效果""隐藏敏感信息" → 隐私预览 6 个开关实时生效
- 用户说"润色简历""优化项目描述" → 用户在顶栏选择 OpenAI-compatible 或 Anthropic Messages 协议，再配置 Base URL、API Key、模型和润色内容；前端调用 `/api/resume/polish` 生成并保存 `polish.entries`，只展示通过校验的结果
- 编辑器顶部「AI 润色」开关关闭时显示 Wiki 中的用户原始输入，开启时显示已生成且通过原文指纹校验的润色结果；没有润色结果时仍显示原文

**不用于：** 生成简历数据（用 resume-generator）；采访与 Wiki 编译（用 interview / wiki-engine）。模板管理、多简历管理、隐私脱敏已并入本前端，不再作为独立 skill。

## 技术栈

- **React 18** + **TypeScript**
- **Vite** — 构建工具 + 开发服务器
- **dnd-kit** — 编辑区内拖拽排序
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
    │   ├── ModulePicker.tsx     ← 编排区按需添加模块选择器
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
│ 紧凑顶栏：简历 | 模板 | 润色 | 隐私 | 编辑/预览 | 保存              │
├──────────┬───────────────────────────────┬──────────────────────┤
│ 内容编排 │ 中间编辑区 +「添加模块」入口      │ 右侧预览              │
│          │ ┌─────────────────────────┐     │ ┌──────────────────┐ │
│          │ │ ⋮⋮ 个人信息     ▼  ✕   │     │ │  简历预览          │ │
│          │ │   name: [王二____]      │     │ │                    │ │
│          │ └─────────────────────────┘     │ │  王二              │ │
│          │ ┌─────────────────────────┐     │ │  后端开发工程师     │ │
│          │ │ ⋮⋮ 工作经历     ▶  ✕   │     │ │                    │ │
│          │ └─────────────────────────┘     │ │  工作经历           │ │
│          │                                 │ │  ...               │ │
│          │  点击「添加模块」选择需要的内容  │ │  [100%] [−][+]    │ │
│          │                                 │ └──────────────────┘ │
└──────────┴───────────────────────────────┴──────────────────────┘
```

### 交互流程

1. **按需添加模块** — 点击内容编排区的「添加模块」，勾选要保留在当前简历预览/导出中的模块后应用；取消勾选会从当前简历移除，不会删除或修改 Wiki
2. **编辑覆盖** — 点击模块展开，可编辑字段。输入时立即更新右侧预览，保存为当前简历 JSON 的 `content_overrides[Wiki相对路径][字段名]`，**不回写 wiki**；重新打开当前简历时恢复，PDF/HTML/JSON 导出使用同一覆盖结果
3. **子项隐藏/恢复** — 项目、经历等条目可从当前简历隐藏并恢复；保存为 `hide.items`，预览与导出同步生效，Wiki 数据不变。要从知识库删除实体，必须退出编辑器并触发 wiki-engine 的删除流程。
4. **排序** — 编辑区内拖拽模块卡片上下排序
5. **删除** — 点击模块卡片右上角 ✕ 从当前简历预览/导出中移除；不删除或修改 Wiki
6. **右侧实时预览** — 按选中模板渲染，编辑改动实时反映到预览
8. **模板切换** — 顶栏下拉框切换模板，预览即时更新
9. **缩放** — 预览区有 +/− 按钮缩放
10. **脱敏** — 顶栏脱敏开关实时控制预览中的字段脱敏
11. **AI 润色显示** — 顶栏「AI 润色」开关默认关闭；齿轮按钮选择 OpenAI-compatible / Anthropic Messages 协议，配置模型并选择项目描述、个人优势、岗位职责等内容；OpenAI-compatible 支持拉取 `/v1/models`，Anthropic 需手填模型。关闭显示原始输入，开启显示已校验的 `polish.entries`；已生成字段旁提供「换一换」，只重新生成当前条目的当前字段，切换即时影响编辑区、预览和导出

### 导出

> 🔴 **CHECKPOINT** — 导出前必须让用户确认
>
> 点击导出按钮后，导出面板会在真正写文件前集中确认：
> - 当前模板、脱敏设置、模块顺序是否符合预期
> - 文件格式与文件名
> - 当前脱敏项数量
> - 支持 File System Access API 时由系统窗口选择保存位置；否则保存到浏览器默认下载目录
>
> 🛑 不要在用户未确认前直接触发导出。导出是不可逆操作，导出后才发现脱敏没开会泄露隐私。

| 格式 | 方式 | 说明 |
|------|------|------|
| PDF | `html2pdf.js` | 将 `.print-area` 的 A4 预览在浏览器端生成并直接下载，不调用打印对话框 |
| HTML | `Blob` 下载 | 取 `.print-area` 的 outerHTML，包成完整 HTML 文件下载 |
| JSON | `ResumeView` Blob | 浏览器直接序列化与预览相同的 Resume Projection 结果 |

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
| POST | `/api/resume/polish-context` | 提供 Agent 润色所需的原始事实和用户口吻样本 |
| POST | `/api/resume/polish` | 生成当前简历的 AI 润色结果 |
| POST | `/api/resume/polish-models` | 拉取用户配置 provider 的模型列表 |
| POST | `/api/resume/save` | 保存简历配置 |
| PUT | `/api/wiki/refresh` | 触发 wiki 重新 compile |
| GET | `/api/health` | 健康检查 |

## Resume Projection

`src/resume/projection.ts` 的 `projectResume({ wiki, config, template })` 是简历展示规则的唯一接口。固定顺序为：选择模块 → 应用有效润色 → 手动覆盖 → 隐藏条目/字段 → 排序/强调 → 隐私 → 分组。`PreviewPanel`、HTML、PDF 和 JSON 只消费最终 `ResumeView`。

脱敏在 Resume Projection 中执行：

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

5. **dnd-kit 拖拽需同时有 Sortable + Droppable。** 编辑区是 Droppable，模块卡片通过 `SortableContext` 支持排序；模块添加和移除通过「添加模块」选择器完成。

6. **PDF 生成范围。** `html2pdf.js` 只接收 `.print-area`，不要传入预览工具栏或缩放容器，否则导出内容会带入界面控件或缩放比例。

7. **覆盖不回写 wiki。** 编辑区运行时按 Wiki 路径保存条目级 `overrides`，持久化时写入当前简历配置的 `content_overrides`，不修改 wiki 源数据。展示优先级是“手动覆盖 > 有效 AI 润色 > Wiki 原文”——改简历只改当前简历视角。

8. **预览与 HTML 样式分叉。** HTML 导出必须从当前文档样式表收集 CSS，并复用 `.print-area` 的同一渲染树；不要另写一套导出模板。

9. **TypeScript 严格模式。** `tsconfig.json` 开了 strict。API 返回的 `fields: Record<string, unknown>` 需要类型断言才能访问具体字段。不要用 `any` 绕过——用类型守卫或断言。

## Verification Checklist

- [ ] `npm install` 成功安装所有依赖
- [ ] 依赖已存在时未重复执行 `npm install`
- [ ] `npm run dev` 启动开发服务器，`http://localhost:5173` 可访问
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
