---
name: orchestrate
description: Split a large task into independent units, run them in parallel subagents, verify each, and integrate the results. Only runs on an explicit /orchestrate.
argument-hint: "<task description>"
disable-model-invocation: true
---

# /orchestrate

Task: $ARGUMENTS

Invoking this skill is the user's explicit opt-in to multi-agent orchestration, including the Workflow tool.

1. **Task.** Empty task → ask the user what to orchestrate and stop.
2. **Understand first.** Read the code the task touches. If the task is small enough for one agent, say so and just do it yourself.
3. **Decompose.** Split into units with **disjoint file ownership**: list the files each unit owns. Units that must touch the same file are merged into one unit or run in sequence. Note dependencies between units.
4. **Run.** Every agent runs on Opus: pass `model: "opus"` on each Agent call and in each
   Workflow `agent()` options. Never use Fable, and don't use the `fork` agent type (forks
   inherit the parent's model).
   - Workflow tool available → load the `workflow-authoring` skill, then write a script with phases Implement → Verify, piping each unit's result into its own verification. Respect the session's agent-count guideline.
   - Otherwise → Agent tool: launch all independent units in one message; use `isolation: "worktree"` when ownership can't be kept disjoint. Run dependent units after their inputs finish.
   - Every agent prompt is self-contained: goal, files it owns, files it must not edit, how to verify, what to return.
5. **Verify.** Run the repo's own checks (tests, typecheck, lint) on the combined result. A failing unit gets re-dispatched once with the failure output; still failing → report it, don't loop.
6. **Report.** Per unit: done / failed and why. No commits or pushes unless the user asked.
