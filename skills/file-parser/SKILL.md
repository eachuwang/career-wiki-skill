---
name: file-parser
description: 解析用户要求导入 Career Wiki 的简历或职业材料，保存来源并编译知识库。普通“读文件”或一次性文本提取不触发知识库写入。
version: 1.0.0
author: career-wiki-skill
license: MIT
metadata:
  hermes:
    tags: [file-parser, career-wiki-skill, data-collection, sources, ocr]
    related_skills: [wiki-engine, interview]
---

# 文件解析 Skill（Career-Wiki-Skill）

## 归档条件

明确要求导入 Career Wiki 才写入。拖入文件、提供路径、「读一下」或一次性文字提取都只读；若用户意图不明，返回提取结果，询问是否导入。明确导入已授权归档及编译。

### 步骤 1：归档原件

按 [env-init](../env-init/SKILL.md) 定位和初始化同一个 `WorkspaceRoot`，再运行：

```bash
node skills/file-parser/import_source.mjs archive "$FILE" --root "$ROOT"
```

脚本在 `knowledge/references/uploads/` 独占创建带唯一 ID 的原件，输出路径。保存路径作为重试入口。原件即使是 Markdown 也不是 OKF concept。

### 步骤 2：按格式提取文字

根据扩展名分流：

| 格式 | 扩展名 | 提取方法 |
|------|--------|----------|
| PDF | .pdf | Agent 用 Read 工具读，提取文字层 |
| 图片 | .png .jpg .jpeg .webp .gif | Agent 用 vision 能力识别内容 |
| Word | .docx | Agent 用 Read 工具提取文本 |
| Excel | .xlsx .xls | Agent 用 Read 工具读单元格 |
| 纯文本/MD | .txt .md .markdown | 直接读 |
| 其他 | 其他 | 尝试 Read，失败则告诉用户格式不支持 |

**PDF 特殊处理：**
- 文字层可读 → 直接提取
- 扫描件（无文字层）→ 告诉用户"这是扫描件"，尝试用 vision 识别页面内容
- 混合件 → 文字层 + vision 补充

**图片特殊处理：**
- 简历截图 → vision 识别文字 + 布局
- 含表格的图片 → 尝试还原为 markdown 表格

> 低置信度识别只阻塞不确定字段。保留原文件，把不确定文本放在隔离的待核对草稿中；不要将它作为已核实事实编译。继续处理可靠内容，并集中询问无法核实且影响结果的字段。不得因一处模糊停止整个文件任务。

### 步骤 3：生成 Reference

把提取文本（保持原文顺序，不预提取职业实体）写入 bundle 外的临时 Markdown 文件，再运行：

```bash
node skills/file-parser/import_source.mjs reference "$ARCHIVED_BASENAME" "$EXTRACTION" --root "$ROOT"
```

脚本只在 `knowledge/references/raw/uploads/` 新建与归档 ID 对应的 `Reference`，通过 `sources` 指向原件。不确定文本留在 bundle 外待核对。

### 步骤 4：编译并打开编辑器

按 [Wiki 编译流程](../wiki-engine/SKILL.md) 全量编译。确认生成页 `sources` 引用了本次 Reference，涉及项目时核对项目描述和职责。发布成功后，按 env-init 打开同一工作区的编辑器。告知原件、Reference 和状态：

- **已归档**：原件已保存，尚无可编译 Reference。用原归档文件名重试提取。
- **待编译**：Reference 已保存，构建或发布尚未完成。用现有 Reference 重试，不重新上传。
- **已发布**：Wiki 已校验并生效。报告生成/更新页面数及编辑器是否已打开。

## 跨 Agent 一致性

- 假设所有支持 skill 的 Agent 有 Read 工具 + vision 能力
- **不做降级**——Read/vision 是基本能力，没有的 Agent 用不了这个 skill
- 不依赖 Python 解析库（pymupdf/OCR 库），Agent 自身能力覆盖
