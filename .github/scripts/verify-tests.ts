import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { requireEnv, runGit } from './lib/actions.ts';

const RUN_TESTS = resolve(import.meta.dirname, '../../.claude/skills/run-tests/scripts/run-tests.ts');
const SOURCE_PATHSPECS = ['backend/src/*.ts', 'frontend/src/*.ts', 'frontend/src/*.tsx'] as const;
const TEST_FILE = /\.test\.tsx?$/;
const EXIT_CODE_FAILED = 1;

function listChangedSources(baseSha: string): string[] {
  return runGit('diff', '--name-only', '--diff-filter=AMR', baseSha, 'HEAD', '--', ...SOURCE_PATHSPECS)
    .split('\n')
    .filter((path) => path && !TEST_FILE.test(path));
}

const baseSha = requireEnv('BASE_SHA');
const resultsFile = requireEnv('RESULTS_FILE');
const changedArgs = listChangedSources(baseSha).flatMap((path) => ['--changed', path]);

const run = spawnSync(
  process.execPath,
  [RUN_TESTS, '--root', process.cwd(), '--app', 'all', ...changedArgs, '--out', resultsFile],
  { stdio: 'inherit' },
);
process.exit(run.status ?? EXIT_CODE_FAILED);
