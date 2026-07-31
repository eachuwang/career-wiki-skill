---
name: privacy-filter
description: 用途：对 wiki 导出内容做隐私脱敏。当用户"预览脱敏效果"、"导出前脱敏"、"隐藏敏感信息"时触发。正则匹配姓名/电话/邮箱/薪资/公司名/GitHub 用户名，按固定规则替换，用户勾选字段开关实时看效果，满意后导出。导出格式 PDF/HTML/JSON 均调用本 skill 的 Python 脚本。
version: 1.0.0
author: career-wiki
license: MIT
metadata:
  hermes:
    tags: [privacy-filter, career-wiki, export, mask, pii]
    related_skills: [wiki-engine, interview, file-parser]
---

# 隐私脱敏 Skill（Career-Wiki）

## 概述

wiki 里存的是真实数据。**脱敏只在导出/预览时做，wiki 原始数据不改。** 用户在 Web 预览界面勾选字段脱敏开关，实时看脱敏后效果，满意后导出。导出时由 Node API server 调用本 skill 的 Python 脚本 `privacy_filter.py` 做实际替换。

**核心理念：**
- 规则固定，用户只勾选"开/关"，不调规则参数
- wiki 存真实，脱敏只作用于导出副本
- 正则匹配敏感字段 → 规则替换 → 输出脱敏后内容

## 何时触发

- 用户说"预览脱敏效果 / 看看脱敏后什么样 / 隐藏敏感信息"
- 用户点导出前，Web 前端调本 skill 的脱敏接口做实时预览
- Node API server 导出 PDF/HTML/JSON 时调 `privacy_filter.py` 应用脱敏
- 用户说"这个简历出去要把薪资隐掉 / 把电话掩码"

**不用于：** 采集阶段脱敏（采集必须存原话）；改 wiki 源数据（脱敏是只读视图）。

## 脱敏规则（固定）

| 字段 | 规则 | 示例 | 默认 |
|------|------|------|------|
| 姓名 | 保留姓，名用 `**` | `王小明` → `王**` | 显示（不脱敏） |
| 电话 | 保留前 3 后 4，中间掩码 | `13812345678` → `138****5678` | 脱敏 |
| 邮箱 | 保留首字母 + 域名 | `wang@example.com` → `w***@example.com` | 脱敏 |
| 薪资 | 整段隐藏，替换为 `[薪资已隐藏]` | `月薪 25k` → `[薪资已隐藏]` | 脱敏 |
| 公司名 | 原样 或 隐藏，二选一 | `字节跳动` → `字节跳动` 或 `[公司已隐藏]` | 显示 |
| GitHub | 原样 或 隐藏，二选一 | `github.com/joewang` → 原样 或 `[GitHub已隐藏]` | 显示 |

**默认值依据：** 电话/邮箱/薪资默认脱敏（泄露风险高）；姓名/公司/GitHub 默认显示（求职场景需要）。用户可在预览界面逐项切换。

## 操作方式

### Web 预览（实时）

1. 用户在 Web 前端打开简历预览
2. 侧边栏列出 6 个脱敏开关，带默认值
3. 用户勾选/取消勾选 → 前端调 `privacy_filter.py` 重新脱敏 → 实时渲染
4. 用户满意后点"导出" → Node API server 用最终配置调用 `privacy_filter.py` 生成导出文件

### CLI（脚本直调）

```bash
# 默认配置（6 字段默认值）脱敏一个文件
python3 skills/privacy-filter/scripts/privacy_filter.py input.md

# 指定配置（JSON），脱敏后输出到文件
python3 skills/privacy-filter/scripts/privacy_filter.py input.md --config config.json -o output.md

# 只看哪些会被脱敏，不实际替换（dry-run，打印 diff）
python3 skills/privacy-filter/scripts/privacy_filter.py input.md --dry-run
```

**配置 JSON 格式**（即 6 个开关）：

```json
{
  "name": false,
  "phone": true,
  "email": true,
  "salary": true,
  "company": false,
  "github": false
}
```

- `true` = 该字段脱敏
- `false` = 该字段显示原值
- 缺省字段用默认值

## 数据目录约定

- **不改 wiki 源数据**——脱敏只作用于传入脚本的文本副本
- 脚本读任意 markdown/文本，输出脱敏后文本到 stdout 或 `-o` 指定文件
- 导出产物（脱敏后的 PDF/HTML/JSON）由 Node API server 管理，不在本 skill 目录

## 脱敏流程

### 步骤 1：确定脱敏配置

1. 用户在 Web 前端勾选 6 个开关 → 前端生成 config JSON
2. CLI 模式：用 `--config` 传 JSON 文件，或用默认配置

### 步骤 2：调用 Python 脚本

```bash
python3 skills/privacy-filter/scripts/privacy_filter.py <input> [--config config.json] [-o output] [--dry-run]
```

脚本流程：
1. 读输入文件（markdown 纯文本）
2. 读配置 JSON（或用默认）
3. 对每个开启的字段，用预定义正则匹配 → 规则替换
4. `--dry-run` 时打印 diff（原值 → 脱敏值），不写文件
5. 非 dry-run 时输出脱敏后全文到 stdout 或 `-o` 文件

### 步骤 3：输出

- **Web 预览：** 脚本输出脱敏后文本 → 前端渲染实时预览
- **导出：** 脚本输出脱敏后文本 → Node API server 转成 PDF/HTML/JSON

## 正则匹配规则

| 字段 | 正则 | 说明 |
|------|------|------|
| 电话 | `\b1[3-9]\d{9}\b` | 11 位中国大陆手机号 |
| 邮箱 | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` | 标准邮箱格式 |
| 薪资 | `(月薪\|年薪\|月薪\s*)\s*[\d,.]+\s*[kK万千百]?(元)?(\s*[\/／]\s*月)?` | 匹配薪资表述 |
| GitHub | `github\.com/[a-zA-Z0-9_-]+` | GitHub URL 或用户名 |
| 姓名 | 需上下文标记，见下 | 无通用正则 |

**姓名脱敏的特殊处理：**
姓名没有可靠正则。脚本依赖 wiki frontmatter 的 `name` 字段或文本中显式标注的姓名（如"姓名：王小明"）来定位。脚本会：
1. 读 frontmatter 的 `name` 字段（如有）
2. 匹配文本中 `姓名[:：]\s*([\u4e00-\u9fa5]{2,4})` 模式
3. 对命中的姓名做保留首字 + `**` 替换

如果 wiki 数据没有结构化姓名字段，姓名脱敏可能不生效——脚本会打印 warning。

## 跨 Agent 一致性

- Python 脚本只依赖标准库（`re` / `json` / `argparse` / `pathlib`），不装第三方包
- 所有 Agent 用同一个脚本，脱敏结果一致
- Web 前端和 CLI 用同一套规则，预览和导出结果一致

## Common Pitfalls

1. **改 wiki 源数据做脱敏。** 脱敏只作用于副本。wiki 原始数据必须保留真实信息，否则下次导出无法切换脱敏程度。

2. **让用户调规则参数。** 规则固定，用户只勾选开/关。如果把"掩码几位"交给用户调，配置爆炸且易出错。

3. **姓名脱敏漏掉。** 姓名没有可靠正则，依赖 frontmatter 或显式标注。如果 wiki 数据没有 `name` 字段，姓名脱敏不生效——脚本应打印 warning，不要静默跳过。

4. **薪资正则太宽。** 薪资正则只匹配明确的"月薪/年薪 X k"表述，不要把正文里的普通数字也替换掉。漏匹配比误伤好。

5. **dry-run 不打印 diff。** `--dry-run` 必须打印"原值 → 脱敏值"的对照，让用户看到将要替换什么。只打印脱敏后全文不算 diff。

6. **前端预览和导出用不同规则。** 前端预览和 Node 导出必须调同一个 `privacy_filter.py`，用同一份配置。否则预览看到的效果和导出的文件不一致。

7. **公司名/GitHub 只做"显示/隐藏"，不做部分掩码。** 这两个字段是二选一：要么完整显示，要么整段替换为 `[XX已隐藏]`。不要做"字节**"这种半掩码——公司名不像姓名有固定结构。

## Verification Checklist

- [ ] `skills/privacy-filter/scripts/privacy_filter.py` 存在且可执行
- [ ] 默认配置正确（电话/邮箱/薪资=脱敏，姓名/公司/GitHub=显示）
- [ ] 6 个字段脱敏规则按本文档表格实现
- [ ] `--dry-run` 打印"原值 → 脱敏值" diff
- [ ] `--config` 能传自定义配置 JSON
- [ ] `-o` 能输出到指定文件，缺省输出到 stdout
- [ ] 无姓名字段时打印 warning，不静默失败
- [ ] 只用标准库，无第三方依赖
