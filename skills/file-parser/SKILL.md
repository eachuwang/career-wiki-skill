---
name: file-parser
description: 用途：解析用户上传的简历/文档文件（PDF/图片/Word/Excel/文本）提取文字内容。当用户上传文件、"解析简历"、"读这个文件"时触发。产出 markdown 存 sources/raw/uploads/，采完自动调 wiki 引擎 compile。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [file-parser, career-wiki-skill, data-collection, sources, ocr]
    related_skills: [wiki-engine, interview]
---

# 文件解析 Skill（Career-Wiki）

## 概述

用户上传的文件（PDF / 图片 / Word / Excel / 纯文本）提取为纯文字 markdown，存入 `sources/raw/uploads/`。**不预结构化提取**——那是 wiki 引擎 compile 的活。文件解析产出跟采访产出平权，统一进 `sources/raw/`。

**核心理念：** Agent 自身的 Read / vision 能力覆盖所有格式，不需要 Python 解析脚本。

## 何时触发

- 用户拖入/上传一个文件并说"解析一下"/"读这个简历"
- 用户粘贴一个文件路径让 Agent 处理
- env-init 后用户第一次提供材料且是文件而非对话

**不用于：** 通过对话采集信息（用 interview skill）。

## 数据目录约定

```
~/.career_wiki/sources/
├── raw/                    ← 提取后的 markdown（采访 + 文件统一在这）
│   ├── interview-001.md
│   └── uploads/            ← 文件提取产出
│       └── 老王简历_2026-07-31.md
└── uploads/                ← 用户上传的原始文件（保留原样）
    └── 老王简历_2026-07-31.pdf
```

- 原始文件存 `sources/uploads/`，文件名加日期防重名
- 提取的 markdown 存 `sources/raw/uploads/`
- 首次调用先确认 `~/.career_wiki/` 存在；不存在 → 提示跑 env-init

## 解析流程

### 步骤 1：保存原始文件

1. 用户上传文件 → 存到 `~/.career_wiki/sources/uploads/{原文件名}_{YYYY-MM-DD}{原扩展名}`
2. 文件名加日期防重名（如 `老王简历.pdf` → `老王简历_2026-07-31.pdf`）
3. 确认文件已落盘

### 步骤 2：按格式提取文字

根据扩展名分流：

| 格式 | 扩展名 | 提取方法 |
|------|--------|----------|
| PDF | .pdf | Agent 用 Read 工具读，提取文字层 |
| 图片 | .png .jpg .jpeg .webp .gif | Agent 用 vision 能力识别内容 |
| Word | .docx | Agent 用 Read 工具提取文本 |
| Excel | .xlsx .xls | Agent 用 Read 工具读单元格 |
| 纯文本/MD | .txt .md .markdown | 直接读 |
| 其他 | 其他 | 尝试 Read，失败则告诉用户格式不支持 |

**PDF 特殊处理：**
- 文字层可读 → 直接提取
- 扫描件（无文字层）→ 告诉用户"这是扫描件"，尝试用 vision 识别页面内容
- 混合件 → 文字层 + vision 补充

**图片特殊处理：**
- 简历截图 → vision 识别文字 + 布局
- 含表格的图片 → 尝试还原为 markdown 表格

> 🔴 **CHECKPOINT** — vision 识别置信度低时必须暂停确认
>
> 当 vision 识别出现以下情况时，🛑 STOP，不要直接写入 raw 文件：
> - 文字模糊、无法确认
> - 布局复杂、表格结构不确定
> - 手写内容
> - 识别结果置信度低
>
> **必须**告诉用户："识别可能有误，原始文件在 `{文件路径}`，请核对确认后再继续。"
> 用户确认后才能将提取内容写入 raw 文件。不要把未确认的低置信度内容当作事实存入 wiki。

### 步骤 3：写成 markdown 存 raw

1. 提取的文字写成 markdown 文件：`~/.career_wiki/sources/raw/uploads/{原文件名}_{YYYY-MM-DD}.md`
2. frontmatter：

```yaml
---
upload_date: 2026-07-31
original_file: 老王简历_2026-07-31.pdf
file_type: pdf
interviewer: career-wiki-skill
---
```

3. 正文 = 提取的纯文字内容，尽量保持原文件结构（标题层级、列表、表格）
4. **不预提取实体**——正文就是原文，不加结构化标注

### 步骤 4：触发 wiki 引擎 compile

跟 interview skill 一致：

1. **有 subagent 能力** → 并行触发 compile，不阻塞用户
2. **无 subagent 能力** → 同步执行 compile，跑完告诉用户
3. 告诉用户：原始文件路径 + 提取的 markdown 路径 + compile 状态

## 续解析支持

用户后续上传更多文件：
- 每个文件独立走一遍流程，产出独立的 raw markdown 文件
- 文件名加日期 + 必要时加序号防重名
- 每次都触发 compile（compile 全量扫所有 raw 重建 wiki）

## 跨 Agent 一致性

- 假设所有支持 skill 的 Agent 有 Read 工具 + vision 能力
- **不做降级**——Read/vision 是基本能力，没有的 Agent 用不了这个 skill
- 不依赖 Python 解析库（pymupdf/OCR 库），Agent 自身能力覆盖

## Common Pitfalls

1. **在解析阶段做结构化提取。** 解析只产出纯文字 markdown。实体识别、frontmatter 化、跨源合并全是 wiki 引擎 compile 的事。混在一起会让 raw 文件被污染。

2. **不保存原始文件。** 原始文件必须存 `sources/uploads/`，不能只存提取后的 markdown。用户可能要重新解析或核对。

3. **文件名不加日期。** 同名文件多次上传会覆盖。必须加日期后缀。

4. **把提取的 markdown 和原始文件放同一目录。** 原始文件在 `sources/uploads/`，提取产出在 `sources/raw/uploads/`，分开存。

5. **忘记触发 compile。** 步骤 4 必须调 wiki 引擎。有 subagent 并行，没有同步，不能跳过。

6. **vision 识别不确认就写。** 图片/扫描件 vision 提取的内容，如果置信度低（文字模糊、布局复杂），告诉用户"识别可能有误，原始文件在 X，请核对"。

7. **改原文件结构。** 提取时尽量保持原文件的标题层级和列表结构，但不要重组、不要加 Agent 自己的注释。原汁原味。

## Verification Checklist

- [ ] 原始文件已存 `~/.career_wiki/sources/uploads/{name}_{date}{ext}`
- [ ] 提取的 markdown 已存 `~/.career_wiki/sources/raw/uploads/{name}_{date}.md`
- [ ] markdown frontmatter 含 `upload_date / original_file / file_type / interviewer: career-wiki-skill`
- [ ] 正文为纯文字，保持原文件结构，无结构化提取标注
- [ ] wiki 引擎 compile 已触发（并行或同步）
- [ ] 已告知用户原始文件路径 + markdown 路径 + compile 状态
