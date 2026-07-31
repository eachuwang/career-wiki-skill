---
id: F11
type: task
status: open
assignee:
blocked-by: ["F01", "F04"]
created: 2026-07-31
title: OKF 导入/导出（格式规范/Node 解析/双向转换）
---

## Question

OKF 导入/导出的完整设计：

1. **OKF 格式规范**：确认谷歌 OKF 的具体格式，或自定义一套够用的 JSON 结构
2. **导出流程**：Node 脚本读 wiki markdown → 解析 frontmatter + wikilink → 组装 OKF JSON → 写文件
3. **导入流程**：读 OKF JSON → 按实体拆分 → 写回 wiki markdown 页面
4. **融入 Wiki 引擎**：导出/导入作为 Wiki 引擎 skill 的子命令
5. **OKF JSON 结构**：nodes（实体）+ edges（关系）+ sources（原始材料）

## Notes

- 用户在 Q15 选 A（Node 自己解析组装 OKF JSON）
- 用户在 Q12 确认：A+B 结合（CLP schema 内部存储，OKF 做导出格式）
- Node 脚本做确定性操作，不需要 LLM
- 融入 F04 Wiki 引擎 skill，不单独建 skill

## Resolution

已合并到 F04。OKF 导入/导出作为 wiki 引擎 skill 的 Node 脚本，不单独建 skill。
