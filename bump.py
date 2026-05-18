#!/usr/bin/env python3
"""bump.py — single-command version bump.

The navlog "no build step" stack needs four pieces of metadata to stay in
sync on every deploy that touches app/main.jsx or app/components/*.jsx:

  1. APP_VERSION constant in app/main.jsx (rendered in the footer)
  2. &v=YYYYMMDD.HHMM cache-buster on the esm.sh import URL inside
     index.html — forces esm.sh to recompile the entry from raw.gh
  3. CACHE_NAME in sw.js (incremented integer, e.g. navlog-v30 → -v31)
  4. ?v=YYYYMMDD.HHMM appended to every RELATIVE import inside any
     .jsx under app/. esm.sh caches each unique URL separately at the
     edge; without the buster on the relative imports, parent gets
     refreshed but children stay stale and the app crashes with
     "X is not defined" inside a render.

Usage:

  python3 bump.py              # uses YYYYMMDD.HHMM in UTC right now
  python3 bump.py 20260517.1620
  python3 bump.py --check      # verify all v-tags match APP_VERSION,
                               # exit 1 with diagnostics if anything
                               # is out of sync. Does not modify files.
"""

import datetime
import pathlib
import re
import sys


# Matches `from "./foo.jsx"` and `from "../bar/foo.jsx"` — both are relative
# imports between modules served via esm.sh. Each unique URL is a separate
# edge cache key, so the buster has to land on all of them.
REL_IMPORT_RE = re.compile(r'(from\s+["\'])(\.\.?/[^"\'?]+?\.jsx)(\?v=[^"\']*)?(["\'])')

# Any `?v=X` or `&v=X` cache-buster (in .jsx imports, index.html and sw.js).
V_TAG_RE = re.compile(r'[?&]v=([\d.]+)')

# Files that may carry v-tags. Used by both bump and verify so they stay in sync.
def candidate_files(repo: pathlib.Path):
    files = list((repo / "app").rglob("*.jsx"))
    files.append(repo / "index.html")
    files.append(repo / "sw.js")
    return files


def bump_files(version: str) -> None:
    repo = pathlib.Path(__file__).resolve().parent

    # 1. APP_VERSION in app/main.jsx
    main = repo / "app" / "main.jsx"
    text = main.read_text()
    text = re.sub(
        r'const APP_VERSION = "[\d.]+";',
        f'const APP_VERSION = "{version}";',
        text, count=1,
    )

    # 4. Relative imports inside app/main.jsx
    text = REL_IMPORT_RE.sub(rf'\g<1>\g<2>?v={version}\g<4>', text)
    main.write_text(text)

    # 4. Relative imports inside every .jsx under app/ (components, hooks,
    # context — all share the same esm.sh edge cache treatment).
    app_dir = repo / "app"
    for jsx in sorted(app_dir.rglob("*.jsx")):
        if jsx == main:
            continue  # handled above
        t = jsx.read_text()
        t2 = REL_IMPORT_RE.sub(rf'\g<1>\g<2>?v={version}\g<4>', t)
        if t2 != t:
            jsx.write_text(t2)

    # 2. &v= in index.html
    index = repo / "index.html"
    t = index.read_text()
    t = re.sub(r'&v=[\d.]+', f'&v={version}', t)
    index.write_text(t)

    # 3. CACHE_NAME + &v= in sw.js
    sw = repo / "sw.js"
    t = sw.read_text()
    # bump CACHE_NAME integer
    def inc_cache(m):
        return f'const CACHE_NAME = "navlog-v{int(m.group(1)) + 1}";'
    t = re.sub(r'const CACHE_NAME = "navlog-v(\d+)";', inc_cache, t)
    t = re.sub(r'&v=[\d.]+', f'&v={version}', t)
    sw.write_text(t)

    print(f"bumped to {version}")
    print(f"  APP_VERSION + main.jsx imports")
    print(f"  index.html &v=")
    print(f"  sw.js CACHE_NAME + &v=")


def read_app_version(repo: pathlib.Path) -> str | None:
    main = repo / "app" / "main.jsx"
    m = re.search(r'const APP_VERSION = "([\d.]+)"', main.read_text())
    return m.group(1) if m else None


def verify(repo: pathlib.Path, expected: str | None = None) -> list[str]:
    """Returns a list of issues (empty = all in sync).

    If `expected` is None, uses APP_VERSION from main.jsx as the source of
    truth — this is the typical CI usage ("does the current tree have a
    consistent version everywhere?").
    """
    issues: list[str] = []
    app_version = read_app_version(repo)
    if app_version is None:
        issues.append("app/main.jsx: APP_VERSION constant not found")
        return issues
    if expected is not None and app_version != expected:
        issues.append(f"app/main.jsx: APP_VERSION = {app_version} (expected {expected})")
    target = expected or app_version

    for f in candidate_files(repo):
        if not f.exists():
            continue
        rel = f.relative_to(repo)
        for line_no, line in enumerate(f.read_text().splitlines(), 1):
            for m in V_TAG_RE.finditer(line):
                if m.group(1) != target:
                    issues.append(
                        f"{rel}:{line_no}: v={m.group(1)} (expected {target})"
                    )
    return issues


if __name__ == "__main__":
    args = sys.argv[1:]
    repo = pathlib.Path(__file__).resolve().parent

    if "--check" in args:
        issues = verify(repo)
        if issues:
            print(f"bump.py --check: found {len(issues)} mismatched v-tags:", file=sys.stderr)
            for i in issues:
                print(f"  ✗ {i}", file=sys.stderr)
            sys.exit(1)
        version = read_app_version(repo)
        print(f"✓ all v-tags match APP_VERSION = {version}")
        sys.exit(0)

    if args:
        version = args[0]
    else:
        version = datetime.datetime.utcnow().strftime("%Y%m%d.%H%M")
    bump_files(version)

    # Auto-verify: catch the case where a future regex change skips some
    # file silently. Better to fail loudly than to deploy a stale
    # mid-tree that black-screens on mobile.
    issues = verify(repo, expected=version)
    if issues:
        print(f"bump.py: post-bump verify found {len(issues)} mismatches:", file=sys.stderr)
        for i in issues:
            print(f"  ✗ {i}", file=sys.stderr)
        sys.exit(1)
    print(f"  ✓ verify: all v-tags = {version}")
