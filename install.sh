#!/usr/bin/env bash
# Install the hive mind as a standalone Claude Code skill (no plugin system needed).
# For team distribution, prefer the plugin route (see README) — this is the lightweight path.
#
# Usage:
#   ./install.sh                 # global: ~/.claude (symlink, tracks this repo)
#   ./install.sh --project DIR   # into DIR/.claude (copy, so you can commit it)
#   ./install.sh --global --copy # global, but copy instead of symlink
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="global"
TARGET_ROOT="$HOME/.claude"
METHOD=""   # link | copy ; defaults per-mode below

while [ $# -gt 0 ]; do
  case "$1" in
    --global)  MODE="global"; TARGET_ROOT="$HOME/.claude"; shift ;;
    --project) MODE="project"; TARGET_ROOT="${2:?--project needs a directory}/.claude"; shift 2 ;;
    --copy)    METHOD="copy"; shift ;;
    --link)    METHOD="link"; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done
[ -n "$METHOD" ] || { [ "$MODE" = "global" ] && METHOD="link" || METHOD="copy"; }

echo "Installing hivemind → $TARGET_ROOT  (mode=$MODE, method=$METHOD)"
mkdir -p "$TARGET_ROOT/skills" "$TARGET_ROOT/commands"

install_one() {  # $1=source path  $2=dest path
  rm -rf "$2"
  if [ "$METHOD" = "link" ]; then ln -s "$1" "$2"; else cp -R "$1" "$2"; fi
}
install_one "$SRC/skills/hivemind"      "$TARGET_ROOT/skills/hivemind"
install_one "$SRC/commands/hivemind.md" "$TARGET_ROOT/commands/hivemind.md"

echo "✓ skill:   $TARGET_ROOT/skills/hivemind"
echo "✓ command: $TARGET_ROOT/commands/hivemind.md"

# Preflight: Codex must be installed and logged in (subscription), and node present.
echo
command -v node  >/dev/null 2>&1 && echo "✓ node:  $(node --version)"  || echo "✗ node not found — required to run the helper."
if command -v codex >/dev/null 2>&1; then
  echo "✓ codex: $(codex --version 2>/dev/null || echo present)"
  if [ -f "$HOME/.codex/auth.json" ]; then echo "✓ codex auth present (~/.codex/auth.json)"; else echo "✗ not logged in — run 'codex login' (use your subscription, not an API key)."; fi
else
  echo "✗ codex CLI not found — install it and run 'codex login'."
fi
echo
echo "Done. Restart Claude Code (or /reload) so it picks up the skill."
