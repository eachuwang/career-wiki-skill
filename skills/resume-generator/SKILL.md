---
name: resume-generator
description: 简历生成 skill。提供 Node API server（9 个 HTTP 接口），读 wiki markdown → gray-matter 解析 frontmatter → 正则提取 wikilink → 按模板 schema 组装结构化简历 JSON。用户说"生成简历""导出简历""启动 API server"时触发。纯确定性操作，不需要 LLM。PDF/HTML 导出由前端渲染。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [resume-generator, career-wiki-skill, api-server, resume, generate, export]
    related_skills: [wiki-engine, template-manager, multi-resume, web-frontend, privacy-filter]
    tickets: [F06]
---

# 简历生成 Skill（Career-Wiki-Skill）

## 概述

career-wiki-skill 的简历生成层。提供 **Node HTTP API server**，从 wiki markdown 读数据、解析 frontmatter、按模板+简历配置组装结构化简历 JSON。Web 前端（F07）调用这些接口完成简历渲染和导出。

**核心理念：** 简历生成是**纯确定性操作**（Node 做，不需要 LLM）。读 wiki → 解析 → 按模板 schema 组装 → 返回 JSON。数据组装、字段映射、排序、过滤全在 Node 脚本完成。简历润色是 LLM 操作（用户需要时在 Web 前端触发 Agent）。

**模板格式：** JSON 配置（字段映射 + 布局参数）+ CSS 样式文件。预设 4 个模板（技术简约/商务侧栏/创意色块/学术纯文），由 template-manager skill 管理。

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

**不用于：** 管理多份简历配置（用 multi-resume skill）；管理模板（用 template-manager skill）；编译 wiki（用 wiki-engine skill）。

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

### 依赖

- `gray-matter` — 解析 markdown frontmatter（仓库根 package.json 声明）
- Node 内置 `http` / `fs` / `path` — 不需要额外依赖

### 9 个接口

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/health` | 健康检查，返回服务状态 + 数据目录信息 |
| 2 | GET | `/api/wiki` | 所有 wiki 实体，读 wiki/ 下所有 markdown，gray-matter 解析 frontmatter 返回 JSON |
| 3 | GET | `/api/wiki/:entity/:id` | 单个实体详情，entity 是实体类型（persons/experiences/...），id 是文件名（不带 .md） |
| 4 | GET | `/api/resumes` | 所有简历配置，读 resumes/ 目录下所有 .json |
| 5 | GET | `/api/templates` | 所有模板，读 templates/ 目录下所有 .json |
| 6 | POST | `/api/resume/generate` | 按模板 + 配置生成结构化简历 JSON |
| 7 | POST | `/api/resume/export` | 导出 PDF/HTML/JSON（JSON 直接返回，HTML/PDF 由前端渲染） |
| 8 | POST | `/api/resume/save` | 保存简历配置到 resumes/ |
| 9 | PUT | `/api/wiki/refresh` | 触发 wiki 重新 compile（提示用户调 Agent） |

---

## 数据组装流程（核心）

`POST /api/resume/generate` 的执行流程：

### 步骤 1：读简历配置

请求体含 `resume_id`（简历配置 id）或直接传完整配置对象。根据 `resume_id` 从 `~/.career_wiki/resumes/{id}.json` 读配置。

配置决定：
- 用哪个模板（`template` 字段 → 读模板 JSON 的 sections 定义）
- 包含哪些模块（`modules` 数组，覆盖模板 sections 的顺序）
- 强调什么（`emphasize` 数组 → 某些技能/项目置顶或高亮）
- 隐藏什么（`hide` 数组 → 某些字段不显示）
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
- 正文 content → 保留作为 `description` 或 `content` 字段

用正则提取正文中的 wikilink：
```
\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]
```
提取出 `{target, name}` 数组，用于关系展示（如"在 XX 公司期间用了 YY 技能"）。

### 步骤 5：按模板 schema 组装结构化简历 JSON

按模板 sections 顺序组装。对每个 section：

1. 取该 module 对应的所有 wiki 实体数据
2. 按 `fields` 配置抽取字段（只保留模板要的字段）
3. 应用简历配置的覆盖：
   - `modules` 过滤 — 只保留简历配置要的模块
   - `order` 排序 — 按时间 asc/desc 排序
   - `emphasize` — 强调的项排前面
   - `hide` — 删掉隐藏的字段
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
  "total": 15
}
```

**查询参数：**
- `entity=skill` — 只返回某类实体

### 3. GET /api/wiki/:entity/:id

返回单个实体详情。`entity` 是复数目录名（persons/experiences/projects/skills/education/certificates/awards/publications/activities/summaries），`id` 是文件名不带 `.md`。

**响应 200：** 同上单个实体对象。
**响应 404：** `{"error": "实体不存在", "path": "persons/xxx.md"}`

### 4. GET /api/resumes

返回所有简历配置。读 `resumes/` 下所有 `.json`。

**响应 200：**
```json
{
  "resumes": [
    {
      "name": "字节后端版",
      "id": "bytedance-backend",
      "template": "tech-minimal",
      "target": {"company": "字节跳动", "position": "后端开发"},
      "modules": ["person", "experience", "project", "skill", "education"],
      "updated": "2026-07-31"
    }
  ],
  "total": 2
}
```

### 5. GET /api/templates

返回所有模板。读 `templates/` 下所有 `.json`。

**响应 200：**
```json
{
  "templates": [
    {
      "name": "技术简约",
      "id": "tech-minimal",
      "layout": "single-column",
      "has_photo": false,
      "sections_count": 5
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

### 8. POST /api/resume/save

保存简历配置到 `~/.career_wiki/resumes/{id}.json`。

**请求体：** 完整的简历配置 JSON（格式见 multi-resume skill）。

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

3. **emphasize/hide 的 items 跟 wiki 实体 name 对不上。** F06 按 name 字段做匹配，wiki 里的 name 可能跟用户原话不同（如"Go" vs "Golang"）。配置应由 multi-resume skill 从 wiki 拉真实 name 填入。

4. **数据目录找不到。** `WIKI_ROOT` 环境变量没设、config.json 不存在、目录路径写错——API server 启动时应该 fallback 到 `~/.career_wiki/`，并在 `/api/health` 里返回实际用的路径让用户确认。

5. **wiki markdown 没有 frontmatter 或 frontmatter 不合规。** gray-matter 解析不出 fields，实体数据会是空的。应跳过并 warn，不 crash。

6. **端口冲突。** 默认 3001，被占时启动失败。应提示用户设 `PORT` 环境变量换端口。

7. **PDF 导出依赖前端。** 不要在 Node 里装 puppeteer——太重。PDF 导出靠前端 `window.print()`，Node 只返回数据。

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
- [ ] `POST /api/resume/export` 对 json/html/pdf 三种格式正确响应
- [ ] `POST /api/resume/save` 能保存配置文件
- [ ] `PUT /api/wiki/refresh` 返回需要 Agent 的提示
