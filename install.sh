#!/usr/bin/env bash
# Thin shim → `hivemind add`. Kept for backward compatibility.
# Prefer the `hivemind` CLI directly:  hivemind add | update | remove | status
#
#   ./install.sh                 install into the CURRENT project (git-excluded)
#   ./install.sh --project DIR   install into DIR
#   ./install.sh --global        install for ALL projects (~/.claude)
#   ./install.sh --link          symlink instead of copy (auto-updates on `hivemind update`)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/hivemind" add "$@"
