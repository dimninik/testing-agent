---
name: report-results
description: Write the unit-test agent's final machine-readable report (.agent-output/report.json) describing per-file decisions, tests written and findings, and render it as a pull request comment. Use as the last step of every test-generation run.
---

# Report results

## When to use

As the last step of every run, after the full verification passed.

## Steps

1. Write `.agent-output/report.json` with this shape:

   | Field | Content |
   |---|---|
   | `summary` | 1–2 sentences: what changed and what you did about tests |
   | `decisions[]` | one entry per `source` file from the analysis |
   | `decisions[].source` | the source file path |
   | `decisions[].action` | `created`, `updated`, `skipped` or `removed` |
   | `decisions[].testFile` | the test file path, or `null` when skipped |
   | `decisions[].reason` | one concrete sentence, max 300 characters, no markdown |
   | `decisions[].cases` | names of tests you added or changed, max 15 |
   | `findings[]` | suspected bugs or unreachable code in **source**; empty if none |
   | `skillsUsed[]` | skills you actually used |

2. Optional: preview the PR comment locally:

   ```sh
   node .claude/skills/report-results/scripts/render-report.ts --report .agent-output/report.json --results .agent-output/test-results.json
   ```

## Rules

- Report only what you actually did.
- Don't put test results or coverage numbers in the report. The workflow measures them itself.
- Use `removed` only for a test whose source file was deleted.
- You never fix source code. Suspected bugs go to `findings`.
- The workflow drops every field that does not match this shape, and escapes all text before
  posting it.

## Example

```json
{
  "summary": "The PR adds a stats endpoint. Added router tests for it and skipped the type-only change.",
  "decisions": [
    {
      "source": "backend/src/features/todos/router.ts",
      "action": "updated",
      "testFile": "backend/tests/router.test.ts",
      "reason": "New GET /stats route was not called by any test.",
      "cases": ["returns task statistics", "returns 500 when the repository fails"]
    },
    {
      "source": "backend/src/features/todos/types.ts",
      "action": "skipped",
      "testFile": null,
      "reason": "Type-only change."
    }
  ],
  "findings": [],
  "skillsUsed": ["analyze-changes", "backend-unit-tests", "run-tests", "report-results"]
}
```
