import {
  REPORT_STATUS,
  isReportStatus,
  type ReportStatus,
} from '../../../.claude/skills/report-results/scripts/report-contract.ts';
import { JOB_RESULT_SUCCESS, isRecord } from './actions.ts';

const FAILING_STATUSES: readonly ReportStatus[] = [REPORT_STATUS.VERIFICATION_FAILED, REPORT_STATUS.REJECTED];

export interface PublishInputs {
  generateResult: string;
  verifyResult: string;
  testableSources: number;
  hasPatch: boolean;
  branchMoved: boolean;
  disallowedChanges: number;
}

export interface PublishState {
  status: ReportStatus;
  commit: string;
  rejectedPaths: string[];
}

export function decidePublishStatus(inputs: PublishInputs): ReportStatus {
  if (inputs.generateResult !== JOB_RESULT_SUCCESS) return REPORT_STATUS.AGENT_FAILED;
  if (inputs.testableSources === 0 || !inputs.hasPatch) return REPORT_STATUS.NO_CHANGES;
  if (inputs.branchMoved) return REPORT_STATUS.BRANCH_MOVED;
  if (inputs.disallowedChanges > 0) return REPORT_STATUS.REJECTED;
  if (inputs.verifyResult !== JOB_RESULT_SUCCESS) return REPORT_STATUS.VERIFICATION_FAILED;
  return REPORT_STATUS.COMMITTED;
}

export const isFailingStatus = (status: ReportStatus): boolean => FAILING_STATUSES.includes(status);

export function parsePublishState(value: unknown): PublishState {
  if (!isRecord(value) || !isReportStatus(value.status)) {
    return { status: REPORT_STATUS.AGENT_FAILED, commit: '', rejectedPaths: [] };
  }
  return {
    status: value.status,
    commit: typeof value.commit === 'string' ? value.commit : '',
    rejectedPaths: Array.isArray(value.rejectedPaths)
      ? value.rejectedPaths.filter((path): path is string => typeof path === 'string')
      : [],
  };
}
