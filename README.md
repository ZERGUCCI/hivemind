# 🧠 Hive Mind — Claude Code × Codex fusion

Turn Claude Code into a **synthesis of Claude and Codex**. On non-trivial work, the two models
research independently, **adversarially review each other**, and Claude synthesizes the result —
so you get an answer that's smarter and safer than either model alone.

It's a single lightweight **skill** you add **per project** — scoped to just the project you want it
in, so **other projects on your machine are completely unaffected**. It lives in that project's
`.claude/` but is added to `.git/info/exclude`, so it is **never committed and never changes the
project's git** — it's a tool *for* Claude Code, not part of your codebase. It adds only one line to
Claude's context until it actually fires (no context rot), **natively detects your existing
`codex login`** and spends those credits on its own, and runs entirely on your **Claude Max** and
**Codex/ChatGPT** subscriptions. **No API keys for either side.**

## Why this works

Inspired by [OpenRouter's Fusion](https://openrouter.ai/blog/announcements/fusion-beats-frontier/):
fan a task out to a panel of models, have a judge extract structure (consensus, contradictions,
unique insights), then have a synthesizer write the grounded answer. OpenRouter measured that
**~3/4 of the lift comes from synthesis and ~1/4 from diversity** — a fused panel beat strong solo
frontier models. This applies that idea to a **two-mind panel — Claude + Codex** — and adds a twist:
each model also **authors the part it's strongest at**.

## Division of labor (by strength)

| Work | Author | Adversarial reviewer |
|------|--------|----------------------|
| **Backend / backend-facing** — APIs, services, business logic, data models, migration files, jobs, auth | **Codex** | **Claude** |
| **Frontend / frontend-facing** — UI, components, hooks, client state, styling, a11y | **Claude** | **Codex** |
| **Research / design / debugging** (no code) | both, independently | each critiques the other |

Claude is always the **orchestrator + synthesizer**.

## The loop

```
                        ┌─────────── independent panel ───────────┐
   task ──▶ classify ──▶│  Codex authors backend (workspace-write) │──▶ adversarial ──▶ Claude
                        │  Claude authors frontend                 │    cross-review     synthesizes
                        │  (both research independently first)     │    (each attacks    + verifies
                        └──────────────────────────────────────────┘     the other's)
```

For a research question, both investigate in parallel, then Claude reconciles consensus /
contradictions / unique insights into one cited answer.

## When it engages

Auto-fires for **most non-trivial work** — research questions worth a second opinion, and any code
change beyond a trivial one-liner (features, refactors, bug fixes, API/data/schema, anything
security- or money-sensitive). It **skips** trivial edits, formatting, and simple Q&A so you don't
pay latency for nothing. Force it anytime with **`/hivemind <task>`**.

## Safety (built for delicate repos)

- **Database changes stay human-gated.** Codex is hard-instructed to author migration *files* only —
  never to execute migrations, schema changes, drops, truncations, or destructive data ops. Claude
  presents the exact SQL + blast-radius/rollback summary for your approval before anything runs.
- Codex backend writes run in a **`workspace-write` sandbox**: no network, scoped to the repo. It
  cannot deploy or touch production.
- Nothing ships on one model's say-so — the cross-review is the point.
- If Codex is unavailable, it **degrades to Claude-only** and tells you.

## Staying engaged on long sessions

A skill is *pull*, not push: its one-line description sits in context and Claude decides when to
reach for it. Over a long session that fills with task-specific work, that description loses salience
and Claude can drift back to solo work. To counter this, `hivemind add` writes a small **marked note
into the project's `CLAUDE.md`** — which Claude Code reloads every session into its stable
instruction region — telling Claude to keep routing non-trivial work through the hive mind:

```
<!-- hivemind:start -->
## Hive mind (Claude + Codex) — use it, and keep using it
For any non-trivial work in this project, route through the hivemind skill … keep using it across
long sessions — do not drift back to solo work as the task drags on. …
<!-- hivemind:end -->
```

This note **is committed** (it also helps teammates discover the tool); pass `--no-note` to skip it.
It's idempotent (re-running `add`/`update` never duplicates it) and `hivemind remove` strips it. The
*skill files* themselves remain git-excluded as before — only this small note touches tracked git.

## Progress & liveness (no false "it's hung")

A real Codex pass often takes **5–10 minutes** — that's normal, not a hang. Every Codex call writes
a live **heartbeat file** (`--progress <file>`) with cumulative token usage, event count, stdout
bytes, and a 5-second tick. Claude polls it to confirm Codex is alive (counters climbing) instead of
killing a slow-but-working run. If Codex genuinely stalls, the helper self-terminates at its
`--timeout` and reports cleanly so Claude can fall back to solo. This fixes the failure mode where a
long Codex run gets mistaken for a hang and killed prematurely.

## Requirements

- [Claude Code](https://claude.com/claude-code) on your Claude subscription.
- [Codex CLI](https://developers.openai.com/codex/cli) installed and logged in: `codex login`
  (use your **ChatGPT/Codex subscription**, not an API key).
- Node.js (ships with Codex CLI's toolchain; `node` must be on `PATH`).

## Install

Hivemind is a **tool for Claude Code, not part of your codebase**. You add it **per project**: it's
scoped to just that project (other projects on your machine are untouched), it lives in the project's
`.claude/` but is added to `.git/info/exclude` so it is **never committed and never shows up in
`git status`**, and it **auto-detects your `codex login`** — nothing to configure.

(This is about the *tool's* footprint. When you ask it to do work, Codex still authors real code into
your project — that's the intended work product, and it goes through your normal git review like any
other change.)

### One-time setup (per machine)

```bash
git clone https://github.com/ZERGUCCI/hivemind ~/Dev/hivemind
ln -s ~/Dev/hivemind/hivemind /usr/local/bin/hivemind   # put the CLI on your PATH
# (or add an alias: alias hivemind='~/Dev/hivemind/hivemind')
```

### Add it to a project

```bash
cd /path/to/your/project
hivemind add          # installs into ./.claude, git-excluded, THIS project only
```

Restart Claude Code in that project. It now auto-fires on non-trivial work there — and **only**
there — or run it on demand with `/hivemind`.

### Update everywhere

```bash
hivemind update       # git-pull the repo, then re-sync every project you've added it to
```

`hivemind add` records each project, so `update` pulls the latest and refreshes them all at once
(`hivemind update --here` does just the current project). Other handy commands:

```bash
hivemind status       # versions + where it's installed
hivemind remove       # uninstall from the current project
hivemind add --link   # symlink instead of copy → a plain `git pull` auto-updates it
```

### Want it in every project instead?

```bash
hivemind add --global   # installs into ~/.claude for ALL projects
```

Or use the plugin system: `/plugin marketplace add ZERGUCCI/hivemind` then
`/plugin install hivemind@hivemind`. Both make it global; the per-project install above is the
isolated default.

## Tuning

- **Effort:** the helper defaults to `--effort high`. Bump to `xhigh` for the gnarliest backend
  work, drop to `low/medium` to go faster.
- **Model:** Codex uses your `~/.codex/config.toml` default. Override per call with `--model`.
- **Aggressiveness:** edit the `description` in `skills/hivemind/SKILL.md` to make it fire more or
  less often.

## How it's built

```
hivemind/
├── .claude-plugin/
│   ├── plugin.json            # plugin manifest
│   └── marketplace.json       # lets a team add this repo as a marketplace
├── skills/hivemind/
│   ├── SKILL.md               # the orchestration protocol + auto-trigger
│   └── scripts/hivemind.mjs   # the Codex engine: one `codex exec` pass, clean output
├── commands/hivemind.md       # explicit /hivemind
└── install.sh                 # standalone user-level install (no plugin system)
```

`hivemind.mjs` runs exactly one `codex exec` pass per call (`research` / `review` / `implement`),
captures only the final message, and prints a parseable status line so Claude can synthesize the
signal or fall back cleanly. Run `node skills/hivemind/scripts/hivemind.mjs --help` for the CLI.

## License

MIT — see [LICENSE](LICENSE).
