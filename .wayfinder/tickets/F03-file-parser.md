---
id: F03
type: grilling
status: open
assignee:
blocked-by: ["F01"]
created: 2026-07-31
title: 文件解析 skill 设计（支持格式/解析库/落到 raw 规则）
---

## Question

文件解析 skill 的完整设计：

1. **支持格式**：PDF / 图片 / Word / Excel / 纯文本？每种用什么库
2. **解析脚本**：`file_parser.py` 提取文字，`file_to_source.py` 拆分写入 raw
3. **落到 raw 的规则**：一个文件产出几个 source？按什么逻辑拆分？
4. **图片处理**：OCR 用什么？需要在线 API 还是本地？
5. **依赖安装**：用户环境可能缺 pymupdf/OCR 库，怎么处理

## Notes

- 文件解析产出跟采访产出平权，统一进 `sources/raw/`
- 需要跨 Agent 兼容：只用 Python 通用库
- 用户在 Q4 确认用户有 Node.js，Python 需要检查

## Resolution

已确认。F03 决议：

**支持格式：** 不限格式，Agent 用 Read 工具直接读
- PDF → Agent Read 提取文字
- 图片 → Agent vision 识别内容
- Word/Excel → Agent 提取内容
- 纯文本/Markdown → 直接读
- 不需要 Python 脚本（Agent 本身能力覆盖）

**Skill 形式：** 纯 SKILL.md（从 2 个 Python 脚本降级）

**流程：**
1. 用户上传文件 → 存到 `sources/uploads/`（保留原始文件）
2. Agent Read 文件 → 提取全部文字内容
3. 写成 markdown 存到 `sources/raw/uploads/`，带 frontmatter（upload_date, original_file, file_type, interviewer: career-wiki）
4. 自动调 wiki 引擎 compile（跟 F02 一致）

**目录结构：**
```
~/.career_wiki/sources/
├── raw/                    ← 提取后的 markdown
│   ├── interview-001.md    ← 采访产出
│   └── uploads/            ← 文件提取产出
│       └── 老王简历_2026-07-31.md
└── uploads/                ← 用户上传的原始文件
    └── 老王简历_2026-07-31.pdf
```

**原始文件保存：** 文件名加日期防重名

**采完自动 compile：** 选 A — 跟 F02 一致
