#!/usr/bin/env node
// hivemind.mjs — the Codex side of the Claude + Codex hive mind.
//
// Runs exactly ONE Codex `exec` pass on your Codex/ChatGPT subscription (no API key)
// and returns a single clean message. Claude orchestrates; this script is the muscle
// for whichever role Codex is playing on a given task.
//
// Modes:
//   research   read-only   Codex independently investigates and proposes an approach.
//   review     read-only   Codex adversarially reviews work Claude produced.
//   implement  write       Codex authors backend / backend-facing code in the workspace.
//
// LIVE HEARTBEAT (so Claude never assumes a long run is "hung"):
//   While Codex runs, a JSON progress file is updated continuously with cumulative
//   token usage, event count, stdout bytes, and a 5s wall-clock tick. Poll it to
//   confirm Codex is ALIVE and working (counters climbing) before deciding to wait or
//   give up. Path is printed on the first line as `progress=<file>` and can be set with
//   --progress <file>. A real Codex research/review pass often takes 5-10 minutes; that
//   is normal — judge liveness by the heartbeat, not by elapsed time.
//
// Payload (the task / question / work-under-review) is read from stdin, e.g.:
//   node hivemind.mjs research --effort high --progress /tmp/hm-research.json <<'EOF'
//   <task>
//   EOF
//
// Output protocol (so Claude can parse the result and degrade gracefully):
//   ===HIVEMIND mode=<m> status=starting progress=<file>===        (first line)
//   ===HIVEMIND mode=<m> status=ok tokens=<n> events=<n> ...===\n<clean message>
//   ===HIVEMIND mode=<m> status=error reason=<why>===\n<diagnostic>
// The script always exits 0 on a handled error so the skill can proceed solo.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODES = {
  research:  { sandbox: 'read-only',       timeout: 600 },
  review:    { sandbox: 'read-only',       timeout: 600 },
  implement: { sandbox: 'workspace-write', timeout: 1200 },
};

const FRAMING = {
  research: (p) => `You are an elite engineer acting as ONE independent member of a two-model panel
(the other member is Claude). You are researching this task on your own; your analysis
will be cross-checked against Claude's and synthesized into one answer. Read the relevant
files in this repository before concluding — be specific to THIS codebase, not generic.

Deliver, concisely and high-signal (no filler):
1. Your recommended approach, concrete and grounded in the actual code.
2. The key decisions and the tradeoffs behind each.
3. Risks, edge cases, and failure modes you would guard against.
4. Anything you are uncertain about or would verify before shipping.

TASK:
${p}`,

  review: (p) => `You are Codex performing an ADVERSARIAL review as one member of a two-model panel.
Claude produced the work below. Your job is to BREAK CONFIDENCE in it, not to validate it.
Default to skepticism; assume it can fail in subtle, high-cost, or user-visible ways until
the evidence says otherwise. Read the cited files to ground your findings.

Hunt for the strongest reasons this should not ship yet:
- wrong, risky, or overcomplicated approach vs. a simpler correct one
- violated invariants, missing guards, unhandled error/failure paths
- auth / permission / tenant-isolation / trust-boundary gaps
- data loss, corruption, duplication, irreversible state; idempotency & rollback gaps
- races, ordering assumptions, stale state, re-entrancy
- empty / null / timeout / degraded-dependency behavior
- schema drift, migration hazards, version skew, compatibility regressions

For each finding give: what can go wrong, why this exact code/plan is vulnerable,
the likely impact, and the concrete fix. Cite file:line where you can. Prefer a few
strong, defensible findings over many weak ones. If it is genuinely sound, say so plainly.
Stay grounded — do not invent files, lines, or code paths you cannot support.

WORK UNDER REVIEW:
${p}`,

  implement: (p) => `You are Codex, the BACKEND specialist of a two-model team. Claude handles the
frontend and will adversarially review everything you produce, so write code you can defend.
Implement the backend / backend-facing portion of the task below by editing files directly
in the workspace. Read neighboring files first and match the existing style and conventions.

Scope: server routes, API endpoints, business logic, services, data models, jobs/queues,
auth, and migration FILES. Keep changes surgical and tied to the task — no speculative
features, no unrelated refactors, no "improvements" to code you weren't asked to touch.

HARD SAFETY RULES (non-negotiable):
- Do NOT execute database migrations, schema changes, drops, truncations, backfills, or any
  destructive / irreversible data operation. Author migration FILES only. Execution is
  reserved for human review.
- Do NOT run deploys, start/stop long-running servers, or take any outward-facing action.
- If a DB / data change is needed, write the migration file AND a plain-English summary of
  exactly what it changes, what it could break, locking/long-run impact, and the rollback path.

When done, output a concise summary for Claude's review:
- files changed and what each change does
- any migrations authored (with the safety summary above)
- assumptions you made and the highest-risk spots Claude should scrutinize

TASK:
${p}`,
};

function helpText() {
  return `hivemind.mjs — Codex side of the Claude + Codex hive mind

Usage:
  node hivemind.mjs <research|review|implement> [options]   # payload on stdin

Modes:
  research    read-only       independent investigation + proposed approach
  review      read-only       adversarial review of Claude's work (payload = the work)
  implement   workspace-write Codex authors backend code in the repo

Options:
  --effort <none|minimal|low|medium|high|xhigh>   reasoning effort (default: high)
  --model  <slug>                                 override model (default: your codex config)
  --cd     <dir>                                  working root for Codex (default: cwd)
  --timeout <seconds>                             hard kill after N seconds (per-mode default)
  --progress <file>                               live heartbeat JSON path (default: /tmp/hivemind-progress-<mode>-<pid>.json)
  --save   <file>                                 also write the clean message to <file>
  --task   <text>                                 inline payload instead of stdin
  --help                                          show this

Heartbeat: while running, --progress file is updated with cumulative tokens, events,
stdout bytes, and a 5s tick. Poll it to confirm Codex is alive (counters climbing).
Real runs often take 5-10 min — that is normal; judge by the heartbeat, not elapsed time.

Auth: uses your existing 'codex login' (subscription). No API key.`;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function status(mode, st, fields = {}, body = '') {
  const kv = Object.entries({ mode, status: st, ...fields }).map(([k, v]) => `${k}=${v}`).join(' ');
  process.stdout.write(`===HIVEMIND ${kv}===\n`);
  if (body) process.stdout.write(body + '\n');
}

function tail(s, n) { s = (s || '').trim(); return s.length > n ? '…' + s.slice(-n) : s; }

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];

if (args.help || !mode) { console.log(helpText()); process.exit(0); }
if (!MODES[mode]) { console.error(`Unknown mode '${mode}'.\n`); console.log(helpText()); process.exit(1); }

const cfg = MODES[mode];
const effort = args.effort && args.effort !== true ? String(args.effort) : 'high';
const timeoutMs = (Number(args.timeout) > 0 ? Number(args.timeout) : cfg.timeout) * 1000;
const progressFile = (args.progress && args.progress !== true)
  ? String(args.progress)
  : join(tmpdir(), `hivemind-progress-${mode}-${process.pid}.json`);

let payload = (args.task && args.task !== true) ? String(args.task) : '';
const stdinText = await readStdin();
if (stdinText.trim()) payload = payload ? `${payload}\n\n${stdinText}` : stdinText;
payload = payload.trim();
if (!payload) { status(mode, 'error', { reason: 'no-input' }, 'No task/payload provided (pass via stdin or --task).'); process.exit(0); }

const prompt = FRAMING[mode](payload);
const outFile = join(tmpdir(), `hivemind-${mode}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`);

// --- Heartbeat state -------------------------------------------------------
const startTs = Date.now();
let events = 0, stdoutBytes = 0;
let tokIn = 0, tokOut = 0, tokReason = 0, tokCached = 0;
let lastEventType = 'starting';
let lastActivity = startTs;
let lastWrite = 0;
let finalMessage = '';

function writeHeartbeat(st) {
  const now = Date.now();
  const hb = {
    tool: 'hivemind', mode, status: st, pid: process.pid,
    startedIso: new Date(startTs).toISOString(),
    updatedIso: new Date(now).toISOString(),
    elapsedSec: Math.round((now - startTs) / 1000),
    sinceLastEventSec: Math.round((now - lastActivity) / 1000),
    events,
    stdoutBytes,
    tokensTotal: tokIn + tokOut + tokReason,
    tokensInput: tokIn,
    tokensOutput: tokOut,
    tokensReasoning: tokReason,
    tokensCachedInput: tokCached,
    lastEventType,
  };
  try {
    const tmp = `${progressFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(hb, null, 2));
    renameSync(tmp, progressFile);
    lastWrite = now;
  } catch { /* heartbeat is best-effort */ }
}
function touchHeartbeat() { if (Date.now() - lastWrite >= 600) writeHeartbeat('running'); }

// Announce the progress path immediately, then write the first heartbeat.
process.stdout.write(`===HIVEMIND mode=${mode} status=starting progress=${progressFile}===\n`);
writeHeartbeat('starting');
// Wall-clock tick: proves liveness even while Codex is quietly thinking (no events).
const ticker = setInterval(() => writeHeartbeat('running'), 5000);
if (typeof ticker.unref === 'function') ticker.unref();

// --- Spawn Codex -----------------------------------------------------------
const codexArgs = ['exec', '--json', '--sandbox', cfg.sandbox, '--skip-git-repo-check', '--color', 'never', '-o', outFile];
if (args.cd && args.cd !== true) codexArgs.push('-C', String(args.cd));
if (args.model && args.model !== true) codexArgs.push('-m', String(args.model));
codexArgs.push('-c', `model_reasoning_effort=${effort}`);
codexArgs.push('-'); // read the prompt from stdin

const bin = process.env.HIVEMIND_CODEX_BIN || 'codex';
let stderr = '';
let timedOut = false;
let buf = '';

function cleanup() { try { rmSync(outFile, { force: true }); } catch {} }

function handleLine(line) {
  if (!line.trim()) return;
  events++;
  let o;
  try { o = JSON.parse(line); } catch { return; }
  lastEventType = o.type || (o.msg && o.msg.type) || 'event';
  const u = o.usage || (o.msg && o.msg.usage);
  if (u && typeof u === 'object') {
    if (typeof u.input_tokens === 'number') tokIn += u.input_tokens;
    if (typeof u.output_tokens === 'number') tokOut += u.output_tokens;
    if (typeof u.reasoning_output_tokens === 'number') tokReason += u.reasoning_output_tokens;
    if (typeof u.cached_input_tokens === 'number') tokCached += u.cached_input_tokens;
  }
  const item = o.item || (o.msg && o.msg.item);
  if (item && item.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
    finalMessage = item.text;
  }
}

const child = spawn(bin, codexArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
const killer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);

child.stdout.on('data', (d) => {
  stdoutBytes += d.length;
  lastActivity = Date.now();
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    handleLine(buf.slice(0, idx));
    buf = buf.slice(idx + 1);
  }
  touchHeartbeat();
});
child.stderr.on('data', (d) => { stderr += d.toString(); });

child.on('error', (err) => {
  clearTimeout(killer); clearInterval(ticker);
  if (err.code === 'ENOENT') { writeHeartbeat('error'); status(mode, 'error', { reason: 'codex-not-found' }, `Could not find the '${bin}' CLI on PATH. Install Codex CLI and run 'codex login'.`); }
  else { writeHeartbeat('error'); status(mode, 'error', { reason: 'spawn-failed' }, String(err.message || err)); }
  cleanup();
  process.exit(0);
});

child.on('close', (code) => {
  clearTimeout(killer); clearInterval(ticker);
  if (buf.trim()) handleLine(buf);
  const elapsed = Math.round((Date.now() - startTs) / 1000) + 's';
  const tokensTotal = tokIn + tokOut + tokReason;
  if (timedOut) {
    writeHeartbeat('timeout');
    status(mode, 'error', { reason: 'timeout', elapsed, tokens: tokensTotal, events }, `Codex exceeded ${timeoutMs / 1000}s and was killed. Raise --timeout, or retry with smaller scope / lower --effort.`);
    cleanup();
    process.exit(0);
  }
  let msg = '';
  try { if (existsSync(outFile)) msg = readFileSync(outFile, 'utf8').trim(); } catch {}
  if (!msg) msg = finalMessage.trim();
  cleanup();
  if (!msg) {
    writeHeartbeat('error');
    status(mode, 'error', { reason: code === 0 ? 'empty-output' : `exit-${code}`, elapsed, tokens: tokensTotal, events }, tail(stderr, 1500) || 'Codex returned no message.');
    process.exit(0);
  }
  writeHeartbeat('done');
  status(mode, 'ok', {
    model: (args.model && args.model !== true) ? args.model : 'config-default',
    effort, sandbox: cfg.sandbox, elapsed, tokens: tokensTotal, events,
  });
  process.stdout.write(msg + '\n');
  if (args.save && args.save !== true) { try { writeFileSync(String(args.save), msg); } catch {} }
  process.exit(0);
});

child.stdin.write(prompt);
child.stdin.end();
