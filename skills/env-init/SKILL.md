---
name: env-init
description: career-wiki 环境初始化 skill。检查 Node.js/Python/npm 版本、创建 ~/.career_wiki/ 目录结构、npm 安装 Node 依赖、定位或初始化 WorkspaceRoot。当用户明确说"检查 career-wiki 环境"/"初始化 career-wiki 环境"/"初始化 career-wiki"时触发。所有其他 career-wiki skill 的前置依赖。
category: career-wiki-skill
---

# 环境初始化

从完整安装的仓库根目录运行。要求 Node 22.20+ 或 24.12+（LTS）及 npm；`env_check.py` 入口需要 Python 3.9+。

1. **定位**：`node skills/env-init/scripts/workspace_root.mjs`。优先使用显式 `--root`、`WIKI_ROOT`、`~/.career-wiki-skill/workspace.json`，最后沿用旧定位配置或默认 `~/.career_wiki/`。无效配置或路径直接报错；不要改用另一个目录。
2. **初始化**：`python3 skills/env-init/scripts/env_check.py`。首次未指定时说明采用默认目录。用户明确选择新目录时附 `--root "<路径>"`；脚本验证可写、安装锁定依赖、初始化新布局并记住绝对 `WorkspaceRoot`。重复运行复用已保存选择，保留现有配置和知识。不编译空 Wiki。
3. **旧布局**：初始化遇到 `wiki/` 会退出而不创建 `knowledge/`；按 [迁移流程](../wiki-engine/SKILL.md) 处理授权和新旧数据冲突。迁移命令缺依赖时，先在 `skills/` 运行 `npm ci`，无需初始化旧目录。
4. **启动编辑器**：`node skills/env-init/scripts/launch.mjs`。它预检工具与依赖、启动或复用身份和数据根均匹配的本地服务，并打开浏览器。用 `--no-open` 只启动和获取 URL；使用其他已存在工作区时附 `--root`。遇到端口占用或数据根不匹配，报告冲突，不关闭其他进程。

失败时先诊断权限内可修复的问题。只有后续步骤确实受阻才暂停，报告所需操作。完成标准：定位命令输出正确绝对路径；编辑器启动时代理健康检查也返回同一个根。
