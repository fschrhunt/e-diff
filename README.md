# diff

See what changed. A package for [e](https://github.com/intuitums/e).

```sh
e install git:github.com/intuitums/diff@v1
```

Then restart e or run `/reload`.

## What you get

**`/diff`** — the stat of every change in the working tree against HEAD,
plus untracked files. With arguments it prints the patch: anything
`git diff` accepts, so `/diff src/main.rs`, `/diff --staged`,
`/diff main...`, `/diff HEAD~3`.

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

**`/explain-diff [base]`** — a prompt template that has the model read the
diff and explain it the way a reviewer would: what changed, why it seems to
have changed, and the risks. Read-only.

## Requirements

`node` and `git` on `PATH`. The extension is one self-contained file that
speaks e's line protocol directly; there is nothing to build or install
beside it.

## Layout

```
extensions/diff.mjs        the extension
prompts/explain-diff.md    the /explain-diff template
```

This is the shape every e package has: any subset of `extensions/`,
`skills/`, `prompts/`, `themes/`, no manifest. See `e docs packages`.

## License

MIT
