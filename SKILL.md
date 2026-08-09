---
name: career-wiki-skill
description: "用 AI Agent 采访采集信息，自动生成结构化 Wiki 知识库，从 Wiki 一键生成多份简历，Web 可视化编辑导出。当用户说'开始采访''录入信息''补充经历''解析简历文件''编译 wiki''检查 wiki''从 Wiki 删除项目''从知识库删除经历''导出 OKF''生成简历''打开编辑器''看看简历预览''创建模板''创建字节版简历''预览脱敏效果'时使用。跨 Agent 兼容，纯本地数据，支持 Claude Code/Codex/Hermes/OpenClaw 等所有支持 Skill 的 Agent。"
version: 1.0.0
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
| "编译 wiki" / "compile" / "重建 wiki" | wiki-engine | 全量重建 wiki/，实体识别+合并+去重 |
| "检查 wiki" / "lint" | wiki-engine | 孤儿/断链/重复/过期检查 |
| "删除项目经历" / "从 Wiki 删除项目" / "从知识库删除经历" / "删除知识库实体" | wiki-engine | 先确认是删除当前简历视图还是 Wiki 知识；确认删除 Wiki 后登记删除清单并全量重建 |
| "导出 OKF" / "导入 OKF" | wiki-engine | Node 脚本，OKF JSON 双向转换 |
| "生成简历" / "导出简历" / "启动 API server" | resume-generator | Node API server，查询 wiki + 组装简历 |
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

---

## 数据目录

默认 `~/.career_wiki/`，用户可自定义。

```
~/.career_wiki/
├── sources/
│   ├── raw/               ← 采访产出 + 文件提取（原始材料）
│   │   ├── interview-{timestamp}.md
│   │   └── uploads/
│   │       └── {filename}_{date}.md
│   └── uploads/           ← 用户上传的原始文件
├── wiki/                  ← 编译产出的结构化页面（不允许人工编辑）
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
├── resumes/               ← 简历配置（每份一个 JSON）
├── templates/             ← 简历模板（JSON + CSS）
└── .career-wiki-skill/    ← 运行时状态
```

---

## 数据规范

### 10 个实体类型

person · experience · project · skill · education · certificate · award · publication · activity · summary

### 13 个关系类型

has_experience · has_skill · has_education · has_certificate · has_award · has_publication · has_activity · has_summary · used_skill · did_project · at_company · took_course · references

### Frontmatter 规范

每个 wiki 页面是 Markdown + YAML frontmatter：

```yaml
---
entity: experience           # 实体类型
confidence: verified         # verified / extracted / inferred
sources:                     # 来源追溯
  - sources/raw/interview-001.md
relations:                  # 骨架关系
  - type: used_skill
    target: wiki/skills/react
---
```

正文用 wikilink `[[wiki/skills/react|React]]` 做关联（血肉）。

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
4. **Wiki 是编译产物** — 全量重建，不允许人工编辑，改信息改 raw 再 recompile
5. **OKF 标准导出** — 支持谷歌 OKF 格式导入导出，跨系统交换

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
2. 创建 `~/.career_wiki/` 目录结构（sources/raw、wiki/、resumes/、templates/ 等 16 个子目录）
3. 安装 Node 依赖（gray-matter 等）
4. 写入配置文件

**初始化完成后才能开始采访、编译 wiki、生成简历。**

首次使用时说"检查 career-wiki 环境"或"初始化 career-wiki 环境"，env-init skill 会检查环境并创建数据目录。

---

## Common Pitfalls

1. **跳过 env-init 直接用** — 数据目录不存在，后续 skill 会找不到路径。先跑 env-init。

2. **人工编辑 wiki 页面** — wiki 是编译产物，下次 compile 会被覆盖。改信息改 `sources/raw/` 再 recompile。

3. **增量 compile** — 只编译新增 raw 不扫旧的。必须全量重建，否则旧实体残留。

4. **在不同 Agent 里用特定工具** — 不要用 lark-cli、imsg 等平台特定工具。只用 Bash + Python + Node 通用工具链。

5. **不给用户确认就清空 wiki** — compile 前必须向用户确认，不可逆操作。

6. **test-prompts.json 泄露用户数据** — test-prompts 只用于评估，不要放真实用户信息。

---

## Verification Checklist

- [ ] env-init 已运行，`~/.career_wiki/` 目录结构已创建
- [ ] interview 产出的 raw markdown 在 `sources/raw/` 下
- [ ] file-parser 提取的 markdown 在 `sources/raw/uploads/` 下，原始文件在 `sources/uploads/`
- [ ] wiki-engine compile 后 `wiki/` 各子目录有页面
- [ ] wiki-engine lint 无 error（warn 可接受）
- [ ] resume-generator API server 可启动，9 个接口可调
- [ ] web-editor 前端可打开，拖拽/预览/导出功能正常
- [ ] web-editor 多简历切换/新建/复制/删除正常，配置在 `resumes/` 下
- [ ] web-editor 模板复制/删除正常，模板在 `templates/` 下
- [ ] web-editor 6 字段脱敏开关实时生效，预览与导出一致

---

## 子 Skill 文件清单

| 子 Skill | 文件 |
|---------|------|
| env-init | SKILL.md + scripts/env_check.py |
| interview | SKILL.md |
| file-parser | SKILL.md |
| wiki-engine | SKILL.md + scripts/okf_export.mjs + scripts/okf_import.mjs |
| resume-generator | SKILL.md + scripts/api_server.mjs + package.json |
| web-editor | SKILL.md + React 项目 + templates/（4 JSON + 4 CSS） |

---

## 设计灵感

- **OKF（Open Knowledge Format）** — 谷歌的知识格式标准，纯 Markdown + frontmatter，无中心化 schema
- **LLM Wiki** — Karpathy 的概念：把知识"编译"成互链的 wiki 页面
- **SkillLens + SkillOpt** — 微软研究院的 Skill 评估和优化框架
