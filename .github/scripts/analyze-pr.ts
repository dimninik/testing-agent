import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { isRecord, readJsonFile, requireEnv, setOutput } from './lib/actions.ts';

const ANALYZER = resolve(import.meta.dirname, '../../.claude/skills/analyze-changes/scripts/analyze-changes.ts');

function readTestableSources(analysisFile: string): number {
  const analysis = readJsonFile(analysisFile);
  const summary = isRecord(analysis) ? analysis.summary : null;
  if (!isRecord(summary) || typeof summary.testableSources !== 'number') {
    throw new Error(`Analysis in ${analysisFile} has no summary.testableSources`);
  }
  return summary.testableSources;
}

const baseSha = requireEnv('BASE_SHA');
const analysisFile = requireEnv('ANALYSIS_FILE');

execFileSync(process.execPath, [ANALYZER, '--base', baseSha, '--head', 'HEAD', '--out', analysisFile], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
setOutput('testable', String(readTestableSources(analysisFile)));
