# 现代简历排版与 ATS 友好原则调研

> 调研日期：2026-08-05
> 适用范围：中文/英文、A4/Letter、HTML 实时预览与 PDF/打印输出
> 来源边界：高校职业中心、ATS 相关官方指南、W3C 官方规范。本文将来源明确支持的结论与工程推导分开标记。

## 一、结论摘要

这套产品最稳妥的方向不是“视觉越丰富越好”，而是做一份**单栏、强层级、可快速扫读、文本顺序稳定**的现代简历：用字号、字重、留白和一条低调强调色建立层级，避免依赖图标、图片、文本框、表格和多栏布局。MIT 的 ATS 指南明确指出，图片、图标、表格、文本框和复杂图形可能被 ATS 扭曲、忽略或删除；多栏还可能导致纯文本提取顺序错误。[MIT：Make your resume ATS-friendly](https://capd.mit.edu/resources/make-your-resume-ats-friendly/)

推荐形成两个明确的纸张预设，而不是依赖浏览器自动缩放：

- **A4（默认，中文及多数国际场景）**：210 × 297 mm。
- **Letter（北美场景）**：8.5 × 11 in。

W3C CSS Paged Media 将 A4 和 Letter 定义为不同的命名纸张尺寸，也说明 `@page` 可控制页面尺寸、方向和边距。[W3C CSS Paged Media Level 3：Page Size](https://www.w3.org/TR/css-page-3/#page-size-prop)

对于在校生和职业早期用户，默认目标应是单页；不要通过把正文压到 10pt 以下来强行塞入一页。MIT 建议边距保持在 0.5–1.0 英寸、字号 10–12pt、通常一页；高级学位或 10 年以上丰富经历可使用两页。[MIT Resume Checklist](https://capd.mit.edu/resources/resume-checklist/)

## 二、可直接采用的版式基线

### 1. 页面与留白

| 项目 | 建议值 | 依据/说明 |
| --- | --- | --- |
| 纸张 | A4 默认；提供 Letter 切换 | W3C 明确定义 A4 为 210 × 297 mm，Letter 为 8.5 × 11 in。[W3C](https://www.w3.org/TR/css-page-3/#valdef-page-size-a4) |
| 方向 | 纵向 | 简历的常规阅读方向；同时减少横向多栏诱因。 |
| 页边距 | A4 建议 14–18 mm；Letter 建议 0.55–0.75 in | 均落在 MIT 建议的 0.5–1.0 in 范围内，并为内容和留白取得平衡。[MIT Checklist](https://capd.mit.edu/resources/resume-checklist/) |
| 页面长度 | 职业早期默认单页；允许明确切换双页 | MIT：通常一页，高级学位或 10+ 年经历可两页。[MIT Checklist](https://capd.mit.edu/resources/resume-checklist/) |
| 溢出策略 | 显示“超出 1 页”提示，优先隐藏不相关条目或精简内容；不得自动缩小到 10pt 以下 | 10–12pt 是 MIT 给出的正文区间；自动缩小会破坏可读性。[MIT Checklist](https://capd.mit.edu/resources/resume-checklist/) |

Purdue OWL 提出页面应在文字与空白之间保持平衡，并把最重要信息放在页面左上区域，以顺应从左到右、从上到下的快速扫读路径。[Purdue OWL：Résumé Design](https://owl.purdue.edu/owl/job_search_writing/resumes_and_vitas/resume_design.html)

### 2. 字体、字号与行距

建议采用有限且稳定的字号层级：

- 姓名：18–22pt，700 字重。
- 一级分区标题：11–12pt，650–700 字重，可配细分隔线。
- 组织/项目名称：10.5–11pt，600–700 字重。
- 职位、日期、地点：10–10.5pt，400–600 字重。
- 正文与项目要点：10–10.5pt，行高 1.25–1.4。
- 同一简历最多使用一个主字体族；如确需第二字体，只用于标题，且必须全局一致。

其中，正文不低于 10pt、推荐使用常见易读字体，直接来自 MIT；MIT 列举 Arial、Calibri、Cambria、Georgia、Helvetica、Times New Roman 等常见字体，并建议避免彩色、花哨或风格化字体。[MIT ATS Guide](https://capd.mit.edu/resources/make-your-resume-ats-friendly/) Purdue 也强调字体和强调方式的一致性，建议最多两种字体，并避免混用大写、斜体、下划线等过多强调手段。[Purdue OWL](https://owl.purdue.edu/owl/job_search_writing/resumes_and_vitas/resume_design.html)

**中文字体的工程推导**：ATS 来源没有给出中文字体清单。为保证中文可读性和跨平台降级，可使用常见无衬线字体栈，例如 `Arial, "Microsoft YaHei", "PingFang SC", sans-serif`；但最终 PDF 必须实际验证字体嵌入、文字可选择和复制顺序，不能只凭浏览器预览判断。

### 3. 信息层级与顺序

推荐单栏结构：

1. 姓名与联系方式。
2. 与目标岗位最相关的分区优先，例如工作经历、项目经历、教育经历、技能。
3. 每个分区内部采用倒序时间线。
4. 每条经历先展示“组织/项目 + 职位/角色”，再展示日期/地点和成果要点。

MIT 要求分区按雇主关注的重要性排列、标题具有描述性，并在每段经历中清楚列出组织、职位、地点、日期，以及项目/活动/成果；要点以动作动词开头，并尽量用规模、预算、人数等量化影响。[MIT Resume Checklist](https://capd.mit.edu/resources/resume-checklist/)

推荐的经历条目结构：

```text
组织或项目名称                                      2024.03–2025.06
职位 / 角色 · 地点
• 动作 + 任务/问题 + 方法 + 可验证结果
• 动作 + 影响范围/规模 + 量化结果
```

日期应保持同一种格式并视觉右对齐，但**源代码/DOM 顺序仍放在所属经历内**，以保证纯文本提取时不会脱离上下文。实现时可用 CSS Grid/Flex 完成视觉对齐，不要使用 HTML 表格或绝对定位文本框。这个实现方式是结合 MIT“日期清晰一致”和“避免表格、文本框、错误文本顺序”的工程推导。[MIT Checklist](https://capd.mit.edu/resources/resume-checklist/) [MIT ATS Guide](https://capd.mit.edu/resources/make-your-resume-ats-friendly/)

### 4. 颜色与装饰

建议使用白底、深色正文和最多一种深色强调色：

- 正文使用接近黑色的深灰，而非浅灰。
- 强调色只用于分区标题、极细分隔线或链接；不承担唯一的信息区分职责。
- 联系方式使用文字标签，不使用只有图标的电话、邮箱、地点。
- 不使用头像、技能进度条、星级、时间轴图形、大面积色块、双栏侧边栏。

ATS 方面，MIT 明确建议避免图形、图标、图片、表格、文本框和彩色花哨字体。[MIT ATS Guide](https://capd.mit.edu/resources/make-your-resume-ats-friendly/) 无障碍方面，WCAG 2.2 要求普通文本与背景至少达到 4.5:1 对比度，大号文本至少 3:1；颜色不能作为传达信息的唯一方式。[WCAG 2.2：Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum) [WCAG 2.2：Use of Color](https://www.w3.org/TR/WCAG22/#use-of-color)

## 三、ATS 友好约束

### 必须遵守

- 使用常见、可读字体，正文至少 10pt。
- 采用单栏、线性 DOM 顺序和标准分区标题。
- 不将核心信息放进页眉/页脚、图片、图标、文本框或表格。
- 不用断词把一个关键词拆到两行。
- 合理使用职位描述中的真实关键词，不堆砌关键词，也不要只写缩写。
- 输出 PDF 或 DOC/DOCX 时遵循招聘系统指定格式；未指定时，MIT 认为 DOC/DOCX 或 PDF 通常安全。
- 导出后做一次纯文本测试，检查是否缺字、乱码或顺序错乱。

以上均来自 MIT ATS 官方指南，尤其是它给出的自检方法：把简历保存/提取为纯文本，检查缺失文字与错误顺序；错误通常来自文本框、表格、列等布局结构。[MIT ATS Guide](https://capd.mit.edu/resources/make-your-resume-ats-friendly/)

### 产品中应提供的检查

这是从上述官方要求推导出的产品级校验：

1. **一页检测**：分别在 A4 和 Letter 预设下检测页数。
2. **最小字号检测**：正文任何节点不得低于 10pt。
3. **结构检测**：导出 DOM 中不出现用于排版的 `<table>`、绝对定位文本块和纯图标联系方式。
4. **文本抽取检测**：对生成 PDF 提取纯文本，确认姓名、分区、组织、角色、日期、要点均存在且顺序正确。
5. **选择性检测**：用户在本次简历中隐藏的条目不得出现在预览、打印 DOM、PDF 文本或最终导出数据中，但不能从 Wiki 源数据删除。
6. **关键词完整性检测**：避免由 CSS 断词或软连字符造成关键词被拆分。

## 四、HTML、打印与 PDF 一致性

### 推荐实现

```css
/* 纸张尺寸必须显式选择，避免浏览器按打印机默认值缩放。 */
@page {
  size: A4 portrait;
  margin: 16mm;
}

@media print {
  .resume-entry {
    break-inside: avoid-page;
  }

  .resume-ui-only {
    display: none !important;
  }
}
```

W3C CSS Paged Media 规定 `@page` 可控制页面尺寸、方向和边距，并分别定义 A4 与 Letter；W3C CSS Fragmentation 规定 `break-inside`、`break-before`、`break-after` 及 `avoid-page` 用于控制分页和尽量保持内容块完整。[W3C CSS Paged Media](https://www.w3.org/TR/css-page-3/) [W3C CSS Fragmentation Level 3](https://www.w3.org/TR/css-break-3/#breaking-controls)

注意：`break-inside: avoid-page` 是“尽量避免”而非无限保证；当单条经历本身高于一页时仍必须允许分页。因此模板应通过内容选择和溢出提示控制长度，而不是依赖强制分页规则。

打印颜色也不能只看屏幕。W3C 说明浏览器可能为节省墨水而抑制打印背景色；`print-color-adjust` 可表达作者希望，但用户代理仍可能调整。因此关键信息必须在黑白打印下仍可辨认，分区层级不能只依赖背景色。[W3C CSS Color Adjustment Level 1](https://www.w3.org/TR/css-color-adjust-1/#print-color-adjust)

### 一致性验收矩阵

| 检查项 | 屏幕预览 | A4 PDF | Letter PDF | 黑白打印 |
| --- | --- | --- | --- | --- |
| 分区、条目和日期顺序一致 | 必须 | 必须 | 必须 | 必须 |
| 隐藏条目不出现 | 必须 | 必须 | 必须 | 必须 |
| 正文不低于 10pt | 必须 | 必须 | 必须 | 必须 |
| 经历条目不发生不必要的跨页断裂 | 观察 | 必须 | 必须 | 必须 |
| 文字可选择、可复制、无乱码 | 不适用 | 必须 | 必须 | 不适用 |
| 纯文本提取顺序正确 | 不适用 | 必须 | 必须 | 不适用 |
| 颜色对比度 ≥ 4.5:1，且黑白下层级仍成立 | 必须 | 必须 | 必须 | 必须 |

## 五、对本项目的设计落点

1. **默认模板改为现代单栏**：姓名居左或居中均可，但经历主体保持单栏；用字重、字号、间距和细分隔线建立层级。
2. **A4/Letter 两套固定预设**：中国/国际默认 A4，北美申请切换 Letter；不要将同一画布简单缩放。
3. **日期视觉右对齐、数据语义就近**：CSS Grid/Flex 对齐，DOM 中日期紧随所属经历，保证 ATS 文本顺序。
4. **内容密度通过选择控制**：先让用户隐藏不相关的项目/经历，再精简 bullet；不要以更小字体和更窄行距补救。
5. **强调色克制且可访问**：深蓝、深青或深灰均可，但需通过 4.5:1 对比度检测；不使用浅灰正文。
6. **同一渲染树驱动预览与导出**：屏幕和打印仅切换媒介样式，避免两份模板逻辑漂移。
7. **PDF 导出作为测试对象**：不仅截图比对，还要验证页数、文本可选、文字完整性和抽取顺序。

## 六、来源清单

1. MIT Career Advising & Professional Development, [Resume Checklist](https://capd.mit.edu/resources/resume-checklist/)：边距、字号、页数、留白、字体、日期一致性、分区顺序、经历内容结构。
2. MIT Career Advising & Professional Development, [Make your resume ATS-friendly](https://capd.mit.edu/resources/make-your-resume-ats-friendly/)：图片/图标/表格/文本框、多栏、字体、关键词、文件格式和纯文本自检。
3. Purdue Online Writing Lab, [Résumé Design](https://owl.purdue.edu/owl/job_search_writing/resumes_and_vitas/resume_design.html)：页面平衡、快速扫读、字体层级与强调方式一致性。
4. W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)：文本对比度、不能仅靠颜色传达信息、文本间距适应性。
5. W3C, [CSS Paged Media Module Level 3](https://www.w3.org/TR/css-page-3/)：`@page`、A4/Letter 尺寸、页边距与页面方向。
6. W3C, [CSS Fragmentation Module Level 3](https://www.w3.org/TR/css-break-3/)：分页、`break-inside`、`avoid-page`、孤行/寡行控制。
7. W3C, [CSS Color Adjustment Module Level 1](https://www.w3.org/TR/css-color-adjust-1/)：浏览器打印时的颜色调整和背景色抑制行为。
