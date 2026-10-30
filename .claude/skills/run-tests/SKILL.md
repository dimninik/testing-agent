---
name: run-tests
description: Run type-checking, the unit test suites and coverage for backend/ and/or frontend/, and get a machine-readable summary with failures and per-file coverage. Use to verify any test you write or change, and to find coverage gaps.
---

# Run tests

## When to use

- After writing each test file: a quick run of that one file.
- Before finishing: the full verification. It must pass.
- In manual mode without a base commit: to find files with low coverage.

## Steps

1. Quick run of one file:

   ```sh
   cd backend && npx vitest run tests/<name>.test.ts
   cd frontend && npx vitest run src/path/to/<Name>.test.tsx
   ```

2. Full verification:

   ```sh
   node .claude/skills/run-tests/scripts/run-tests.ts --app <backend|frontend|all> --changed <source path> --out .agent-output/test-results.json
   ```

   Repeat `--changed` for every source file you care about. The script runs `npm run typecheck`
   and `vitest run --coverage`. It exits with 0 only when everything passed.

3. Read the JSON output:

   | Field | Meaning |
   |---|---|
   | `ok` | typecheck, tests and coverage thresholds all passed |
   | `apps[].tests.failures[]` | `{ file, test, message }` per failing test; `(suite)` means the file did not load |
   | `apps[].coverage.total` | lines, statements, functions and branches in percent |
   | `apps[].coverage.changedFiles` | coverage of each `--changed` file; `null` means no test imports it |
   | `apps[].coverage.thresholdsMet` | `false` means a coverage threshold failed |

4. To see exact uncovered lines, run `npx vitest run --coverage` in the app folder and read the
   `Uncovered Line #s` column.

5. If something fails:
   1. Read the message. Decide if the test is wrong or your assumption about the code is wrong.
   2. Fix the test.
   3. Run the single file again, then the full verification.
   4. After 3 failed attempts, remove that test case or restore the file with
      `git checkout -- <file>`. Report it as skipped with the reason.

## Rules

- Fix tests, never source code, Vitest configs, thresholds or `package.json`.
- Never use `.skip`, `.only` or `.todo`.
- Never loosen an assertion only to make it pass.
- If a test shows a real bug, remove the test and report the bug in `findings`.

## Example

```json
{
  "ok": false,
  "apps": [{
    "app": "backend",
    "tests": { "ok": false, "total": 93, "passed": 92, "failures": [
      { "file": "backend/tests/router.test.ts", "test": "returns 404 for missing tasks", "message": "expected 200 to be 404" }
    ] },
    "coverage": { "changedFiles": { "backend/src/features/todos/router.ts": { "lines": 100, "branches": 87.5 } } }
  }]
}
```
