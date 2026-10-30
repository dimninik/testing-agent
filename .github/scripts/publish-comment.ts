import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { REPORT_MARKER } from '../../.claude/skills/report-results/scripts/report-contract.ts';
import { appendSummary, isRecord, readEnv, readJsonFile, requireEnv } from './lib/actions.ts';
import { parsePublishState } from './lib/publish-status.ts';

const RENDER_REPORT = resolve(import.meta.dirname, '../../.claude/skills/report-results/scripts/render-report.ts');
const BOT_LOGIN = 'github-actions[bot]';
const DEFAULT_API_URL = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const COMMENTS_PER_PAGE = 100;

type HttpMethod = 'GET' | 'POST' | 'PATCH';

const artifactsDir = requireEnv('ARTIFACTS_DIR');
const repository = requireEnv('GITHUB_REPOSITORY');
const pullRequest = requireEnv('PR_NUMBER');
const token = requireEnv('GITHUB_TOKEN');
const apiUrl = readEnv('GITHUB_API_URL') || DEFAULT_API_URL;
const runUrl = `${requireEnv('GITHUB_SERVER_URL')}/${repository}/actions/runs/${requireEnv('GITHUB_RUN_ID')}`;

async function callGitHub(method: HttpMethod, path: string, body?: object): Promise<unknown> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': API_VERSION,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed with ${String(response.status)}`);
  return response.json();
}

const isReportComment = (comment: unknown): comment is { id: number } =>
  isRecord(comment) &&
  typeof comment.id === 'number' &&
  isRecord(comment.user) &&
  comment.user.login === BOT_LOGIN &&
  typeof comment.body === 'string' &&
  comment.body.startsWith(REPORT_MARKER);

async function findReportCommentId(): Promise<number | null> {
  for (let page = 1; ; page += 1) {
    const comments = await callGitHub(
      'GET',
      `/repos/${repository}/issues/${pullRequest}/comments?per_page=${String(COMMENTS_PER_PAGE)}&page=${String(page)}`,
    );
    if (!Array.isArray(comments)) return null;
    const reportComment = comments.find(isReportComment);
    if (reportComment) return reportComment.id;
    if (comments.length < COMMENTS_PER_PAGE) return null;
  }
}

function renderComment(): string {
  const state = parsePublishState(readJsonFile(requireEnv('PUBLISH_STATE_FILE')));
  const args = [
    '--report',
    join(artifactsDir, 'agent-output', 'report.json'),
    '--analysis',
    join(artifactsDir, 'agent-output', 'analysis.json'),
    '--results',
    join(artifactsDir, 'test-results', 'test-results.json'),
    '--status',
    state.status,
    '--run-url',
    runUrl,
    ...(state.commit ? ['--commit', state.commit] : []),
    ...state.rejectedPaths.flatMap((path) => ['--rejected-path', path]),
  ];
  return execFileSync(process.execPath, [RENDER_REPORT, ...args], { encoding: 'utf8' });
}

const comment = renderComment();
appendSummary(comment);

const existingCommentId = await findReportCommentId();
if (existingCommentId === null) {
  await callGitHub('POST', `/repos/${repository}/issues/${pullRequest}/comments`, { body: comment });
} else {
  await callGitHub('PATCH', `/repos/${repository}/issues/comments/${String(existingCommentId)}`, { body: comment });
}
