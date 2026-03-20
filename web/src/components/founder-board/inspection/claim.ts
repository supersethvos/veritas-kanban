import type {
  Workflow,
  WorkflowCertification,
  WorkflowReadiness,
  WorkflowCertificationStatus,
  CompletionTruthState,
} from '@veritas-kanban/shared';

export type ClaimTone = 'verified' | 'at_risk' | 'pending';

export interface SystemClaim {
  claim: string;
  tone: ClaimTone;
}

const STATUS_PHRASES: Record<WorkflowCertificationStatus, string> = {
  certified: 'certified autonomous',
  candidate: 'a certification candidate',
  ready_for_review: 'ready for founder review',
  not_ready: 'not yet ready for certification',
  decertified: 'decertified',
};

const TRUTH_STATE_TO_TONE: Record<CompletionTruthState, ClaimTone> = {
  verified: 'verified',
  at_risk: 'at_risk',
  pending: 'pending',
};

export function buildSystemClaim(
  workflow: Workflow,
  certification: WorkflowCertification,
  readiness: WorkflowReadiness,
  completionTruthState: CompletionTruthState
): SystemClaim {
  const phrase = STATUS_PHRASES[certification.certification_status];
  const reason = certification.certification_reason || readiness.readiness_summary;
  const claim = `${workflow.name} is ${phrase} because ${reason}`;

  const tone: ClaimTone =
    certification.certification_status === 'decertified'
      ? 'at_risk'
      : certification.certification_status === 'certified'
        ? 'verified'
        : (TRUTH_STATE_TO_TONE[completionTruthState] ?? 'pending');

  return { claim, tone };
}
