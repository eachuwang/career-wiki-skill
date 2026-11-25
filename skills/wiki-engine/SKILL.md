---
name: wiki-engine
description: 编译、检查、迁移或删除 Career Wiki 知识时使用。读取 OKF Reference 原始材料，全量生成严格 OKF v0.2 career.* concepts，并维护标准 Markdown 关系、来源、信任与删除清单。
version: 2.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [wiki-engine, career-wiki-skill, compile, lint, okf]
    related_skills: [env-init, interview, file-parser]
---

# Wiki 引擎

Career Wiki 的知识层是一个严格的 [Open Knowledge Format v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle。数据根目录布局以 [`layout.json`](layout.json) 为唯一来源；知识 bundle 位于 `knowledge/`，应用状态位于 `.career-wiki-skill/`。

## 主流程

### 读取职业知识

简历、图谱和 HTTP adapter 统一通过 `scripts/career_knowledge.mjs` 的
`loadCareerKnowledge(root, options)` 读取 Career concepts。该接口负责目录遍历、严格 OKF
解析、关系归一化和删除清单过滤；消费者不得自行解析 frontmatter 或读取 10 个实体目录。

### 编译

明确的编译请求、已完成采访或明确导入产生的 Reference 才触发发布。定位 `WorkspaceRoot` 后读取删除清单，并递归读取 `knowledge/references/raw/` 下所有 `type: Reference`；`knowledge/references/uploads/` 仅用于核对原件，不论扩展名都不是 concepts。

1. 用 Agent 识别、合并和语义去重，按现有 OKF 契约产出 `career.*` 页面、根 `index.md`。把这些文件写到单独的 staging 根下的 `knowledge/`。每个生成页写 `generated.by: career-wiki-agent`（可带 `/版本`），并在 `sources` 中列出支撑事实的 Reference。不要将原件或人工内容写进 staging。
2. 对照删除清单、来源和完整职业字段检查候选页，然后执行：

   ```bash
   node skills/wiki-engine/scripts/okf_bundle.mjs publish "$STAGING_ROOT" --root "$ROOT"
   ```

3. 发布器合并保留项、严格校验，再备份并替换生成页和索引。原件、References 和人工内容留在原位；候选页若覆盖人工内容则停止。失败时保留材料，按报告修复后重试发布，不重复上传或审批。
4. 完成标准：所有 Reference 均已读取，生成页通过校验且已生效，已删除事实和关系不再出现，项目字段完整。状态区分**待编译**（Reference 已存）和**已发布**（已生效）。

### 迁移旧工作区

用户明确要求迁移时，在选定工作区停止其他写入后运行：

```bash
node skills/wiki-engine/scripts/okf_bundle.mjs migrate --root "$ROOT"
```

迁移器先在 staging 校验知识和应用状态，再把旧布局原件移入备份并发布。替换失败时回滚，修复报错后重试；已有 `knowledge/` 或新状态数据冲突时不要覆盖。成功后重新运行 env-init 记住迁移后的工作区。

### 删除知识实体

1. 精确定位 concept 类型、相对 `knowledge/` 的路径与显示名。
2. 列出来源、标准 Markdown 入链和简历引用。
3. 核对用户是否已明确授权删除该知识实体；已授权则说明影响后执行。仅当简历视图删除与知识删除的范围不清或影响超出授权时询问。
4. 登记负向事实：

   ```bash
   node skills/wiki-engine/scripts/delete_entity.mjs \
     --root <数据根目录> \
     --entity project \
     --path projects/example.md \
     --name "示例项目" \
     --reason "用户明确要求删除"
   ```

5. 更新对应 Reference concept，随后全量编译。
6. 校验页面、关系、API 和简历均不再暴露该实体。

原始上传文件默认保留；彻底删除证据需要单独确认。

## OKF concept 契约

除 `references/uploads/` 外，每个非 `index.md` / `log.md` Markdown 文件必须包含合法 frontmatter，并至少有非空 `type`。Career Wiki 生成页使用以下类型：

| 领域实体 | OKF type | 目录 |
|---|---|---|
| person | `career.person` | `knowledge/persons/` |
| experience | `career.experience` | `knowledge/experiences/` |
| project | `career.project` | `knowledge/projects/` |
| skill | `career.skill` | `knowledge/skills/` |
| education | `career.education` | `knowledge/education/` |
| certificate | `career.certificate` | `knowledge/certificates/` |
| award | `career.award` | `knowledge/awards/` |
| publication | `career.publication` | `knowledge/publications/` |
| activity | `career.activity` | `knowledge/activities/` |
| summary | `career.summary` | `knowledge/summaries/` |

示例：

```markdown
---
type: career.project
title: 邮件智能路由项目
description: 根据邮件意图将请求路由到合适的客服组。
status: stable
generated: { by: career-wiki-agent/gpt-5, at: 2026-08-13T04:00:00Z }
verified: { by: human:career-wiki-user, at: 2026-08-13T04:00:00Z }
sources:
  - id: interview-20260813
    resource: /references/raw/interview-20260813.md
name: 邮件智能路由项目
role: AI 应用开发
start: 2025-06
end: present
responsibilities: 邮件解析、意图识别 Prompt 设计、标签体系梳理。
tech_stack: Python、FastAPI、Qwen、MySQL、Redis
---

[王二](/persons/王二.md) 在该项目中使用 [Python](/skills/python.md) 实现意图识别。
```

规则：

- `type` 只表达 concept 类型。工作性质写 `employment_type`，总结类别写 `summary_type`。
- `title` 只表达 OKF 显示名。个人当前职位写 `current_title`，出版物标题写 `publication_title`。
- `sources` 是对象数组，每项必须有 `resource`；bundle 内路径优先使用以 `/` 开头的根相对路径。
- 来源可信度由 `sources[].author/usage_count/last_modified` 表达，不存主观分数。
- 内容生产与确认分别写 `generated` 和 `verified`。用户明确确认的事实写 `verified.by: human:career-wiki-user`。
- 生命周期使用 `status: draft|stable|deprecated` 与可选 `stale_after`。
- 关系只使用标准 Markdown 链接；链接上下文表达关系语义。正文不得生成 `[[wikilink]]`，frontmatter 不生成自定义 `relations`。
- 未知 OKF 字段在读写时保留；合法但非 `career.*` 的 concepts 可存在于 bundle 中，简历 API 不消费它们。10 个 Career 实体目录内若出现非 `career.*` 或旧格式页面，API 明确拒绝。

## 领域字段

- person：`name`, `current_title`, `email`, `phone`, `location`, `github`, `website`
- experience：`company`, `role`, `start`, `end`, `location`, `employment_type`, `salary`
- project：基础字段为 `name`, `role`, `start`, `end`, `description`, `responsibilities`, `tech_stack`, `at_company`；深度知识字段为：

  | 字段 | 含义 | 默认简历展示 |
  |---|---|---|
  | challenges | 项目遇到的困难、约束与复杂性 | 否 |
  | solutions | 针对困难采用的分析、方案与实施过程 | 否 |
  | outcomes | 可验证的业务或技术结果 | 否 |
  | learnings | 项目复盘、经验和后续改进 | 否 |
- skill：`name`, `category`, `level`, `description`
- education：`school`, `degree`, `major`, `start`, `end`, `gpa`, `courses`
- certificate：`name`, `issuer`, `date`, `url`
- award：`name`, `issuer`, `date`, `description`
- publication：`publication_title`, `venue`, `date`, `url`
- activity：`name`, `role`, `start`, `end`, `url`, `description`
- summary：`summary_type`, `content`

## 合并规则

- 名称、职位等基本事实按来源时间取最新可信值。
- 描述、职责、技术、困难、方案、结果、复盘分别保留最详细事实。
- `sources` 合并去重；每项保持稳定 `id`，正文脚注可用该 id 做逐条归因。
- 人工确认优先于机器确认；机器确认优先于未确认，但不得把该判断写成自定义 confidence 分数。
- 同类型且语义同名时合并；不同类型保持独立 concepts。

## 校验

```bash
node --test skills/wiki-engine/tests/*.test.mjs
node skills/wiki-engine/scripts/okf_bundle.mjs check --root <数据根目录>
```

完成标准：零 OKF conformance error；零旧 `entity`/`confidence`/字符串 `sources`/`[[wikilink]]`；标准链接目标可缺失但必须报告；根 `index.md` 声明 `okf_version: "0.2"`。
