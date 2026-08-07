<div align="center">

# career-wiki-skill

**用 AI Agent 采访采集信息，自动生成结构化 Wiki 知识库，从 Wiki 一键生成多份简历。**

跨 Agent 兼容 · 纯本地 Markdown · 支持 Claude Code / Codex / Hermes / OpenClaw 等所有支持 Skill 的 Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-Compatible-blueviolet)](https://skills.sh)
[![Runtime Neutral](https://img.shields.io/badge/Runtime-Neutral-green)](#runtime-兼容性)
[![OKF](https://img.shields.io/badge/OKF-v0.2-blue)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)

</div>

---

## 它解决什么问题

求职者在准备简历时面临三个痛点：

1. **信息散落** — 工作经历、项目、技能、教育等散在脑子里、旧简历、各种文档里，没有统一管理
2. **简历重复劳动** — 投不同公司要强调不同重点，每次手动改一遍，数据和格式不一致
3. **没有知识沉淀** — 面试结束后面经和反思没有沉淀，下次准备还是从零开始

career-wiki-skill 把这些问题一次性解决：**采访采集 → Wiki 知识库 → 多份简历 → 可视化编辑导出**。

---

## 核心循环

```
采访采集 ──→ raw markdown ──→ Wiki 编译 ──→ 结构化知识库
                                              │
                                    ┌─────────┴─────────┐
                                    ↓                   ↓
                              简历生成              Web 可视化
                              (模板+配置)           (拖拽+预览+导出)
```

### 主要能力

- **深度串行采访** — 项目采访一次只问一个问题；当前回答不明确时持续追问，明确后才进入下一项。
- **完整项目知识归档** — 分别保存项目描述、本人职责、技术栈、困难、解决方案、结果和复盘；原话保存在 raw，结构化字段进入 Wiki。
- **多简历视角** — 同一份 Wiki 可生成多份岗位简历，并按简历隐藏不相关的项目或字段，不修改知识库原始数据。
- **可视化编辑与实时预览** — 米白极简编辑器支持模块排序、字段覆盖、条目显隐、模板切换和 A4 实时预览。
- **直接下载 PDF** — 在预览区直接生成并下载渲染好的 PDF，无需选择打印机；同时支持 HTML、JSON 和 OKF。
- **可读 Wiki 图谱** — 实体节点、关系、图例和详情信息使用高对比度配色，便于浏览项目与技能关系。

---

## 6 个 Skill 组成

| # | Skill | 形式 | 职责 |
|---|-------|------|------|
| 1 | **env-init** | SKILL.md + Python 脚本 | 环境检查、目录初始化、依赖安装 |
| 2 | **interview** | 纯 SKILL.md | 单题串行采访，深挖项目上下文，完整产出 raw markdown |
| 3 | **file-parser** | 纯 SKILL.md | 上传 PDF/图片/文档，Agent 提取内容落到 raw |
| 4 | **wiki-engine** | SKILL.md + Node 脚本 | 数据 schema 定义、compile/lint/OKF 导入导出 |
| 5 | **resume-generator** | SKILL.md + Node API server | 从 Wiki 查询数据，按模板组装简历 JSON |
| 6 | **web-editor** | SKILL.md + React 项目 | 可视化编辑、多简历管理、模板复制/删除、6 字段隐私脱敏、实时预览、Wiki 图谱、直接导出 PDF |

---

## 数据规范

### 10 个实体类型

```
person · experience · project · skill · education ·
certificate · award · publication · activity · summary
```

### 13 个关系类型

```
has_experience · has_skill · has_education · has_certificate ·
has_award · has_publication · has_activity · has_summary ·
used_skill · did_project · at_company · took_course · references
```

### 项目信息

项目实体将简历展示字段与知识归档字段分开保存：

| 字段 | 用途 | 预设简历默认展示 |
|------|------|------------------|
| `description` | 项目背景、目标与主要功能 | 是 |
| `responsibilities` | 本人具体职责 | 是 |
| `tech_stack` | 项目使用的技术栈 | 是 |
| `challenges` | 遇到的困难、限制与风险 | 否 |
| `solutions` | 分析过程、解决方案与选择依据 | 否 |
| `outcomes` | 量化结果、用户反馈或业务影响 | 否 |
| `learnings` | 复盘、经验教训与改进方向 | 否 |

未默认展示的字段仍会完整存入 Wiki，生成定向简历时可按岗位需要选用。

### 存储

纯本地 Markdown + YAML frontmatter，Git 友好，不依赖数据库。

```
~/.career_wiki/
├── sources/
│   ├── raw/               ← 采访产出 + 文件提取（原始材料）
│   └── uploads/           ← 用户上传的原始文件
├── wiki/                  ← 编译产出的结构化页面（不允许人工编辑）
│   ├── persons/
│   ├── experiences/
│   ├── projects/
│   ├── skills/
│   └── ...
├── resumes/               ← 简历配置（每份一个 JSON）
├── templates/             ← 简历模板（JSON + CSS）
└── .career-wiki-skill/    ← 运行时状态
```

schema 写在 wiki-engine 的 SKILL.md 里，不用 profile.json，跟 OKF 理念一致。

---

## 快速开始

### 1. 安装

在你的 Agent 里直接说：

```
安装 skill：https://github.com/eachuwang/career-wiki-skill
```

Agent 会自动 clone 仓库到 skill 目录。

手动安装：

```bash
git clone https://github.com/eachuwang/career-wiki-skill.git
```

把 `skills/` 下的目录放到你 Agent 的 skill 目录（如 `~/.claude/skills/`）。

### 2. 初始化环境（🔴 安装后必须执行，不能跳过）

安装只是把文件放到了 skill 目录，数据目录和依赖还没建。必须先初始化：

在你的 Agent 里说：

```
检查 career-wiki 环境 / 初始化 career-wiki 环境
```

env-init skill 会：
1. 检查 Node.js ≥ 18 / Python ≥ 3.9 / npm
2. 创建 `~/.career_wiki/` 目录结构（sources/raw、wiki/、resumes/、templates/ 等 16 个子目录）
3. 安装 Node 依赖（gray-matter 等）
4. 写入配置文件

**初始化完成后才能开始采访、编译 wiki、生成简历。**

### 3. 开始采访

```
开始采访 / 帮我录入信息
```

interview skill 启动多轮对话采集。项目部分一次只问一个问题，依次确认项目描述、本人职责、技术栈、困难、解决方案、结果与复盘；回答不明确时会先追问当前项，不会同时抛出多个问题。

### 4. 查看和编辑简历

```
打开编辑器 / 看看简历预览
```

web-editor skill 启动 React 前端，支持模块排序、字段编辑、项目显隐、实时预览，以及 PDF/HTML/JSON 导出。PDF 会按当前 A4 预览直接生成并下载，不会打开打印机选择窗口。

---

## 设计原则

| # | 原则 | 说明 |
|:---|:---|:---|
| 01 | **Skill 只编排，不执行** | SKILL.md 指导 Agent 怎么做，LLM 推理让 Agent 做，脚本只做确定性操作 |
| 02 | **跨 Agent 兼容** | 只用通用工具链（Bash + Python + Node），不依赖任何特定 Agent 的工具 |
| 03 | **纯本地数据** | 用户数据在 `~/.career_wiki/`，自选目录和同步方式（Git/硬盘） |
| 04 | **Wiki 是编译产物** | 全量重建，不允许人工编辑，改信息改 raw 再 recompile |
| 05 | **OKF 标准导出** | 支持谷歌 OKF 格式导入导出，跨系统交换 |

---

## Runtime 兼容性

career-wiki-skill 在以下 Agent 工具中均可使用：

- **Claude Code** — Anthropic 的 CLI 编码工具
- **Codex** — OpenAI 的编码 CLI
- **Hermes Agent** — Nous Research 的开源 Agent 框架
- **OpenClaw** — 开源 Agent 生态
- **Cursor** — AI 代码编辑器
- **Gemini CLI** — Google 的 Agent CLI
- 以及所有支持 `SKILL.md` 格式的 Agent 工具

所有 SKILL.md 已通过 Runtime 适配性扫描（9/9 全绿灯，无单一 Agent 绑定措辞）。

---

## 技术栈

| 组件 | 技术 |
|------|------|
| Wiki 数据 | Markdown + YAML frontmatter + wikilink |
| API Server | Node.js + gray-matter（纯 `node:http`，无框架） |
| Web 前端 | React 18 + Vite + dnd-kit + Tailwind CSS + vis-network + html2pdf.js |
| Python 脚本 | 环境检查（标准库） |
| 导出格式 | PDF（按 A4 预览直接下载）/ HTML / JSON / OKF |
| 模板系统 | JSON 配置 + CSS 样式 |

---

## 设计灵感

- **OKF（Open Knowledge Format）** — 谷歌的知识格式标准，纯 Markdown + frontmatter，无中心化 schema
- **LLM Wiki** — Karpathy 的概念：把知识"编译"成互链的 wiki 页面，不每次从零检索
- **SkillLens + SkillOpt** — 微软研究院的 Skill 评估和优化框架

---

## License

MIT
