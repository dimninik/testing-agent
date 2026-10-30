# Solution: Unit Test Agent

A Claude Code agent with reusable skills writes and updates unit tests for the Taskly backend and frontend.
A GitHub workflow runs it on every pull request. The workflow verifies the tests independently, commits them
to the PR branch and posts the results as a PR comment.

## Technical decisions

- **Claude Code as the agent environment.** It is the environment I have the most experience with. The agent and
  its skills are plain files in `.claude/`. The same definition runs locally (manual mode) and in CI (pr mode)
  through `anthropics/claude-code-action`.
- **Sonnet as the default model.** The tests are fairly simple but not trivial, so a mid-sized model is the right
  balance between quality, speed and cost. The repository variable `UNIT_TEST_AGENT_MODEL` overrides it.
- **Deterministic work in scripts, judgement in the model.** Analysing the diff, running the suites and rendering
  the report are TypeScript scripts with typed outputs. The model decides what to test and writes the tests;
  it does not parse JSON or build comments. All scripts are TypeScript run directly by Node 22, so the repo
  stays in one language and no logic lives in workflow YAML.
- **Consistency with the existing tests.** The `backend-unit-tests` and `frontend-unit-tests` skills describe the
  conventions found in the existing test files. The agent must also read the nearest existing test before
  writing a new one.
- **Least privilege across three jobs.**
  - `generate` holds the Claude token but only has read access to the repo.
  - `verify` has no secrets and starts from a clean runner.
  - `publish` can write, but never executes code from the PR.
- **Do not trust the agent's own result.** `verify` re-runs typecheck, tests and the coverage thresholds itself.
  Only a patch that passes is committed.
- **Defence in depth against prompt injection from PR content.**
  - The agent runs with `dontAsk` permissions and a command allowlist, with no network and no git push.
  - The agent definition and all workflow scripts come from the base branch, never from the PR.
  - A path guard rejects any change outside test files, as well as symlinks.
  - Subprocesses run in a bubblewrap sandbox without the token in their environment.
  - Text written by the agent is escaped before it reaches the PR comment.
- **Commit to the PR branch.** The tests land next to the feature they cover and are reviewed together with it.
- **95% coverage thresholds** for statements, branches, functions and lines in both apps. CI fails if coverage
  drops.

## Running it

**Prerequisites:**

1. Add the repository secret `CLAUDE_CODE_OAUTH_TOKEN`. Generate the token with `claude setup-token`.
2. Optionally, add the repository variable `UNIT_TEST_AGENT_MODEL` (default: `sonnet`).
3. The workflow and its scripts must already be on `main`, because every run loads the scripts from the base branch.

**In CI:** open a non-draft pull request from a branch of this repository that changes `backend/**` or `frontend/**`.
The `Unit Test Agent` workflow runs `generate`, then `verify`, then `publish`. GitHub asks a maintainer to approve
the workflow runs triggered by the bot's commit. After approval, CI runs on the new commit and the agent skips
itself.

**Locally:**

```sh
claude --agent unit-test-agent --settings .claude/unit-test-agent.settings.json "Mode: manual. Scope: backend only."
claude --agent unit-test-agent --settings .claude/unit-test-agent.settings.json "Mode: manual. Base: origin/main."
```

**Checks for the scripts themselves:** run `npm ci && npm run check` (typecheck, ESLint, Prettier and `node:test`).

## Where things are defined

| Path | Purpose |
|---|---|
| `.claude/agents/unit-test-agent.md` | The agent: modes, workflow (plan, conventions, write, verify, report) and hard rules |
| `.claude/unit-test-agent.settings.json` | Tool permissions: allowed commands, writable paths, denied network and git |
| `.claude/skills/analyze-changes` | Classifies changed files and maps each one to its test file; the agent decides create, update or skip |
| `.claude/skills/backend-unit-tests` | Backend test conventions (supertest, Prisma stubs, env and timers) |
| `.claude/skills/frontend-unit-tests` | Frontend test conventions (Testing Library, QueryClient, hooks) |
| `.claude/skills/run-tests` | Typecheck, tests and coverage as JSON, including coverage of the changed files |
| `.claude/skills/report-results` | The report format and the renderer of the PR comment |
| `.github/workflows/unit-test-agent.yml` | The PR workflow |
| `.github/scripts/` | Typed workflow steps, the test path guard and the publish status logic, with tests |

## Example run

**PR [#2](https://github.com/dimninik/testing-agent/pull/2)** adds a task summary: `GET /api/todos/stats` in the
backend and a summary row in the frontend. The PR contained no tests.

- **Decisions** ([comment](https://github.com/dimninik/testing-agent/pull/2#issuecomment-6534508096)):

  | Source | Action | Test file |
  |---|---|---|
  | `backend/src/features/todos/stats.ts` | created | `backend/tests/stats.test.ts` |
  | `backend/src/features/todos/router.ts` | updated | `backend/tests/router.test.ts` |
  | `frontend/src/features/todos/utils/todos.ts` | updated | `frontend/src/features/todos/utils/todos.test.ts` |
  | `frontend/src/features/todos/components/TodoStats.tsx` | created | `frontend/src/features/todos/components/TodoStats.test.tsx` |
  | `frontend/src/features/todos/TodosPage.tsx` | updated | `frontend/src/features/todos/TodosPage.test.tsx` |

- **Skills used:** analyze-changes, backend-unit-tests, frontend-unit-tests, run-tests, report-results.
- **Independent verification:**
  - backend: 95/95 tests, 100% lines, 100% branches;
  - frontend: 100/100 tests, 100% lines, 99.3% branches;
  - all thresholds met.
- **Result:** the bot committed `b9dd458` (5 test files, +123 lines, no source changes), and CI on that commit is green.

The first two attempts failed, and both failures were reported in the PR comment without committing anything:

1. bubblewrap was missing on the runner, so subprocess isolation could not start (fixed in the workflow);
2. there was a typo in the `CLAUDE_CODE_OAUTH_TOKEN` secret.

**Manual mode** raised the coverage of the existing code:

| App | Lines before | Lines after | Turns | Est. API cost |
|---|---|---|---|---|
| backend | 33% | 100% | 39 | ~$0.32 |
| frontend | 47.7% | 100% | 81 | ~$0.76 |

Estimated by Claude Code from token usage at API prices; the runs used a Claude subscription.

## Assumptions

- Pull requests come from branches of this repository.
- Unit tests run without network, a database or real timers. Prisma, `fetch` and time are stubbed.
- New tests follow the conventions of the existing test files.
- One run covers about 10 source files. The rest are reported as skipped with the reason `budget`.
- Sonnet is good enough for tests of this complexity.

## Limitations

- **Large pull requests** are only partly covered because of the per-run file budget.
- **Coverage is the main quality signal.** A test can execute code without asserting anything meaningful. The skills
  ask for behavioural assertions, but nothing checks them automatically. Generated tests still need human review to
  confirm they check the right behaviour and meet the requirements.
- **The bot's commit needs approval** before CI runs on it.
- **The agent does not fix source bugs.** It reports suspected bugs under `findings`.

## Production extensions

- **A test quality gate beyond coverage.** For example, mutation testing with Stryker on the changed files, or a
  review step that flags assertion-free tests.
- **On-demand runs** through a PR comment command such as `/unit-tests`.
- **A separate pull request with the tests**, opened against the feature branch, instead of pushing to it directly.
- **Caching:** dependency and Claude Code installation caches, and skipping files whose tests did not change since
  the last run.
- **More automation with a dedicated GitHub App.** CI on the bot's commit could start without manual approval if
  the bot pushed with a GitHub App token instead of the default `GITHUB_TOKEN`. On the other hand, the current
  approval step forces a maintainer to look at the generated tests before CI runs on them.
