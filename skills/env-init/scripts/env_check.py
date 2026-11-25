#!/usr/bin/env python3
"""Initialize Career Wiki and remember its workspace."""

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    if sys.version_info < (3, 9):
        sys.exit("Python >= 3.9 is required")
    try:
        sys.exit(subprocess.call([
            "node", str(Path(__file__).with_name("launch.mjs")), "--init", *sys.argv[1:],
        ]))
    except FileNotFoundError:
        sys.exit("Node.js is required; install Node 22.20+ or 24.12+ (LTS).")
