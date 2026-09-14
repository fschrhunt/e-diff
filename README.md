# e-diff

See what changed. A package for [e](https://github.com/intuitums/e).

```sh
e install npm:@fschrhunt1/e-diff                 # from npm
e install git:github.com/fschrhunt/e-diff@v2    # or straight from git
```

Then restart e or run `/reload`.

## What you get

**`/diff`** — a live review pane beside the conversation: every changed
and untracked file with its `+`/`-` counts, and the selected file's patch
below — line numbers, coloured markers, `⋯` between hunks, painted by e
through your theme. It refreshes after every tool the agent runs. `ctrl+t`
moves between the conversation and the pane; in the pane, `↑`/`↓` pick a
file, `Enter` moves to its patch, `Shift+↓` selects lines and `Enter`
attaches them to your draft, `Esc` steps back and then closes. `/diff`
again closes it. Which side it sits on and how wide it is are yours to set
in `~/.e/layout.json` (`e docs layout`).

**`/diff show`** — the whole review as one block in the transcript
instead. `/diff --stat` shows the per-file summary and untracked files.
Other arguments pass through to `git diff` as a block: `/diff
src/main.rs`, `/diff --staged`, `/diff main...`, `/diff HEAD~3`.

**A line after every turn** — when the agent's turn touched files, one
notice names them with their added and removed line counts:

```
● diff: 2 files +38 −4: src/core/cli.rs, tests/cli.rs
```

Nothing is printed for a turn that changed nothing. A commit made during the
turn is reported as `committed <sha> <subject>` instead. Turn it off in
`~/.e/settings.json`:

```json
{ "extensions": { "diff": { "turn_summary": false } } }
```

**A `diff` tool** — the model reads the patch itself instead of reciting
from memory: `base` (default `HEAD`), `paths`, `staged`, and `stat` for a
per-file summary. Output is capped at 100 KB with a note to narrow by path.
The transcript row reads `Diffing …` then `Diffed … +12 -3`, and ctrl+o
shows the diff painted like a built-in edit's.

**`/explain-diff [base]`** — a prompt template that has the model read the
diff and explain it the way a reviewer would: what changed, why it seems to
have changed, and the risks. Read-only.

## Requirements

`node` and `git` on `PATH`, and an e that speaks the `display` capability
(0.1 and later; older e paints the same output as plain notices). The
extension is one self-contained file that speaks e's line protocol
directly; there is nothing to build or install beside it.

## Layout

```
extensions/diff.mjs        the extension
prompts/explain-diff.md    the /explain-diff template
```

This is the shape every e package has: any subset of `extensions/`,
`skills/`, `prompts/`, `themes/`, no manifest. See `e docs packages`.

## License

MIT
