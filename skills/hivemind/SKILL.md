---
name: hivemind
description: >-
  Fuse Claude and Codex into one hive mind for higher-accuracy, safer changes. Auto-use
  for MOST non-trivial work: any research/design question worth a second independent
  investigation, and any code change beyond a trivial one-liner (features, refactors, bug
  fixes, API/data/schema work, anything security- or money-sensitive). Division of labor by
  strength — Codex authors backend / backend-facing code (APIs, services, business logic,
  data models, migration files), Claude authors frontend / frontend-facing code (UI,
  components, hooks, client state, styling) — and each adversarially reviews the other's
  work, then Claude synthesizes. Runs on your Claude + Codex subscriptions, no API keys.
  Skip only for trivial edits, pure formatting, or simple factual Q&A. Also runs via /hivemind.
---

# Hive Mind — Claude + Codex fusion

Two independent models beat either one alone when you (1) let them work independently
(diversity), (2) have them adversarially review each other, and (3) synthesize the result.
Most of the gain is in the **synthesis**; the rest is the **diversity**. This skill applies
that to a two-model panel — Claude and Codex — using each model where it is strongest.

Codex runs on your existing `codex login` subscription via a helper script. No API key.

## When to engage (and when not to)

**Engage for most non-trivial work:**
- A research / design / debugging question where a second independent take adds confidence.
- Any code change beyond a trivial one-liner — especially backend, data, auth, money, or
  anything in a delicate / high-blast-radius part of the system.

**Skip (just do it solo):** typo/format-only edits, trivial one-liners, simple factual
answers, or anything where a second model is obviously pointless. Don't add latency for nothing.

If unsure, lean toward engaging — that is the point of this skill.

## Roles (by strength)

| Work | Author | Adversarial reviewer |
|------|--------|----------------------|
| Backend / backend-facing (APIs, services, business logic, data models, migration files, jobs, auth) | **Codex** (`implement`) | **Claude** |
| Frontend / frontend-facing (UI, components, hooks, client state, styling, a11y) | **Claude** | **Codex** (`review`) |
| Research / design / debugging (no code) | both independently (`research` + Claude) | each critiques the other |

Claude is always the **orchestrator + synthesizer** (the highest-leverage role).

## The helper

All Codex calls go through one script. Resolve its path once per Bash call (works whether
installed as a plugin or a standalone skill), and pass the payload over a heredoc on stdin:

```bash
HM="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/skills/hivemind/scripts/hivemind.mjs}"; [ -f "$HM" ] || HM="$HOME/.claude/skills/hivemind/scripts/hivemind.mjs"
node "$HM" <research|review|implement> --effort high --cd "$PWD" <<'PROMPT'
<payload>
PROMPT
```

Each run prints a status line then the result:
- `===HIVEMIND mode=... status=ok ...===` followed by Codex's message — use it.
- `===HIVEMIND ... status=error reason=...===` — Codex was unavailable (not installed /
  timed out / empty). **Degrade gracefully: proceed solo and tell the user the hive mind
  fell back to Claude-only and why.** Never block on Codex.

`--effort` accepts `low|medium|high|xhigh` (default `high`; use `xhigh` for the gnarliest
backend work). Add `--save <file>` for large outputs and read the file selectively instead
of pulling it all into context.

## Protocol

### A. Code task
1. **Decompose** the task into backend-facing and frontend-facing parts.
2. **Author in parallel, by strength:**
   - Backend → launch `implement` **in the background** (`Bash` with `run_in_background: true`):
     ```bash
     node "$HM" implement --effort high --cd "$PWD" <<'PROMPT'
     <the backend portion, with concrete context: files, contracts, constraints>
     PROMPT
     ```
   - Frontend → Claude writes it directly **while Codex works** (true parallel panel).
   - Pure-backend task → still launch Codex `implement`; Claude prepares the review meanwhile.
   - Pure-frontend task → Claude authors; skip `implement`.
3. **Cross-review (the adversarial step):**
   - Claude reviews Codex's backend output: read the changed files / `git diff`, attack it
     as hard as the `review` prompt attacks Claude's work — invariants, error paths, auth,
     data safety, idempotency, races, edge cases.
   - Codex reviews Claude's frontend:
     ```bash
     node "$HM" review --effort high --cd "$PWD" <<'PROMPT'
     TASK: <task>

     CLAUDE'S WORK TO REVIEW:
     <the frontend diff / files / key snippets>
     PROMPT
     ```
4. **Synthesize:** reconcile both reviews. Apply the fixes you agree with; where the two
   reviews contradict, decide on the merits and say why. For backend fixes, either apply
   them yourself or hand them back to Codex via another `implement` call. Resolve everything
   before declaring done.
5. **Verify:** run the project's tests / type-check / build for the touched areas.

For an especially hard or ambiguous task, prepend a **research panel** (step from B.1–B.2)
before authoring, so both minds align on the approach first.

### B. Research / design / debugging (no code)
1. Launch Codex `research` **in the background** on the same question.
2. Do your own independent investigation **concurrently** — do not wait.
3. Read Codex's result. **Adversarially reconcile**, don't just merge: extract consensus,
   contradictions, partial coverage, and each side's unique insights. Where you disagree
   with Codex, verify against the code/sources and resolve it.
4. For high-stakes answers, optionally send your draft through `review` for a final attack.
5. **Synthesize** the final grounded answer. Note where Codex changed your conclusion — that
   transparency is the value.

## Safety gates (non-negotiable)

- **Database / data changes stay human-gated.** Codex `implement` is hard-instructed to author
  migration *files* only and never execute migrations, schema changes, drops, truncations, or
  destructive data ops — but you are the backstop. Before ANY DB/data change runs: read the live
  schema, present the exact SQL + a plain-English summary (what changes, blast radius, locking,
  rollback), and get explicit user approval. Prefer a dry-run / row-count preview.
- Codex backend writes run in a `workspace-write` sandbox (no network, workspace-scoped). It
  cannot deploy, hit production, or act outside the repo.
- Treat Codex output as a strong proposal, not ground truth. The cross-review exists precisely
  so nothing ships on one model's say-so. You own the final result.

## Context hygiene

Keep this lightweight: fold the *signal* from Codex into your synthesis — don't paste Codex's
full output back to the user verbatim. Summarize what each mind contributed and what the
synthesis decided. Use `--save` + selective reads for anything large.
