---
id: F04
type: grilling
status: open
assignee:
blocked-by: ["F01"]
created: 2026-07-31
title: Wiki 引擎 skill 设计（Agent 编排 ingest/compile/lint/export）
---

## Question

Wiki 引擎 skill 的完整设计——不用 llmwiki CLI，Agent 自己做：

1. **Ingest 流程**：Agent 怎么读 `sources/raw/` 的 markdown，提取实体信息
2. **Compile 流程**：Agent 怎么从 raw 文本提取概念、合并跨源信息、生成 wiki 页面、去重、标注 confidence
3. **Lint 流程**：检查什么？孤儿页面/断链/过期/矛盾/frontmatter 合规
4. **Export 流程**：OKF 导出格式，Node 脚本还是 Agent 做
5. **CLP profile**：`.career-wiki/profile.json` 定义实体/关系约束，Agent 读取后按约束工作

## Notes

- 用户核心原则：skill 只编排指导 Agent，LLM 推理让 Agent 做
- 不引入 llmwiki CLI/SDK/MCP 作为运行时依赖
- SKILL.md 里详细描述 Agent 该怎么做这些操作
- compile 是最复杂的部分：Agent 要做概念提取+跨源合并+去重

## Resolution

待用户确认
