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

已确认。F02 决议：

**问题树结构：** 7 节
1. 基本信息（person）— 姓名、职位、联系方式、所在地、GitHub/网站、求职意向
2. 工作经历（experience）— 可多条，每段：公司、职位、时间、类型、薪资（可选）；追问项目→project、技能→skill；循环"还有吗"
3. 项目经验（project）— 可多条，每个：名称、角色、时间、链接、描述、属于哪家公司→experience；追问技能→skill；循环"还有吗"
4. 技能（skill）— 可多条，每个：名称、分类、等级、简述；循环"还有吗"
5. 教育背景（education）— 可多条，学校、学历、专业、时间、GPA（可选）、课程（可选）；循环"还有吗"
6. 证书/获奖/发表/活动 — 可多条，逐个问；循环"还有吗"
7. 个人优势总结（summary）— 用户自己写 or LLM 从采集信息总结

**采访模式：** 混合 C — 基本信息填表式快过，经历/项目让用户自由讲再提取确认

**产出格式：** 一个 markdown 文件存 `sources/raw/interview-{timestamp}.md`
- frontmatter: interview_date, round（第几轮，续采递增）, interviewer: career-wiki-skill
- 按问题树结构组织
- 保留用户原话，不做结构化提取（提取是 F04 的活）

**续采：** 支持 C — 用户明确说补什么直接进对应分支，不明确则引导

**采完自动 compile：** 选 A — 采完写 raw 后自动触发 wiki 引擎 compile

**subagent 并行：** 选 A — 有 subagent 的并行 compile，用户不等；没有的同步执行

**跨 Agent 一致性：** 选 C — 假设所有支持 skill 的 Agent 有基本对话能力，不做降级
