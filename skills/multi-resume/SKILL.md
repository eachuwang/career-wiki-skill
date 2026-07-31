---
name: multi-resume
description: 用途：基于 wiki 创建和管理多份简历配置。用户说"创建字节版简历"、"生成产品岗简历"、"看看我有几份简历"时触发。每份简历一个 JSON 配置存 resumes/，定义模板+模块+强调方向+脱敏+排序。被 F06 简历生成读取，被 F07 Web 前端用于多简历切换 UI。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [multi-resume, career-wiki-skill, resumes, job-applications]
    related_skills: [template-manager, resume-generator, web-frontend, privacy-filter]
    tickets: [F09]
---

# 多简历管理 Skill（Career-Wiki）

## 概述

一个 wiki 支持产出**多份简历**——同一个数据底座，不同的简历配置用于投递不同公司/岗位。每份简历是一个 JSON 配置文件，定义用哪个模板、包含哪些模块、强调什么、隐藏什么、模块排序、脱敏设置。存 `~/.career_wiki/resumes/`。

**核心理念：** 数据一份，配置多份。wiki 是事实，简历是视角。改简历不改 wiki——只改配置。

## 何时触发

- 用户说"创建字节版简历" / "生成产品岗简历" / "新建一份简历" → 进创建流程
- 用户说"看看我有几份简历" / "列出简历" → 列出 `~/.career_wiki/resumes/` 下所有配置
- 用户说"改一下字节版简历" → 编辑已有配置
- 用户说"删掉那份测试简历" → 删除配置
- 用户说"对比字节版和阿里版" → 对比两份配置差异（可选功能）

**不用于：** 管理模板（用 template-manager skill）；生成简历 PDF/HTML（用 resume-generator skill）。

## 数据目录约定

```
~/.career_wiki/resumes/
├── bytedance-backend.json      ← 字节后端版
├── alibaba-product.json        ← 阿里产品版
├── tencent-fullstack.json      ← 腾讯全栈版
└── general-default.json        ← 通用默认版
```

- 首次调用先确认 `~/.career_wiki/` 存在；不存在 → 提示跑 env-init
- 文件名 = `{公司或岗位简称}-{岗位}.json`，kebab-case
- 每份简历独立配置，互不影响

## 简历配置 JSON 格式

```json
{
  "name": "字节后端版",
  "id": "bytedance-backend",
  "template": "tech-minimal",
  "created": "2026-07-31",
  "updated": "2026-07-31",
  "target": {
    "company": "字节跳动",
    "position": "后端开发工程师"
  },
  "modules": ["person", "experience", "project", "skill", "education"],
  "emphasize": [
    {
      "module": "skill",
      "items": ["Go", "gRPC", "Kubernetes", "Redis"],
      "reason": "字节后端看重 Go + 云原生"
    },
    {
      "module": "project",
      "items": ["高并发 API 网关", "分布式缓存系统"],
      "reason": "展示后端架构能力"
    }
  ],
  "hide": [
    {
      "module": "experience",
      "fields": ["salary"],
      "reason": "不暴露薪资"
    },
    {
      "module": "person",
      "fields": ["phone"],
      "reason": "投递阶段不暴露电话"
    }
  ],
  "order": {
    "experience": "desc",
    "project": "desc"
  },
  "privacy": {
    "mask_phone": true,
    "mask_email": false,
    "mask_name": false,
    "custom": []
  },
  "notes": "字节后端注重高并发和微服务，强调 Go 相关技能和项目"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 简历显示名 |
| `id` | string | 是 | 唯一标识（kebab-case），= 文件名前缀 |
| `template` | string | 是 | 使用的模板 id（对应 templates/ 下的模板） |
| `created` | string | 是 | 创建日期（YYYY-MM-DD） |
| `updated` | string | 是 | 最后修改日期 |
| `target.company` | string | 否 | 目标公司 |
| `target.position` | string | 否 | 目标岗位 |
| `modules` | array | 是 | 包含哪些模块，顺序即简历从上到下排列 |
| `emphasize` | array | 否 | 强调项——某些技能/项目/经历要突出展示 |
| `emphasize[].module` | enum | 是 | 要强调的模块（skill/project/experience） |
| `emphasize[].items` | array | 是 | 要强调的具体项名称 |
| `emphasize[].reason` | string | 否 | 为什么要强调（Agent 参考，用户可不填） |
| `hide` | array | 否 | 隐藏某些字段——投递策略性隐藏 |
| `hide[].module` | enum | 是 | 要隐藏字段的模块 |
| `hide[].fields` | array | 是 | 要隐藏的字段名 |
| `hide[].reason` | string | 否 | 隐藏原因 |
| `order` | object | 否 | 模块内排序，key=模块名，value=asc/desc |
| `privacy` | object | 否 | 脱敏设置，Web 预览时实时生效 |
| `privacy.mask_phone` | bool | 否 | 电话脱敏（138****1234） |
| `privacy.mask_email` | bool | 否 | 邮箱脱敏（j***@example.com） |
| `privacy.mask_name` | bool | 否 | 姓名脱敏（王**） |
| `privacy.custom` | array | 否 | 自定义脱敏规则（F10 privacy-filter 扩展） |
| `notes` | string | 否 | 备注，投递策略记录 |

## 创建简历流程

### 步骤 1：确认环境 + wiki 有数据

1. 确认 `~/.career_wiki/` 存在；不存在 → 提示跑 env-init
2. 确认 `~/.career_wiki/resumes/` 存在
3. 确认 wiki 里有数据（扫 `~/.career_wiki/wiki/` 下有 .md 文件）；没有 → 提示先跑 interview skill 采集信息
4. 确认 templates/ 下有模板；没有 → 提示跑 env-init 或 template-manager skill

### 步骤 2：引导填写基本信息

逐项确认：

| 字段 | 问法 | 说明 |
|------|------|------|
| 简历名 | "这份简历叫什么？" | 如"字节后端版" |
| 目标公司 | "投哪家公司？" | 可空（通用简历） |
| 目标岗位 | "投什么岗位？" | 可空 |

简历 id 从简历名自动生成（拼音转 kebab-case），跟已有 id 撞了加后缀。

### 步骤 3：选模板

1. 列出 `~/.career_wiki/templates/` 下所有模板（读 JSON 的 name + layout + has_photo）
2. 问"用哪个模板？"；用户选模板 id
3. 如果用户不确定，根据目标岗位推荐：
   - 技术岗 → 技术简约（tech-minimal）
   - 产品/管理岗 → 商务侧栏（business-sidebar）
   - 设计/创意岗 → 创意色块（creative-color）
   - 学术/研究岗 → 学术纯文（academic-plain）

### 步骤 4：选模块

1. 读选中模板的 sections 配置，知道模板支持哪些模块
2. 问"这份简历要包含哪些模块？"
3. 列出可选模块（基于 wiki 里有什么数据）：
   - 检查 `~/.career_wiki/wiki/` 下哪些实体目录有文件
   - 没有数据的模块提示用户"wiki 里没有证书数据，选了也显示不了"
4. 用户选模块 → 确认顺序（默认跟模板 sections 一致，用户可调）
5. Agent 复述最终 modules 数组让用户确认

### 步骤 5：设强调方向

问"这份简历想强调什么？"——引导用户思考投递策略：

1. **技能强调**："目标岗位看重哪些技能？你的 wiki 里有这些技能吗？"
   - 列出 wiki/skills/ 里所有技能让用户选
   - 选中的进入 `emphasize[].items`
   - 强调的技能在简历里会**置顶**或**高亮**（由模板 CSS 控制）
2. **项目强调**："有想突出展示的项目吗？"
   - 列出 wiki/projects/ 里所有项目
   - 选中的在简历里**排前面**
3. **经历强调**："某段工作经历要重点展示吗？"
   - 列出 wiki/experiences/ 里所有经历
   - 选中的在简历里**排前面**
4. 每个强调项可记 reason（Agent 参考用，帮用户保持策略一致）

**没有强调方向也行**——通用简历不设 emphasize，按模板默认顺序展示。

### 步骤 6：设脱敏 + 隐藏

1. **脱敏**（privacy）：
   - 问"有需要脱敏的信息吗？电话/邮箱/姓名？"
   - 默认不脱敏；用户选哪些要脱敏
   - 详细脱敏逻辑见 F10 privacy-filter skill
2. **隐藏字段**（hide）：
   - 问"有要隐藏的字段吗？比如薪资、某些不想暴露的经历？"
   - 跟脱敏区别：脱敏是打码（显示 138****1234），隐藏是完全不显示
   - 列出各模块的字段让用户选

### 步骤 7：排序设置

问"经历/项目要按什么顺序？倒序（最近在前）还是正序？"

- 默认倒序（最近的经历排前面，符合简历惯例）
- 用户可改正序（如学术简历有时按时间正序）

### 步骤 8：写文件 + 确认

1. 用 `write_file` 写 `~/.career_wiki/resumes/{id}.json`
   - 写入配置 JSON（含 created/updated 日期 = 今天）
2. 告诉用户：
   - 配置文件路径
   - 使用的模板
   - 包含的模块 + 强调项 + 脱敏设置概要
   - "在 Web 前端可以切换查看这份简历了"
3. 提示"要生成简历（渲染成 PDF/HTML）用 resume-generator skill"

## 查看简历列表

用户说"列出简历"时：

1. 扫 `~/.career_wiki/resumes/*.json`
2. 读每个配置的 name / target / template / modules
3. 表格输出：

| 简历名 | 目标 | 模板 | 模块数 | 强调 | 更新 |
|--------|------|------|--------|------|------|
| 字节后端版 | 字节/后端 | tech-minimal | 5 | Go/K8s | 2026-07-31 |

## 编辑简历配置

用户说"改一下字节版"时：

1. 读对应 JSON 配置
2. 问要改什么（模板/模块/强调/脱敏/排序）
3. 改对应字段，updated 日期更新为今天
4. 用 `write_file` 覆盖写回
5. 告诉用户改了什么 + 提示 Web 前端刷新可见

## 删除简历配置

1. 确认要删的简历 id
2. 删 `~/.career_wiki/resumes/{id}.json`
3. 告诉用户已删，提示 wiki 数据不受影响（只删配置不删数据）

## 对比功能（可选）

用户说"对比字节版和阿里版"时：

1. 读两份配置 JSON
2. 输出差异表：

| 维度 | 字节后端版 | 阿里产品版 |
|------|------------|------------|
| 模板 | tech-minimal | business-sidebar |
| 模块 | 5 个 | 6 个（多 summary） |
| 强调技能 | Go, K8s, Redis | 产品设计, 数据分析 |
| 强调项目 | API 网关, 缓存系统 | 用户增长平台 |
| 隐藏 | salary | phone, salary |
| 脱敏 | phone | phone + email |

这是只读对比，不改任何配置。后续可扩展为 Web 前端并排预览。

## Web 前端切换

F07 Web 前端会读 `~/.career_wiki/resumes/` 下所有配置：

- 简历编辑器顶部有切换下拉框，列出所有简历配置
- 选一份 → 加载该配置 + 对应模板 + 从 wiki 拉数据 → 右侧预览实时渲染
- 在 Web 前端可直接改配置（模块顺序、强调项勾选、脱敏开关），保存写回 JSON
- 多份简历共享同一份 wiki 数据，切换不重新查数据

## 跨 Agent 一致性

- 假设所有支持 skill 的 Agent 有对话能力 + `write_file` 工具
- **不做降级**——没有 `write_file` 的 Agent 用不了这个 skill
- 配置 JSON 格式是硬约束，对话引导风格可适配
- emphasize/hide 里的 items 必须跟 wiki 里的实体 name 对应，Agent 创建时应从 wiki 拉真实 name 填入

## Common Pitfalls

1. **emphasize/hide 的 items 跟 wiki 对不上。** 用户说"强调 Go 技能"，但 wiki 里的技能 name 可能是 "Golang" 或 "Go 语言"。必须从 wiki 拉真实 name 填入，不能凭用户原话。F06 按 name 匹配，对不上就强调不了。

2. **选了 wiki 里没有数据的模块。** 用户选了"证书"模块但 wiki/certificates/ 是空的，简历渲染出来就是空 section。创建时应检查 wiki 是否有对应数据，没有要提示用户。

3. **template 字段指向不存在的模板。** 模板被删了或 id 写错，F06 渲染会 fallback 到默认模板或报错。创建时应检查 templates/ 下对应模板存在。

4. **modules 顺序跟模板 sections 不一致。** 模板 sections 定义了模块顺序，简历配置的 modules 数组可以覆盖这个顺序。如果 modules 里有模板 sections 没有的模块，多出来的模块会渲染但可能没样式。应检查 modules 是否是模板 sections 的子集 + 重排序。

5. **脱敏和隐藏混用。** 脱敏是打码显示，隐藏是完全不显示。同一字段不要既脱敏又隐藏——隐藏优先（都不显示了不用脱敏）。

6. **改配置不更新 updated 日期。}} 编辑已有简历时必须把 updated 改成今天，不然用户无法判断哪份是最新改的。

7. **文件名跟 id 不一致。}} 文件名必须 = `{id}.json`。id 改了文件名要跟着改，不然扫不到。

8. **通用简历不设 target。}} 通用简历可以不设 target.company / target.position，这是正常的（投多公司用）。不要强制用户填。

## Verification Checklist

- [ ] `~/.career_wiki/resumes/{id}.json` 已创建
- [ ] JSON 含 `name / id / template / created / updated / modules` 必填字段
- [ ] `template` 字段指向的模板在 `~/.career_wiki/templates/` 真实存在
- [ ] `modules` 数组里的模块在 wiki 里有对应数据
- [ ] `emphasize[].items` 跟 wiki 实体的 name 对得上
- [ ] `hide[].fields` 是该模块的合法 frontmatter 字段
- [ ] 简历 id 不跟已有简历重复
- [ ] 文件名 = `{id}.json`
- [ ] 已告知用户配置路径 + 模板 + 模块概要
- [ ] 已提示可在 Web 前端切换查看 + 可用 resume-generator 生成
