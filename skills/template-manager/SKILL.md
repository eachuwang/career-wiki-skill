---
name: template-manager
description: 用途：管理简历模板（创建/查看/复制预设模板）。用户说"创建一个新模板"、"看看有哪些模板"、"复制技术简约改一下"时触发。模板由 JSON 配置（布局+模块+字段映射）+ CSS 样式文件组成，存 ~/.career_wiki/templates/。被 F06 简历生成读取，被 F07 Web 前端用于模板选择 UI。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [template-manager, career-wiki-skill, templates, resume]
    related_skills: [resume-generator, web-frontend, multi-resume]
    tickets: [F08]
---

# 模板管理 Skill（Career-Wiki）

## 概述

管理简历模板。模板 = **JSON 配置**（定义布局、模块顺序、字段映射、样式引用）+ **CSS 样式文件**（定义视觉样式）。用户通过纯对话创建/查看/复制模板，不需要手写 JSON 或 CSS——Agent 引导填写，生成文件。

**核心理念：** 模板是数据，不是代码。JSON 描述结构，CSS 描述外观，两者解耦。改布局改 JSON，改颜色改 CSS。

## 何时触发

- 用户说"创建一个新模板" / "新建模板" → 进创建流程
- 用户说"看看有哪些模板" / "列出模板" → 列出 `~/.career_wiki/templates/` 下所有模板
- 用户说"复制技术简约改一下" / "基于 X 改一个" → 复制预设模板再引导修改
- 用户说"删掉某个模板" → 删除（预设模板不可删，只能删自定义）
- env-init 后用户要配置模板时

**不用于：** 生成简历（用 resume-generator skill）；多简历配置管理（用 multi-resume skill）。

## 数据目录约定

```
~/.career_wiki/templates/
├── tech-minimal.json          ← 预设：技术简约
├── tech-minimal.css
├── business-sidebar.json      ← 预设：商务侧栏
├── business-sidebar.css
├── creative-color.json        ← 预设：创意色块
├── creative-color.css
├── academic-plain.json        ← 预设：学术纯文
├── academic-plain.css
└── {user-custom}.json         ← 用户自定义模板
    {user-custom}.css
```

- 首次调用先确认 `~/.career_wiki/` 存在；不存在 → 提示跑 env-init
- 预设模板随 skill 包分发，env-init 时从 `skills/template-manager/templates/` 复制到 `~/.career_wiki/templates/`
- 自定义模板存同一目录，跟预设平权

## 模板 JSON 格式

```json
{
  "name": "技术简约",
  "id": "tech-minimal",
  "style": "tech-minimal.css",
  "layout": "single-column",
  "has_photo": false,
  "font": {
    "family": "'PingFang SC', 'Microsoft YaHei', sans-serif",
    "size_base": "14px",
    "size_h1": "24px",
    "size_h2": "18px"
  },
  "sections": [
    {
      "module": "person",
      "title": "个人信息",
      "fields": ["name", "title", "email", "phone", "github", "website"]
    },
    {
      "module": "experience",
      "title": "工作经历",
      "fields": ["company", "role", "start", "end", "description"],
      "order": "desc"
    },
    {
      "module": "project",
      "title": "项目经验",
      "fields": ["name", "role", "start", "end", "description", "url"]
    },
    {
      "module": "skill",
      "title": "技能",
      "fields": ["name", "category", "level"],
      "group_by": "category"
    },
    {
      "module": "education",
      "title": "教育背景",
      "fields": ["school", "degree", "major", "start", "end"]
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 模板显示名 |
| `id` | string | 是 | 模板唯一标识（kebab-case），= 文件名前缀 |
| `style` | string | 是 | CSS 文件名（相对 templates/ 目录） |
| `layout` | enum | 是 | `single-column` / `double-column` |
| `has_photo` | bool | 否 | 是否有照片位，默认 false |
| `font` | object | 否 | 字体配置，family + size 系列 |
| `sections` | array | 是 | 模块顺序定义，决定简历从上到下哪些模块出现、叫什么名、抽哪些字段 |
| `sections[].module` | enum | 是 | wiki 实体类型：person/experience/project/skill/education/certificate/award/publication/activity/summary |
| `sections[].title` | string | 是 | 模块在简历上的标题（如"工作经历"） |
| `sections[].fields` | array | 是 | 从 wiki 实体抽取哪些字段，顺序即展示顺序 |
| `sections[].order` | enum | 否 | `asc` / `desc`，时间排序，默认 desc |
| `sections[].group_by` | string | 否 | 按某字段分组（如 skill 按 category 分组展示） |

## CSS 格式约定

每个 CSS 文件以模板 id 为命名空间前缀，避免多模板样式冲突：

```css
/* tech-minimal.css */
.tech-minimal {
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #2c3e50;
  line-height: 1.6;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px;
}

.tech-minimal h1 {
  font-size: 24px;
  border-bottom: 2px solid #3498db;
  padding-bottom: 8px;
  margin-bottom: 16px;
}

.tech-minimal .section { margin-bottom: 24px; }
.tech-minimal .section-title {
  font-size: 18px;
  color: #3498db;
  margin-bottom: 12px;
}

/* double-column 布局用 grid */
.tech-minimal.double-column {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 24px;
}
```

## 创建模板流程

### 步骤 1：确认环境

1. 确认 `~/.career_wiki/` 存在；不存在 → 提示跑 env-init
2. 确认 `~/.career_wiki/templates/` 存在（env-init 已建）

### 步骤 2：引导填写基本信息

逐项确认（用户一次性倒更好，不必逐项追问）：

| 字段 | 问法 | 默认/选项 |
|------|------|-----------|
| 模板名 | "模板叫什么？" | 必填 |
| 布局 | "单栏还是双栏？" | `single-column` / `double-column` |
| 要照片位吗 | "简历要放照片吗？" | 是/否，默认否 |
| 字体 | "有字体偏好吗？没有用默认中文字体" | 默认 PingFang SC |

模板 id 从模板名自动生成：转拼音或 kebab-case，如"技术简约" → `tech-minimal`，"我的模板" → `my-template`。跟已有模板 id 撞了加后缀 `-2`。

### 步骤 3：选模块和顺序

1. 列出 10 个可选模块（person/experience/project/skill/education/certificate/award/publication/activity/summary），问用户"要哪些模块？按什么顺序？"
2. 对每个选中的模块，问：
   - 标题叫什么？（默认用模块名，如"工作经历"）
   - 抽哪些字段？（列出该实体的 frontmatter 字段让用户选）
   - 时间排序正序还是倒序？（默认倒序）
   - 要分组吗？（如技能按分类分组）
3. Agent 复述一遍最终 sections 数组让用户确认

### 步骤 4：CSS 处理

两条路：

**A. 基于预设模板复制改（推荐）：**
1. 问"基于哪个预设样式？"
   - 技术简约（简洁、蓝色高亮、单栏）
   - 商务侧栏（双栏、左侧栏深色、正式）
   - 创意色块（彩色 section 背景、现代）
   - 学术纯文（纯文字、无装饰、Serif）
2. 复制对应预设的 `.css` 到新模板名（如 `tech-minimal.css` → `my-template.css`）
3. 告诉用户"已基于技术简约复制样式，要改颜色/间距告诉我，或自己改 `~/.career_wiki/templates/my-template.css`"

**B. 从零写（高级用户）：**
1. 告诉用户 CSS 命名空间规则（用模板 id 做前缀）
2. 用户给 CSS 内容或让 Agent 生成基础框架
3. Agent 写入 `~/.career_wiki/templates/{id}.css`

### 步骤 5：写文件 + 确认

1. 用 `write_file` 写两个文件：
   - `~/.career_wiki/templates/{id}.json` — 模板配置
   - `~/.career_wiki/templates/{id}.css` — 样式（复制或新生成）
2. 告诉用户文件路径 + 模板已可用
3. 提示"在 Web 前端可以选这个模板了，或用 multi-resume skill 创建简历时选它"

## 查看模板

用户说"列出模板"时：

1. 扫 `~/.career_wiki/templates/*.json`
2. 读每个 JSON 的 name / layout / has_photo / sections 概览
3. 表格输出：

| 模板名 | ID | 布局 | 照片 | 模块数 |
|--------|----|------|------|--------|
| 技术简约 | tech-minimal | 单栏 | 否 | 5 |

## 删除模板

1. 确认不是预设模板（tech-minimal/business-sidebar/creative-color/academic-plain 不可删）
2. 删 `.json` + `.css` 两个文件
3. 确认是否有简历配置还在引用它，有则警告

## 预设模板说明

### 1. 技术简约（tech-minimal）

- **适用：** 技术岗、后端/前端/全栈工程师
- **布局：** 单栏
- **风格：** 简洁、蓝色高亮、无照片
- **模块顺序：** 个人信息 → 工作经历 → 项目经验 → 技能 → 教育背景

### 2. 商务侧栏（business-sidebar）

- **适用：** 产品经理、商务、管理岗
- **布局：** 双栏（左侧栏 1/3 + 右侧 2/3）
- **风格：** 正式、左侧栏深色背景放联系方式/技能/教育、右侧放经历/项目
- **模块顺序：** 侧栏（person/skill/education）+ 主区（experience/project/summary）

### 3. 创意色块（creative-color）

- **适用：** 设计师、创意岗、市场营销
- **布局：** 单栏 + 彩色 section 背景
- **风格：** 现代、每个 section 不同背景色、可放照片
- **模块顺序：** 个人信息(含照片) → 工作经历 → 项目经验 → 技能 → 作品链接

### 4. 学术纯文（academic-plain）

- **适用：** 学术、研究、教职申请
- **布局：** 单栏
- **风格：** 纯文字、Serif 字体、无装饰、无照片
- **模块顺序：** 个人信息 → 教育背景 → 研究经历 → 发表 → 技能 → 获奖证

## 跨 Agent 一致性

- 假设所有支持 skill 的 Agent 有对话能力 + `write_file` 工具
- **不做降级**——没有 `write_file` 的 Agent 用不了这个 skill
- 模板 JSON 格式是硬约束，对话引导风格可适配
- 预设模板文件随 skill 包分发（`skills/template-manager/templates/`），env-init 复制到用户目录

## Common Pitfalls

1. **模板 id 撞名。** 跟已有模板 id 重了直接覆盖。必须检查并加后缀。

2. **只写 JSON 不写 CSS。** 模板 = JSON + CSS 两文件。JSON 的 `style` 字段必须指向一个真实存在的 CSS 文件。漏了 CSS 前端渲染会裸奔。

3. **CSS 不加命名空间前缀。** 多模板样式混在一个页面（如对比预览）会互相污染。每个模板的 CSS 必须用自己的 id 做选择器前缀。

4. **sections 模块名写错。** `sections[].module` 必须是 10 个 wiki 实体类型之一（小写、kebab-case），写错 F06 简历生成抽不到数据。

5. **预设模板被删。** 预设模板是 skill 包的一部分，删了 env-init 重跑会补回。应禁止删除，只允许删除自定义模板。

6. **自定义 CSS 让用户从零写。** 大多数用户不会写 CSS。默认走"复制预设改"路线，从零写只对明确要求的高级用户。

7. **fields 列了 wiki 里没有的字段。** `fields` 数组里的字段必须是 F01 schema 里该实体的 frontmatter 字段。列了不存在的，F06 会忽略但不报错，用户以为有数据其实没有。

## Verification Checklist

- [ ] `~/.career_wiki/templates/{id}.json` 已创建
- [ ] `~/.career_wiki/templates/{id}.css` 已创建
- [ ] JSON 含 `name / id / style / layout / sections` 必填字段
- [ ] `style` 字段指向的 CSS 文件真实存在
- [ ] `sections[].module` 全部是合法的 wiki 实体类型
- [ ] 模板 id 不跟已有模板重复
- [ ] CSS 选择器以模板 id 为前缀命名
- [ ] 已告知用户文件路径 + 模板可用
