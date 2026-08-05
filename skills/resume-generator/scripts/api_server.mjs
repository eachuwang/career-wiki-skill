/**
 * api_server.mjs — Career-Wiki-Skill 简历生成 API Server 入口
 *
 * 用法:
 *   node skills/resume-generator/scripts/api_server.mjs
 *   PORT=4000 node skills/resume-generator/scripts/api_server.mjs
 *   WIKI_ROOT=/path/to/data node skills/resume-generator/scripts/api_server.mjs
 *
 * 环境变量:
 *   PORT      — 监听端口，默认 3001
 *   WIKI_ROOT — 数据目录根路径，默认读 ~/.career_wiki/.career-wiki-skill/config.json 的 root，再 fallback 到 ~/.career_wiki/
 *
 * 实现按领域拆分（候选 D）：
 *   - wiki-reader.mjs  wiki 读取域（路径解析 / 实体读取 / health 计数 / refresh 提示），复用 wiki-engine 的 wiki-parser.mjs
 *   - assembler.mjs    纯函数组装核心（可直测，消费 resume-rules.mjs + wiki-parser.mjs）
 *   - crud.mjs         简历/模板 CRUD + generate/export 共用的 config+template 加载逻辑
 *   - http.mjs         HTTP 壳：请求/响应原语、路由分发、generate/export 处理器、服务启动
 *
 * 13 个接口:
 *   GET    /api/health              — 健康检查
 *   GET    /api/wiki                — 所有 wiki 实体
 *   GET    /api/wiki/:entity/:id    — 单个实体详情
 *   GET    /api/resumes             — 所有简历配置
 *   GET    /api/templates           — 所有模板
 *   POST   /api/resume/generate     — 按模板+配置生成结构化简历 JSON
 *   POST   /api/resume/export       — 导出 PDF/HTML/JSON
 *   POST   /api/resume/save         — 保存简历配置
 *   POST   /api/resume/delete       — 删除简历配置
 *   POST   /api/template/save       — 创建/更新模板
 *   POST   /api/template/delete     — 删除模板
 *   GET    /api/template/css        — 读取模板 CSS 文本
 *   PUT    /api/wiki/refresh        — 触发 wiki 重新 compile（提示用户调 Agent）
 */

import { start } from './http.mjs';

start();
