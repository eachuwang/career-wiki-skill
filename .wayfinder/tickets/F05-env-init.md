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

已确认。F05 决议：

**检查项：**
- Node.js ≥ 18（必须）— `node -v`
- Python ≥ 3.9（必须）— `python3 --version`
- npm（必须）— `npm -v`
- gray-matter（自动装）— `npm list gray-matter`
- ~/.career_wiki/ 目录（不存在则创建）
- 子目录结构（不存在则创建）

**检查脚本：** A — Python 脚本 `env_check.py`，用 subprocess 调命令，跨平台兼容

**初始化流程：**
1. 检查 ~/.career_wiki/ 是否存在
2. 不存在 → 问用户：默认 ~/.career_wiki/ 还是自定义路径
3. 创建目录结构：sources/raw/, sources/uploads/, sources/raw/uploads/, wiki/{persons,experiences,projects,skills,education,certificates,awards,publications,activities,summaries}/, resumes/, templates/, .career-wiki-skill/
4. npm install（wiki 引擎的 Node 依赖，如 gray-matter）
5. 提示用户：环境就绪，可以开始用采访 skill 了

**Skill 形式：** SKILL.md + Python 脚本 × 1
