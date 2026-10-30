import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  REPORT_MARKER,
  REPORT_STATUS,
  type ReportStatus,
} from '../../../.claude/skills/report-results/scripts/report-contract.ts';
import type { TestResults } from '../../../.claude/skills/run-tests/scripts/run-tests.ts';
import { JOB_RESULT_SUCCESS } from '../lib/actions.ts';
import { decidePublishStatus, isFailingStatus, parsePublishState, type PublishInputs } from '../lib/publish-status.ts';
import { REJECTION, findDisallowedChanges, formatDisallowedChange } from '../lib/test-paths.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

const RENDER_REPORT = join(ROOT, '.claude/skills/report-results/scripts/render-report.ts');

const MODES = {
  REGULAR_FILE: '100644',
  SYMLINK: '120000',
} as const;

const GIT_STATUS = {
  ADDED: 'A',
  MODIFIED: 'M',
} as const;

const EXIT_CODE_OK = 0;

const OLD_SHA = '0'.repeat(40);
const NEW_SHA = '1'.repeat(40);
const MAX_REPORT_LENGTH = 3000;

type Mode = (typeof MODES)[keyof typeof MODES];
type GitStatus = (typeof GIT_STATUS)[keyof typeof GIT_STATUS];

interface ScriptRun {
  status: number | null;
  stdout: string;
}

function runScript(script: string, argv: string[]): ScriptRun {
  const { status, stdout } = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8' });
  return { status, stdout };
}

const rawDiffLine = (path: string, mode: Mode = MODES.REGULAR_FILE, status: GitStatus = GIT_STATUS.ADDED): string =>
  `:000000 ${mode} ${OLD_SHA} ${NEW_SHA} ${status}\t${path}\n`;

describe('test-paths', () => {
  it('accepts backend tests, frontend tests and frontend test fixtures', () => {
    const rawDiff =
      rawDiffLine('backend/tests/config.test.ts') +
      rawDiffLine('frontend/src/lib/http.test.ts') +
      rawDiffLine('frontend/src/App.test.tsx') +
      rawDiffLine('frontend/src/test/fixtures.ts', MODES.REGULAR_FILE, GIT_STATUS.MODIFIED);
    assert.deepEqual(findDisallowedChanges(rawDiff), []);
  });

  const forbidden = [
    'backend/src/factory.ts',
    'frontend/src/lib/http.ts',
    '.github/workflows/ci.yml',
    '.claude/agents/unit-test-agent.md',
    'frontend/package.json',
    'backend/tests/../src/main.ts',
    'frontend/vite.config.ts',
  ];
  for (const path of forbidden) {
    it(`rejects ${path}`, () => {
      const changes = findDisallowedChanges(rawDiffLine('backend/tests/ok.test.ts') + rawDiffLine(path));
      assert.deepEqual(changes, [{ path, rejection: REJECTION.PATH_NOT_ALLOWED, mode: MODES.REGULAR_FILE }]);
    });
  }

  it('rejects symlinks even on allowed paths', () => {
    const [change] = findDisallowedChanges(rawDiffLine('backend/tests/link.test.ts', MODES.SYMLINK));
    assert.ok(change);
    assert.equal(formatDisallowedChange(change), 'backend/tests/link.test.ts (mode 120000 not allowed)');
  });

  it('checks both sides of a rename', () => {
    const changes = findDisallowedChanges(
      `:100644 100644 ${OLD_SHA} ${NEW_SHA} R100\tbackend/src/main.ts\tbackend/tests/main.test.ts\n`,
    );
    assert.deepEqual(
      changes.map((change) => change.path),
      ['backend/src/main.ts'],
    );
  });
});

describe('publish-status', () => {
  const ready: PublishInputs = {
    generateResult: JOB_RESULT_SUCCESS,
    verifyResult: JOB_RESULT_SUCCESS,
    testableSources: 2,
    hasPatch: true,
    branchMoved: false,
    disallowedChanges: 0,
  };

  const cases: [name: string, overrides: Partial<PublishInputs>, expected: ReportStatus][] = [
    ['commits verified tests', {}, REPORT_STATUS.COMMITTED],
    ['reports a failed agent job', { generateResult: 'failure' }, REPORT_STATUS.AGENT_FAILED],
    ['skips when nothing is testable', { testableSources: 0 }, REPORT_STATUS.NO_CHANGES],
    ['skips when the agent wrote nothing', { hasPatch: false }, REPORT_STATUS.NO_CHANGES],
    ['waits for the next run when the branch moved', { branchMoved: true }, REPORT_STATUS.BRANCH_MOVED],
    [
      'rejects disallowed paths before checking verification',
      { disallowedChanges: 1, verifyResult: 'failure' },
      REPORT_STATUS.REJECTED,
    ],
    ['refuses tests that failed verification', { verifyResult: 'failure' }, REPORT_STATUS.VERIFICATION_FAILED],
  ];
  for (const [name, overrides, expected] of cases) {
    it(name, () => {
      assert.equal(decidePublishStatus({ ...ready, ...overrides }), expected);
    });
  }

  it('fails the job only for rejected or unverified tests', () => {
    const failing = Object.values(REPORT_STATUS).filter(isFailingStatus);
    assert.deepEqual(failing, [REPORT_STATUS.VERIFICATION_FAILED, REPORT_STATUS.REJECTED]);
  });

  it('falls back to agent-failed for a missing or malformed state file', () => {
    assert.equal(parsePublishState(null).status, REPORT_STATUS.AGENT_FAILED);
    assert.equal(parsePublishState({ status: 'pwned' }).status, REPORT_STATUS.AGENT_FAILED);
  });
});

describe('render-report', () => {
  const fixturesDir = mkdtempSync(join(tmpdir(), 'render-'));
  const writeJsonFixture = (name: string, value: unknown): string => {
    const file = join(fixturesDir, name);
    writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const results = writeJsonFixture('results.json', {
    ok: true,
    apps: [
      {
        app: 'backend',
        ok: true,
        typecheck: { ok: true },
        tests: { ok: true, total: 3, passed: 3, failed: 0, seconds: 1, failures: [] },
        coverage: {
          total: { lines: 98.5, statements: 98.5, functions: 100, branches: 91 },
          thresholdsMet: true,
          changedFiles: { 'backend/src/factory.ts': { lines: 100, statements: 100, functions: 100, branches: 92.8 } },
        },
      },
    ],
  } satisfies TestResults);

  it('renders decisions, verification and skills behind the sticky-comment marker', () => {
    const report = writeJsonFixture('report.json', {
      summary: 'Added router tests.',
      decisions: [
        {
          source: 'backend/src/features/todos/router.ts',
          action: 'updated',
          testFile: 'backend/tests/router.test.ts',
          reason: 'New branch.',
          cases: ['returns 409'],
        },
      ],
      findings: [],
      skillsUsed: ['analyze-changes', 'run-tests', 'not-a-skill'],
    });
    const { stdout, status } = runScript(RENDER_REPORT, [
      '--report',
      report,
      '--results',
      results,
      '--status',
      REPORT_STATUS.COMMITTED,
      '--commit',
      'abc1234',
    ]);
    assert.equal(status, EXIT_CODE_OK);
    assert.ok(stdout.startsWith(REPORT_MARKER));
    assert.match(
      stdout,
      /\| `backend\/src\/features\/todos\/router.ts` \| ✏️ updated \| `backend\/tests\/router.test.ts` \|/,
    );
    assert.match(stdout, /\| backend \| ✅ \| ✅ 3\/3 \| 98\.5% \| 91\.0% \| ✅ \|/);
    assert.match(stdout, /Skills used: `analyze-changes`, `run-tests`<\/sub>/);
    assert.doesNotMatch(stdout, /not-a-skill/);
  });

  it('neutralizes markdown/HTML injection, mentions and invalid paths from the agent report', () => {
    const report = writeJsonFixture('evil.json', {
      summary: '<img src=x onerror=alert(1)> @org/team please approve #1',
      decisions: [
        {
          source: '../../etc/passwd',
          action: 'created',
          testFile: 'backend/tests/x.test.ts`](javascript:alert(1))',
          reason: '| broken | table [link](https://evil.example)',
          cases: [],
        },
        { source: 'backend/src/a.ts', action: 'deleted-everything', reason: 'unknown action' },
      ],
      findings: ['x'.repeat(5000)],
    });
    const { stdout } = runScript(RENDER_REPORT, [
      '--report',
      report,
      '--status',
      REPORT_STATUS.COMMITTED,
      '--run-url',
      'https://evil.example/run',
    ]);
    assert.doesNotMatch(stdout, /<img/);
    assert.doesNotMatch(stdout, /@org/);
    assert.doesNotMatch(stdout, /\[link\]\(/);
    assert.doesNotMatch(stdout, /etc\/passwd`/);
    assert.doesNotMatch(stdout, /javascript:alert\(1\)\)`/);
    assert.doesNotMatch(stdout, /deleted-everything|unknown action/);
    assert.doesNotMatch(stdout, /evil\.example\/run/);
    assert.ok(stdout.length < MAX_REPORT_LENGTH, 'long findings are truncated');
  });

  it('renders a failure headline even without an agent report', () => {
    const { stdout, status } = runScript(RENDER_REPORT, [
      '--status',
      REPORT_STATUS.VERIFICATION_FAILED,
      '--results',
      results,
    ]);
    assert.equal(status, EXIT_CODE_OK);
    assert.match(stdout, /failed independent verification/);
  });
});
