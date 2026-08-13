---
name: career-wiki-skill
description: "用 AI Agent 采访采集信息，生成严格 OKF v0.2 职业知识库，并从同一知识源创建多份简历。当用户要求采访、解析简历、编译或检查知识库、迁移旧数据、生成简历、打开编辑器、管理模板或脱敏时使用。跨 Agent 兼容，用户数据默认纯本地存储。"
version: 2.0.0
author: eachuwang
license: MIT
---

# career-wiki-skill

一个跨 Agent 兼容的 skill 包，帮助求职者通过采访采集信息、生成 Wiki 知识库、从 Wiki 生成多份简历、Web 可视化编辑导出。

---

## 触发路由表

根据用户意图路由到对应子 skill：

| 用户说 | 子 Skill | 动作 |
|--------|----------|------|
| "检查 career-wiki 环境" / "初始化 career-wiki 环境" / "初始化 career-wiki" | env-init | 检查 Node/Python，创建目录，安装依赖 |
| "开始采访" / "录入信息" / "补充经历" | interview | 多轮对话采集，产出 raw markdown |
| "解析简历文件" / "读这个文件" / "上传 PDF" | file-parser | Agent Read 提取内容，落到 raw |
| "编译 wiki" / "compile" / "重建 wiki" | wiki-engine | 全量重建 knowledge/，实体识别+合并+去重 |
| "检查 wiki" / "lint" | wiki-engine | 孤儿/断链/重复/过期检查 |
| "删除项目经历" / "从 Wiki 删除项目" / "从知识库删除经历" / "删除知识库实体" | wiki-engine | 先确认是删除当前简历视图还是 Wiki 知识；确认删除 Wiki 后登记删除清单并全量重建 |
| "迁移 OKF" / "检查 OKF" | wiki-engine | 一次性迁移旧工作区或严格校验当前 OKF bundle |
| "生成简历" / "导出简历" / "启动 API server" | resume-generator | Node 查询 wiki + 组装简历；可由 Agent 或已配置的 provider 轻量润色项目描述/岗位职责 |
| "打开编辑器" / "启动前端" / "看看简历预览" | web-editor | React 前端，拖拽编辑 + 实时预览 + 导出；含多简历/模板管理/隐私脱敏 |
| "从当前简历隐藏项目" / "不在这份简历显示项目" | web-editor | 只修改当前简历配置的 hide.items，不删除 Wiki 知识 |

---

## 子 Skill 依赖关系

```
env-init ──→ 所有其他 skill（前置依赖）

interview ──→ wiki-engine（采完自动 compile）
file-parser ──→ wiki-engine（提取完自动 compile）

wiki-engine ──→ resume-generator（提供 wiki 数据）
resume-generator ──→ web-editor（前端调 API，含模板/多简历/脱敏数据）
```

### 简历润色边界

简历生成时，Agent 可按“调用 `POST /api/resume/polish-context` → 根据 `selected_fields` 阅读原始字段和同一用户口吻样本 → 轻量润色 → 用原 `source_hash` 写入 `polish.entries` → 保存 → 再调用 generate/export”的顺序执行；Web 编辑器则由用户配置 OpenAI-compatible provider 和润色内容后调用 `POST /api/resume/polish`，生成后再保存。支持项目描述、个人优势和岗位职责；字段旁的「换一换」使用 `only: { path, field }` 只重新生成当前字段。API Key 仅保存在浏览器本地设置，不写入简历 JSON；没有可用推理能力时保留原文，不做伪润色。

润色必须遵守：保留用户事实和词汇；短输入只做必要扩写；参考用户已有表达模仿句式；不补造数字、技术、结果；避免空泛的 AI 套话。Wiki 永远是事实源，润色只属于当前简历视角。Node 会校验 `source_hash`，原始 Wiki 变化后自动回退原文。

---

## 数据目录

默认 `~/.career_wiki/`，用户可自定义。

```
~/.career_wiki/
├── knowledge/             ← 唯一知识层：可独立交换的 OKF v0.2 bundle
│   ├── index.md
│   ├── references/
│   │   ├── raw/           ← 采访与文件提取形成的 Reference concepts
│   │   └── uploads/       ← 用户上传的原始文件
│   ├── persons/
│   ├── experiences/
│   ├── projects/
│   ├── skills/
│   ├── education/
│   ├── certificates/
│   ├── awards/
│   ├── publications/
│   ├── activities/
│   └── summaries/
└── .career-wiki-skill/    ← 非知识应用状态，不属于 OKF bundle
    ├── config.json
    ├── resumes/
    ├── templates/
    └── backups/
```

---

## 数据规范

### 10 个实体类型

person · experience · project · skill · education · certificate · award · publication · activity · summary

### 13 个关系类型

has_experience · has_skill · has_education · has_certificate · has_award · has_publication · has_activity · has_summary · used_skill · did_project · at_company · took_course · references

### Frontmatter 规范

每个非保留 Markdown 页面是严格 OKF v0.2 concept。至少包含非空 `type`；Career 概念使用 `career.*`：

```yaml
---
type: career.experience
title: 示例公司 · AI 工程师
generated: { by: career-wiki-agent/1.0, at: 2026-08-13T04:00:00Z }
verified: { by: human:career-wiki-user, at: 2026-08-13T04:00:00Z }
sources:
  - resource: /references/raw/interview-001.md
company: 示例公司
role: AI 工程师
---
```

正文使用标准 Markdown 链接，如 `[React](/skills/react.md)`。不接受旧 `entity`、`confidence`、自定义 `relations` 或 `[[wikilink]]`。

详细 schema 见 `skills/wiki-engine/SKILL.md` 的数据规范章节。

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

---

## 设计原则

1. **Skill 只编排，不执行** — SKILL.md 指导 Agent 怎么做，LLM 推理让 Agent 做，脚本只做确定性操作
2. **跨 Agent 兼容** — 只用通用工具链（Bash + Python + Node），不依赖任何特定 Agent 的工具
3. **纯本地数据** — 用户数据在 `~/.career_wiki/`，自选目录和同步方式
4. **Knowledge 是编译产物** — 全量重建，不允许人工编辑，改信息改 Reference 后再 recompile
5. **OKF 原生存储** — `knowledge/` 本身就是 OKF v0.2 bundle，不再维护私有格式与导入导出副本

---

## 安装

```bash
git clone https://github.com/eachuwang/career-wiki-skill.git
```

把 `skills/` 下的目录放到你 Agent 的 skill 目录（如 `~/.claude/skills/`）。

### 安装后第一步：必须初始化环境

🔴 **安装完不能直接用，必须先运行环境初始化。**

在你的 Agent 里说：

```
检查 career-wiki 环境 / 初始化 career-wiki 环境
```

env-init skill 会：
1. 检查 Node.js ≥ 18 / Python ≥ 3.9 / npm
2. 创建 `~/.career_wiki/` 目录结构（knowledge/references/raw、knowledge/、.career-wiki-skill/resumes/、.career-wiki-skill/templates/ 等 16 个子目录）
3. 安装 Node 依赖（gray-matter 等）
4. 写入配置文件

**初始化完成后才能开始采访、编译 wiki、生成简历。**

首次使用时说"检查 career-wiki 环境"或"初始化 career-wiki 环境"，env-init skill 会检查环境并创建数据目录。

---

## Common Pitfalls

1. **跳过 env-init 直接用** — 数据目录不存在，后续 skill 会找不到路径。先跑 env-init。

2. **人工编辑 wiki 页面** — wiki 是编译产物，下次 compile 会被覆盖。改信息改 `knowledge/references/raw/` 再 recompile。

3. **增量 compile** — 只编译新增 raw 不扫旧的。必须全量重建，否则旧实体残留。

4. **在不同 Agent 里用特定工具** — 不要用 lark-cli、imsg 等平台特定工具。只用 Bash + Python + Node 通用工具链。

5. **不给用户确认就清空 wiki** — compile 前必须向用户确认，不可逆操作。

6. **test-prompts.json 泄露用户数据** — test-prompts 只用于评估，不要放真实用户信息。

---

## Verification Checklist

- [ ] env-init 已运行，`~/.career_wiki/` 目录结构已创建
- [ ] interview 产出的 raw markdown 在 `knowledge/references/raw/` 下
- [ ] file-parser 提取的 markdown 在 `knowledge/references/raw/uploads/` 下，原始文件在 `knowledge/references/uploads/`
- [ ] wiki-engine compile 后 `knowledge/` 各子目录有页面
- [ ] wiki-engine lint 无 error（warn 可接受）
- [ ] resume-generator API server 可启动，9 个接口可调
- [ ] web-editor 前端可打开，拖拽/预览/导出功能正常
- [ ] web-editor 多简历切换/新建/复制/删除正常，配置在 `.career-wiki-skill/resumes/` 下
- [ ] web-editor 模板复制/删除正常，模板在 `.career-wiki-skill/templates/` 下
- [ ] web-editor 6 字段脱敏开关实时生效，预览与导出一致

---

## 子 Skill 文件清单

| 子 Skill | 文件 |
|---------|------|
| env-init | SKILL.md + scripts/env_check.py |
| interview | SKILL.md |
| file-parser | SKILL.md |
| wiki-engine | SKILL.md + scripts/okf_bundle.mjs + scripts/delete_entity.mjs |
| resume-generator | SKILL.md + scripts/api_server.mjs + package.json |
| web-editor | SKILL.md + React 项目 + .career-wiki-skill/templates/（4 JSON + 4 CSS） |

---

## 设计灵感

- **OKF（Open Knowledge Format）** — 谷歌的知识格式标准，纯 Markdown + frontmatter，无中心化 schema
- **LLM Wiki** — Karpathy 的概念：把知识"编译"成互链的 wiki 页面
- **SkillLens + SkillOpt** — 微软研究院的 Skill 评估和优化框架
