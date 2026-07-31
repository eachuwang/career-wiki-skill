---
name: env-init
description: 环境初始化 skill。检查 Node.js/Python/npm 版本、创建 ~/.career_wiki/ 目录结构、npm 安装 Node 依赖、首次引导用户选数据目录。所有其他 skill 的前置依赖。
category: career-wiki
---

# 环境初始化（env-init）

## 何时使用

- 用户第一次使用 career-wiki 包时
- 用户环境变化后（升级了 Node、重装系统、切换机器）
- 任何其他 career-wiki skill 报告依赖缺失时
- 用户显式要求"检查环境"/"初始化环境"时

## 检查项

| 项 | 最低版本 | 检查命令 | 必须 |
|---|---|---|---|
| Node.js | ≥ 18 | `node -v` | 是 |
| Python | ≥ 3.9 | `python3 --version` | 是 |
| npm | 任意 | `npm -v` | 是 |
| gray-matter | 已安装 | `npm list gray-matter` | 否，自动装 |

## 初始化流程

按顺序执行，遇到失败立即停下报错给用户：

1. **运行检查脚本**
   ```bash
   python3 skills/env-init/scripts/env_check.py
   ```
   脚本会打印每一项的检查结果与最终状态。如果 Node/Python/npm 不达标，告诉用户怎么升级，不要自己替用户装。

2. **首次引导（仅 `~/.career_wiki/` 不存在时触发）**
   - 问用户：使用默认目录 `~/.career_wiki/` 还是自定义路径？
   - 用户给自定义路径 → 校验路径可写，用它
   - 用户接受默认 → 用 `~/.career_wiki/`
   - 把最终路径写入 `~/.career_wiki/.career-wiki/config.json` 的 `root` 字段

3. **创建目录结构**（脚本已做，但若用户选了自定义路径，需在自定义路径下建）
   ```
   sources/raw/
   sources/uploads/
   sources/raw/uploads/
   wiki/persons/
   wiki/experiences/
   wiki/projects/
   wiki/skills/
   wiki/education/
   wiki/certificates/
   wiki/awards/
   wiki/publications/
   wiki/activities/
   wiki/summaries/
   resumes/
   templates/
   .career-wiki/
   ```

4. **npm install**
   - 在 career-wiki 仓库根目录运行 `npm install`（装 wiki 引擎用的 Node 依赖，如 gray-matter）
   - 如果 `package.json` 不存在，跳过这一步并提示用户

5. **提示用户**
   - 环境就绪
   - 下一步可以开始用采访 skill（F02）或文件解析 skill（F03）采集信息了

## 重检查

用户环境变化后重跑 `env_check.py` 即可。脚本幂等，目录已存在不会报错，依赖已装会跳过。

## 跨平台

- Node/Python/npm 命令在 macOS/Linux/Windows 通用，脚本用 `subprocess` + `shell=True` 跨平台调用
- 路径用 `pathlib.Path` + `Path.home()`，不硬编码分隔符
- Windows 上 `python3` 可能叫 `python`，脚本会 fallback

## 输出规范

检查脚本退出码：
- `0` — 全部通过，环境就绪
- `1` — 有失败项，需要用户处理
