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

career-wiki 的核心数据 schema 怎么定义？需要确定：

1. **实体类型**：person / experience / skill / project / education / ... 还需要加吗？
2. **每种实体的 frontmatter 字段**：必填/可选字段
3. **关系类型**：has_experience / used_skill / did_project / ... 用 frontmatter relations（骨架）+ wikilink（正文）
4. **confidence 取值**：verified / extracted / inferred / ... 还有？
5. **sources 字段格式**：指向 `sources/raw/` 的路径
6. **目录结构**：`sources/raw/` 和 `wiki/` 同级，wiki 下按实体类型分子目录
7. **CLP profile 文件**：是否有 `.career-wiki/profile.json` 声明实体/关系/字段约束

## Notes

- 借鉴 llmwiki 的 CLP 概念（实体类型 + 关系 + frontmatter），但不用其编译器
- 用户在 Q12 确认：A + B 结合（CLP schema 做内部存储，OKF 做导出格式）
- frontmatter 存 entity 属性 + confidence + sources + relations（骨架），wikilink 在正文做关联（血肉）
- 所有数据纯本地 markdown + YAML frontmatter，Git 友好

## Resolution

待用户确认
