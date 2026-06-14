# 🧠 Hive Mind — Claude Code × Codex fusion

Turn Claude Code into a **synthesis of Claude and Codex**. On non-trivial work, the two models
research independently, **adversarially review each other**, and Claude synthesizes the result —
so you get an answer that's smarter and safer than either model alone.

It's a single lightweight **skill** (packaged as a Claude Code **plugin** for easy team sharing).
It adds only one line to Claude's context until it actually fires — no context rot, no always-on
machinery — and it runs entirely on your **Claude Max** and **Codex/ChatGPT** subscriptions.
**No API keys for either side.**

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

## Requirements

- [Claude Code](https://claude.com/claude-code) on your Claude subscription.
- [Codex CLI](https://developers.openai.com/codex/cli) installed and logged in: `codex login`
  (use your **ChatGPT/Codex subscription**, not an API key).
- Node.js (ships with Codex CLI's toolchain; `node` must be on `PATH`).

## Install

### Option A — as a plugin (recommended for teams)

```
# in Claude Code
/plugin marketplace add <your-org>/hivemind      # this repo (or a local path)
/plugin install hivemind@hivemind
```

Teammates run the same two lines and they're in — versioned, no per-machine setup.

### Option B — as a standalone skill

```bash
git clone <your-org>/hivemind && cd hivemind
./install.sh                 # global: ~/.claude (all projects)
./install.sh --project .     # or copy into one repo's .claude/ (commit it for the team)
```

Then restart Claude Code. Verify with `/hivemind` or just ask for something non-trivial.

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
└── install.sh                 # standalone (non-plugin) install
```

`hivemind.mjs` runs exactly one `codex exec` pass per call (`research` / `review` / `implement`),
captures only the final message, and prints a parseable status line so Claude can synthesize the
signal or fall back cleanly. Run `node skills/hivemind/scripts/hivemind.mjs --help` for the CLI.

## License

MIT — see [LICENSE](LICENSE).
