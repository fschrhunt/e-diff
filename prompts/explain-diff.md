---
description: Explain the current changes the way a reviewer would
argument-hint: "[base ref]"
---
Read the working-tree changes with the `diff` tool (base: `${1:-HEAD}`), then
explain them. Do not edit anything.

For the change as a whole, then per file where it matters:

- What changed, in plain language — behaviour, not line-by-line.
- Why it was apparently changed, inferred from the code and any nearby
  comments or docs. Say when the intent is unclear.
- Risks: behaviour that could break, missing tests or docs, leftover debug
  code, and anything that looks unrelated to the rest of the change.

Keep it short. Lead with the most important point.
