---
name: resume-generator
description: Career Wiki Node HTTP adapter。严格读取 OKF Career Knowledge，管理简历和模板配置，并提供 AI 润色上下文、生成与模型列表接口。用户要求启动本地 API、配置 AI 润色、保存简历或管理模板时使用；简历预览与 PDF/HTML/JSON 导出由 web-editor 的 Resume Projection 负责。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [resume-generator, career-wiki-skill, api-server, resume, polish]
    related_skills: [wiki-engine, web-editor]
    tickets: [F06]
---

# Resume Generator HTTP Adapter

## 职责

Node 进程由四个明确接口组成：

1. `createCareerKnowledge({ root })`：统一 Wiki snapshot、实体读取与健康状态。
2. `createCareerWikiAppState({ root })`：简历和模板的读取、保存与删除事务。
3. `createResumePolish({ root, appState })`：润色上下文、生成、结果合并与模型列表。
4. `createCareerWikiHttpAdapter({ knowledge, appState, polish })`：只翻译 HTTP 输入输出、状态码和序列化。

浏览器端 `projectResume({ wiki, config, template })` 拥有简历投影。预览、HTML、PDF 和 JSON 导出消费同一 `ResumeView`；HTTP adapter 不执行模块选择、润色应用、手动覆盖、隐藏、排序、隐私或分组。

## 启动

在仓库根目录执行：

```bash
node skills/resume-generator/scripts/api_server.mjs
```

可选环境变量：

- `PORT`：监听端口，默认 `3001`。
- `WIKI_ROOT`：数据根目录；缺失时读取 `~/.career_wiki/.career-wiki-skill/config.json`，再回退到 `~/.career_wiki/`。
- `RESUME_POLISH_PROTOCOL`、`RESUME_POLISH_BASE_URL`、`RESUME_POLISH_API_KEY`、`RESUME_POLISH_MODEL`：服务端 AI Provider 兜底配置。Web 编辑器配置默认保存到当前用户目录。
- `RESUME_POLISH_PROVIDER=mock`：仅用于测试。

运行时依赖由 `skills/package.json` workspace 管理。

## HTTP 接口

| 方法 | 路径 | 职责 |
|---|---|---|
| GET | `/api/health` | 返回数据根目录、实体计数和 OKF 校验状态 |
| GET | `/api/wiki` | 返回 Career Knowledge snapshot；支持 `?entity=project` |
| GET | `/api/wiki/:entity/:id` | 返回单个 Career 实体 |
| GET | `/api/resumes` | 返回全部简历配置 |
| GET | `/api/templates` | 返回全部模板配置 |
| GET | `/api/resume/polish-provider` | 返回本地 Provider 公共配置，不返回 API Key |
| POST | `/api/resume/polish-provider` | 将 Provider 保存到当前用户目录 |
| POST | `/api/resume/polish-context` | 返回润色候选、原始事实、用户口吻样本和指纹 |
| POST | `/api/resume/polish` | 调用显式协议的 Provider，返回带 `polish.entries` 的配置 |
| POST | `/api/resume/polish-models` | 拉取 OpenAI-compatible Provider 的模型列表 |
| POST | `/api/resume/save` | 保存简历配置 |
| POST | `/api/resume/delete` | 删除简历配置，不修改 Wiki |
| POST | `/api/template/save` | 保存模板 JSON 和可选 CSS |
| POST | `/api/template/delete` | 删除模板 JSON 和 CSS |
| GET | `/api/template/css` | 返回模板 CSS |
| PUT | `/api/wiki/refresh` | 返回需要 Agent 重新编译 Wiki 的提示 |

## Career Knowledge 读取

`GET /api/wiki` 调用：

```js
loadCareerKnowledge(root, options)
```

Career Knowledge 模块拥有目录遍历、严格 OKF 校验、实体解析、关系归一化和删除清单过滤。HTTP adapter 只翻译查询参数与响应状态，不直接解析 frontmatter 或读取实体目录。

`GET /api/wiki` 返回：

```json
{
  "entities": [],
  "allRelations": [],
  "total": 0
}
```

## AI 润色流程

### Agent 模式

1. 调用 `POST /api/resume/polish-context`，传 `config` 或 `resume_id`。
2. 只根据 `candidates.source`、`selected_fields` 和 `style_samples` 改写已有事实。
3. 原样使用候选项 `source_hash`，把结果写入 `polish.entries[path]`。
4. 调用 `POST /api/resume/save` 保存配置。Web 编辑器随后通过 Resume Projection 展示和导出。

润色不得补造数字、技术、职责或结果。信息不足时保留原文。

### Web Provider 模式

先通过 `POST /api/resume/polish-provider` 保存配置；API Key 写入 `~/.career_wiki/.career-wiki-skill/polish-provider.json`（权限 `0600`），不会返回或持久化到浏览器。随后 `POST /api/resume/polish` 从本地配置解析协议：

- `openai`：调用 OpenAI-compatible Chat Completions，并使用对应响应 JSON 提取器。
- `anthropic`：调用 Anthropic Messages，并使用对应响应 JSON 提取器。

Base URL 不用于猜测协议。候选项每批最多 2 条、最多同时 2 批；超时、408、429 或 5xx 自动重试一次。API Key 不写入简历配置或错误信息。

成功响应：

```json
{
  "config": {
    "polish": {
      "enabled": true,
      "entries": {
        "projects/data-agent.md": {
          "source_hash": "8位十六进制指纹",
          "fields": {
            "description": "润色后的内容"
          }
        }
      }
    }
  },
  "generated_count": 1,
  "candidate_count": 1
}
```

浏览器 Resume Projection 只应用与当前 Wiki 原始字段指纹一致的结果；过期结果回退原文。

## 保存语义

`POST /api/resume/save` 只写简历配置。以下字段都属于当前简历视角，不回写 Wiki：

- `modules`
- `polish`
- `content_overrides`
- `hide`
- `emphasize`
- `order`
- `privacy`

目录不可写时返回可操作错误，不向浏览器暴露本地绝对路径。

## 错误模式

- 数据根目录错误：用 `/api/health` 返回的 `wiki_root` 定位。
- OKF concept 不合规：明确返回校验错误，不猜测旧 `entity/confidence/[[wikilink]]` 格式。
- Provider 协议缺失：拒绝请求，要求用户显式选择协议。
- Provider 网络不可达：返回服务 origin 和可操作错误，不返回 API Key。
- 端口占用：使用 `PORT` 切换端口。
- `PUT /api/wiki/refresh`：只返回 Agent 提示，不在 Node 中编译 Wiki。

## 完成标准

- `GET /api/health`、Wiki、简历和模板读取接口通过。
- 润色上下文包含原始事实、口吻样本、选中字段和稳定指纹。
- OpenAI-compatible 与 Anthropic Messages 使用各自请求和响应协议。
- 保存失败保留浏览器草稿并返回不含绝对路径的错误。
- `api_server.mjs` 只组装生产模块和管理端口生命周期。
- HTTP adapter 中不存在文件系统、OKF 解析、润色编排、Resume Projection 或导出实现。
- 应用状态与润色行为通过各自接口测试；HTTP 只保留少量契约测试。
- `npm run test:resume-generator` 通过。
