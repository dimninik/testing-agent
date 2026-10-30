const ALLOWED_PATHS = {
  BACKEND_TEST: /^backend\/tests\/[\w./-]+\.ts$/,
  FRONTEND_TEST: /^frontend\/src\/[\w./-]+\.test\.tsx?$/,
  FRONTEND_TEST_SUPPORT: /^frontend\/src\/test\/[\w./-]+\.tsx?$/,
} as const satisfies Record<string, RegExp>;

const ALLOWED_MODES = {
  REGULAR_FILE: '100644',
  EXECUTABLE_FILE: '100755',
  DELETED: '000000',
} as const;

export const REJECTION = {
  PATH_NOT_ALLOWED: 'path not allowed',
  MODE_NOT_ALLOWED: 'mode not allowed',
} as const;

const PATH_TRAVERSAL = '..';

export type Rejection = (typeof REJECTION)[keyof typeof REJECTION];

interface RawDiffEntry {
  newMode: string;
  paths: string[];
}

export interface DisallowedChange {
  path: string;
  rejection: Rejection;
  mode: string;
}

const isAllowedPath = (path: string): boolean =>
  !path.includes(PATH_TRAVERSAL) && Object.values(ALLOWED_PATHS).some((pattern) => pattern.test(path));

const isAllowedMode = (mode: string): boolean => Object.values(ALLOWED_MODES).some((allowed) => allowed === mode);

function parseRawDiffLine(line: string): RawDiffEntry {
  const [meta = '', ...paths] = line.split('\t');
  const [, newMode = ''] = meta.slice(1).split(' ');
  return { newMode, paths };
}

function findDisallowedPaths({ newMode, paths }: RawDiffEntry): DisallowedChange[] {
  return paths.flatMap((path): DisallowedChange[] => {
    if (!isAllowedPath(path)) return [{ path, rejection: REJECTION.PATH_NOT_ALLOWED, mode: newMode }];
    if (!isAllowedMode(newMode)) return [{ path, rejection: REJECTION.MODE_NOT_ALLOWED, mode: newMode }];
    return [];
  });
}

export function findDisallowedChanges(rawDiff: string): DisallowedChange[] {
  return rawDiff.split('\n').filter(Boolean).map(parseRawDiffLine).flatMap(findDisallowedPaths);
}

export const formatDisallowedChange = ({ path, rejection, mode }: DisallowedChange): string =>
  rejection === REJECTION.MODE_NOT_ALLOWED ? `${path} (mode ${mode} not allowed)` : `${path} (${rejection})`;
