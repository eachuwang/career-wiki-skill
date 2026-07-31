---
id: F09
type: grilling
status: open
assignee:
blocked-by: ["F01"]
created: 2026-07-31
title: 多简历 skill（JSON 配置格式/切换/对比）
---

## Question

多简历管理的完整设计：

1. **配置格式**：每份简历一个 JSON 文件，定义模板/模块/强调方向/脱敏/排序
2. **存放位置**：`resumes/` 目录，每份一个文件
3. **切换逻辑**：Web 前端怎么在多份简历间切换
4. **对比功能**：要不要支持两份简历对比差异
5. **创建流程**：用户说"生成字节版简历"→选模板→选模块→选强调→保存配置

## Notes

- 纯 SKILL.md，不需要脚本
- 一个 wiki 支持产出多份简历
- 被 F06 简历生成读取，被 F07 Web 前端用于多简历切换 UI

## Resolution

待用户确认
