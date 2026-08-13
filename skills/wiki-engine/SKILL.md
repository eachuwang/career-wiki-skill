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

### 编译

1. 读取 `.career-wiki-skill/deletions.json`。
2. 递归读取 `knowledge/references/raw/` 下所有 Reference concepts 的正文。
3. 用 Agent 理解能力识别、跨来源合并、语义去重 10 类职业实体。
4. 为每个实体生成一个 `type: career.<entity>` 的 OKF concept。
5. 使用标准 Markdown 链接表达实体关系。
6. 用户确认后清理旧的生成 concepts；保留 `references/` 和 `index.md`。
7. 写入新 concepts，重建根 `index.md`，运行严格校验：

   ```bash
   node skills/wiki-engine/scripts/okf_bundle.mjs check --root <数据根目录>
   ```

完成标准：所有 Reference 都已读取；所有生成页通过 OKF 校验；删除清单中的实体和关系均不存在；项目的描述、职责、技术栈等事实没有因简历展示需求被压缩。

### 迁移旧工作区

运行：

```bash
node skills/wiki-engine/scripts/okf_bundle.mjs migrate --root <数据根目录>
```

迁移器先备份旧 `wiki/sources/resumes/templates`，在 staging 中构建并校验 `knowledge/`，成功后才切换目录。迁移后严格使用新契约，不保留旧格式读取分支。

### 删除知识实体

1. 精确定位 concept 类型、相对 `knowledge/` 的路径与显示名。
2. 列出来源、标准 Markdown 入链和简历引用。
3. 明确告知用户删除影响并获得确认。
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

每个非 `index.md` / `log.md` Markdown 文件必须包含合法 frontmatter，并至少有非空 `type`。Career Wiki 生成页使用以下类型：

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
- project：`name`, `role`, `start`, `end`, `description`, `responsibilities`, `tech_stack`, `challenges`, `solutions`, `outcomes`, `learnings`, `at_company`
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

## 破坏性编译检查点

清理生成 concepts 前必须向用户确认。先确保 `.career-wiki-skill/backups/` 有可恢复备份；仅清理 10 个实体目录，保留 `knowledge/references/`。用户未明确确认时停止。

## 校验

```bash
node --test skills/wiki-engine/tests/*.test.mjs
node skills/wiki-engine/scripts/okf_bundle.mjs check --root <数据根目录>
```

完成标准：零 OKF conformance error；零旧 `entity`/`confidence`/字符串 `sources`/`[[wikilink]]`；标准链接目标可缺失但必须报告；根 `index.md` 声明 `okf_version: "0.2"`。
