---
name: resume-generator
description: 简历生成 skill。提供 Node API server（16 个 HTTP 接口），读 wiki markdown → gray-matter 解析 frontmatter → 正则提取 wikilink → 按模板 schema 组装结构化简历 JSON，并提供项目描述/个人优势/岗位职责的 AI 润色上下文、生成和模型列表接口。用户说"生成简历""导出简历""启动 API server"时触发。数据组装与润色结果校验由 Node 完成，模型推理由用户配置的 OpenAI-compatible provider 完成。PDF/HTML 导出由前端渲染。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [resume-generator, career-wiki-skill, api-server, resume, generate, export]
    related_skills: [wiki-engine, web-editor]
    tickets: [F06]
---

# 简历生成 Skill（Career-Wiki-Skill）

## 概述

career-wiki-skill 的简历生成层。提供 **Node HTTP API server**，从 wiki markdown 读数据、解析 frontmatter、按模板+简历配置组装结构化简历 JSON。Web 前端（F07）调用这些接口完成简历渲染和导出。

**核心理念：** Wiki 是事实源，简历是面向岗位的表达视角。Node 负责读取、组装、指纹校验和应用结果；润色可以由宿主 Agent 或已配置的服务端 provider 执行。润色结果写入当前简历配置的 `polish.entries`，不回写 Wiki；原文变化后旧结果自动失效。

**模板格式：** JSON 配置（字段映射 + 布局参数）+ CSS 样式文件。预设 4 个模板（技术简约/商务侧栏/创意色块/学术纯文），由 web-editor 前端管理（复制/删除）。

**导出方式：**
- **JSON** — Node 直接返回组装好的结构化简历 JSON
- **HTML** — 前端按选中模板渲染出完整 HTML 页面，直接保存为文件
- **PDF** — 前端渲染的 HTML 用浏览器 `window.print()` 导出 PDF，样式靠 CSS 模板控制，不需要 puppeteer

---

## 何时触发

- 用户说"生成简历" / "渲染简历" / "组装简历" → 调 `POST /api/resume/generate`
- 用户说"导出简历" / "下载简历" → 调 `POST /api/resume/export`（JSON 直接返回，HTML/PDF 前端渲染）
- 用户说"启动 API server" / "起个服务" → 启动 `scripts/api_server.mjs`
- 用户说"看 wiki 有什么数据" → 调 `GET /api/wiki`
- Web 前端启动时自动调 `GET /api/health` 检查服务状态
- Web 前端简历编辑器调 `GET /api/resumes` + `GET /api/templates` 填充 UI

**不用于：** 编译 wiki（用 wiki-engine skill）；多简历配置与模板管理已并入 web-editor 前端。

### 生成简历时的 Agent 润色流程

当用户通过 Agent 生成或导出简历，且当前简历包含 `experience` / `project` / `summary` 模块时，Agent 按以下顺序执行：

1. 调用 `POST /api/resume/polish-context`，传入当前 `config` 或 `resume_id`。
2. 阅读 `candidates.source`、`selected_fields` 与 `style_samples`。只对用户选择且存在的 `description` / `content` / `responsibilities` 生成简历版本；其他字段只作为事实和语气上下文，不直接改写。
3. 使用同一候选项的 `source_hash` 原样填入 `polish.entries[path].source_hash`，把结果保存到当前 `config` 的 `polish.entries`，调用 `POST /api/resume/save`。
4. 再调用 `POST /api/resume/generate` 或 `/api/resume/export`，把最终结果交给用户。

如果某个候选项原文已经自然完整，允许只做极少量调整；如果信息不足，不得为了“看起来更像简历”而补写数字、技术、结果或职责。Agent 没有可用的推理能力时，直接跳过润色并保留原文。Web 编辑器调用 `/api/resume/polish` 时由 provider 完成同一规则的生成和校验。点击「换一换」时传入 `only: { path, field }`，只重做当前条目的当前字段，并保留其他已生成字段。

---

## 数据目录约定

```
~/.career_wiki/
├── wiki/                  ← 数据源（F06 读这里）
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
├── resumes/               ← 简历配置（F06 读这里）
│   ├── bytedance-backend.json
│   └── ...
├── templates/             ← 简历模板（F06 读这里）
│   ├── tech-minimal.json
│   ├── tech-minimal.css
│   └── ...
└── .career-wiki-skill/
    └── config.json        ← root 字段存数据目录路径
```

- 数据目录默认 `~/.career_wiki/`，用户可在 env-init 时自定义
- API server 启动时读 `~/.career_wiki/.career-wiki-skill/config.json` 的 `root` 字段确定数据目录
- 所有 wiki/ resumes/ templates/ 路径都基于 root 计算

---

## API Server

### 启动

```bash
# 在 career-wiki-skill 仓库根目录运行
node skills/resume-generator/scripts/api_server.mjs

# 指定端口（默认 3001）
PORT=4000 node skills/resume-generator/scripts/api_server.mjs

# 指定数据目录（默认从 ~/.career_wiki/.career-wiki-skill/config.json 读）
WIKI_ROOT=/path/to/wiki node skills/resume-generator/scripts/api_server.mjs
```

环境变量：
- `PORT` — 监听端口，默认 `3001`
- `WIKI_ROOT` — 数据目录根路径，默认读 `~/.career_wiki/.career-wiki-skill/config.json` 的 `root`，再 fallback 到 `~/.career_wiki/`
- `RESUME_POLISH_PROVIDER` — 设为 `mock` 仅用于测试；正常请求优先使用前端传入的 provider。没有前端 provider 时，只有在同时配置 `RESUME_POLISH_PROTOCOL`、`RESUME_POLISH_BASE_URL`、`RESUME_POLISH_API_KEY`、`RESUME_POLISH_MODEL` 后才使用服务端环境配置；不再读取或猜测 `ANTHROPIC_*` 环境变量。

### 依赖

- `gray-matter` — 解析 markdown frontmatter（仓库根 package.json 声明）
- Node 内置 `http` / `fs` / `path` — 不需要额外依赖

### 16 个接口

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/health` | 健康检查，返回服务状态 + 数据目录信息 |
| 2 | GET | `/api/wiki` | 所有 wiki 实体，读 wiki/ 下所有 markdown，gray-matter 解析 frontmatter 返回 JSON |
| 3 | GET | `/api/wiki/:entity/:id` | 单个实体详情，entity 是实体类型（persons/experiences/...），id 是文件名（不带 .md） |
| 4 | GET | `/api/resumes` | 所有简历配置，读 resumes/ 目录下所有 .json |
| 5 | GET | `/api/templates` | 所有模板，读 templates/ 目录下所有 .json |
| 6 | POST | `/api/resume/generate` | 按模板 + 配置生成结构化简历 JSON |
| 7 | POST | `/api/resume/polish-context` | 为 Agent 准备原始事实、口吻样本和润色状态 |
| 8 | POST | `/api/resume/polish` | 生成当前简历的润色结果并返回可保存配置 |
| 9 | POST | `/api/resume/polish-models` | 拉取用户 OpenAI-compatible provider 的模型列表 |
| 10 | POST | `/api/resume/export` | 导出 PDF/HTML/JSON（JSON 直接返回，HTML/PDF 由前端渲染） |
| 11 | POST | `/api/resume/save` | 保存简历配置到 resumes/ |
| 12 | PUT | `/api/wiki/refresh` | 触发 wiki 重新 compile（提示用户调 Agent） |
| 13 | POST | `/api/resume/delete` | 删除简历配置（仅删 JSON，不删 wiki 数据） |
| 14 | POST | `/api/template/save` | 创建/更新模板（JSON + 可选 CSS） |
| 15 | POST | `/api/template/delete` | 删除模板（JSON + 同名 CSS） |
| 16 | GET | `/api/template/css` | 读取模板 CSS 文本（供复制/预览） |

---

## 数据组装流程（核心）

`POST /api/resume/generate` 的执行流程：

### 步骤 1：读简历配置

请求体含 `resume_id`（简历配置 id）或直接传完整配置对象。根据 `resume_id` 从 `~/.career_wiki/resumes/{id}.json` 读配置。

配置决定：
- 用哪个模板（`template` 字段 → 读模板 JSON 的 sections 定义）
- 包含哪些模块（`modules` 数组，覆盖模板 sections 的顺序）
- 强调什么（`emphasize` 数组 → 某些技能/项目置顶或高亮）
- 隐藏什么（`hide.fields` → 字段不显示；`hide.items` → 整个 Wiki 实体不进入当前简历）
- 排序（`order` 对象 → 模块内时间排序）
- 脱敏（`privacy` 对象 → phone/email/name 打码）

### 步骤 2：读模板 schema

从 `~/.career_wiki/templates/{template_id}.json` 读模板配置。模板的 `sections` 数组定义了：
- 每个模块对应哪个 wiki 实体（`module` 字段 → 实体目录名，如 `experience` → `wiki/experiences/`）
- 每个模块抽取哪些字段（`fields` 数组）
- 模块内排序方向（`order`，可被简历配置的 `order` 覆盖）
- 分组方式（`group_by`，如 skill 按 category 分组）

### 步骤 3：读 wiki markdown

根据模板 sections 的 module 定义，读 `wiki/` 下对应实体目录的所有 markdown 文件。

实体→目录映射：

| module | 目录 |
|--------|------|
| person | `wiki/persons/` |
| experience | `wiki/experiences/` |
| project | `wiki/projects/` |
| skill | `wiki/skills/` |
| education | `wiki/education/` |
| certificate | `wiki/certificates/` |
| award | `wiki/awards/` |
| publication | `wiki/publications/` |
| activity | `wiki/activities/` |
| summary | `wiki/summaries/` |

### 步骤 4：gray-matter 解析 frontmatter + 正则提取 wikilink

对每个 markdown 文件用 `gray-matter` 解析：
- frontmatter（YAML metadata）→ 提取实体字段（company/role/start/end/...）
- 正文 content → 保留为 `content`；project frontmatter 的 `tech_stack` 作为独立字段透传，旧版正文中的“岗位职责”兼容提取为 `responsibilities`

用正则提取正文中的 wikilink：
```
\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]
```
提取出 `{target, name}` 数组，用于关系展示（如"在 XX 公司期间用了 YY 技能"）。

### 步骤 5：按模板 schema 组装结构化简历 JSON

按模板 sections 顺序组装。对每个 section：

1. 取该 module 对应的所有 wiki 实体数据
2. 按 `fields` 配置抽取字段；project 固定补充 `responsibilities` 和 `tech_stack` 以兼容旧模板
3. 应用简历配置的覆盖：
   - `modules` 过滤 — 只保留简历配置要的模块
   - `polish.entries` — 原文指纹有效且开关开启时应用 AI 润色
   - `content_overrides` — 按 Wiki 相对路径应用当前简历的手动字段覆盖，优先级高于 AI 润色；只读简历配置，不写 Wiki
   - `order` 排序 — 按时间 asc/desc 排序
   - `emphasize` — 强调的项排前面
   - `hide` — 按 Wiki 路径排除隐藏实体，再删掉隐藏字段
   - `privacy` — 对 phone/email/name 做打码
4. 按 `group_by` 分组（如 skill 按 category 分组）
5. 组装成 section 对象

最终输出结构化简历 JSON：

```json
{
  "resume": {
    "name": "字节后端版",
    "id": "bytedance-backend",
    "template": "tech-minimal"
  },
  "person": {
    "name": "王二",
    "title": "后端开发工程师",
    "email": "j***@example.com",
    "phone": "138****1234",
    "github": "wanger"
  },
  "sections": [
    {
      "module": "experience",
      "title": "工作经历",
      "items": [
        {
          "company": "字节跳动",
          "role": "后端开发",
          "start": "2023-06",
          "end": "2024-09",
          "description": "负责高并发 API 网关...",
          "links": [
            {"target": "wiki/skills/go", "name": "Go"},
            {"target": "wiki/projects/xxx-system", "name": "XXX系统"}
          ]
        }
      ]
    },
    {
      "module": "skill",
      "title": "技能",
      "grouped": true,
      "groups": [
        {
          "key": "语言",
          "items": [
            {"name": "Go", "category": "语言", "level": "精通"}
          ]
        }
      ]
    }
  ],
  "meta": {
    "generated_at": "2026-07-31T14:00:00Z",
    "entity_count": 15,
    "template": "tech-minimal",
    "resume_config": "bytedance-backend"
  }
}
```

### 步骤 6：返回 JSON

组装好的结构化简历 JSON 直接返回给前端。前端拿这个 JSON + 对应模板的 CSS 渲染简历页面。

---

## 接口详情

### 1. GET /api/health

健康检查。

**响应 200：**
```json
{
  "status": "ok",
  "service": "career-wiki-skill-resume-generator",
  "version": "1.0.0",
  "wiki_root": "/Users/joewang/.career_wiki",
  "wiki_exists": true,
  "entity_counts": {
    "persons": 1,
    "experiences": 3,
    "projects": 5
  },
  "resumes_count": 2,
  "templates_count": 4
}
```

### 2. GET /api/wiki

返回所有 wiki 实体。递归扫描 `wiki/` 下所有 `.md` 文件，gray-matter 解析 frontmatter，正则提取 wikilink。

**响应 200：**
```json
{
  "entities": [
    {
      "path": "persons/王二.md",
      "entity": "person",
      "confidence": "verified",
      "sources": ["sources/raw/interview-20260731-140000.md"],
      "fields": {
        "name": "王二",
        "title": "后端开发工程师"
      },
      "relations": [
        {"type": "has_experience", "target": "wiki/experiences/bytedance-backend-2023"}
      ],
      "links": [
        {"target": "wiki/skills/go", "name": "Go"}
      ],
      "content": "正文 markdown..."
    }
  ],
  "allRelations": [
    {"from": "persons/王二.md", "to": "experiences/bytedance-backend-2023.md", "type": "has_experience"}
  ],
  "total": 15
}
```

`allRelations` 是所有实体关系的扁平化列表，供图谱和缺口分析使用。`from`/`to` 已归一化为 `entity.path` 的形式（相对 wiki/，带 `.md` 后缀），且只包含指向存在实体的关系。

**查询参数：**
- `entity=skill` — 只返回某类实体

### 3. GET /api/wiki/:entity/:id

返回单个实体详情。`entity` 是复数目录名（persons/experiences/projects/skills/education/certificates/awards/publications/activities/summaries），`id` 是文件名不带 `.md`。

**响应 200：** 同上单个实体对象。
**响应 404：** `{"error": "实体不存在", "path": "persons/xxx.md"}`

### 4. GET /api/resumes

返回所有简历配置（完整配置对象，前端编辑器需要 `modules`/`privacy`/`emphasize`/`hide` 等字段）。读 `resumes/` 下所有 `.json`，原样返回文件内容。

**响应 200：**
```json
{
  "resumes": [
    {
      "name": "字节后端版",
      "id": "bytedance-backend",
      "template": "tech-minimal",
      "created": "2026-07-30",
      "updated": "2026-07-31",
      "target": {"company": "字节跳动", "position": "后端开发"},
      "modules": ["person", "experience", "project", "skill", "education"],
      "emphasize": [{"module": "skill", "items": ["Go", "K8s"]}],
      "hide": [],
      "privacy": {"mask_phone": true, "mask_email": true}
    }
  ],
  "total": 2
}
```

### 5. GET /api/templates

返回所有模板（完整模板配置，前端预览渲染需要 `sections` 定义）。读 `templates/` 下所有 `.json`，原样返回文件内容。

**响应 200：**
```json
{
  "templates": [
    {
      "name": "技术简约",
      "id": "tech-minimal",
      "style": "tech-minimal.css",
      "layout": "single-column",
      "has_photo": false,
      "sections": [
        {"module": "person", "title": "个人信息", "fields": ["name", "title", "email", "phone"]},
        {"module": "experience", "title": "工作经历", "fields": ["company", "title", "start", "end", "description"], "order": "desc"},
        {"module": "skill", "title": "技能", "fields": ["name", "level"], "group_by": "category"}
      ]
    }
  ],
  "total": 4
}
```

### 6. POST /api/resume/generate

按模板 + 配置生成结构化简历 JSON。执行上面描述的 6 步数据组装流程。

**请求体（二选一）：**
```json
{
  "resume_id": "bytedance-backend"
}
```
或直接传配置：
```json
{
  "config": {
    "name": "临时简历",
    "template": "tech-minimal",
    "modules": ["person", "experience", "skill"],
    "emphasize": [],
    "hide": [],
    "order": {"experience": "desc"},
    "privacy": {"mask_phone": true}
  }
}
```

**响应 200：** 结构化简历 JSON（见上方步骤 5 输出格式）。
**响应 400：** `{"error": "缺少 resume_id 或 config"}`
**响应 404：** `{"error": "简历配置不存在", "id": "xxx"}`
**响应 404：** `{"error": "模板不存在", "template": "xxx"}`

### 7. POST /api/resume/polish-context

为 Agent 准备当前简历视角下的项目和工作经历润色上下文。接口只读，不调用模型，不写 Wiki。

响应中的 `candidates` 每项包含：

- `source` — 用户原始字段和可辅助理解的上下文（技术栈、困难、方案、结果等）
- `source_hash` — 当前原始事实指纹，Agent 生成结果时必须原样回填
- `selected_fields` — 用户选择的润色字段
- `target_fields` — 当前存在且被选中的 `description` / `content` / `responsibilities`
- `status` — `missing`、`applied`、`partial`、`stale` 或 `unverified`

Agent 完成润色后，将结果保存到当前简历配置：

```json
{
  "polish": {
    "enabled": true,
    "entries": {
      "projects/data-agent.md": {
        "source_hash": "候选项中的 source_hash",
        "fields": {
          "description": "轻量润色后的项目描述",
          "content": "轻量润色后的个人优势",
          "responsibilities": "轻量润色后的岗位职责"
        },
        "updated_at": "2026-08-12T00:00:00.000Z"
      }
    }
  }
}
```

润色规则：保留用户事实和常用词汇；短输入只做必要扩写；模仿同一用户已有文本的句式和语气；不补造数字、技术、结果；不使用空泛的 AI 套话。原始 Wiki 内容变化后，指纹不匹配，生成结果自动回退原文并标记 `stale`。

### 8. POST /api/resume/polish

点击 Web 编辑器的「AI 润色」开关时调用。服务端读取当前 Wiki、构造润色上下文，使用请求体中显式选择的 `provider.protocol` 调用 OpenAI-compatible `/v1/chat/completions` 或 Anthropic `/v1/messages`，并使用同一协议对应的响应 JSON 提取器，再严格过滤为当前候选项、当前 `source_hash`、用户选择的 `description` / `content` / `responsibilities` 字段。候选项每 2 条一批、最多同时请求 2 批；单批超时或遇到 408、429、5xx 时自动重试一次，避免长上下文或瞬时服务拥塞使整次润色失败。网络不可达时返回包含服务 origin 的可操作错误，不暴露 API Key。成功时返回 `{config, generated_count, candidate_count}`，其中 `config.polish.enabled` 为 `true`；前端保存成功后再更新预览。点击字段旁的「换一换」会使用 `only` 参数只生成一个字段，并合并回原配置。API Key 不写入简历配置。

请求体中的 `provider` 格式为 `{ "protocol": "openai", "base_url": "https://api.openai.com/v1", "api_key": "...", "model": "...", "timeout_ms": 60000 }`。`protocol` 必须明确填写为 `openai` 或 `anthropic`，请求端点、请求格式和响应 JSON 提取方式由它统一决定。使用 Anthropic-compatible provider 时，Base URL 例如 `https://dashscope.aliyuncs.com/apps/anthropic`，模型需手动填写，模型列表接口不适用。`timeout_ms` 默认为 60 秒，可在 Web 编辑器配置为 10–180 秒。OpenAI-compatible provider 的模型列表接口调用同一 provider 的 `/v1/models`，返回可供用户选择的模型 id；用户也可以直接填写模型名。

### 9. POST /api/resume/export

导出简历。**JSON 格式**由 Node 直接返回组装好的结构化 JSON（等同 `/api/resume/generate` 的输出）。**HTML/PDF 格式**由前端渲染——这个接口对 HTML/PDF 的角色是返回渲染所需的 JSON 数据，前端拿到后用模板 CSS 渲染成 HTML 页面，再用 `window.print()` 导出 PDF。

**请求体：**
```json
{
  "resume_id": "bytedance-backend",
  "format": "json"
}
```

| format | 行为 |
|--------|------|
| `json` | Node 直接返回结构化简历 JSON（等同 generate） |
| `html` | 返回 JSON 数据 + 提示前端用模板 CSS 渲染 HTML |
| `pdf` | 返回 JSON 数据 + 提示前端渲染后用 `window.print()` 导出 |

**响应 200（json）：** 结构化简历 JSON
**响应 200（html/pdf）：**
```json
{
  "format": "html",
  "data": { /* 结构化简历 JSON */ },
  "template_id": "tech-minimal",
  "css_path": "templates/tech-minimal.css",
  "instruction": "前端用模板 CSS 渲染 HTML，PDF 用 window.print()"
}
```

### 10. POST /api/resume/save

保存简历配置到 `~/.career_wiki/resumes/{id}.json`。

**请求体：** 完整的简历配置 JSON（由 web-editor 前端生成，格式见 `resumes/` 下现有配置）。

内容编排中的手动修改保存在 `content_overrides[Wiki相对路径][字段名]`。保存接口只写 `resumes/{id}.json`，不会调用 Wiki 写入流程；generate/JSON export 在读取 Wiki 后将该覆盖应用到当前简历结果。

**响应 200：**
```json
{
  "status": "saved",
  "path": "/Users/joewang/.career_wiki/resumes/bytedance-backend.json",
  "id": "bytedance-backend"
}
```
**响应 400：** `{"error": "缺少 id 或 config 对象"}`
**响应 409：** `{"error": "id 已存在，请用 PUT 更新", "id": "xxx"}`（可选，防止覆盖）

### 9. PUT /api/wiki/refresh

触发 wiki 重新 compile。**这个接口不自己编译 wiki**——wiki compile 是 Agent LLM 操作（见 wiki-engine skill），Node 脚本做不了。这个接口的作用是提示前端告诉用户"需要调 Agent 重新 compile wiki"。

> 🔴 **CHECKPOINT** — 前端收到此响应后必须提示用户
>
> 这个接口返回的响应**不是**同步编译完成，而是需要用户在 Agent 对话中手动触发：
> - 前端收到 200 响应后，**必须**向用户显示提示信息
> - 用户需在 Hermes 中说"编译 wiki"来触发 wiki-engine skill
> - 编译完成后 API server 会自动读到新数据
>
> 🛑 不要向用户暗示"刷新已完成"。Wiki compile 是 LLM 操作，必须用户在对话里触发。

**响应 200：**
```json
{
  "status": "needs_agent",
  "message": "Wiki 重新编译需要 Agent 执行（LLM 操作）。请在 Hermes 中说\"编译 wiki\"触发 wiki-engine skill。编译完成后 API server 会自动读到新数据。",
  "skill": "wiki-engine",
  "trigger_phrase": "编译 wiki"
}
```

---

## Common Pitfalls

1. **wiki/ 是空目录就启动。** API server 能启动但 `/api/wiki` 返回空数组。应提示用户先跑 interview skill 采集信息再 compile wiki。

2. **简历配置的 template 指向不存在的模板。** `/api/resume/generate` 会返回 404。生成前应检查模板文件存在。

3. **强调名称或隐藏路径跟 Wiki 对不上。** `emphasize.items` 按实体名称匹配；`hide.items` 按 API 返回的 `_path`/`path` 精确匹配，配置应由 Web 编辑器从真实 Wiki 数据生成。

4. **忽略 Wiki 删除清单。** API 会读取 `<数据根目录>/.career-wiki-skill/deletions.json`，按实体类型和精确路径过滤已删除实体；这与当前简历的 `hide.items` 不同，删除清单对所有简历和 Wiki 图谱生效。

5. **数据目录找不到。** `WIKI_ROOT` 环境变量没设、config.json 不存在、目录路径写错——API server 启动时应该 fallback 到 `~/.career_wiki/`，并在 `/api/health` 里返回实际用的路径让用户确认。

6. **wiki markdown 没有 frontmatter 或 frontmatter 不合规。** gray-matter 解析不出 fields，实体数据会是空的。应跳过并 warn，不 crash。

7. **端口冲突。** 默认 3001，被占时启动失败。应提示用户设 `PORT` 环境变量换端口。

8. **PDF 导出依赖前端。** 不要在 Node 里装 puppeteer——太重。PDF 导出靠前端 `window.print()`，Node 只返回数据。

9. **PUT /api/wiki/refresh 被误以为是同步编译。** 这个接口不编译 wiki，只返回提示。Wiki compile 是 Agent LLM 操作，必须用户在对话里触发 wiki-engine skill。

10. **正则提取 wikilink 漏了嵌套方括号。** wikilink 格式是 `[[path|name]]`，正则要正确处理可选的 `|name` 部分。参考 wiki-engine 的 okf_export.mjs 的正则。

---

## Verification Checklist

- [ ] `skills/resume-generator/SKILL.md` 已创建
- [ ] `skills/resume-generator/scripts/api_server.mjs` 已创建
- [ ] `skills/resume-generator/package.json` 已创建（声明 gray-matter）
- [ ] API server 能启动：`node skills/resume-generator/scripts/api_server.mjs`
- [ ] `GET /api/health` 返回 200 + 状态信息
- [ ] `GET /api/wiki` 返回 wiki 实体列表（无数据时返回空数组）
- [ ] `GET /api/wiki/:entity/:id` 能查到单个实体
- [ ] `GET /api/resumes` 返回简历配置列表
- [ ] `GET /api/templates` 返回模板列表
  - [ ] `POST /api/resume/generate` 能组装结构化简历 JSON
- [ ] `POST /api/resume/polish-context` 能返回原始事实、口吻样本和指纹
- [ ] `POST /api/resume/polish` 能生成并返回带指纹校验的润色配置
  - [ ] generate/export 只应用指纹匹配的润色结果，原文变化后回退并标记 stale
- [ ] `hide.items` 在 generate/export 中都能按 Wiki 路径排除实体，且不修改 Wiki 文件
- [ ] 删除清单中的实体不会出现在 health、Wiki 查询、单实体查询或简历生成结果中
- [ ] `POST /api/resume/export` 对 json/html/pdf 三种格式正确响应
- [ ] `POST /api/resume/save` 能保存配置文件
- [ ] `PUT /api/wiki/refresh` 返回需要 Agent 的提示
