#!/usr/bin/env bash
# hivemind installer — installs the Claude+Codex hive mind for Claude Code.
#
# Hivemind is a tool FOR Claude Code, not part of your codebase. By default it installs
# into a SINGLE project:
#   - scoped to that project only (other projects on this machine are unaffected)
#   - lives in <project>/.claude/ but is added to .git/info/exclude, so it is NEVER
#     committed, never shown in `git status`, and never changes the project's git.
set -euo pipefail

usage() {
  cat <<'EOF'
hivemind installer

  install.sh                 install into the CURRENT project only (default)
  install.sh --project DIR   install into project DIR only
  install.sh --global        install for ALL projects (~/.claude)
  install.sh --copy          copy instead of symlink
  install.sh --help          show this help

A project install lives in <project>/.claude/ and is added to .git/info/exclude, so it is
never committed and never changes the project's git. Other projects are unaffected.
Remove it anytime: rm -rf <project>/.claude/skills/hivemind <project>/.claude/commands/hivemind.md
EOF
}

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE="project"
TARGET_PROJECT="$PWD"
METHOD="link"

while [ $# -gt 0 ]; do
  case "$1" in
    --project) SCOPE="project"; TARGET_PROJECT="${2:?--project needs a directory}"; shift 2 ;;
    --global)  SCOPE="global"; shift ;;
    --copy)    METHOD="copy"; shift ;;
    --link)    METHOD="link"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

install_one() {  # $1=source  $2=dest
  rm -rf "$2"
  mkdir -p "$(dirname "$2")"
  if [ "$METHOD" = "link" ]; then ln -s "$1" "$2"; else cp -R "$1" "$2"; fi
}

if [ "$SCOPE" = "global" ]; then
  ROOT="$HOME/.claude"
  echo "Installing hivemind for ALL projects → $ROOT  (method=$METHOD)"
else
  [ -d "$TARGET_PROJECT" ] || { echo "No such directory: $TARGET_PROJECT" >&2; exit 1; }
  ROOT="$(cd "$TARGET_PROJECT" && pwd)/.claude"
  echo "Installing hivemind into THIS project only → $ROOT  (method=$METHOD)"
fi

install_one "$SRC/skills/hivemind"      "$ROOT/skills/hivemind"
install_one "$SRC/commands/hivemind.md" "$ROOT/commands/hivemind.md"
echo "✓ skill:   $ROOT/skills/hivemind"
echo "✓ command: $ROOT/commands/hivemind.md"

# Project install: make it invisible to the project's git so it is never committed.
if [ "$SCOPE" = "project" ]; then
  if GITDIR="$(git -C "$TARGET_PROJECT" rev-parse --absolute-git-dir 2>/dev/null)"; then
    EXCL="$GITDIR/info/exclude"
    mkdir -p "$(dirname "$EXCL")"; touch "$EXCL"
    for entry in ".claude/skills/hivemind" ".claude/commands/hivemind.md"; do
      grep -qxF "$entry" "$EXCL" 2>/dev/null || printf '%s\n' "$entry" >> "$EXCL"
    done
    echo "✓ git:     added to $EXCL — never committed, never shown in 'git status'"
  else
    echo "ℹ git:     '$TARGET_PROJECT' is not a git repo; nothing to exclude"
  fi
fi

echo
command -v node  >/dev/null 2>&1 && echo "✓ node:  $(node --version)"  || echo "✗ node not found — required to run the helper."
if command -v codex >/dev/null 2>&1; then
  echo "✓ codex: $(codex --version 2>/dev/null || echo present)"
  [ -f "$HOME/.codex/auth.json" ] && echo "✓ codex auth present — credits used automatically" || echo "✗ not logged in — run 'codex login' (subscription, not an API key)."
else
  echo "✗ codex CLI not found — install it and run 'codex login'."
fi
echo
echo "Done. Restart Claude Code (or start a new session) in this project so it picks up the skill."
