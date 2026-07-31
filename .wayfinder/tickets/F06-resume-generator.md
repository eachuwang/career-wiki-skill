---
id: F06
type: grilling
status: open
assignee:
blocked-by: ["F01", "F04"]
created: 2026-07-31
title: 简历生成 skill + API server（SDK 查询/模板组装/JSON-LD 导出）
---

## Question

简历生成 skill + Node API server 的完整设计：

1. **数据层**：Node 脚本读 wiki markdown → 解析 frontmatter（gray-matter）→ 提取 wikilink（正则）→ 组装结构化简历 JSON
2. **API server**：HTTP 接口设计——GET /api/wiki（读 wiki 数据）、POST /api/resume/generate（生成简历）、POST /api/resume/export（导出 PDF/HTML/JSON）
3. **模板组装**：按模板 schema 从 wiki 实体抽取数据，组装到简历模块
4. **导出**：JSON-LD / PDF / HTML 三种格式
5. **LLM 调用**：纯确定性操作不需要 LLM，还是有些步骤需要？

## Notes

- 用户在 Q7 选 C（简历生成是数据层，Web 是展示层，解耦）
- 用户在 Q9 选 B（简历生成 Node 脚本同时做 API server + 数据层）
- 用户在 Q8 选 C（PDF + HTML + JSON 三格式）
- Node 自己解析 wiki（Q14），不用 LLM
- 需要 gray-matter + 正则提取 wikilink

## Resolution

已确认。F06 决议：

**API server 接口：**
- GET /api/wiki — 所有 wiki 实体
- GET /api/wiki/:entity/:id — 单个实体详情
- GET /api/resumes — 所有简历配置
- GET /api/templates — 所有模板
- POST /api/resume/generate — 按模板+配置生成结构化简历 JSON
- POST /api/resume/export — 导出 PDF/HTML/JSON
- POST /api/resume/save — 保存简历配置
- PUT /api/wiki/refresh — 触发 wiki 重新 compile
- GET /api/health — 健康检查

**数据组装流程（Node 脚本）：**
1. 读简历配置（哪个模板、哪些模块、强调什么）
2. 读模板 schema（实体→模块映射规则）
3. 读 wiki/ 下对应实体目录的 markdown 文件
4. gray-matter 解析 frontmatter，正则提取 wikilink
5. 按模板 schema 组装结构化简历 JSON
6. 返回 JSON

**简历润色：** C — 数据组装是确定性操作（Node 做），润色是 LLM 操作（用户需要时在 Web 前端触发 Agent）

**PDF 导出：** C — 前端按选中的模板渲染出完整的简历 HTML 页面，用浏览器 `window.print()` 导出 PDF。样式靠 CSS 模板控制，每个模板一套 CSS。不需要 puppeteer。

**HTML 导出：** 前端渲染的 HTML 直接保存为文件
**JSON 导出：** Node 脚本组装的结构化简历 JSON 直接导出

**模板格式：** JSON 配置 + CSS 样式 + 布局参数
```
templates/
├── tech-minimal.json          // { name, style: "tech-minimal.css", layout: "single-column", sections: [...], has_photo: false }
├── tech-minimal.css           // 样式
├── business-sidebar.json
├── business-sidebar.css
├── creative-color.json
├── creative-color.css
├── academic-plain.json
└── academic-plain.css
```
模板 = JSON 配置（字段映射+布局参数）+ CSS（视觉样式）。预设：技术简约/商务侧栏/创意色块/学术纯文

**Skill 形式：** SKILL.md + Node 脚本（API server + 数据组装 + 导出）
