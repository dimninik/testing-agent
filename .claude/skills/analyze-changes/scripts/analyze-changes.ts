import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, posix } from 'node:path';
import { parseArgs } from 'node:util';
import type { App } from '../../run-tests/scripts/run-tests.ts';

const FILE_KIND = {
  SOURCE: 'source',
  TEST: 'test',
  EXCLUDED: 'excluded',
  DELETED: 'deleted',
  OTHER: 'other',
} as const;

type FileKind = (typeof FILE_KIND)[keyof typeof FILE_KIND];

const APP_SOURCE_DIRECTORIES = {
  backend: 'backend/src/',
  frontend: 'frontend/src/',
} as const satisfies Record<App, string>;

const APP_TEST_PATHS = {
  backend: /^backend\/tests\/.+\.ts$/,
  frontend: /^frontend\/src\/.+\.test\.tsx?$/,
} as const satisfies Record<App, RegExp>;

const TYPESCRIPT_FILE = /\.tsx?$/;
const DIFF_HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const GIT_STATUS_DELETED = 'D';
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const COVERAGE_EXCLUDED_PATHS = {
  GENERATED_PRISMA_CLIENT: /^backend\/src\/generated\//,
  BACKEND_ENTRY_POINT: /^backend\/src\/main\.ts$/,
  TYPE_DECLARATIONS: /(^|\/)types\.ts$|\.types\.ts$|\.d\.ts$/,
  FRONTEND_ENTRY_POINT: /^frontend\/src\/main\.tsx$/,
  DESIGN_SYSTEM: /^frontend\/src\/design-system\//,
  STORYBOOK_STORY: /\.stories\.tsx?$/,
  STYLING: /\.styles\.ts$|\.variants\.ts$|\.css$/,
  BARREL: /(^|\/)index\.ts$/,
  CONSTANTS: /constants\.tsx?$|\.constants\.ts$/,
  QUERY_KEYS: /^frontend\/src\/features\/todos\/api\/queryKeys\.ts$/,
  QUERY_CLIENT: /^frontend\/src\/lib\/queryClient\.ts$/,
  TEST_SUPPORT: /^frontend\/src\/test\//,
} as const satisfies Record<string, RegExp>;

type CoverageExclusion = keyof typeof COVERAGE_EXCLUDED_PATHS;

const COVERAGE_EXCLUSION_REASONS: Record<CoverageExclusion, string> = {
  GENERATED_PRISMA_CLIENT: 'generated Prisma client',
  BACKEND_ENTRY_POINT: 'process entry point',
  TYPE_DECLARATIONS: 'type declarations only',
  FRONTEND_ENTRY_POINT: 'browser entry point',
  DESIGN_SYSTEM: 'design system (covered by Storybook, excluded from coverage)',
  STORYBOOK_STORY: 'Storybook story',
  STYLING: 'styling only',
  BARREL: 're-export barrel',
  CONSTANTS: 'constants only',
  QUERY_KEYS: 'static query keys',
  QUERY_CLIENT: 'static client configuration',
  TEST_SUPPORT: 'test support code',
};

const FILE_REASONS = {
  NOT_SOURCE: 'not application source',
  DELETED: 'file deleted',
} as const;

type LineRange = [start: number, end: number];

interface DiffEntry {
  status: string;
  path: string;
  previousPath?: string;
}

interface PathClassification {
  app: App | null;
  kind: FileKind;
  reason?: string;
}

export interface ChangedFile extends DiffEntry, PathClassification {
  changedLines?: LineRange[];
  testFile?: string;
  testExists?: boolean;
  testChangedInPr?: boolean;
}

export interface Analysis {
  base: string;
  head: string;
  summary: {
    changedFiles: number;
    testableSources: number;
    backend: number;
    frontend: number;
    withoutTestFile: number;
  };
  files: ChangedFile[];
}

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
    head: { type: 'string', default: 'HEAD' },
    out: { type: 'string' },
  },
});

const diffRange = `${args.base}...${args.head}`;
const runGit = (...argv: string[]): string =>
  execFileSync('git', argv, { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER_BYTES });
const typedKeysOf = <T extends object>(record: T): Extract<keyof T, string>[] =>
  Object.keys(record).filter((key): key is Extract<keyof T, string> => Object.hasOwn(record, key));

const findAppBySourcePath = (path: string): App | null =>
  typedKeysOf(APP_SOURCE_DIRECTORIES).find((app) => path.startsWith(APP_SOURCE_DIRECTORIES[app])) ?? null;

const findAppByTestPath = (path: string): App | null =>
  typedKeysOf(APP_TEST_PATHS).find((app) => APP_TEST_PATHS[app].test(path)) ?? null;

const findCoverageExclusion = (path: string): CoverageExclusion | null =>
  typedKeysOf(COVERAGE_EXCLUDED_PATHS).find((exclusion) => COVERAGE_EXCLUDED_PATHS[exclusion].test(path)) ?? null;

function classifyChangedPath(path: string): PathClassification {
  const testFileApp = findAppByTestPath(path);
  if (testFileApp) return { app: testFileApp, kind: FILE_KIND.TEST };
  const app = findAppBySourcePath(path);
  if (!app || !TYPESCRIPT_FILE.test(path)) return { app, kind: FILE_KIND.OTHER, reason: FILE_REASONS.NOT_SOURCE };
  const coverageExclusion = findCoverageExclusion(path);
  if (coverageExclusion)
    return { app, kind: FILE_KIND.EXCLUDED, reason: COVERAGE_EXCLUSION_REASONS[coverageExclusion] };
  return { app, kind: FILE_KIND.SOURCE };
}

function conventionalTestPaths(path: string, app: App): string[] {
  const { dir, name, ext } = posix.parse(path);
  if (app === 'backend') {
    const nested = posix.relative(APP_SOURCE_DIRECTORIES.backend, dir).replaceAll('/', '.');
    return [`backend/tests/${name}.test.ts`, ...(nested ? [`backend/tests/${nested}.${name}.test.ts`] : [])];
  }
  return [`${dir}/${name}.test${ext}`, `${dir}/${name}.test.${ext === '.ts' ? 'tsx' : 'ts'}`];
}

function readChangedLineRanges(path: string): LineRange[] {
  return runGit('diff', '-U0', diffRange, '--', path)
    .split('\n')
    .flatMap((line): LineRange[] => {
      const match = DIFF_HUNK_HEADER.exec(line);
      if (!match) return [];
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      return count > 0 ? [[start, start + count - 1]] : [];
    });
}

function parseNameStatusLine(line: string): DiffEntry | null {
  const [status = '', ...paths] = line.split('\t');
  const path = paths.at(-1);
  if (!path) return null;
  const previousPath = paths.length > 1 ? paths[0] : undefined;
  return { status: status.charAt(0), path, ...(previousPath ? { previousPath } : {}) };
}

function analyzeChangedFile(entry: DiffEntry, changedPaths: Set<string>): ChangedFile {
  const classification = classifyChangedPath(entry.path);
  const file: ChangedFile = { ...entry, ...classification };
  if (entry.status === GIT_STATUS_DELETED) {
    return {
      ...file,
      kind: classification.kind === FILE_KIND.TEST ? FILE_KIND.TEST : FILE_KIND.DELETED,
      reason: FILE_REASONS.DELETED,
    };
  }
  if (classification.kind !== FILE_KIND.SOURCE || !classification.app) return file;
  const testPathCandidates = conventionalTestPaths(entry.path, classification.app);
  const existingTestPath = testPathCandidates.find((candidate) => existsSync(candidate));
  return {
    ...file,
    changedLines: readChangedLineRanges(entry.path),
    testFile: existingTestPath ?? testPathCandidates[0],
    testExists: existingTestPath !== undefined,
    testChangedInPr: testPathCandidates.some((candidate) => changedPaths.has(candidate)),
  };
}

const diffEntries = runGit('diff', '--name-status', '-M', diffRange)
  .split('\n')
  .map(parseNameStatusLine)
  .filter((entry) => entry !== null);
const changedPaths = new Set(diffEntries.map((entry) => entry.path));
const changedFiles = diffEntries.map((entry) => analyzeChangedFile(entry, changedPaths));
const testableSources = changedFiles.filter((file) => file.kind === FILE_KIND.SOURCE);

const analysis: Analysis = {
  base: runGit('rev-parse', args.base).trim(),
  head: runGit('rev-parse', args.head).trim(),
  summary: {
    changedFiles: changedFiles.length,
    testableSources: testableSources.length,
    backend: testableSources.filter((file) => file.app === 'backend').length,
    frontend: testableSources.filter((file) => file.app === 'frontend').length,
    withoutTestFile: testableSources.filter((file) => !file.testExists).length,
  },
  files: changedFiles,
};

const json = JSON.stringify(analysis, null, 2);
if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${json}\n`);
}
process.stdout.write(`${json}\n`);
