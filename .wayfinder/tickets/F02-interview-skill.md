---
id: F02
type: grilling
status: open
assignee:
blocked-by: ["F01"]
created: 2026-07-31
title: 采访 skill 设计（问题树/混合模式/产出格式）
---

## Question

采访 skill 的完整设计：

1. **问题树结构**：基本信息 → 工作经历 → 项目经验 → 技能 → 教育 → 自我评价。每层的具体问题列表
2. **混合模式流程**：结构化骨架怎么跟自由对话结合？AI 什么时候追问、什么时候跳过
3. **产出格式**：采访结束产出原始 markdown 文件，写入 `sources/raw/interview-{timestamp}.md`，带 frontmatter（采访时间、轮次）
4. **续采支持**：用户后续补充信息时怎么追加
5. **跨 Agent 一致性**：不同 Agent 的对话能力不同，流程编排怎么适配最低能力

## Notes

- 用户在 Q5 选 C（混合模式：结构化骨架 + 自由对话）
- 采访产出 = 原始 markdown，跟上传文件平权，统一进 `sources/raw/`
- 采访 skill 不做预提取，纯 SKILL.md 编排 + Write 写 markdown + Bash 调 wiki 引擎
- 不需要 Python 脚本（降级了）

## Resolution

待用户确认
