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

待用户确认
