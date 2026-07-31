---
id: F08
type: grilling
status: open
assignee:
blocked-by: ["F01"]
created: 2026-07-31
title: 简历模板管理 skill（模板格式/预设模板/实体→模块映射）
---

## Question

模板管理的完整设计：

1. **模板格式**：JSON schema，定义 sections + style + 实体→模块映射规则
2. **预设模板**：技术岗 / 产品岗 / 设计岗 / 学术岗 / 通用
3. **自定义模板**：用户怎么创建、保存、版本管理
4. **实体→模块映射**：模板怎么定义"哪些 wiki 实体映射到哪些简历模块"
5. **样式控制**：theme/font/columns/spacing

## Notes

- 纯 SKILL.md + 模板文件（JSON），不需要脚本
- 模板被 F06 简历生成读取，被 F07 Web 前端用于模板选择 UI

## Resolution

已确认。F08 决议：

**操作方式：** A — 纯对话操作，用户说"创建一个新模板"，Agent 引导填写名称/布局/模块/样式配置，写入 templates/

**CSS 处理：** 从预设模板复制一份，用户需要自定义时复制改

**模板格式：** JSON 配置（字段映射+布局参数）+ CSS（视觉样式），已在 F06 确认

**预设模板：** 技术简约/商务侧栏/创意色块/学术纯文

**Skill 形式：** 纯 SKILL.md
