---
name: env-init
description: career-wiki 环境初始化 skill。检查 Node.js/Python/npm 版本、创建 ~/.career_wiki/ 目录结构、npm 安装 Node 依赖、首次引导用户选数据目录。当用户明确说"检查 career-wiki 环境"/"初始化 career-wiki 环境"/"初始化 career-wiki"时触发。所有其他 career-wiki skill 的前置依赖。
category: career-wiki-skill
---

# 环境初始化（env-init）

## 何时使用

- 用户第一次使用 career-wiki-skill 包时
- 用户环境变化后（升级了 Node、重装系统、切换机器）
- 任何其他 career-wiki-skill skill 报告依赖缺失时
- 用户显式要求"检查 career-wiki 环境"/"初始化 career-wiki 环境"时

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

   > 🔴 **CHECKPOINT** — 选数据目录前必须向用户确认路径选择
   >
   > 在执行下一步之前，**必须**让用户明确选择数据目录：
   > - 问用户：使用默认目录 `~/.career_wiki/` 还是自定义路径？
   > - 用户给自定义路径 → 校验路径可写，用它
   > - 用户接受默认 → 用 `~/.career_wiki/`
   > - 把最终路径写入 `~/.career_wiki/.career-wiki-skill/config.json` 的 `root` 字段
   >
   > 🛑 不要在用户未确认前直接创建目录。数据目录是后续所有 skill 的根路径，选错了全部要重来。

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
   .career-wiki-skill/
   ```

4. **npm install**
   - 在 career-wiki-skill 仓库根目录运行 `npm install`（装 wiki 引擎用的 Node 依赖，如 gray-matter）
   - 如果 `package.json` 不存在，跳过这一步并提示用户

5. **提示用户**
   - 环境就绪
   - 下一步可以开始用采访 skill（F02）或文件解析 skill（F03）采集信息了

## 重检查

用户环境变化后重跑 `env_check.py` 即可。脚本幂等，目录已存在不会报错，依赖已装会跳过。

## Common Pitfalls

1. **用 pip 替 npm 装 Node 依赖。** `gray-matter` 是 Node 包，必须用 `npm install` 安装。用 `pip install gray-matter` 装的是无关的 Python 包，wiki 引擎和简历生成跑不起来。Node 依赖用 npm，Python 脚本只用标准库，不要混。

2. **跳过目录创建直接用后续 skill。** 初始化时如果 `~/.career_wiki/` 及其子目录（`sources/raw/`、`wiki/persons/` 等）没建好，后续 interview/file-parser/wiki-engine 等 skill 会找不到路径、写文件失败。目录结构是所有 skill 的地基，必须先建。

3. **初始化时跑 wiki compile。** 刚初始化完 `sources/raw/` 是空的，没有采访产出也没有文件提取产出，此时跑 compile 没有任何 raw 可扫，生成的 wiki 是空的。compile 应在 interview 或 file-parser 产出 raw 之后才触发，不要在 env-init 阶段调 wiki 引擎。

4. **不确认就让用户选了默认路径。** 数据目录路径写进 `config.json` 的 `root` 字段后，所有后续 skill 都基于它。选错了全要重来。必须向用户明确确认路径选择，不能默认替用户决定。

5. **Node/Python/npm 版本不达标还继续。** 检查脚本报版本不达标时，不要自己替用户升级（不同系统包管理器不同），应告诉用户怎么升级，升级完重跑检查脚本。

## 跨平台

- Node/Python/npm 命令在 macOS/Linux/Windows 通用，脚本用 `subprocess` + `shell=True` 跨平台调用
- 路径用 `pathlib.Path` + `Path.home()`，不硬编码分隔符
- Windows 上 `python3` 可能叫 `python`，脚本会 fallback

## 输出规范

检查脚本退出码：
- `0` — 全部通过，环境就绪
- `1` — 有失败项，需要用户处理
