---
description: Force the Claude+Codex hive mind on a task (independent research, role-based authoring, adversarial cross-review, synthesis)
argument-hint: '[task or question]'
---

Engage the **hive mind** on the request below, following the `hivemind` skill's protocol in full
(do not skip the cross-review or synthesis):

`$ARGUMENTS`

Reminder of the division of labor: Codex authors backend / backend-facing code, Claude authors
frontend / frontend-facing code, each adversarially reviews the other, and you synthesize. For a
research/design question, both investigate independently and you reconcile + synthesize. Keep the
database safety gate intact: Codex may author migration files but never executes DB/data changes —
those stay human-reviewed.

If Codex is unavailable, proceed solo and say so.
