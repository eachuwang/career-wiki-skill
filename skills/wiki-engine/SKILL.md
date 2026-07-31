---
name: wiki-engine
description: Wiki 引擎 skill。定义 career-wiki-skill 的核心数据 schema（10 实体 + 13 关系 + frontmatter 规范 + 目录结构），编排 Agent 执行 compile（全量重建）/ lint（7 类检查），并提供 OKF 导入导出 Node 脚本。当用户说"编译 wiki""检查 wiki""导出 OKF""导入 OKF"时触发。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [wiki-engine, career-wiki-skill, compile, lint, okf, schema]
    related_skills: [env-init, interview, file-parser]
---

# Wiki 引擎 Skill（Career-Wiki）

## 概述

career-wiki-skill 的核心引擎。做三件事：

1. **Compile** — 扫描 `sources/raw/` 所有 markdown，用 LLM 理解能力识别实体、跨源合并、去重、标注 confidence、生成 wikilink，全量重建 `wiki/` 目录。
2. **Lint** — 检查 wiki/ 下所有页面的完整性：孤儿页面、断链、frontmatter 合规、confidence 偏低、无来源、重复实体、过期信息。
3. **OKF 导入/导出** — 纯确定性 Node 脚本，wiki markdown ↔ OKF JSON 双向转换。

**核心理念：** schema 写在本 SKILL.md 里（不用 profile.json）；compile 的实体识别纯靠 Agent LLM 理解能力（不需要脚本）；wiki 是编译产物，不允许人工编辑，每次从所有 raw 全量重建。

---

## 数据规范（F01）

### 实体类型（10 个）

| 实体 | 目录 | 说明 |
|------|------|------|
| person | `wiki/persons/` | 个人基本信息 |
| experience | `wiki/experiences/` | 工作经历 |
| project | `wiki/projects/` | 项目经验 |
| skill | `wiki/skills/` | 技能 |
| education | `wiki/education/` | 教育背景 |
| certificate | `wiki/certificates/` | 证书 |
| award | `wiki/awards/` | 获奖 |
| publication | `wiki/publications/` | 发表文章 |
| activity | `wiki/activities/` | 开源/社区活动 |
| summary | `wiki/summaries/` | 个人优势总结 |

### Frontmatter 必填字段（所有实体通用）

```yaml
---
entity: person              # 实体类型，必须是上表 10 个之一
confidence: verified        # verified / extracted / inferred
sources:                    # 来源列表，指向 sources/raw/ 下的文件路径
  - sources/raw/interview-20260731-140000.md
  - sources/raw/uploads/老王简历_2026-07-31.md
---
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `entity` | 是 | 实体类型，10 个之一 |
| `confidence` | 是 | `verified`（用户原话确认）/ `extracted`（文件提取）/ `inferred`（Agent 推断） |
| `sources` | 是 | 来源文件路径数组，至少 1 个，指向 `sources/raw/` 下文件 |

### 各实体可选字段

#### person

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 姓名 |
| title | 是 | string | 当前/最近职位 |
| email | 否 | string | 邮箱 |
| phone | 否 | string | 电话 |
| location | 否 | string | 所在地 |
| github | 否 | string | GitHub 用户名或链接 |
| website | 否 | string | 个人网站/博客 |

#### experience

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| company | 是 | string | 公司名 |
| role | 是 | string | 职位 |
| start | 是 | string | 开始时间，格式 YYYY-MM |
| end | 是 | string | 结束时间，YYYY-MM 或 `present` |
| location | 否 | string | 工作地点 |
| type | 否 | string | `full-time` / `part-time` / `internship` |
| salary | 否 | string | 薪资（用户主动提供才填） |

#### project

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 项目名 |
| url | 否 | string | 项目链接 |
| role | 是 | string | 角色/职责 |
| start | 是 | string | 开始时间 YYYY-MM |
| end | 是 | string | 结束时间 YYYY-MM 或 `present` |
| description | 否 | string | 项目描述 |
| at_company | 否 | string | 所属公司（空=个人项目，通过 relation `at_company` 关联 experience） |

#### skill

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 技能名 |
| category | 是 | string | `语言` / `框架` / `工具` / `数据库` / `云` / `方法论` / `其他` |
| level | 是 | string | `了解` / `熟悉` / `掌握` / `精通` |
| description | 否 | string | 补充说明 |

#### education

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| school | 是 | string | 学校名 |
| degree | 是 | string | `专科` / `本科` / `硕士` / `博士` / `其他` |
| major | 是 | string | 专业 |
| start | 是 | string | 开始时间 YYYY-MM |
| end | 是 | string | 结束时间 YYYY-MM 或 `present` |
| gpa | 否 | string | GPA |
| courses | 否 | string[] | 主修课程 |

#### certificate

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 证书名 |
| issuer | 是 | string | 颁发机构 |
| date | 是 | string | 颁发日期 YYYY-MM |
| url | 否 | string | 证书链接 |

#### award

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 奖项名 |
| issuer | 是 | string | 颁发机构 |
| date | 是 | string | 获奖日期 YYYY-MM |
| description | 否 | string | 奖项描述 |

#### publication

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| title | 是 | string | 文章标题 |
| venue | 是 | string | 发表刊物/会议 |
| date | 是 | string | 发表日期 YYYY-MM |
| url | 否 | string | 文章链接 |

#### activity

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 活动名（如开源项目名） |
| role | 是 | string | `maintainer` / `contributor` |
| start | 是 | string | 开始时间 YYYY-MM |
| end | 是 | string | 结束时间 YYYY-MM 或 `present` |
| url | 否 | string | 活动链接 |
| description | 否 | string | 活动描述 |

#### summary

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| type | 是 | string | `personal`（用户自写）/ `auto-summary`（Agent 总结用户确认） |
| content | 是 | string | 总结正文 |

### 关系类型（13 个）

关系用两层表达：**frontmatter `relations`（骨架）+ 正文 wikilink（血肉）**。

```yaml
relations:
  - type: has_experience
    target: wiki/experiences/bytedance-backend-2023.md
  - type: used_skill
    target: wiki/skills/react.md
```

正文中提到其他实体时用 wikilink 双向链接：

```markdown
在 [[wiki/experiences/bytedance-backend-2023|字节跳动后端]] 期间，主要用 [[wiki/skills/react|React]] 做了 [[wiki/projects/xxx系统|XXX系统]]。
```

| 关系 | 主语实体 | 宾语实体 | 说明 |
|------|----------|----------|------|
| has_experience | person | experience | 人有工作经历 |
| has_skill | person | skill | 人有技能 |
| has_education | person | education | 人有教育背景 |
| has_certificate | person | certificate | 人有证书 |
| has_award | person | award | 人有奖项 |
| has_publication | person | publication | 人有发表 |
| has_activity | person | activity | 人有活动 |
| has_summary | person | summary | 人有总结 |
| used_skill | experience/project | skill | 经历/项目用了技能 |
| did_project | experience | project | 经历做了项目 |
| at_company | project | experience | 项目属于某公司经历 |
| took_course | education | skill | 教育中学了技能 |
| references | any | any | 引用关系（泛化） |

### Confidence 取值

| 值 | 含义 | 来源场景 |
|----|------|----------|
| `verified` | 用户原话确认 | 采访中用户明确说的、用户确认过的提取信息 |
| `extracted` | 文件提取 | 从用户上传的简历/文档中解析得到 |
| `inferred` | Agent 推断 | Agent 从上下文推断但未经用户确认 |

优先级：`verified` > `extracted` > `inferred`。合并时取最高。

### 目录结构

```
~/.career_wiki/
├── sources/
│   ├── raw/               ← 采访产出 + 文件提取产出（原始材料）
│   │   ├── interview-20260731-140000.md
│   │   └── uploads/
│   │       └── 老王简历_2026-07-31.md
│   └── uploads/           ← 用户上传的原始文件
├── wiki/                  ← 编译产出的页面（不允许人工编辑）
│   ├── persons/
│   ├── experiences/
│   ├── projects/
│   ├── skills/
│   ├── education/
│   ├── certificates/
│   ├── awards/
│   ├── publications/
│   ├── activities/
│   └── summaries/
├── resumes/               ← 简历配置
├── templates/             ← 简历模板
└── .career-wiki-skill/          ← 运行时状态
```

**schema 声明位置：** 写在本 SKILL.md 里，不用 `.career-wiki-skill/profile.json`。Agent 读取本文件即获得全部 schema 约束。

---

## Compile 流程（F04）

### 核心原则

- **全量重建** — 每次 compile 从 `sources/raw/` 所有文件重新编译，wiki/ 是编译产物，不允许人工编辑。
- **Agent 编排** — 实体识别、跨源合并、去重全靠 Agent LLM 理解能力，纯 SKILL.md 编排，不需要脚本。
- **幂等** — 同样的 raw 输入编译出的 wiki 一致（Agent 推理有随机性，但结构一致）。

### 步骤

#### 1. 扫描 raw 文件

```bash
# 列出所有 raw markdown 文件
find ~/.career_wiki/sources/raw/ -name '*.md' -type f
```

用 `search_files` 或 `find` 列出 `sources/raw/` 下所有 `.md` 文件（含 `uploads/` 子目录）。每个文件都读全文。

#### 2. 逐个读文件，Agent 识别实体

逐个读 raw markdown 文件全文。Agent 用 LLM 理解能力识别其中包含的实体：

- 采访文件：frontmatter 有 `interview_date`，正文按 7 节组织，每节可能含多个实体
- 文件提取产出：frontmatter 有 `upload_date` + `original_file`，正文是简历原文，可能含所有实体类型

**识别规则：**
- person — 姓名、职位、联系方式
- experience — 公司+职位+起止时间的组合
- project — 项目名+角色+起止时间
- skill — 技能名+分类+熟练度
- education — 学校+学历+专业+起止
- certificate — 证书名+机构+日期
- award — 奖项名+机构+日期
- publication — 标题+刊物+日期
- activity — 活动名+角色+起止
- summary — 个人优势总结

**不需要正则或脚本。** Agent 读全文后直接理解"这段在讲哪个实体"。

#### 3. 跨源合并

多个 raw 文件提到同一实体时智能合并：

| 字段类型 | 合并策略 |
|----------|----------|
| 基本信息（name/company/title 等） | 取最新（按 source 文件日期排序） |
| 描述类（description/content） | 取最详细的版本 |
| sources | 全部记录，合并为数组 |
| confidence | 取最高（verified > extracted > inferred） |
| 可选字段 | 有就记，不覆盖已有更详细的 |

**同名判定：** 不做精确字符串匹配。Agent 判断"LangChain"/"langchain"/"Langchain"是同一个 skill。用语义理解去重，不靠编辑距离。

#### 4. 去重

编译过程中维护一个已识别实体列表。每识别到新实体时检查是否已存在：

- 同类型 + 语义同名 → 合并到已有实体
- 不同类型 → 新实体

Agent 自己判断语义相似度，不做脚本去重。lint 阶段会兜底检查漏网的重复实体。

#### 5. 标注 confidence

根据来源标注每个实体的 confidence：

| 来源 | confidence |
|------|------------|
| 采访中用户原话（`>` 引用块）或用户确认的提取 | `verified` |
| 文件提取（简历 PDF/图片解析） | `extracted` |
| Agent 从上下文推断但未经确认 | `inferred` |

一个实体跨多个来源时取最高 confidence。

#### 6. 生成 wikilink

编译正文中提到其他实体时生成 wikilink：

```
[[wiki/skills/react|React]]
[[wiki/experiences/bytedance-2023|字节跳动]]
[[wiki/projects/xxx-system|XXX系统]]
```

格式：`[[{相对路径}|{显示名}]]`，路径相对于 wiki 根，不带 `.md`。

**关系双层表达：**
1. frontmatter `relations` 数组记录骨架（type + target 路径）
2. 正文 wikilink 自然嵌入叙述中

#### 7. 写入 wiki/

按实体类型写入对应子目录：

```bash
~/.career_wiki/wiki/persons/{name}.md
~/.career_wiki/wiki/experiences/{company}-{role}-{start}.md
~/.career_wiki/wiki/projects/{name}.md
~/.career_wiki/wiki/skills/{name}.md
~/.career_wiki/wiki/education/{school}-{degree}.md
~/.career_wiki/wiki/certificates/{name}.md
~/.career_wiki/wiki/awards/{name}.md
~/.career_wiki/wiki/publications/{title}.md
~/.career_wiki/wiki/activities/{name}.md
~/.career_wiki/wiki/summaries/{type}.md
```

文件名用实体关键字段，小写+连字符。中文文件名直接用中文（如 `王二.md`），不做拼音转换。

每个 wiki 页面格式：

```markdown
---
entity: experience
confidence: verified
sources:
  - sources/raw/interview-20260731-140000.md
  - sources/raw/uploads/老王简历_2026-07-31.md
company: 字节跳动
role: 后端开发
start: 2023-06
end: 2024-09
location: 北京
type: full-time
relations:
  - type: used_skill
    target: wiki/skills/go
  - type: did_project
    target: wiki/projects/xxx-system
---

在 [[wiki/persons/王二|王二]] 的 [[wiki/experiences/bytedance-backend-2023|字节跳动后端]] 经历中，主要使用 [[wiki/skills/go|Go]] 开发了 [[wiki/projects/xxx-system|XXX系统]]。
```

#### 8. 清理旧 wiki（全量重建）

> 🔴 **CHECKPOINT · 🛑 STOP — 清空 wiki/ 前必须确认**
>
> 全量重建会删除 `wiki/` 下所有旧文件，**不可逆**。执行前必须：
> 1. 向用户确认：`"即将清空 wiki/ 目录并全量重建，已有 wiki 页面将被覆盖。确认继续？"`
> 2. 用户明确回答"确认/继续/是"后才执行
> 3. 如果用户犹豫，先建议运行 OKF 导出备份：`node skills/wiki-engine/scripts/okf_export.mjs ~/.career_wiki/wiki/ -o wiki-backup.json`

用户确认后，清空 `wiki/` 下所有子目录，确保是全新重建。旧文件不保留。

---

## Lint 检查

compile 后运行 lint 检查 wiki/ 完整性。Agent 自己做检查，不依赖脚本。

### 检查项

| # | 检查 | 级别 | 说明 |
|---|------|------|------|
| 1 | 孤儿页面 | warn | 没有任何 wikilink 指向的页面（person 除外，person 是根） |
| 2 | 断链 | error | wikilink 指向的页面不存在 |
| 3 | frontmatter 缺失必填字段 | error | entity/confidence/sources 任一缺失 |
| 4 | confidence 偏低 | warn | 单个实体 confidence 为 inferred，或整个 wiki inferred 占比 > 30% |
| 5 | 无来源 | warn | sources 为空数组或缺失（理论上 error 已覆盖，此项兜底） |
| 6 | 重复实体 | error | 同名同类型实体出现在不同文件（合并没做好） |
| 7 | 过期信息 | warn | end 日期标 `present` 但 start 距今已超 5 年 |

### 执行方法

1. 用 `search_files` 列出 wiki/ 下所有 .md 文件
2. 逐个读文件，解析 frontmatter（用 `gray-matter` 或手写解析）
3. 提取所有 wikilink，建双向索引
4. 对照检查项逐条检查
5. 输出报告：

```
=== Wiki Lint Report ===
[ERROR] 断链: wiki/skills/go 被引用但不存在
  - wiki/experiences/bytedance-backend-2023.md line 5
[WARN]  孤儿页面: wiki/certificates/pmp.md 无入链
[ERROR] frontmatter 缺失: wiki/skills/react.md 缺少 confidence 字段
[WARN]  confidence 偏低: wiki/projects/xxx-system.md confidence=inferred
[ERROR] 重复实体: wiki/skills/go.md 与 wiki/skills/golang.md 疑似重复
[WARN]  过期信息: wiki/experiences/oldjob.md end=present 但 start=2018-01

总计: 3 errors, 4 warnings
```

### error 处理

有 error 时 compile 不算成功，需修复后重新 compile。Agent 根据 lint 报告定位问题，修 raw 或重跑 compile。

---

## OKF 导出/导入

OKF（Open Knowledge Format）是 wiki 的 JSON 序列化格式，用于跨系统交换。**纯确定性操作，不需要 LLM**，用 Node 脚本执行。

### 脚本

- `skills/wiki-engine/scripts/okf_export.mjs` — wiki markdown → OKF JSON
- `skills/wiki-engine/scripts/okf_import.mjs` — OKF JSON → wiki markdown

依赖：`gray-matter`（package.json 声明）

### OKF JSON 格式

```json
{
  "version": "1.0",
  "exported_at": "2026-07-31T14:00:00Z",
  "entities": [
    {
      "path": "wiki/experiences/bytedance-backend-2023.md",
      "entity": "experience",
      "confidence": "verified",
      "sources": ["sources/raw/interview-20260731-140000.md"],
      "fields": {
        "company": "字节跳动",
        "role": "后端开发",
        "start": "2023-06",
        "end": "2024-09"
      },
      "relations": [
        {"type": "used_skill", "target": "wiki/skills/go.md"}
      ],
      "links": [
        {"target": "wiki/skills/go", "name": "Go"}
      ],
      "content": "正文 markdown（含 wikilink 原文）..."
    }
  ]
}
```

### 导出命令

```bash
node skills/wiki-engine/scripts/okf_export.mjs ~/.career_wiki/wiki/ -o okf-export.json
```

参数：
- 第一个参数：wiki 根目录路径（默认 `~/.career_wiki/wiki/`）
- `-o`：输出文件路径（默认 `okf-export.json`）

### 导入命令

```bash
node skills/wiki-engine/scripts/okf_import.mjs okf-export.json -o ~/.career_wiki/wiki/
```

参数：
- 第一个参数：OKF JSON 文件路径
- `-o`：wiki 输出目录（默认 `~/.career_wiki/wiki/`）

### 依赖安装

在 career-wiki-skill 仓库根目录运行：

```bash
npm install
```

`package.json` 在仓库根目录，声明 `gray-matter` 依赖。

---

## 何时触发

- 用户说"编译 wiki / compile / 重建 wiki"
- interview/file-parser skill 产出 raw 后自动触发
- 用户说"检查 wiki / lint"
- 用户说"导出 OKF / 导出 JSON"
- 用户说"导入 OKF / 从 JSON 恢复"
- 用户问"wiki 有什么问题"

---

## Common Pitfalls

1. **人工编辑 wiki 页面。** wiki 是编译产物，下次 compile 会被覆盖。要改信息改 `sources/raw/` 再 recompile。

2. **增量 compile。** 只编译新增 raw 不扫旧的。会导致旧实体的 sources 丢失、已删除的 raw 对应实体残留。必须全量重建。

3. **在 compile 阶段引入脚本做实体识别。** 实体识别纯靠 Agent LLM 理解能力。脚本只做 OKF 导入导出这种确定性操作。

4. **confidence 标注错误。** 采访用户确认过的信息标 inferred（应为 verified）。看来源：用户原话/确认 → verified；文件提取 → extracted；Agent 推断 → inferred。

5. **wikilink 路径不带 .md。** wikilink 格式 `[[wiki/skills/react|React]]`，不带 `.md` 后缀。frontmatter relations 的 target 可以带 .md（脚本处理时统一去掉）。

6. **合并时丢失来源。** 多个 raw 提到同一实体，sources 必须全部合并记录，不能只留最新来源。

7. **OKF 导出导入用 Agent 推理。** OKF 操作是纯确定性的，读 markdown → parse frontmatter → 提取 wikilink → 输出 JSON。不需要 LLM 参与。

8. **lint 只报不修。** lint 发现 error 应该修 raw 或重跑 compile，不能直接改 wiki 页面。

---

## Verification Checklist

### Compile

- [ ] `sources/raw/` 下所有 .md 文件已读取
- [ ] 每个文件中的实体已识别
- [ ] 跨源同名实体已合并
- [ ] 去重检查已完成
- [ ] 每个实体 confidence 已标注
- [ ] 正文 wikilink 已生成
- [ ] frontmatter relations 已填写
- [ ] wiki/ 旧文件已清空
- [ ] 新页面已写入对应子目录

### Lint
- [ ] 所有 wiki 页面 frontmatter 含 entity/confidence/sources
- [ ] 所有 wikilink 指向的页面存在
- [ ] 无重复实体
- [ ] lint 报告已输出

### OKF
- [ ] `npm install` 已运行，gray-matter 已装
- [ ] 导出：OKF JSON 含所有 wiki 实体
- [ ] 导入：wiki markdown 可从 OKF JSON 还原
- [ ] 往返一致：export → import → export 结果一致
