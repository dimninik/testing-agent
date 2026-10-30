import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendSummary, runGit, setOutput } from './lib/actions.ts';

const AGENT_DEFINITION_DIR = '.claude';
const AGENT_OUTPUT_DIR = '.agent-output';
const PATCH_FILE_NAME = 'tests.patch';

function restorePullRequestAgentDefinition(): void {
  rmSync(AGENT_DEFINITION_DIR, { recursive: true, force: true });
  const existsInPullRequest = runGit('ls-tree', '-d', 'HEAD', AGENT_DEFINITION_DIR).trim() !== '';
  if (existsInPullRequest) runGit('checkout', 'HEAD', '--', AGENT_DEFINITION_DIR);
}

restorePullRequestAgentDefinition();
runGit('add', '--all');
const patch = runGit('diff', '--cached', '--binary');

mkdirSync(AGENT_OUTPUT_DIR, { recursive: true });
writeFileSync(join(AGENT_OUTPUT_DIR, PATCH_FILE_NAME), patch);
setOutput('has_patch', String(patch.length > 0));
appendSummary(['### Files changed by the agent', '', '```', runGit('diff', '--cached', '--stat'), '```'].join('\n'));
