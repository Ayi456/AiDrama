---
name: autoupgrade
description: Use when the user explicitly mentions $autoupgrade, autoupgrade, autuoupgrade, /autoupgrade, 自适应项目进化, or asks for an L1-L5 project evolution round. Do not use implicitly for ordinary refactors, reviews, bug fixes, cleanup, or general improvement work.
---

# Autoupgrade

## Overview

Run exactly one adaptive project evolution round. First sense project stability, then choose the safest valuable improvement level, implement only that improvement, verify it, and commit only the changes from this round.

This skill is opt-in only. If the user did not explicitly invoke it by name or by the L1-L5 project-evolution language in the description, do not apply this workflow.

## Inputs

Parse optional arguments from the user's request:

| Argument | Meaning |
| --- | --- |
| `--level=L1..L5` | Force a level. If the requested level is unsafe for the current stability, prefer a design/RFC or defensive work and explain why. |
| `--mode=attack` | Prefer forward improvement within the allowed stability range. |
| `--mode=defend` | Prefer stabilization, tests, warnings, and small cleanup. |
| `--mode=auto` | Default. Choose attack or defend from project stability. |
| `--target=<module>` | Limit sensing and improvement selection to the named module where practical. |

## Step 1: Sense State

Before changing anything:

1. Check the working tree with `git status --short`. Treat pre-existing changes as user-owned. Do not revert or stage them unless the user explicitly asks.
2. Read recent history with `git log --oneline -15` and avoid repeating recent improvement themes.
3. Run the project's fastest meaningful test signal.
   - If this is a Python project with `uv` and `pytest`, prefer:
     ```bash
     uv run pytest tests/ -q --tb=no 2>&1 | tail -3
     ```
   - Otherwise, use the repository's documented equivalent: focused unit tests, `npm test`, `npm run typecheck`, `npm run build`, or the closest low-cost verification command.
4. Inspect coverage if configured. For pytest coverage, read the `TOTAL` line. For other stacks, use the project's existing coverage output only if it is already configured.
5. Check whether E2E tests exist. Run them every fifth autoupgrade round or after large changes; if E2E fails, fix that before new improvement work.

## Stability Grade

Classify the project before choosing work:

| Grade | Signals | Allowed range |
| --- | --- | --- |
| Green / high stability | Tests green, coverage stable or rising, no regressions in the recent five autoupgrade-style rounds | L1-L5, with L5 only on explicit `--level=L5` or milestone trigger |
| Yellow / medium stability | Tests green, but recent commits include fixes or risky work | L1-L3 |
| Red / low stability | Tests fail, verification cannot run, or the project just had a large risky change | Defend only: L1-L2 plus tests |

If the signal is incomplete, grade conservatively.

## Step 2: Choose Level

In `auto` mode, choose the smallest level that produces real value.

| Level | Use for | Output |
| --- | --- | --- |
| L1 - Craftsperson | Import order, dead code, warnings, `print` to logger, missing docstring, tiny local cleanup | One small commit |
| L2 - Engineer | Extract a small function, fix an edge bug, add focused tests, micro-optimize a hot local path | One or two small commits |
| L3 - Architect | New module/protocol, API unification, cross-module refactor | Write design intent to `docs/improvements.md` first and stop for confirmation before implementation |
| L4 - Tech Director | New subsystem, storage or communication upgrade, large refactor | Write an RFC/design doc under `docs/` and split into steps before implementation |
| L5 - CEO Strategy | Strategic thinking only: positioning, roadmap, ecosystem, technical debt, what to kill, moat | Write strategy docs under `docs/strategy/`; do not change code |

Attack/defend rhythm in auto mode:

| Stability | Rhythm |
| --- | --- |
| High | Attack 3-5 rounds, then defend 1-2 rounds |
| Medium | Attack 1-2 rounds, then defend 1-2 rounds |
| Low | Defend continuously until green |

## Step 3: Execute One Improvement

Rules for every round:

1. Do one improvement only. Keep the diff small and focused.
2. If code behavior changes, ensure test coverage first; add a focused test before the implementation when practical.
3. In defend mode, prioritize restoring green tests, adding regression coverage, reducing warnings, or shrinking risky surface area.
4. In attack mode, pick the highest-value improvement allowed by the stability grade and target.
5. For L3/L4 decisions that require product or architecture judgment, document the recommendation in `docs/improvements.md` or an RFC and ask for confirmation instead of silently pushing through.
6. For L5, answer these questions in the strategy artifact:
   - Where are we: MVP, growth, or mature?
   - What's working?
   - What's not working?
   - Where should the next 3-6 months focus?
   - What should be killed or simplified?
   - What is the moat, and how should it be reinforced?

## Verification and Commit

After the change:

1. Re-run the focused verification command used for sensing. Broaden verification if the touched surface is shared.
2. If E2E is due or the change is large, run the configured E2E command.
3. Review `git diff` and confirm only this round's intended files changed.
4. Commit through the active environment's commit workflow (`/commit` where available, otherwise `git add` and `git commit`). Stage only files changed by this round.
5. If verification cannot run or fails for reasons outside the round, report the exact blocker and do not claim success.

## Common Mistakes

| Mistake | Correction |
| --- | --- |
| Using this skill for ordinary cleanup because it sounds useful | Do not. It is explicit-invocation only. |
| Starting with a refactor before sensing stability | Sense first, then choose level. |
| Doing multiple small improvements in one round | Pick one and stop after verification/commit. |
| Treating failed tests as permission to redesign | Low stability means defend with L1-L2 only. |
| Implementing L3/L4 without a design checkpoint | Write the doc first and wait for confirmation. |
| Staging unrelated user changes | Stage only this round's files. |
