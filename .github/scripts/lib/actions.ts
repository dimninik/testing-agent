import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export const JOB_RESULT_SUCCESS = 'success';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const readEnv = (name: string): string => process.env[name] ?? '';

export function setOutput(name: string, value: string): void {
  appendFileSync(requireEnv('GITHUB_OUTPUT'), `${name}=${value}\n`);
}

export function appendSummary(markdown: string): void {
  appendFileSync(requireEnv('GITHUB_STEP_SUMMARY'), `${markdown}\n`);
}

export const runGit = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER_BYTES });

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
