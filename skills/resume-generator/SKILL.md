---
name: resume-generator
description: 简历生成 skill。提供 Node API server（13 个 HTTP 接口），读 wiki markdown → gray-matter 解析 frontmatter → 正则提取 wikilink → 按模板 schema 组装结构化简历 JSON。用户说"生成简历""导出简历""启动 API server"时触发。纯确定性操作，不需要 LLM。PDF/HTML 导出由前端渲染。
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

**核心理念：** 简历生成是**纯确定性操作**（Node 做，不需要 LLM）。读 wiki → 解析 → 按模板 schema 组装 → 返回 JSON。字段映射、排序、过滤、脱敏等确定性规则收敛在 `scripts/resume-rules.mjs`（web-editor 前端预览与后端生成共用，避免双实现分叉），组装在 Node 脚本完成。简历润色是 LLM 操作（用户需要时在 Web 前端触发 Agent）。

**模板格式：** JSON 配置（字段映射 + 布局参数）+ CSS 样式文件。预设 4 个模板（技术简约/商务侧栏/创意色块/学术纯文），由 web-editor 前端管理（复制/删除）。

**导出方式：**
- **JSON** — Node 直接返回组装好的结构化简历 JSON
- **HTML** — 前端在浏览器端渲染完整 HTML 页面并保存（不经后端 export 接口）
- **PDF** — 前端在浏览器端用 `html2pdf.js` 直接生成并下载（不经后端 export 接口）

---

## 何时触发

- 用户说"生成简历" / "渲染简历" / "组装简历" → 调 `POST /api/resume/generate`
- 用户说"导出简历" / "下载简历" → 调 `POST /api/resume/export`（后端返回结构化 JSON；HTML/PDF 由前端浏览器端生成）
- 用户说"启动 API server" / "起个服务" → 启动 `scripts/api_server.mjs`
- 用户说"看 wiki 有什么数据" → 调 `GET /api/wiki`
- Web 前端启动时自动调 `GET /api/health` 检查服务状态
- Web 前端简历编辑器调 `GET /api/resumes` + `GET /api/templates` 填充 UI

**不用于：** 编译 wiki（用 wiki-engine skill）；多简历配置与模板管理已并入 web-editor 前端。

---

## 数据目录约定

resume-generator 从 `~/.career_wiki/` 读三个目录：`wiki/`（数据源）、`resumes/`（简历配置 JSON）、`templates/`（模板 JSON + CSS）。完整目录清单以 `skills/env-init/scripts/env_check.py --list-dirs` 为权威来源，此处不复述。

- 数据目录默认 `~/.career_wiki/`，用户可在 env-init 时自定义
- API server 启动时读 `~/.career_wiki/.career-wiki-skill/config.json` 的 `root` 字段确定数据目录，再 fallback 到 `~/.career_wiki/`
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

### 依赖

- `gray-matter` — 解析 markdown frontmatter（仓库根 package.json 声明）
- Node 内置 `http` / `fs` / `path` — 不需要额外依赖

### 13 个接口

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/health` | 健康检查，返回服务状态 + 数据目录信息 |
| 2 | GET | `/api/wiki` | 所有 wiki 实体，读 wiki/ 下所有 markdown，gray-matter 解析 frontmatter 返回 JSON |
| 3 | GET | `/api/wiki/:entity/:id` | 单个实体详情，entity 是实体类型（persons/experiences/...），id 是文件名（不带 .md） |
| 4 | GET | `/api/resumes` | 所有简历配置，读 resumes/ 目录下所有 .json |
| 5 | GET | `/api/templates` | 所有模板，读 templates/ 目录下所有 .json |
| 6 | POST | `/api/resume/generate` | 按模板 + 配置生成结构化简历 JSON |
| 7 | POST | `/api/resume/export` | 导出结构化简历 JSON（HTML/PDF 由前端浏览器端生成，不经此接口） |
| 8 | POST | `/api/resume/save` | 保存简历配置到 resumes/ |
| 9 | PUT | `/api/wiki/refresh` | 触发 wiki 重新 compile（提示用户调 Agent） |
| 10 | POST | `/api/resume/delete` | 删除简历配置（仅删 JSON，不删 wiki 数据） |
| 11 | POST | `/api/template/save` | 创建/更新模板（JSON + 可选 CSS） |
| 12 | POST | `/api/template/delete` | 删除模板（JSON + 同名 CSS） |
| 13 | GET | `/api/template/css` | 读取模板 CSS 文本（供复制/预览） |

### 模块结构

`scripts/` 按领域拆分（候选 D），`api_server.mjs` 仅是入口：

| 文件 | 职责 |
|------|------|
| `api_server.mjs` | 入口，调 `http.mjs` 的 `start()` |
| `http.mjs` | HTTP 壳：`readBody`/`sendJson`、路由分发、`generate`/`export` 处理器、服务启动 |
| `crud.mjs` | 简历/模板 CRUD + `generate`/`export` 共用的 `loadResumeConfig`/`loadTemplate` |
| `assembler.mjs` | 纯函数组装核心（可直测，消费 `resume-rules.mjs` + `wiki-parser.mjs`） |
| `wiki-reader.mjs` | wiki 读取域：路径解析、实体读取、health 计数、refresh 提示（复用 `wiki-engine` 的 `wiki-parser.mjs`） |
| `resume-rules.mjs` | 共享渲染规则（脱敏/排序/字段选择/隐藏/分组，web-editor 复用） |

`generate` 与 `export` 共用 `crud.mjs` 的配置+模板加载逻辑，再调 `assembler.mjs` 的纯函数组装，避免两处加载分叉。

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
- 排序（`order` 对象 → 模块内时间排序，规则见 `scripts/resume-rules.mjs`）
- 脱敏（`privacy` 对象 → 6 字段打码：name/phone/email/company/salary/github，规则见 `scripts/resume-rules.mjs`，与前端预览共用）

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

### 7. POST /api/resume/export

导出简历。返回结构化简历 JSON（等同 `/api/resume/generate` 的输出）。

**HTML/PDF 导出由前端在浏览器端完成**（`html2pdf.js` 生成 `.print-area` PDF、`Blob` 下载 HTML），不经此接口。前端调 export 只发 `format: json`，后端忽略 `format` 字段直接返回 JSON 数据。

**请求体：**
```json
{
  "resume_id": "bytedance-backend",
  "format": "json"
}
```

`format` 字段保留兼容但后端不再分支处理（历史上有 html/pdf 分支返回 instruction + `window.print()` 指令，前端从未消费，已删）。

**响应 200：** 结构化简历 JSON

### 8. POST /api/resume/save

保存简历配置到 `~/.career_wiki/resumes/{id}.json`。

**请求体：** 完整的简历配置 JSON（由 web-editor 前端生成，格式见 `resumes/` 下现有配置）。

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

4. **数据目录找不到。** `WIKI_ROOT` 环境变量没设、config.json 不存在、目录路径写错——API server 启动时应该 fallback 到 `~/.career_wiki/`，并在 `/api/health` 里返回实际用的路径让用户确认。

5. **wiki markdown 没有 frontmatter 或 frontmatter 不合规。** gray-matter 解析不出 fields，实体数据会是空的。应跳过并 warn，不 crash。

6. **端口冲突。** 默认 3001，被占时启动失败。应提示用户设 `PORT` 环境变量换端口。

7. **PDF/HTML 导出在前端，不在 Node。** 后端 export 接口只返回结构化 JSON。PDF/HTML 由前端 `html2pdf.js` / `Blob` 在浏览器端生成，不要在 Node 装 puppeteer。

8. **PUT /api/wiki/refresh 被误以为是同步编译。** 这个接口不编译 wiki，只返回提示。Wiki compile 是 Agent LLM 操作，必须用户在对话里触发 wiki-engine skill。

9. **正则提取 wikilink 漏了嵌套方括号。** wikilink 格式是 `[[path|name]]`，正则要正确处理可选的 `|name` 部分。参考 wiki-engine 的 okf_export.mjs 的正则。

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
- [ ] `hide.items` 在 generate/export 中都能按 Wiki 路径排除实体，且不修改 Wiki 文件
- [ ] `POST /api/resume/export` 返回结构化简历 JSON（前端拿数据自行渲染 HTML/PDF）
- [ ] `POST /api/resume/save` 能保存配置文件
- [ ] `PUT /api/wiki/refresh` 返回需要 Agent 的提示
