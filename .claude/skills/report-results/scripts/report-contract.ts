export const REPORT_MARKER = '<!-- unit-test-agent-report -->';

export const REPORT_STATUS = {
  COMMITTED: 'committed',
  VERIFICATION_FAILED: 'verification-failed',
  NO_CHANGES: 'no-changes',
  REJECTED: 'rejected',
  AGENT_FAILED: 'agent-failed',
  BRANCH_MOVED: 'branch-moved',
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const isReportStatus = (value: unknown): value is ReportStatus =>
  Object.values(REPORT_STATUS).some((status) => status === value);
