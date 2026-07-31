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
5. **CLP profile**：`.career-wiki-skill/profile.json` 定义实体/关系约束，Agent 读取后按约束工作

## Notes

- 用户核心原则：skill 只编排指导 Agent，LLM 推理让 Agent 做
- 不引入 llmwiki CLI/SDK/MCP 作为运行时依赖
- SKILL.md 里详细描述 Agent 该怎么做这些操作
- compile 是最复杂的部分：Agent 要做概念提取+跨源合并+去重

## Resolution

已确认。F04 补充 Q-F04.5：OKF 导出/导入合并到 F04，Node 脚本执行。F11 关闭。

**Compile 流程：**
1. 扫描 sources/raw/ 下所有 .md 文件
2. 逐个读文件，Agent 用 LLM 理解能力识别实体（纯 SKILL.md 编排，不需要脚本）
3. 跨源合并：同名实体智能合并——基本信息取最新、描述取最详细、sources 全部记录、confidence 取最高
4. 去重："LangChain"/"langchain"/"Langchain" → 同一个 skill 页面
5. 标注 confidence：用户原话=verified、文件提取=extracted、Agent推断=inferred
6. 生成 wikilink：正文中提到其他实体时用 [[wiki/skills/react|React]] 链接
7. 写入 wiki/ 对应目录

**重建策略：** A — 全量重建。wiki 是编译产物，不允许人工编辑，每次从所有 raw 重新编译。

**实体识别：** A — 纯 SKILL.md 编排，Agent 靠 LLM 理解能力识别。脚本辅助去重放到 lint 阶段。

**Lint 检查项（从推荐）：**
- 孤儿页面（warn）— 没有任何 wikilink 指向
- 断链（error）— wikilink 指向的页面不存在
- frontmatter 缺失必填字段（error）— entity/confidence/sources
- confidence 低的页面（warn）— 大量 inferred
- 没有来源的实体（warn）— sources 为空
- 重复实体（error）— 同名不同文件（合并没做好）
- 过期信息（warn）— end 日期很久以前仍标 present

**OKF 导出：** F11 合并到 F04 — 确定性操作，Node 脚本读 wiki markdown → 解析 frontmatter + wikilink → 组装 OKF JSON → 导出。OKF 导入反向：OKF JSON → 按实体拆分 → 写回 wiki markdown。不需要单独 skill，放进 wiki 引擎 skill。

**Skill 形式：** SKILL.md（编排 Agent 做 compile/lint）+ Node 脚本（OKF 导入/导出）

**F11 状态：** 合并到 F04，F11 ticket 关闭
