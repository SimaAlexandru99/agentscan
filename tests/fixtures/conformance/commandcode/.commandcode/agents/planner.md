---
name: planner
description: Plans multi-step changes before anyone edits a file.
tools: "*"
disallowedTools: shell_command, write_file
model: claude-opus-4-8
reasoningEffort: high
maxTurns: 40
permissionMode: plan
background: true
showOutput: true
---

Plan the work, then hand it back.
