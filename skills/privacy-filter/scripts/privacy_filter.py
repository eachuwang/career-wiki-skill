#!/usr/bin/env python3
"""隐私脱敏脚本 — career-wiki-skill 导出前对文本做 PII 脱敏。

用法:
    python3 privacy_filter.py input.md
    python3 privacy_filter.py input.md --config config.json -o output.md
    python3 privacy_filter.py input.md --dry-run

配置 JSON 格式（缺省字段用默认值）:
    {
      "name": false,      # 姓名：false=显示，true=脱敏（王**）
      "phone": true,     # 电话：true=脱敏（138****5678）
      "email": true,     # 邮箱：true=脱敏（w***@example.com）
      "salary": true,    # 薪资：true=隐藏（[薪资已隐藏]）
      "company": false,  # 公司名：false=显示，true=隐藏
      "github": false     # GitHub：false=显示，true=隐藏
    }

退出码:
    0 — 成功
    1 — 输入文件不存在 / 配置 JSON 解析失败
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


# ---------- 默认配置 ----------

DEFAULT_CONFIG: dict[str, bool] = {
    "name": False,      # 默认显示
    "phone": True,     # 默认脱敏
    "email": True,     # 默认脱敏
    "salary": True,    # 默认脱敏
    "company": False,  # 默认显示
    "github": False,   # 默认显示
}


# ---------- 正则规则 ----------

# 电话：11 位中国大陆手机号 1[3-9]xxxxxxxxx
PHONE_RE = re.compile(r"\b1[3-9]\d{9}\b")

# 邮箱：标准格式
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

# 薪资：月薪/年薪 + 数字 + 单位（k/K/万/千/百/元），可带 /月
# 示例：月薪 25k、年薪 30万、月薪12,000元/月、年薪 300000
SALARY_RE = re.compile(
    r"(月[薪资]|年[薪资]|月薪\s*)\s*[\d,]+\.?\d*\s*[kK万千百]?(?:元)?(?:\s*[\/／]\s*月)?",
    re.IGNORECASE,
)

# GitHub：github.com/username
GITHUB_RE = re.compile(r"github\.com/[a-zA-Z0-9_-]+")

# 姓名定位：frontmatter 的 name 字段 或 "姓名：XXX" 标注
# 中文姓名 2-4 字
NAME_ANNOTATION_RE = re.compile(
    r"(姓名|Name)\s*[:：]\s*([\u4e00-\u9fa5]{2,4})\s*$",
    re.IGNORECASE | re.MULTILINE,
)


# ---------- 脱敏函数 ----------

def mask_phone(m: re.Match) -> str:
    """13812345678 → 138****5678"""
    s = m.group(0)
    return f"{s[:3]}****{s[-4:]}"


def mask_email(m: re.Match) -> str:
    """wang@example.com → w***@example.com"""
    s = m.group(0)
    if "@" not in s:
        return s
    local, _, domain = s.partition("@")
    if not local:
        return s
    return f"{local[0]}***@{domain}"


def mask_salary(m: re.Match) -> str:
    """月薪 25k → [薪资已隐藏]"""
    return "[薪资已隐藏]"


def mask_github(m: re.Match) -> str:
    """github.com/joewang → [GitHub已隐藏]"""
    return "[GitHub已隐藏]"


def mask_name(name: str) -> str:
    """王小明 → 王**（保留姓，名用 **）"""
    if len(name) <= 1:
        return name
    return f"{name[0]}{'*' * (len(name) - 1)}"


# ---------- 配置加载 ----------

def load_config(config_path: str | None) -> dict[str, bool]:
    """加载配置 JSON，与默认配置合并。缺省字段用默认值。"""
    cfg = dict(DEFAULT_CONFIG)
    if config_path is None:
        return cfg
    p = Path(config_path)
    if not p.exists():
        print(f"⚠️  配置文件不存在: {config_path}，使用默认配置", file=sys.stderr)
        return cfg
    try:
        user_cfg = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"❌ 配置 JSON 解析失败: {e}", file=sys.stderr)
        sys.exit(1)
    for k, v in user_cfg.items():
        if k in cfg and isinstance(v, bool):
            cfg[k] = v
        else:
            print(f"⚠️  忽略未知配置项: {k}={v}", file=sys.stderr)
    return cfg


# ---------- 提取姓名候选 ----------

def extract_name_candidates(text: str) -> list[str]:
    """从文本中提取姓名候选（frontmatter name 字段 + 显式标注）。

    返回去重后的姓名列表。
    """
    names: list[str] = []

    # 1. frontmatter name 字段
    #    匹配 ---\n...name: 王小明\n...---
    fm_match = re.search(
        r"^---\s*\n.*?^\s*name\s*:\s*(.+?)\s*$.*?^---",
        text,
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    if fm_match:
        fm_name = fm_match.group(1).strip().strip("\"'")
        if re.fullmatch(r"[\u4e00-\u9fa5]{2,4}", fm_name):
            names.append(fm_name)

    # 2. 文本中 "姓名：王小明" 标注
    for m in NAME_ANNOTATION_RE.finditer(text):
        names.append(m.group(2))

    # 去重，保持顺序
    seen: set[str] = set()
    unique: list[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    return unique


# ---------- 主脱敏逻辑 ----------

def apply_mask(text: str, config: dict[str, bool], dry_run: bool = False) -> tuple[str, list[str]]:
    """对 text 应用脱敏配置，返回 (脱敏后文本, diff 列表)。

    diff 列表每项格式: "原值 → 脱敏值"
    """
    diffs: list[str] = []
    masked_text = text

    def make_replacer(field: str, mask_fn, pattern: re.Pattern):
        """生成一个替换函数，同时收集 diff。"""
        def _repl(m: re.Match) -> str:
            original = m.group(0)
            masked = mask_fn(m)
            if original != masked:
                diffs.append(f"[{field}] {original} → {masked}")
            return masked
        return _repl

    # 1. 电话（正则匹配，最优先，避免被其他规则干扰）
    if config["phone"]:
        masked_text = PHONE_RE.sub(make_replacer("phone", mask_phone, PHONE_RE), masked_text)

    # 2. 邮箱
    if config["email"]:
        masked_text = EMAIL_RE.sub(make_replacer("email", mask_email, EMAIL_RE), masked_text)

    # 3. GitHub（在薪资前，避免 github URL 里的数字被薪资规则误伤）
    if config["github"]:
        masked_text = GITHUB_RE.sub(make_replacer("github", mask_github, GITHUB_RE), masked_text)

    # 4. 薪资
    if config["salary"]:
        masked_text = SALARY_RE.sub(make_replacer("salary", mask_salary, SALARY_RE), masked_text)

    # 5. 公司名 — 需要上下文，无通用正则。留作 TODO，脚本打印 warning。
    #    实际应用场景里，wiki frontmatter 有 company 字段时可以精确替换。
    #    这里通过 frontmatter 的 company / companies 字段做匹配。
    if config["company"]:
        company_names = extract_company_from_frontmatter(masked_text)
        if company_names:
            for cn in company_names:
                if cn and cn in masked_text:
                    masked_text = masked_text.replace(cn, "[公司已隐藏]")
                    diffs.append(f"[company] {cn} → [公司已隐藏]")
        else:
            print(
                "⚠️  公司名脱敏已开启，但未在 frontmatter 找到 company/companies 字段，跳过公司名脱敏。",
                file=sys.stderr,
            )

    # 6. 姓名 — 依赖 frontmatter name 字段或显式标注
    if config["name"]:
        name_candidates = extract_name_candidates(masked_text)
        if name_candidates:
            for nm in name_candidates:
                masked_name = mask_name(nm)
                # 替换文本中所有出现的姓名实例
                before = masked_text
                masked_text = masked_text.replace(nm, masked_name)
                if masked_text != before:
                    diffs.append(f"[name] {nm} → {masked_name}")
        else:
            print(
                "⚠️  姓名脱敏已开启，但未找到 name 字段或姓名标注，跳过姓名脱敏。",
                file=sys.stderr,
            )

    return masked_text, diffs


def extract_company_from_frontmatter(text: str) -> list[str]:
    """从 frontmatter 提取公司名候选（company 或 companies 字段）。"""
    companies: list[str] = []
    fm_match = re.search(
        r"^---\s*\n(.*?)^---",
        text,
        re.MULTILINE | re.DOTALL,
    )
    if not fm_match:
        return companies
    fm_body = fm_match.group(1)

    # 单个 company: 字段
    single = re.search(r"^\s*company\s*:\s*(.+?)\s*$", fm_body, re.MULTILINE | re.IGNORECASE)
    if single:
        val = single.group(1).strip().strip("\"'")
        if val and val.lower() not in ("null", "~", "none", ""):
            companies.append(val)

    # 列表 companies: 字段（YAML 数组）
    list_match = re.search(
        r"^\s*companies\s*:\s*\n((?:\s*-\s+.+\n?)+)",
        fm_body,
        re.MULTILINE | re.IGNORECASE,
    )
    if list_match:
        for line in list_match.group(1).strip().splitlines():
            line = line.strip()
            if line.startswith("-"):
                val = line.lstrip("- ").strip().strip("\"'")
                if val:
                    companies.append(val)

    # dedupe
    seen: set[str] = set()
    unique: list[str] = []
    for c in companies:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return unique


# ---------- 主入口 ----------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="隐私脱敏：对 career-wiki-skill 文本做 PII 脱敏",
    )
    parser.add_argument("input", help="输入文件路径（markdown/文本）")
    parser.add_argument(
        "--config",
        help="配置 JSON 文件路径（字段开关）",
        default=None,
    )
    parser.add_argument(
        "-o", "--output",
        help="输出文件路径，缺省输出到 stdout",
        default=None,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印 diff（原值→脱敏值），不写文件",
    )
    args = parser.parse_args()

    # 读输入
    in_path = Path(args.input)
    if not in_path.exists():
        print(f"❌ 输入文件不存在: {args.input}", file=sys.stderr)
        return 1
    text = in_path.read_text(encoding="utf-8")

    # 加载配置
    config = load_config(args.config)

    # 应用脱敏
    masked_text, diffs = apply_mask(text, config, dry_run=args.dry_run)

    # 输出
    if args.dry_run:
        print("=" * 60)
        print("脱敏预览（dry-run）")
        print("=" * 60)
        print(f"输入文件: {args.input}")
        print(f"配置: {json.dumps(config, ensure_ascii=False)}")
        print("-" * 60)
        if diffs:
            print(f"将替换 {len(diffs)} 处:")
            for d in diffs:
                print(f"  {d}")
        else:
            print("无需脱敏（没有匹配到敏感字段，或相关开关已关闭）")
        print("-" * 60)
        print("脱敏后全文预览（不写文件）:")
        print("-" * 60)
        print(masked_text)
    else:
        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(masked_text, encoding="utf-8")
            print(f"✅ 脱敏完成，输出: {args.output}", file=sys.stderr)
            if diffs:
                print(f"   替换 {len(diffs)} 处:", file=sys.stderr)
                for d in diffs:
                    print(f"   {d}", file=sys.stderr)
        else:
            # stdout 输出脱敏后全文（diff 打到 stderr）
            print(masked_text, end="")
            if diffs:
                print(f"\n--- 脱敏 {len(diffs)} 处 ---", file=sys.stderr)
                for d in diffs:
                    print(d, file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
