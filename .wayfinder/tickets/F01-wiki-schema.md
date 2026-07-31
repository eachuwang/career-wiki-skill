---
id: F01
type: grilling
status: open
assignee:
blocked-by: []
created: 2026-07-31
title: Wiki 数据 schema 定义（CLP 实体/关系/frontmatter/目录结构）
---

## Question

career-wiki-skill 的核心数据 schema 怎么定义？需要确定：

1. **实体类型**：person / experience / skill / project / education / ... 还需要加吗？
2. **每种实体的 frontmatter 字段**：必填/可选字段
3. **关系类型**：has_experience / used_skill / did_project / ... 用 frontmatter relations（骨架）+ wikilink（正文）
4. **confidence 取值**：verified / extracted / inferred / ... 还有？
5. **sources 字段格式**：指向 `sources/raw/` 的路径
6. **目录结构**：`sources/raw/` 和 `wiki/` 同级，wiki 下按实体类型分子目录
7. **CLP profile 文件**：是否有 `.career-wiki-skill/profile.json` 声明实体/关系/字段约束

## Notes

- 借鉴 llmwiki 的 CLP 概念（实体类型 + 关系 + frontmatter），但不用其编译器
- 用户在 Q12 确认：A + B 结合（CLP schema 做内部存储，OKF 做导出格式）
- frontmatter 存 entity 属性 + confidence + sources + relations（骨架），wikilink 在正文做关联（血肉）
- 所有数据纯本地 markdown + YAML frontmatter，Git 友好

## Resolution

已确认。F01 决议：

**10 个实体类型：**
person / experience / project / skill / education / certificate / award / publication / activity / summary

**13 个关系类型：**
has_experience / has_skill / has_education / has_certificate / has_award / has_publication / has_activity / has_summary / used_skill / did_project / at_company / took_course / references

**frontmatter 规范：**
- 必填：entity / confidence / sources
- 可选：各实体特有字段（详见各实体 schema）
- 关系：frontmatter relations（骨架）+ 正文 wikilink [[path|name]]（血肉）
- confidence 取值：verified / extracted / inferred

**各实体 frontmatter 字段：**
- person: name, title, email?, phone?, location?, github?, website?
- experience: company, role, start, end, location?, type?(full-time/part-time/internship), salary?
- project: name, url?, role, start, end, description?, at_company relation(空=个人项目)
- skill: name, category(语言/框架/工具/数据库/云/方法论/其他), level(了解/熟悉/掌握/精通), description?
- education: school, degree(专科/本科/硕士/博士/其他), major, start, end, gpa?, courses?
- certificate: name, issuer, date, url?
- award: name, issuer, date, description?
- publication: title, venue, date, url?
- activity: name, role(maintainer/contributor), start, end, url?, description?
- summary: type(personal/auto-summary), content

**目录结构：**
~/.career_wiki/
├── sources/raw/           ← 采访产出 + 上传文件（原始材料）
├── wiki/                  ← 编译产出的页面
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
├── resumes/               ← 简历配置
├── templates/             ← 简历模板
└── .career-wiki-skill/          ← 运行时状态（不放 schema）

**schema 声明：** 写在 SKILL.md 里，不用 profile.json，跟 OKF 理念一致
**OKF 导出：** wiki markdown → Node 解析 → OKF 格式 JSON
