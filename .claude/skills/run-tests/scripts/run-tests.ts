import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs, stripVTControlCharacters } from 'node:util';

const APPS = ['backend', 'frontend'] as const;
const ALL_APPS = 'all';

const EXIT_CODE = {
  OK: 0,
  FAILED: 1,
  USAGE: 2,
} as const;

const VITEST_STATUS_FAILED = 'failed';
const SUITE_FAILURE_NAME = '(suite)';
const COVERAGE_SUMMARY_PATH = ['coverage', 'coverage-summary.json'] as const;
const PROCESS_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const TAIL_LINES = {
  OUTPUT: 40,
  FAILURE: 15,
} as const;

export type App = (typeof APPS)[number];
export interface Coverage {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
}

export type CoverageMetric = keyof Coverage;

export interface Failure {
  file: string;
  test: string;
  message: string;
}

export interface TypecheckResult {
  ok: boolean;
  output?: string;
}

export interface TestsResult {
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  seconds: number;
  failures: Failure[];
  output?: string;
}

export interface CoverageResult {
  total: Coverage;
  changedFiles: Record<string, Coverage | null>;
  thresholdsMet: boolean;
  output?: string;
}

export interface AppResult {
  app: App;
  ok: boolean;
  typecheck: TypecheckResult;
  tests: TestsResult;
  coverage: CoverageResult | null;
}

export interface TestResults {
  ok: boolean;
  apps: AppResult[];
}

interface FailedTest {
  name: string;
  message: string;
}

interface VitestSuite {
  file: string;
  failed: boolean;
  message: string;
  failedTests: FailedTest[];
}

interface VitestReport {
  failedSuites: number;
  total: number;
  passed: number;
  failed: number;
  suites: VitestSuite[];
}

interface CommandResult {
  code: number;
  output: string;
  seconds: number;
}

const isApp = (value: string): value is App => APPS.some((app) => app === value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const { values: args } = parseArgs({
  options: {
    app: { type: 'string', default: ALL_APPS },
    changed: { type: 'string', multiple: true, default: [] },
    out: { type: 'string' },
    root: { type: 'string' },
  },
});

const repoRoot = resolve(args.root ?? join(import.meta.dirname, '../../../..'));
const requestedApps: string[] = args.app === ALL_APPS ? [...APPS] : [args.app];
const apps = requestedApps.filter(isApp);
if (apps.length !== requestedApps.length) {
  console.error(`Unknown --app "${args.app}". Use ${APPS.join(', ')} or ${ALL_APPS}.`);
  process.exit(EXIT_CODE.USAGE);
}

const lastLines = (text: string, lines: number = TAIL_LINES.OUTPUT): string =>
  text.trim().split('\n').slice(-lines).join('\n');

function readJsonFile(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function runCommand(cwd: string, command: string, argv: string[]): CommandResult {
  const started = Date.now();
  const processResult = spawnSync(command, argv, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
    maxBuffer: PROCESS_MAX_BUFFER_BYTES,
  });
  return {
    code: processResult.status ?? EXIT_CODE.FAILED,
    output: stripVTControlCharacters(`${processResult.stdout}${processResult.stderr}`),
    seconds: (Date.now() - started) / 1000,
  };
}

function parseFailedTests(value: unknown): FailedTest[] {
  return asArray(value)
    .filter(isRecord)
    .filter((test) => test.status === VITEST_STATUS_FAILED)
    .map((test) => ({
      name: asString(test.fullName),
      message: asArray(test.failureMessages).map(asString).join('\n'),
    }));
}

function parseSuite(suite: Record<string, unknown>): VitestSuite {
  return {
    file: relative(repoRoot, asString(suite.name)),
    failed: suite.status === VITEST_STATUS_FAILED,
    message: asString(suite.message),
    failedTests: parseFailedTests(suite.assertionResults),
  };
}

function parseVitestReport(value: unknown): VitestReport | null {
  if (!isRecord(value)) return null;
  return {
    failedSuites: asNumber(value.numFailedTestSuites),
    total: asNumber(value.numTotalTests),
    passed: asNumber(value.numPassedTests),
    failed: asNumber(value.numFailedTests),
    suites: asArray(value.testResults).filter(isRecord).map(parseSuite),
  };
}

function parseCoverage(value: unknown): Coverage | null {
  if (!isRecord(value)) return null;
  const pct = (metric: CoverageMetric): number => {
    const summary = value[metric];
    return isRecord(summary) ? asNumber(summary.pct) : 0;
  };
  return { lines: pct('lines'), statements: pct('statements'), functions: pct('functions'), branches: pct('branches') };
}

function collectFailures(report: VitestReport): Failure[] {
  return report.suites.flatMap((suite): Failure[] => {
    const failed = suite.failedTests.map((test) => ({
      file: suite.file,
      test: test.name,
      message: lastLines(stripVTControlCharacters(test.message), TAIL_LINES.FAILURE),
    }));
    if (failed.length || !suite.failed) return failed;
    return [
      {
        file: suite.file,
        test: SUITE_FAILURE_NAME,
        message: lastLines(stripVTControlCharacters(suite.message), TAIL_LINES.FAILURE),
      },
    ];
  });
}

function buildTestsResult(report: VitestReport | null, vitest: CommandResult, ok: boolean): TestsResult {
  if (!report)
    return {
      ok: false,
      total: 0,
      passed: 0,
      failed: 0,
      seconds: vitest.seconds,
      failures: [],
      output: lastLines(vitest.output),
    };
  return {
    ok,
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    seconds: vitest.seconds,
    failures: collectFailures(report),
  };
}

function verifyApp(app: App): AppResult {
  const cwd = join(repoRoot, app);
  const reportFile = join(mkdtempSync(join(tmpdir(), `vitest-${app}-`)), 'report.json');

  const typecheck = runCommand(cwd, 'npm', ['run', '--silent', 'typecheck']);
  const vitest = runCommand(cwd, 'npx', [
    'vitest',
    'run',
    '--coverage',
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${reportFile}`,
  ]);

  const report = parseVitestReport(readJsonFile(reportFile));
  const summary = readJsonFile(join(cwd, ...COVERAGE_SUMMARY_PATH));
  const coverageOf = (key: string): Coverage | null => (isRecord(summary) ? parseCoverage(summary[key]) : null);
  const total = coverageOf('total');

  const typecheckOk = typecheck.code === EXIT_CODE.OK;
  const testsPassed = report !== null && report.failed === 0 && report.failedSuites === 0;
  const thresholdsMet = testsPassed && vitest.code === EXIT_CODE.OK;
  const changedFiles = Object.fromEntries(
    args.changed.filter((path) => path.startsWith(`${app}/`)).map((path) => [path, coverageOf(join(repoRoot, path))]),
  );

  return {
    app,
    ok: typecheckOk && thresholdsMet,
    typecheck: typecheckOk ? { ok: true } : { ok: false, output: lastLines(typecheck.output) },
    tests: buildTestsResult(report, vitest, testsPassed),
    coverage: total && {
      total,
      changedFiles,
      thresholdsMet,
      ...(testsPassed && !thresholdsMet ? { output: lastLines(vitest.output, TAIL_LINES.FAILURE) } : {}),
    },
  };
}

const appResults = apps.map(verifyApp);
const testResults: TestResults = { ok: appResults.every((app) => app.ok), apps: appResults };
const json = JSON.stringify(testResults, null, 2);
if (args.out) {
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(args.out, `${json}\n`);
}
process.stdout.write(`${json}\n`);
process.exit(testResults.ok ? EXIT_CODE.OK : EXIT_CODE.FAILED);
