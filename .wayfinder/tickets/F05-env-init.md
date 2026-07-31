---
id: F05
type: task
status: open
assignee:
blocked-by: []
created: 2026-07-31
title: 环境初始化 skill（检查 Node/Python/依赖/首次引导）
---

## Question

环境初始化 skill 的完整设计：

1. **检查项**：Node.js 版本 / Python 版本 / npm / 必要的 Python 包
2. **安装逻辑**：缺什么自动装什么（npm install / pip install）
3. **首次引导**：用户第一次使用时，选择 wiki 存储目录、初始化目录结构、创建 profile.json
4. **跨平台**：macOS / Windows / Linux 的差异处理
5. **重检查命令**：用户环境变化后重新检查

## Notes

- 用户在 Q4 确认：有 Agent 工具的用户一定有 Node.js
- Python 需要检查（文件解析 skill 依赖）
- 需要一个 Python 脚本做环境检测

## Resolution

待用户确认
