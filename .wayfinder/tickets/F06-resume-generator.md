---
id: F06
type: grilling
status: open
assignee:
blocked-by: ["F01", "F04"]
created: 2026-07-31
title: 简历生成 skill + API server（SDK 查询/模板组装/JSON-LD 导出）
---

## Question

简历生成 skill + Node API server 的完整设计：

1. **数据层**：Node 脚本读 wiki markdown → 解析 frontmatter（gray-matter）→ 提取 wikilink（正则）→ 组装结构化简历 JSON
2. **API server**：HTTP 接口设计——GET /api/wiki（读 wiki 数据）、POST /api/resume/generate（生成简历）、POST /api/resume/export（导出 PDF/HTML/JSON）
3. **模板组装**：按模板 schema 从 wiki 实体抽取数据，组装到简历模块
4. **导出**：JSON-LD / PDF / HTML 三种格式
5. **LLM 调用**：纯确定性操作不需要 LLM，还是有些步骤需要？

## Notes

- 用户在 Q7 选 C（简历生成是数据层，Web 是展示层，解耦）
- 用户在 Q9 选 B（简历生成 Node 脚本同时做 API server + 数据层）
- 用户在 Q8 选 C（PDF + HTML + JSON 三格式）
- Node 自己解析 wiki（Q14），不用 LLM
- 需要 gray-matter + 正则提取 wikilink

## Resolution

待用户确认
