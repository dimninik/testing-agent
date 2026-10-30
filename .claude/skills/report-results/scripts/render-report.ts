import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { App, Coverage, Failure } from '../../run-tests/scripts/run-tests.ts';
import { REPORT_MARKER, REPORT_STATUS, isReportStatus, type ReportStatus } from './report-contract.ts';

const SKILLS = ['analyze-changes', 'backend-unit-tests', 'frontend-unit-tests', 'run-tests', 'report-results'] as const;

const ACTION_LABELS = {
  created: '🆕 created',
  updated: '✏️ updated',
  skipped: '⏭️ skipped',
  removed: '🗑️ removed',
} as const;

const HEADLINES: Record<ReportStatus, string> = {
  [REPORT_STATUS.COMMITTED]: '✅ Generated tests were verified and committed to this branch.',
  [REPORT_STATUS.VERIFICATION_FAILED]: '❌ Generated tests failed independent verification and were **not** committed.',
  [REPORT_STATUS.NO_CHANGES]: 'ℹ️ No test changes were needed for this pull request.',
  [REPORT_STATUS.REJECTED]: '⛔ The agent modified files outside the allowed test paths; its changes were discarded.',
  [REPORT_STATUS.AGENT_FAILED]: '⚠️ The agent run did not complete; no tests were committed.',
  [REPORT_STATUS.BRANCH_MOVED]: '⏭️ The branch received new commits during the run; the next run will handle them.',
};

const PATTERNS = {
  REPO_PATH: /^(backend|frontend)\/[\w./@()[\]-]+$/,
  COMMIT_SHA: /^[0-9a-f]{7,40}$/,
  WHITESPACE: /\s+/g,
  MARKDOWN_SPECIAL: /[&<>"'`|\\[\]*_~]/g,
  MENTION: /@/g,
  ISSUE_REFERENCE: /#(?=\d)/g,
  CODE_FENCE: /```/g,
} as const satisfies Record<string, RegExp>;

const MAX_ITEMS = {
  DECISIONS: 50,
  CASES_PER_DECISION: 15,
  FINDINGS: 10,
  CHANGED_FILES: 50,
  FAILURES: 10,
  REJECTED_PATHS: 20,
} as const;

const MAX_CHARS = {
  DEFAULT: 300,
  SUMMARY: 600,
  FINDING: 400,
  PATH: 200,
  TEST_NAME: 200,
  CASE_NAME: 160,
  CODE_BLOCK: 1500,
} as const;

const ZERO_WIDTH_SPACE = '​';
const EMPTY_CELL = '—';
const GITHUB_URL_PREFIX = 'https://github.com/';

type Skill = (typeof SKILLS)[number];
type Action = keyof typeof ACTION_LABELS;
type CoverageSummary = Partial<Pick<Coverage, 'lines' | 'branches' | 'functions'>>;

export interface Decision {
  source: string;
  action: Action;
  testFile: string | null;
  reason: string;
  cases: string[];
}

export interface Report {
  summary: string;
  decisions: Decision[];
  findings: string[];
  skillsUsed: Skill[];
}

interface VerifiedApp {
  app: App;
  typecheckOk: boolean;
  typecheckOutput: string;
  testsOk: boolean;
  passed: number;
  total: number;
  failures: Failure[];
  coverage: CoverageSummary;
  thresholdsMet: boolean;
  changedFiles: [file: string, coverage: CoverageSummary | null][];
}

interface AnalysisSummary {
  changedFiles: number;
  testableSources: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isSkill = (value: unknown): value is Skill => SKILLS.some((skill) => skill === value);
const isAction = (value: unknown): value is Action => isString(value) && Object.hasOwn(ACTION_LABELS, value);
const isApp = (value: unknown): value is App => value === 'backend' || value === 'frontend';
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (isString(value) ? value : '');
const asNumber = (value: unknown): number => (isNumber(value) ? value : 0);
const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
const optionalNumber = (value: unknown): number | undefined => (isNumber(value) ? value : undefined);

function readJsonFile(path: string | undefined): unknown {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function parseDecision(value: unknown): Decision | null {
  if (!isRecord(value) || !isAction(value.action)) return null;
  return {
    source: asString(value.source),
    action: value.action,
    testFile: isString(value.testFile) ? value.testFile : null,
    reason: asString(value.reason),
    cases: asArray(value.cases).filter(isString).slice(0, MAX_ITEMS.CASES_PER_DECISION),
  };
}

function parseReport(value: unknown): Report | null {
  if (!isRecord(value)) return null;
  return {
    summary: asString(value.summary),
    decisions: asArray(value.decisions)
      .slice(0, MAX_ITEMS.DECISIONS)
      .map(parseDecision)
      .filter((decision) => decision !== null),
    findings: asArray(value.findings).filter(isString).slice(0, MAX_ITEMS.FINDINGS),
    skillsUsed: asArray(value.skillsUsed).filter(isSkill),
  };
}

function parseCoverage(value: unknown): CoverageSummary {
  const metrics = asRecord(value);
  return {
    lines: optionalNumber(metrics.lines),
    branches: optionalNumber(metrics.branches),
    functions: optionalNumber(metrics.functions),
  };
}

function parseFailure(value: unknown): Failure {
  const failure = asRecord(value);
  return { file: asString(failure.file), test: asString(failure.test), message: asString(failure.message) };
}

function parseChangedFiles(value: unknown): VerifiedApp['changedFiles'] {
  return Object.entries(asRecord(value)).map(([file, metrics]) => [
    file,
    metrics === null ? null : parseCoverage(metrics),
  ]);
}

function parseApp(value: unknown): VerifiedApp | null {
  if (!isRecord(value) || !isApp(value.app)) return null;
  const typecheck = asRecord(value.typecheck);
  const tests = asRecord(value.tests);
  const coverage = asRecord(value.coverage);
  return {
    app: value.app,
    typecheckOk: typecheck.ok === true,
    typecheckOutput: asString(typecheck.output),
    testsOk: tests.ok === true,
    passed: asNumber(tests.passed),
    total: asNumber(tests.total),
    failures: asArray(tests.failures).map(parseFailure),
    coverage: parseCoverage(coverage.total),
    thresholdsMet: coverage.thresholdsMet === true,
    changedFiles: parseChangedFiles(coverage.changedFiles),
  };
}

function parseApps(value: unknown): VerifiedApp[] {
  return asArray(asRecord(value).apps)
    .map(parseApp)
    .filter((app) => app !== null);
}

function parseAnalysisSummary(value: unknown): AnalysisSummary {
  const summary = asRecord(asRecord(value).summary);
  return { changedFiles: asNumber(summary.changedFiles), testableSources: asNumber(summary.testableSources) };
}

function escapeMarkdown(value: string, max: number = MAX_CHARS.DEFAULT): string {
  const escaped = value
    .replace(PATTERNS.WHITESPACE, ' ')
    .trim()
    .replace(PATTERNS.MARKDOWN_SPECIAL, (char) => `&#${String(char.charCodeAt(0))};`)
    .replace(PATTERNS.MENTION, `@${ZERO_WIDTH_SPACE}`)
    .replace(PATTERNS.ISSUE_REFERENCE, `#${ZERO_WIDTH_SPACE}`);
  return escaped.length > max ? `${escaped.slice(0, max - 1)}…` : escaped;
}

const formatRepoPath = (path: string | null): string =>
  path && PATTERNS.REPO_PATH.test(path) && !path.includes('..') ? `\`${path}\`` : EMPTY_CELL;
const formatPercent = (value: number | undefined): string =>
  value === undefined ? EMPTY_CELL : `${value.toFixed(1)}%`;
const codeBlock = (value: string): string[] => [
  '```',
  value.slice(0, MAX_CHARS.CODE_BLOCK).replace(PATTERNS.CODE_FENCE, "'''"),
  '```',
];
const statusIcon = (ok: boolean): string => (ok ? '✅' : '❌');

function renderDecisions(decisions: Decision[]): string[] {
  const commentLines = ['', '### Decisions', '', '| Source | Action | Test file | Reason |', '|---|---|---|---|'];
  for (const decision of decisions) {
    commentLines.push(
      `| ${formatRepoPath(decision.source)} | ${ACTION_LABELS[decision.action]} | ${formatRepoPath(decision.testFile)} | ${escapeMarkdown(decision.reason)} |`,
    );
  }
  const withCases = decisions.filter((decision) => decision.cases.length);
  if (withCases.length) {
    commentLines.push('', '<details><summary>Test cases written</summary>', '');
    for (const decision of withCases) {
      commentLines.push(
        `**${formatRepoPath(decision.testFile)}**`,
        '',
        ...decision.cases.map((name) => `- ${escapeMarkdown(name, MAX_CHARS.CASE_NAME)}`),
        '',
      );
    }
    commentLines.push('</details>');
  }
  return commentLines;
}

function renderVerification(apps: VerifiedApp[]): string[] {
  const commentLines = [
    '',
    '### Independent verification',
    '',
    '| App | Typecheck | Tests | Lines | Branches | Thresholds |',
    '|---|---|---|---|---|---|',
  ];
  for (const app of apps) {
    commentLines.push(
      `| ${app.app} | ${statusIcon(app.typecheckOk)} | ${statusIcon(app.testsOk)} ${String(app.passed)}/${String(app.total)} | ${formatPercent(app.coverage.lines)} | ${formatPercent(app.coverage.branches)} | ${statusIcon(app.thresholdsMet)} |`,
    );
  }

  const changed = apps.flatMap((app) => app.changedFiles).slice(0, MAX_ITEMS.CHANGED_FILES);
  if (changed.length) {
    commentLines.push(
      '',
      '<details><summary>Coverage of changed source files</summary>',
      '',
      '| File | Lines | Branches | Functions |',
      '|---|---|---|---|',
    );
    for (const [file, metrics] of changed)
      commentLines.push(
        `| ${formatRepoPath(file)} | ${formatPercent(metrics?.lines)} | ${formatPercent(metrics?.branches)} | ${formatPercent(metrics?.functions)} |`,
      );
    commentLines.push('', '</details>');
  }

  const typeErrors = apps.filter((app) => !app.typecheckOk && app.typecheckOutput);
  const failures = apps.flatMap((app) => app.failures).slice(0, MAX_ITEMS.FAILURES);
  if (typeErrors.length || failures.length) {
    commentLines.push('', '<details open><summary>Failures</summary>', '');
    for (const app of typeErrors) commentLines.push(`**${app.app} typecheck**`, ...codeBlock(app.typecheckOutput));
    for (const failure of failures)
      commentLines.push(
        `**${formatRepoPath(failure.file)}** — ${escapeMarkdown(failure.test, MAX_CHARS.TEST_NAME)}`,
        ...codeBlock(failure.message),
      );
    commentLines.push('</details>');
  }
  return commentLines;
}

const { values: args } = parseArgs({
  options: {
    report: { type: 'string' },
    results: { type: 'string' },
    analysis: { type: 'string' },
    status: { type: 'string', default: REPORT_STATUS.COMMITTED },
    commit: { type: 'string' },
    'run-url': { type: 'string' },
    'rejected-path': { type: 'string', multiple: true, default: [] },
  },
});

const status: ReportStatus = isReportStatus(args.status) ? args.status : REPORT_STATUS.AGENT_FAILED;
const report = parseReport(readJsonFile(args.report));
const apps = parseApps(readJsonFile(args.results));
const analysis = parseAnalysisSummary(readJsonFile(args.analysis));
const runUrl = args['run-url'] ?? '';

const commentLines = [REPORT_MARKER, '## 🤖 Unit Test Agent', '', HEADLINES[status]];

if (args.commit && PATTERNS.COMMIT_SHA.test(args.commit)) commentLines.push('', `Commit: ${args.commit}`);
if (report?.summary) commentLines.push('', `> ${escapeMarkdown(report.summary, MAX_CHARS.SUMMARY)}`);

const rejected = args['rejected-path'].slice(0, MAX_ITEMS.REJECTED_PATHS);
if (rejected.length)
  commentLines.push(
    '',
    '**Disallowed paths touched by the agent:**',
    '',
    ...rejected.map((path) => `- ${escapeMarkdown(path, MAX_CHARS.PATH)}`),
  );

if (report?.decisions.length) commentLines.push(...renderDecisions(report.decisions));
else if (analysis.changedFiles)
  commentLines.push(
    '',
    `Analyzed ${String(analysis.changedFiles)} changed file(s); ${String(analysis.testableSources)} testable source file(s).`,
  );

if (apps.length) commentLines.push(...renderVerification(apps));

if (report?.findings.length) {
  commentLines.push(
    '',
    '### Findings in source code (not fixed by the agent)',
    '',
    ...report.findings.map((finding) => `- ${escapeMarkdown(finding, MAX_CHARS.FINDING)}`),
  );
}

const footer = [
  report?.skillsUsed.length ? `Skills used: ${report.skillsUsed.map((skill) => `\`${skill}\``).join(', ')}` : '',
  runUrl.startsWith(GITHUB_URL_PREFIX) ? `[Workflow run](${runUrl})` : '',
].filter(Boolean);
if (footer.length) commentLines.push('', `<sub>${footer.join(' · ')}</sub>`);

process.stdout.write(`${commentLines.join('\n')}\n`);
