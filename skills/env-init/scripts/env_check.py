#!/usr/bin/env python3
"""环境检查脚本 — career-wiki-skill 的前置依赖与目录结构初始化。

用法:
    python3 skills/env-init/scripts/env_check.py
    python3 skills/env-init/scripts/env_check.py --root /custom/path

退出码:
    0 — 全部通过
    1 — 有失败项
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


# ---------- 配置 ----------

NODE_MIN_MAJOR = 18
PYTHON_MIN_TUPLE = (3, 9)

WIKI_SUBDIRS = [
    "persons",
    "experiences",
    "projects",
    "skills",
    "education",
    "certificates",
    "awards",
    "publications",
    "activities",
    "summaries",
]

ALL_DIRS = [
    "sources/raw",
    "sources/uploads",
    "sources/raw/uploads",
    *[f"wiki/{d}" for d in WIKI_SUBDIRS],
    "resumes",
    "templates",
    ".career-wiki-skill",
]


# ---------- 工具函数 ----------

def run_cmd(cmd: str) -> tuple[int, str, str]:
    """运行命令，返回 (returncode, stdout, stderr)。跨平台。"""
    try:
        r = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return 127, "", "command not found or timed out"


def find_python() -> str:
    """Windows 上 python3 可能不存在，fallback 到 python。"""
    for candidate in ("python3", "python"):
        rc, out, _ = run_cmd(f"{candidate} --version")
        if rc == 0 and out:
            return candidate
    return "python3"  # 默认返回，后面检查会失败


def parse_python_version(out: str) -> tuple[int, int] | None:
    """从 'Python 3.11.15' 提取 (3, 11)。"""
    try:
        parts = out.split()[1].split(".")
        return int(parts[0]), int(parts[1])
    except (IndexError, ValueError):
        return None


def parse_node_version(out: str) -> int | None:
    """从 'v18.0.0' 或 'v20.11.1' 提取主版本号。"""
    s = out.lstrip("v").strip()
    if not s:
        return None
    try:
        return int(s.split(".")[0])
    except ValueError:
        return None


# ---------- 检查项 ----------

def check_node() -> tuple[bool, str]:
    rc, out, err = run_cmd("node -v")
    if rc != 0 or not out:
        return False, f"❌ Node.js 未安装或不可用 ({err or 'no output'})"
    major = parse_node_version(out)
    if major is None:
        return False, f"❌ 无法解析 Node.js 版本: {out}"
    if major < NODE_MIN_MAJOR:
        return False, f"❌ Node.js {out} 版本过低，需 ≥ v{NODE_MIN_MAJOR}"
    return True, f"✅ Node.js {out}"


def check_python() -> tuple[bool, str]:
    py = find_python()
    rc, out, err = run_cmd(f"{py} --version")
    if rc != 0 or not out:
        return False, f"❌ Python 未安装或不可用 ({err or 'no output'})"
    v = parse_python_version(out)
    if v is None:
        return False, f"❌ 无法解析 Python 版本: {out}"
    if v < PYTHON_MIN_TUPLE:
        return False, f"❌ Python {v[0]}.{v[1]} 版本过低，需 ≥ {PYTHON_MIN_TUPLE[0]}.{PYTHON_MIN_TUPLE[1]}"
    return True, f"✅ Python {v[0]}.{v[1]}"


def check_npm() -> tuple[bool, str]:
    rc, out, err = run_cmd("npm -v")
    if rc != 0 or not out:
        return False, f"❌ npm 未安装或不可用 ({err or 'no output'})"
    return True, f"✅ npm {out}"


def check_gray_matter() -> tuple[bool, str]:
    """gray-matter 是 wiki 引擎的 Node 依赖，不达标会被 SKILL.md 的 npm install 步骤装上。
    这里只做信息性检查，不阻断。"""
    rc, out, _ = run_cmd("npm list gray-matter 2>/dev/null")
    if rc == 0 and "gray-matter" in out:
        return True, f"✅ gray-matter 已安装"
    return False, "⚠️  gray-matter 未安装（将由 npm install 自动安装）"


# ---------- 目录结构 ----------

def ensure_dirs(root: Path) -> list[str]:
    """在 root 下创建所有目录。返回新建的目录列表。幂等。"""
    created: list[str] = []
    for rel in ALL_DIRS:
        d = root / rel
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            created.append(rel)
    return created


def write_config(root: Path) -> bool:
    """写 ~/.career_wiki/.career-wiki-skill/config.json。返回是否新建。"""
    cfg_path = root / ".career-wiki-skill" / "config.json"
    if cfg_path.exists():
        return False
    cfg = {
        "version": "1.0",
        "root": str(root),
        "created": None,  # Agent 会填实际时间
    }
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    return True


# ---------- 主流程 ----------

def main() -> int:
    # 支持自定义 root
    root_arg = None
    args = sys.argv[1:]
    if "--root" in args:
        i = args.index("--root")
        if i + 1 < len(args):
            root_arg = args[i + 1]

    print("=" * 50)
    print("career-wiki-skill 环境检查")
    print("=" * 50)

    failures: list[str] = []

    # 1. 依赖检查
    print("\n[1/3] 依赖检查")
    for name, fn in [
        ("Node.js", check_node),
        ("Python", check_python),
        ("npm", check_npm),
    ]:
        ok, msg = fn()
        print(f"  {name}: {msg}")
        if not ok and not msg.startswith("⚠️"):
            failures.append(name)

    # gray-matter 仅信息性
    ok_gm, msg_gm = check_gray_matter()
    print(f"  gray-matter: {msg_gm}")

    if failures:
        print(f"\n❌ 依赖检查失败: {', '.join(failures)}")
        print("   请先安装/升级上述依赖，再重新运行本脚本。")
        return 1

    # 2. 目录结构
    print("\n[2/3] 目录结构")
    root = Path(root_arg) if root_arg else Path.home() / ".career_wiki"
    try:
        root = root.resolve()
    except OSError:
        pass

    if not root.exists():
        print(f"  📁 首次使用，创建数据目录: {root}")
    else:
        print(f"  📁 数据目录已存在: {root}")

    created = ensure_dirs(root)
    if created:
        print(f"  ✅ 新建 {len(created)} 个子目录:")
        for c in created:
            print(f"     - {c}")
    else:
        print("  ✅ 所有子目录已存在，无需创建")

    # 3. config.json
    print("\n[3/3] 配置文件")
    cfg_written = write_config(root)
    if cfg_written:
        print(f"  ✅ 写入 {root / '.career-wiki-skill' / 'config.json'}")
    else:
        print(f"  ℹ️  config.json 已存在，跳过")

    # 总结
    print("\n" + "=" * 50)
    print("环境检查完成")
    print("=" * 50)
    print(f"数据目录: {root}")
    print(f"  -> 如果 gray-matter 未安装，请在仓库根目录运行: npm install")
    print(f"  -> 环境就绪，可以开始用采访 skill（F02）或文件解析 skill（F03）了")
    return 0


if __name__ == "__main__":
    sys.exit(main())
