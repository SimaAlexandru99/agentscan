#!/usr/bin/env bash
set +e
ROOT="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$ROOT" ]; then
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
fi
[ -n "$ROOT" ] && cd "$ROOT" || exit 0
files=$(git diff --name-only HEAD 2>/dev/null)
if ! printf '%s\n' "$files" | grep -Eq '\.(ts|tsx|mts|cts|js|jsx)$|^package\.json$|^tsconfig|^prisma/schema'; then
  exit 0
fi
if ! command -v bun >/dev/null 2>&1; then
  exit 0
fi
out=$(bun run typecheck 2>&1)
status=$?
if [ "$status" -eq 0 ]; then
  exit 0
fi
excerpt=$(printf '%s\n' "$out" | tail -40)
reason="typecheck failed. Fix these errors and continue:
${excerpt}"
printf '%s\n' "$reason" >&2
if command -v python3 >/dev/null 2>&1; then
  python3 -c 'import json,sys; print(json.dumps({"decision":"block","reason":sys.stdin.read()}))' <<<"$reason"
else
  printf '%s\n' '{"decision":"block","reason":"typecheck failed. Run bun run typecheck, fix, and continue."}'
fi
exit 0
