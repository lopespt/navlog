#!/usr/bin/env python3
"""bump.py — single-command version bump.

The navlog "no build step" stack needs four pieces of metadata to stay in
sync on every deploy that touches app/main.jsx or app/components/*.jsx:

  1. APP_VERSION constant in app/main.jsx (rendered in the footer)
  2. &v=YYYYMMDD.HHMM cache-buster on the esm.sh import URL inside
     index.html — forces esm.sh to recompile the entry from raw.gh
  3. CACHE_NAME in sw.js (incremented integer, e.g. navlog-v30 → -v31)
  4. ?v=YYYYMMDD.HHMM appended to every RELATIVE import inside app/main.jsx
     and inside any app/components/*.jsx that imports a sibling. esm.sh
     caches each unique URL separately at the edge; without the buster on
     the relative imports, parent gets refreshed but children stay stale
     and the app crashes with "X is not defined" inside a render.

Run with no args to use the current UTC timestamp. Pass an explicit version
to override (handy for re-running a bump without the clock moving).

  python3 bump.py              # uses YYYYMMDD.HHMM in UTC right now
  python3 bump.py 20260517.1620
"""

import datetime
import pathlib
import re
import sys


# Matches `from "./foo.jsx"` and `from "../bar/foo.jsx"` — both are relative
# imports between modules served via esm.sh. Each unique URL is a separate
# edge cache key, so the buster has to land on all of them.
REL_IMPORT_RE = re.compile(r'(from\s+["\'])(\.\.?/[^"\'?]+?\.jsx)(\?v=[^"\']*)?(["\'])')


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


if __name__ == "__main__":
    if len(sys.argv) > 1:
        version = sys.argv[1]
    else:
        version = datetime.datetime.utcnow().strftime("%Y%m%d.%H%M")
    bump_files(version)
