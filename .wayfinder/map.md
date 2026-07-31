# career-wiki — Wayfinder Map

## Destination

一个跨 Agent 兼容的 skill 包，帮助求职者通过采访采集信息、生成结构化 wiki 知识库、从 wiki 生成多份简历、Web 可视化拖拽编辑+实时预览简历。轻量化、通用化，支持 Claude Code/Codex/Hermes/OpenClaw 等所有支持 skill 的 Agent。

## Notes

- **领域**：求职简历 + 个人知识管理
- **兼容性**：所有脚本只用通用工具链（Bash + Python + Node.js），不依赖任何特定 Agent 的工具
- **轻量原则**：skill 只编排指导 Agent，LLM 推理让 Agent 做，脚本只做确定性操作
- **数据规范**：借鉴 CLP 实体/关系模型，OKF 做可选导出格式
- **参考调研**：Karpathy LLM Wiki（atomicstrata/llm-wiki-compiler）的 CLP 概念，但不用其编译器
- **开发顺序**：先做数据层（Wiki 引擎 → 采访 → 文件解析）

## Decisions so far

<!-- 空——地图刚建，尚无已关闭的 ticket -->

## Not yet specified

### v1 feature frontier

| 优先级 | Ticket | 类型 | 状态 | 关键决策点 |
|--------|--------|------|------|-----------|
| 1 | Wiki 数据 schema 定义 | grilling | 待创建 | 实体类型/字段/frontmatter 规范/目录结构/CLP profile |
| 2 | 采访 skill | grilling | 待创建 | 问题树设计/混合模式流程/产出格式 |
| 3 | 文件解析 skill | grilling | 待创建 | 支持格式/解析库/落到 raw 的规则 |
| 4 | Wiki 引擎 skill | grilling | 待创建 | Agent 编排的 ingest/compile/lint/export 流程 |
| 5 | 环境初始化 skill | task | 待创建 | 检查 Node/Python/依赖/首次引导 |
| 6 | 简历生成 skill + API server | grilling | 待创建 | SDK/查询/模板组装/JSON-LD 导出 |
| 7 | Web 编辑前端（含图谱页面） | grilling | 待创建 | React 架构/拖拽/实时预览/脱敏/导出 |
| 8 | 简历模板管理 skill | grilling | 待创建 | 模板格式/预设模板/实体→模块映射 |
| 9 | 多简历 skill | grilling | 待创建 | JSON 配置格式/切换/对比 |
| 10 | 隐私脱敏 skill | grilling | 待创建 | 规则/字段可见性/实时预览脱敏 |
| 11 | OKF 导入/导出 | task | 待创建 | OKF 格式规范/Node 解析/双向转换 |

### 依赖关系

```
#1 Wiki schema ──┬──→ #2 采访 skill（产出按 schema 写 raw）
                  ├──→ #3 文件解析 skill（产出按 schema 写 raw）
                  ├──→ #4 Wiki 引擎 skill（ingest/compile 按 schema）
                  ├──→ #6 简历生成（按 schema 查询 wiki）
                  └──→ #7 Web 前端（按 schema 渲染）

#5 环境初始化 ──→ 所有其他 skill（前置依赖）

#6 简历生成 API ──→ #7 Web 前端（前端调 API）

#8 模板管理 ──→ #6 简历生成（按模板组装）
#8 模板管理 ──→ #7 Web 前端（模板选择 UI）

#9 多简历 ──→ #6 简历生成（多配置）
#9 多简历 ──→ #7 Web 前端（多简历切换 UI）

#10 隐私脱敏 ──→ #7 Web 前端（预览时脱敏）

#11 OKF ──→ #4 Wiki 引擎（导出融入引擎 skill）
```

### Fog of war

- **OKF 具体格式**：谷歌 OKF 的公开规范不明确，需要调研确认是自定义还是有标准
- **Wikilink 解析**：wikilink 格式（`[[path|name]]`）需要 Node 端正则解析，解析规则待定
- **Web 前端框架细节**：React + Vite + dnd-kit + Tailwind 方向明确，但页面组件拆分、状态管理待设计
- **模板→简历映射规则**：模板如何定义"哪些 wiki 实体映射到哪些简历模块"，规则引擎还是固定映射
- **跨 Agent 采访一致性**：不同 Agent 的对话能力不同，采访 skill 的流程编排需要适配最低能力

## Out of scope

- **多用户/账号系统**：纯本地，不做认证
- **云端后端服务**：不建服务器，数据纯本地
- **llmwiki 编译器依赖**：借鉴其 CLP 概念，但不引入其 CLI/SDK/MCP 作为运行时依赖
- **飞书知识库集成**：跨 Agent 兼容，不依赖特定平台
