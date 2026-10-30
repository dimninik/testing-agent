import { requireEnv, runGit } from './lib/actions.ts';
import { findDisallowedChanges, formatDisallowedChange } from './lib/test-paths.ts';

const EXIT_CODE = {
  OK: 0,
  REJECTED: 1,
} as const;

runGit('apply', '--index', requireEnv('PATCH_FILE'));
const disallowedChanges = findDisallowedChanges(runGit('diff', '--cached', '--raw', '--no-abbrev'));

for (const change of disallowedChanges) console.error(formatDisallowedChange(change));
process.exit(disallowedChanges.length ? EXIT_CODE.REJECTED : EXIT_CODE.OK);
