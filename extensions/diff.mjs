#!/usr/bin/env node
/**
 * diff — see what changed, for you and for the model.
 *
 *   /diff              every change in the working tree vs HEAD, as a real
 *                      diff block: line numbers, coloured markers, ⋯ between
 *                      hunks — plus untracked files
 *   /diff --stat       the per-file summary instead
 *   /diff <args…>      anything `git diff` accepts — a path, --staged,
 *                      main..., HEAD~3
 *   turn end           one line per turn naming the files the agent touched
 *                      and their +/- counts (silent when nothing changed)
 *   diff tool          the model reads the patch or the stat itself; the row
 *                      says `Diffing src/x.rs`, and ctrl+o shows the diff
 *                      painted like an edit's
 *
 * Self-contained: speaks e's line protocol directly, needs only node and
 * git. Everything it shows is data; e paints it through the theme.
 * Config in ~/.e/settings.json, under the extension's own name:
 *
 *   {"extensions":{"diff":{"turn_summary":false}}}   no per-turn line
 */

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const MAX_TOOL_BYTES = 100 * 1024;
/** e's own cap on a show block; past it the review is clipped here so the
 *  title can say so. */
const MAX_SHOW_BYTES = 64 * 1024;
/** An untracked file larger than this is listed, not shown. */
const MAX_NEW_FILE_BYTES = 2 * 1024 * 1024;

let turnSummary = true;
/** What the tree looked like after the last turn (or at launch). */
let baseline = null;

// ---------------------------------------------------------------- git

/** Run git in e's cwd. `ok` is false on any failure; `out` is trimmed. */
function git(args) {
  const run = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.error) return { ok: false, out: `git is not available: ${run.error.message}` };
  const out = (run.status === 0 ? run.stdout : run.stderr || run.stdout).trim();
  return { ok: run.status === 0, out };
}

function inRepo() {
  return git(["rev-parse", "--is-inside-work-tree"]).ok;
}

/** Refuse anything that would make git read or write a file of its choice. */
function safeArgs(args) {
  return args.filter((a) => !/^--(output|ext-diff|textconv|no-index)/.test(a));
}

/** Tracked changes vs HEAD as {path: [added, deleted]}, plus untracked paths. */
function snapshot() {
  const head = git(["rev-parse", "--short", "HEAD"]).out;
  const files = new Map();
  const numstat = git(["diff", "--numstat", "HEAD"]);
  if (numstat.ok) {
    for (const line of numstat.out.split("\n").filter(Boolean)) {
      const [added, deleted, ...rest] = line.split("\t");
      // Binary files report "-"; count them as touched, not as lines.
      files.set(rest.join("\t"), [Number(added) || 0, Number(deleted) || 0]);
    }
  }
  for (const path of untracked()) files.set(path, ["new", 0]);
  return { head, files };
}

function untracked() {
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  return status.ok
    ? status.out.split("\n").filter((l) => l.startsWith("?? ")).map((l) => l.slice(3))
    : [];
}

/** `git diff --stat` rows plus an untracked line, or a clean note. */
function stat(args) {
  const run = git(["diff", "--stat=100", ...args]);
  const lines = run.ok && run.out ? run.out.split("\n") : [];
  const extra = untracked();
  if (extra.length) lines.push(`untracked: ${extra.join(", ")}`);
  return lines.length ? lines.join("\n") : "clean working tree";
}

/** `+N -M` for a patch, the summary a tool row wears. */
function counts(patch) {
  let added = 0;
  let deleted = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) deleted += 1;
  }
  return `+${added} -${deleted}`;
}

/** The change since the last snapshot as one summary line, or null. */
function turnLine(before, after) {
  if (!before) return null;
  if (before.head !== after.head) {
    const subject = git(["log", "-1", "--format=%s"]).out;
    return `committed ${after.head} ${subject}`.trim();
  }
  const touched = [];
  let added = 0;
  let deleted = 0;
  const paths = new Set([...before.files.keys(), ...after.files.keys()]);
  for (const path of [...paths].sort()) {
    const was = before.files.get(path);
    const now = after.files.get(path);
    if (was && now && was[0] === now[0] && was[1] === now[1]) continue;
    if (!now) {
      touched.push(`${path} (reverted)`);
      continue;
    }
    if (now[0] === "new") {
      touched.push(`${path} (new)`);
      continue;
    }
    const dAdd = now[0] - (was && was[0] !== "new" ? was[0] : 0);
    const dDel = now[1] - (was ? was[1] : 0);
    added += Math.max(dAdd, 0);
    deleted += Math.max(dDel, 0);
    touched.push(path);
  }
  if (!touched.length) return null;
  const count = touched.length === 1 ? "1 file" : `${touched.length} files`;
  return `${count} +${added} −${deleted}: ${touched.join(", ")}`;
}

// ---------------------------------------------------------------- protocol

const manifest = {
  name: "diff",
  version: "2.0",
  description: "what changed: /diff, a per-turn summary, and a diff tool",
  commands: [
    {
      name: "diff",
      description: "show changes: /diff (patch) · /diff --stat · /diff <path | --staged | ref…>",
    },
  ],
  tools: [
    {
      name: "diff",
      description:
        "Unified diff of the working tree against HEAD (or another base). Call it before " +
        "summarizing, reviewing, or explaining what has changed rather than guessing from memory.",
      parameters: {
        type: "object",
        properties: {
          base: {
            type: "string",
            description: "Ref or range to diff against, e.g. HEAD~3 or main...; default HEAD",
          },
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Limit the diff to these paths",
          },
          staged: { type: "boolean", description: "Only the index (git diff --cached)" },
          stat: { type: "boolean", description: "Summary per file instead of the patch" },
        },
      },
      // The transcript row: `Diffing src/x.rs` while it runs, `Diffed …`
      // after, filed under "diff" in the batch tally. `target` names the
      // argument the row shows; `base` reads better than a paths array.
      label: { category: "diff", running: "Diffing", completed: "Diffed", target: "base" },
    },
  ],
  events: ["turn_end"],
};

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function notify(message) {
  write({ method: "notify", params: { message } });
}

function onCommand(args) {
  if (!inRepo()) return { notice: "diff: not a git repository" };
  const words = safeArgs((args || "").trim().split(/\s+/).filter(Boolean));
  const wantsStat = words.includes("--stat");
  const rest = words.filter((w) => w !== "--stat");
  if (wantsStat) {
    return { show: { title: `diff --stat ${rest.join(" ")}`.trim(), body: stat(rest), format: "text" } };
  }
  const argv = rest.length ? rest : ["HEAD"];
  const run = git(["diff", "--no-color", ...argv]);
  if (!run.ok) return { notice: `diff: ${run.out || "git diff failed"}` };
  // The plain review is the whole working tree against HEAD: staged and
  // unstaged changes, then every non-ignored untracked file as an addition.
  let body = run.out;
  if (!rest.length) {
    for (const path of untracked()) {
      const patch = newFilePatch(path);
      if (patch) body += (body ? "\n" : "") + patch;
    }
  }
  if (!body) {
    return { show: { title: "no changes", body: "clean working tree", format: "text" } };
  }
  // The title carries the file count and line totals; a review past e's
  // show limit is clipped on a patch boundary and says so.
  const files = (body.match(/^diff --git /gm) || []).length;
  let title = `${files} file${files === 1 ? "" : "s"} changed ${counts(body)}`;
  if (rest.length) title += ` (${rest.join(" ")})`;
  if (body.length > MAX_SHOW_BYTES) {
    const cut = body.lastIndexOf("\ndiff --git ", MAX_SHOW_BYTES);
    body = body.slice(0, cut > 0 ? cut : MAX_SHOW_BYTES);
    title += " — clipped; /diff <path> reviews one file";
  }
  // A real diff block: e converts the unified diff to its row grammar and
  // paints the markers; nothing here is a colour.
  return { show: { title, body, format: "diff" } };
}

/** An untracked file as a unified patch against nothing. Binary files
 *  become git's one-line note; a file too large to review is skipped. */
function newFilePatch(path) {
  const run = spawnSync("git", ["diff", "--no-color", "--no-index", "--", "/dev/null", path], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  // --no-index exits 1 when the files differ, which is the whole point.
  if (run.error || (run.status !== 0 && run.status !== 1)) return null;
  const out = (run.stdout || "").trimEnd();
  if (!out || out.length > MAX_NEW_FILE_BYTES) return null;
  return out;
}

function onTool(args) {
  if (!inRepo()) return { content: "not a git repository", is_error: true };
  const argv = ["diff", "--no-color"];
  if (args.stat) argv.push("--stat=120");
  if (args.staged) argv.push("--cached");
  if (typeof args.base === "string" && args.base && !args.base.startsWith("-")) {
    argv.push(args.base);
  } else if (!args.staged) {
    argv.push("HEAD");
  }
  const paths = Array.isArray(args.paths) ? args.paths.filter((p) => typeof p === "string") : [];
  if (paths.length) argv.push("--", ...paths);
  const run = git(argv);
  if (!run.ok) return { content: run.out || "git diff failed", is_error: true };
  if (!run.out) return { content: "no changes", summary: "no changes" };
  let content = run.out;
  if (Buffer.byteLength(content) > MAX_TOOL_BYTES) {
    content = content.slice(0, MAX_TOOL_BYTES) + "\n… truncated; pass paths to narrow the diff";
  }
  if (args.stat) return { content, summary: `${run.out.split("\n").length} files` };
  // The model reads the unified diff; the viewer shows the same diff in
  // e's row grammar with line numbers and markers — `display` is what
  // ctrl+o paints, `format` how.
  return { content, summary: counts(run.out), display: run.out, format: "diff" };
}

function onTurnEnd() {
  if (!turnSummary || !inRepo()) return;
  const after = snapshot();
  const line = turnLine(baseline, after);
  baseline = after;
  if (line) notify(`diff: ${line}`);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const { id, method, params = {} } = msg;
  try {
    switch (method) {
      case "initialize": {
        const config = (params.extensions_config && params.extensions_config.diff) || {};
        turnSummary = config.turn_summary !== false;
        baseline = inRepo() ? snapshot() : null;
        write({ id, result: manifest });
        break;
      }
      case "command":
        write({ id, result: onCommand(params.args) });
        break;
      case "tool_call":
        write({ id, result: onTool(params.arguments || {}) });
        break;
      case "event":
        if (params.name === "turn_end") onTurnEnd();
        break;
      case "shutdown":
        process.exit(0);
        break;
      default:
        if (id !== undefined) write({ id, result: {} });
    }
  } catch (error) {
    if (id !== undefined) write({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
rl.on("close", () => process.exit(0));
