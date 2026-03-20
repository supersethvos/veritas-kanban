import type {
  AgentCertificationSummary,
  AnyTelemetryEvent,
  AtlasOperatorLeverageClass,
  HumanReviewBurden,
  OperatorInterventionKind,
  OperatorInterventionReceipt,
  OperatorInterventionResolutionScope,
  OperatorInterventionVerificationStatus,
  Task,
  Workflow,
  WorkflowEfficiencyDiagnosis,
  WorkflowCertification,
  WorkflowEvidenceBundle,
  WorkflowReadiness,
  WorkflowRunSummary,
  WorkflowState,
} from '@veritas-kanban/shared';
import {
  ATLAS_OPERATOR_LEVERAGE_CLASSES,
  OPERATOR_INTERVENTION_KINDS,
  OPERATOR_INTERVENTION_RESOLUTION_SCOPES,
  OPERATOR_INTERVENTION_VERIFICATION_STATUSES,
} from '@veritas-kanban/shared';
import type { WorkflowDefinition } from '../types/workflow.js';

/**
 * Pooled evidence across all workflows sharing the same (venture, family).
 * Allows the judgment to recognize that 12 independent successes across a family
 * is stronger evidence than requiring each individual workflow to have 4 runs.
 */
export interface FamilyEvidence {
  /** Total workflows in this family within the same venture */
  workflowCount: number;
  /** Sum of all runs across the family */
  totalRuns: number;
  /** Sum of successful runs across the family */
  successfulRuns: number;
  /** Sum of failed runs across the family */
  failedRuns: number;
  /** Sum of policy failures across the family */
  policyFailures: number;
  /** Whether family-level evidence is strong enough to lower individual thresholds */
  familyTrustEstablished: boolean;
}

export interface AtlasJudgmentInput {
  workflow: Workflow;
  evidenceBundle: WorkflowEvidenceBundle;
  runSummaries: WorkflowRunSummary[];
  asOf: string;
  task?: Task;
  definition?: WorkflowDefinition;
  relatedSignals?: AnyTelemetryEvent[];
  /** Pooled evidence from sibling workflows in the same (venture, family) */
  familyEvidence?: FamilyEvidence;
}

export type AtlasDegradationTriggerCode =
  | 'repeated_failed_runs'
  | 'policy_failures'
  | 'halt_failures'
  | 'hidden_cleanup'
  | 'human_review_spike'
  | 'latency_instability'
  | 'cost_instability'
  | 'recurring_failure_signature';

export interface AtlasDegradationTrigger {
  code: AtlasDegradationTriggerCode;
  summary: string;
  severity: 'warning' | 'critical';
}

export interface AtlasDegradationAssessment {
  active: boolean;
  requires_review: boolean;
  triggers: AtlasDegradationTrigger[];
}

export interface AtlasWorkflowExplanation {
  current_state: string;
  blockers: string;
  degradation: string | null;
  evidence: string;
  next_action: string;
}

export interface AtlasWorkflowJudgment {
  workflow: Workflow;
  certification: WorkflowCertification;
  readiness: WorkflowReadiness;
  explanation: AtlasWorkflowExplanation;
  degradation: AtlasDegradationAssessment;
  efficiency_diagnosis: WorkflowEfficiencyDiagnosis;
}

export interface AtlasOperatorInterventionRollup {
  total_receipts: number;
  credited_receipt_count: number;
  by_kind: Record<OperatorInterventionKind, number>;
  by_verification_status: Record<OperatorInterventionVerificationStatus, number>;
  by_resolution_scope: Record<OperatorInterventionResolutionScope, number>;
  by_leverage_class: Record<AtlasOperatorLeverageClass, number>;
  latest_created_at: string | null;
  latest_verified_at: string | null;
}

export interface AtlasAgentCertificationInput {
  workflows: Workflow[];
  evidenceBundles: WorkflowEvidenceBundle[];
  certifications: WorkflowCertification[];
  operatorInterventions: OperatorInterventionReceipt[];
  asOf: string;
}

const CANONICAL_AGENT_IDS = [
  'SETH-LEAD',
  'MAYA',
  'TAMMI',
  'HONEY-BADGER',
  'FINN',
  'VEGA',
  'ATLAS',
  'ROUX',
] as const;

const AGENT_CERTIFICATION_TIER_ORDER: Record<
  AgentCertificationSummary['certification_tier'],
  number
> = {
  certified_operator: 0,
  certified_executor: 1,
  not_certified: 2,
  under_review: 3,
};

const HUMAN_BOUNDARY_WORDS = [
  'approval',
  'approve',
  'signoff',
  'sign-off',
  'legal',
  'manual review',
  'human judgment',
  'human review',
  'founder decision',
  'operator review',
];

function toEpoch(value: string | undefined | null, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function maxIso(values: Array<string | undefined | null>, fallback: string): string {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (filtered.length === 0) return fallback;
  return filtered.reduce((latest, value) => (toEpoch(value) > toEpoch(latest) ? value : latest));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function averageNumber(values: number[], fallback = 0): number {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function createCountRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function mapOperatorInterventionKindToLeverageClass(
  kind: OperatorInterventionKind
): AtlasOperatorLeverageClass {
  switch (kind) {
    case 'truth_repair':
    case 'normalization':
      return 'truth_quality';
    case 'routing_cleanup':
      return 'routing_quality';
    case 'governance_update':
    case 'policy_enforcement':
      return 'policy_quality';
    case 'dispatch_quality':
    case 'onboarding_enablement':
    case 'other':
    default:
      return 'coordination_leverage';
  }
}

export function summarizeOperatorInterventionsForAtlas(
  receipts: OperatorInterventionReceipt[]
): AtlasOperatorInterventionRollup {
  const byKind = createCountRecord(OPERATOR_INTERVENTION_KINDS);
  const byVerificationStatus = createCountRecord(OPERATOR_INTERVENTION_VERIFICATION_STATUSES);
  const byResolutionScope = createCountRecord(OPERATOR_INTERVENTION_RESOLUTION_SCOPES);
  const byLeverageClass = createCountRecord(ATLAS_OPERATOR_LEVERAGE_CLASSES);

  let creditedReceiptCount = 0;
  let latestCreatedAt: string | null = null;
  let latestVerifiedAt: string | null = null;

  for (const receipt of receipts) {
    byKind[receipt.kind] += 1;
    byVerificationStatus[receipt.verification_status] += 1;
    byResolutionScope[receipt.resolution_scope] += 1;

    latestCreatedAt = latestCreatedAt
      ? maxIso([latestCreatedAt, receipt.created_at], latestCreatedAt)
      : receipt.created_at;
    latestVerifiedAt = latestVerifiedAt
      ? maxIso([latestVerifiedAt, receipt.verified_at], latestVerifiedAt)
      : receipt.verified_at;

    if (receipt.verification_status !== 'rejected') {
      creditedReceiptCount += 1;
      byLeverageClass[mapOperatorInterventionKindToLeverageClass(receipt.kind)] += 1;
    }
  }

  return {
    total_receipts: receipts.length,
    credited_receipt_count: creditedReceiptCount,
    by_kind: byKind,
    by_verification_status: byVerificationStatus,
    by_resolution_scope: byResolutionScope,
    by_leverage_class: byLeverageClass,
    latest_created_at: latestCreatedAt,
    latest_verified_at: latestVerifiedAt,
  };
}

function certificationStatusWeight(
  status: WorkflowCertification['certification_status'] | undefined
): number {
  switch (status) {
    case 'certified':
      return 1;
    case 'ready_for_review':
      return 0.85;
    case 'candidate':
      return 0.6;
    case 'decertified':
      return 0.15;
    case 'not_ready':
    default:
      return 0.25;
  }
}

function receiptVerificationWeight(status: OperatorInterventionVerificationStatus): number {
  switch (status) {
    case 'verified':
      return 1;
    case 'partially_verified':
      return 0.5;
    case 'rejected':
    default:
      return 0;
  }
}

function receiptScopeWeight(scope: OperatorInterventionResolutionScope): number {
  switch (scope) {
    case 'systemic':
      return 1;
    case 'cross_surface':
      return 0.85;
    case 'multi_task':
      return 0.7;
    case 'single_task':
    default:
      return 0.45;
  }
}

function leverageClassWeight(kind: OperatorInterventionKind): number {
  switch (mapOperatorInterventionKindToLeverageClass(kind)) {
    case 'truth_quality':
    case 'policy_quality':
      return 1;
    case 'routing_quality':
      return 0.9;
    case 'coordination_leverage':
    default:
      return 0.85;
  }
}

function deriveAgentCertificationSummaryForAtlas(
  agentId: string,
  input: AtlasAgentCertificationInput
): AgentCertificationSummary {
  const bundlesByWorkflowId = new Map(
    input.evidenceBundles.map((bundle) => [bundle.workflow_id, bundle])
  );
  const certificationsByWorkflowId = new Map(
    input.certifications.map((certification) => [certification.workflow_id, certification])
  );

  const ownedWorkflows = input.workflows.filter((workflow) => workflow.owner_agent === agentId);
  const supportedWorkflowIds: string[] = [];
  const workflowExecutionSamples: number[] = [];
  const reliabilitySamples: number[] = [];

  for (const workflow of ownedWorkflows) {
    const bundle = bundlesByWorkflowId.get(workflow.workflow_id);
    const certification = certificationsByWorkflowId.get(workflow.workflow_id);

    const hasMeaningfulExecutionEvidence = Boolean(
      bundle &&
      (bundle.run_count > 0 ||
        bundle.evidence_complete ||
        certification?.certification_status !== 'not_ready')
    );

    if (bundle) {
      let reliabilityScore = 100;
      if (workflow.completion_truth?.state === 'at_risk') reliabilityScore -= 35;
      if (
        workflow.state === 'under_review' ||
        certification?.certification_status === 'decertified'
      ) {
        reliabilityScore -= 25;
      }
      reliabilityScore -= Math.min(20, bundle.policy_fail_count * 10);
      reliabilityScore -= Math.min(15, bundle.halt_fail_count * 7.5);
      reliabilityScore -= Math.min(20, bundle.hidden_cleanup_incidents * 10);
      reliabilitySamples.push(clampNumber(reliabilityScore, 0, 100));
    }

    if (!bundle || !hasMeaningfulExecutionEvidence) {
      continue;
    }

    supportedWorkflowIds.push(workflow.workflow_id);

    const successRate = bundle.run_count > 0 ? bundle.successful_run_count / bundle.run_count : 0;
    const policyDiscipline =
      1 - Math.min(1, bundle.policy_fail_count / Math.max(bundle.run_count, 1));
    const haltDiscipline = 1 - Math.min(1, bundle.halt_fail_count / Math.max(bundle.run_count, 1));
    const evidenceStrength = bundle.evidence_complete ? 1 : 0.5;
    const cleanupPenalty = Math.min(0.2, bundle.hidden_cleanup_incidents * 0.05);

    const workflowExecutionScore = clampNumber(
      certificationStatusWeight(certification?.certification_status) * 0.35 +
        successRate * 0.25 +
        policyDiscipline * 0.15 +
        haltDiscipline * 0.1 +
        evidenceStrength * 0.15 -
        cleanupPenalty,
      0,
      1
    );

    workflowExecutionSamples.push(workflowExecutionScore * 100);
  }

  const creditedReceipts = input.operatorInterventions.filter(
    (receipt) => receipt.agent_id === agentId && receipt.verification_status !== 'rejected'
  );
  const receiptCredits = creditedReceipts.map((receipt) => {
    const evidenceWeight =
      receipt.evidence_paths.length > 0 && receipt.verified_outcomes.length > 0 ? 1 : 0.5;

    return (
      receiptVerificationWeight(receipt.verification_status) *
      receiptScopeWeight(receipt.resolution_scope) *
      leverageClassWeight(receipt.kind) *
      evidenceWeight
    );
  });

  const workflow_execution_score = Number(averageNumber(workflowExecutionSamples, 0).toFixed(2));
  const operator_leverage_score = Number(
    clampNumber(averageNumber(receiptCredits, 0) * 100, 0, 100).toFixed(2)
  );
  const reliability_score = Number(
    averageNumber(reliabilitySamples, supportedWorkflowIds.length > 0 ? 70 : 0).toFixed(2)
  );

  const hardGates = uniqueStrings([
    ownedWorkflows.some((workflow) => workflow.completion_truth?.state === 'at_risk')
      ? 'Completion truth drift remains unresolved on owned workflows.'
      : null,
    ownedWorkflows.some((workflow) => {
      const certification = certificationsByWorkflowId.get(workflow.workflow_id);
      return (
        workflow.state === 'under_review' || certification?.certification_status === 'decertified'
      );
    })
      ? 'Owned workflow trust is currently under review.'
      : null,
    ownedWorkflows.some(
      (workflow) => (bundlesByWorkflowId.get(workflow.workflow_id)?.policy_fail_count ?? 0) > 0
    )
      ? 'Policy or boundary failures remain unresolved on owned workflows.'
      : null,
    ownedWorkflows.reduce(
      (sum, workflow) =>
        sum + (bundlesByWorkflowId.get(workflow.workflow_id)?.hidden_cleanup_incidents ?? 0),
      0
    ) >= 2
      ? 'Hidden cleanup burden is recurring on owned workflows.'
      : null,
  ]);

  const hasVerifiedOperatorPattern = creditedReceipts.some(
    (receipt) => receipt.verification_status === 'verified'
  );

  let certification_tier: AgentCertificationSummary['certification_tier'] = 'not_certified';
  let status_reason = 'Workflow execution evidence is still too thin to certify this agent.';

  if (hardGates.length > 0) {
    certification_tier = 'under_review';
    status_reason = hardGates[0] ?? 'Agent trust is currently under review.';
  } else if (supportedWorkflowIds.length === 0) {
    certification_tier = 'not_certified';
    status_reason = 'Workflow execution evidence is still too thin to certify this agent.';
  } else if (
    workflow_execution_score >= 75 &&
    reliability_score >= 75 &&
    hasVerifiedOperatorPattern &&
    operator_leverage_score >= 60
  ) {
    certification_tier = 'certified_operator';
    status_reason =
      'Execution evidence is strong, operator leverage is verified, and reliability discipline is clean enough for broader trust.';
  } else if (workflow_execution_score >= 75 && reliability_score >= 70) {
    certification_tier = 'certified_executor';
    status_reason =
      'Workflow execution evidence is strong enough to trust this agent as an execution owner.';
  } else if (workflow_execution_score < 75) {
    certification_tier = 'not_certified';
    status_reason = 'Workflow execution evidence is not yet strong enough for certification.';
  } else {
    certification_tier = 'not_certified';
    status_reason =
      'Reliability and normalization discipline still need work before this agent can be certified.';
  }

  return {
    agent_id: agentId,
    certification_tier,
    workflow_execution_score,
    operator_leverage_score,
    reliability_score,
    status_reason,
    last_evaluated_at: input.asOf,
    hard_gates: hardGates,
    supporting_workflow_ids: supportedWorkflowIds,
    supporting_receipt_ids: creditedReceipts.map((receipt) => receipt.intervention_id),
    under_review_reason:
      certification_tier === 'under_review' ? (hardGates[0] ?? status_reason) : null,
    next_review_at:
      certification_tier === 'under_review' ||
      certification_tier === 'certified_executor' ||
      certification_tier === 'certified_operator'
        ? new Date(toEpoch(input.asOf) + 14 * 24 * 60 * 60 * 1000).toISOString()
        : null,
  };
}

export function summarizeAgentCertificationsForAtlas(
  input: AtlasAgentCertificationInput
): AgentCertificationSummary[] {
  const agentIds = uniqueStrings([
    ...input.workflows.map((workflow) => workflow.owner_agent),
    ...input.operatorInterventions.map((receipt) => receipt.agent_id),
  ]).filter((agentId) => (CANONICAL_AGENT_IDS as readonly string[]).includes(agentId));

  return agentIds
    .map((agentId) => deriveAgentCertificationSummaryForAtlas(agentId, input))
    .sort((left, right) => {
      const tierDelta =
        AGENT_CERTIFICATION_TIER_ORDER[left.certification_tier] -
        AGENT_CERTIFICATION_TIER_ORDER[right.certification_tier];
      if (tierDelta !== 0) return tierDelta;
      const executionDelta = right.workflow_execution_score - left.workflow_execution_score;
      if (executionDelta !== 0) return executionDelta;
      return left.agent_id.localeCompare(right.agent_id);
    });
}

function blockedReasonText(task?: Task): string | null {
  if (!task?.blockedReason) return null;
  if (typeof task.blockedReason === 'string') return task.blockedReason;
  return [task.blockedReason.category, task.blockedReason.note].filter(Boolean).join(': ');
}

function workflowSearchText(
  workflow: Workflow,
  task?: Task,
  definition?: WorkflowDefinition
): string {
  return [
    workflow.name,
    workflow.description,
    workflow.status_reason,
    workflow.human_review_reason,
    workflow.notes,
    task?.title,
    task?.description,
    task?.type,
    blockedReasonText(task),
    ...(task?.comments ?? []).map((comment) => comment.text),
    definition?.id,
    definition?.name,
    definition?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function includesHumanBoundary(text: string): boolean {
  return HUMAN_BOUNDARY_WORDS.some((word) => text.includes(word));
}

function humanizeState(state: WorkflowState): string {
  switch (state) {
    case 'human_native':
      return 'human-native';
    case 'assisted':
      return 'assisted';
    case 'governed_copilot':
      return 'governed copilot';
    case 'certifying':
      return 'certifying';
    case 'certified_autonomous':
      return 'certified autonomous';
    case 'under_review':
      return 'under review';
    default:
      return state;
  }
}

function countFailureSignatures(
  runSummaries: WorkflowRunSummary[],
  task?: Task
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const summary of runSummaries) {
    if (!summary.failure_signature) continue;
    counts.set(summary.failure_signature, (counts.get(summary.failure_signature) ?? 0) + 1);
  }

  const blockedReason = blockedReasonText(task);
  if (blockedReason) {
    counts.set(blockedReason, (counts.get(blockedReason) ?? 0) + 1);
  }

  return counts;
}

function topFailureSignatures(runSummaries: WorkflowRunSummary[], task?: Task): string[] {
  return Array.from(countFailureSignatures(runSummaries, task).entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([signature]) => signature);
}

export function deriveStructuralLimits(
  workflow: Workflow,
  task?: Task,
  definition?: WorkflowDefinition
): string[] {
  const limits: string[] = [];
  const text = workflowSearchText(workflow, task, definition);

  if (workflow.human_review_required && workflow.human_review_reason) {
    limits.push(workflow.human_review_reason);
  }
  if (workflow.data_class === 'A') {
    limits.push('Class A data boundary keeps this workflow under human review.');
  }
  if (task?.type === 'research') {
    limits.push('Research workflows still rely on human judgment for final acceptance.');
  }
  if (includesHumanBoundary(text)) {
    limits.push('Declared approval boundary keeps the final decision with a human operator.');
  }

  return uniqueStrings(limits);
}

export function deriveHumanReviewBurden(
  workflow: Workflow,
  bundle: WorkflowEvidenceBundle,
  task?: Task,
  structuralLimits: string[] = []
): HumanReviewBurden {
  let score = bundle.human_review_events ?? 0;
  if (task?.status === 'blocked') score += 3;
  if (bundle.policy_fail_count > 0) score += 2;
  if (bundle.halt_fail_count > 0) score += 2;
  if (bundle.hidden_cleanup_incidents > 0) score += 2;
  if (workflow.data_class === 'A') score += 2;
  score += structuralLimits.length;

  if (score <= 0) return 'none';
  if (score <= 2) return 'low';
  if (score <= 5) return 'moderate';
  return 'high';
}

function deriveBaseCertification(
  input: AtlasJudgmentInput,
  structuralLimits: string[],
  humanReviewBurden: HumanReviewBurden
): WorkflowCertification {
  const { workflow, evidenceBundle: bundle, task, relatedSignals = [], asOf } = input;
  const successRate = bundle.run_count > 0 ? bundle.successful_run_count / bundle.run_count : 0;

  let certification_status: WorkflowCertification['certification_status'] = 'not_ready';
  let certification_reason =
    'Workflow does not yet have enough corroborated evidence to enter certification.';
  let certified_at: string | null = null;

  // Family-level evidence pooling: when a workflow family has established trust
  // (many successful runs across sibling workflows), lower the individual run
  // threshold. 12 independent successes across a family is stronger evidence
  // than requiring each individual workflow to have 4 runs.
  const familyTrust = input.familyEvidence?.familyTrustEstablished === true;
  const certifiedRunThreshold = familyTrust ? 1 : 4;
  const reviewRunThreshold = familyTrust ? 1 : 3;

  if (
    bundle.evidence_complete &&
    bundle.run_count >= certifiedRunThreshold &&
    successRate >= 0.95 &&
    bundle.policy_fail_count === 0 &&
    bundle.halt_fail_count === 0 &&
    bundle.hidden_cleanup_incidents === 0 &&
    ['none', 'low'].includes(humanReviewBurden)
  ) {
    certification_status = 'certified';
    certified_at = bundle.updated_at;
    certification_reason = familyTrust
      ? 'Family-pooled evidence across sibling workflows supports certified autonomous operation.'
      : 'Repeated clean runs with complete evidence support certified autonomous operation.';
  } else if (
    structuralLimits.length === 0 &&
    bundle.evidence_complete &&
    bundle.run_count >= reviewRunThreshold &&
    successRate >= 0.85 &&
    bundle.policy_fail_count === 0 &&
    bundle.halt_fail_count === 0 &&
    bundle.hidden_cleanup_incidents === 0
  ) {
    certification_status = 'ready_for_review';
    certification_reason = familyTrust
      ? "Family-pooled evidence is strong and this workflow's run quality supports certification review."
      : 'Evidence bundle is complete and run quality is strong enough for certification review.';
  } else if (
    bundle.run_count > 0 ||
    (task?.deliverables?.length ?? 0) > 0 ||
    relatedSignals.length > 0 ||
    Boolean(task?.agent) ||
    Boolean(input.definition)
  ) {
    certification_status = 'candidate';
    certification_reason =
      structuralLimits.length > 0
        ? 'Workflow shows governed activity, but structural autonomy limits keep it in a human-governed lane.'
        : 'Workflow shows governed activity but still needs cleaner repeated evidence.';
  }

  return {
    workflow_id: workflow.workflow_id,
    certification_status,
    certification_reason,
    review_required: certification_status !== 'certified' || humanReviewBurden !== 'none',
    last_evaluated_at: bundle.updated_at,
    certified_at,
    decertified_at: null,
    certified_by: certification_status === 'certified' ? 'atlas-judgment-v1' : null,
    decertified_reason: null,
    next_review_at:
      certification_status === 'certified' || certification_status === 'ready_for_review'
        ? new Date(toEpoch(asOf) + 14 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    certification_version: 'atlas-judgment-v1',
  };
}

export function deriveTemporaryBlockers(
  input: AtlasJudgmentInput,
  certification: WorkflowCertification,
  structuralLimits: string[]
): string[] {
  const { workflow, evidenceBundle: bundle, task } = input;
  const blockers: string[] = [];
  const blockedReason = blockedReasonText(task);

  if (blockedReason) blockers.push(blockedReason);
  const familyTrust = input.familyEvidence?.familyTrustEstablished === true;
  if (bundle.run_count < 2 && structuralLimits.length === 0 && !familyTrust) {
    blockers.push('Need at least two observed runs to stabilize the evidence bundle.');
  }
  if (!bundle.evidence_complete) {
    blockers.push(
      'Add verification or artifact evidence so trust can be judged from more than one source.'
    );
  }
  if (bundle.policy_fail_count > 0) blockers.push('Resolve policy failures before promotion.');
  if (bundle.halt_fail_count > 0)
    blockers.push('Improve halt or escalation behavior before promotion.');
  if (bundle.hidden_cleanup_incidents > 0) {
    blockers.push('Remove hidden cleanup burden before asking for more autonomy.');
  }
  if (certification.certification_status === 'ready_for_review') {
    blockers.push('Schedule human certification review.');
  }
  if (workflow.critical_path && task?.status !== 'done') {
    blockers.push('Critical-path workflow is not yet closed or stabilized.');
  }

  return uniqueStrings(blockers);
}

export function deriveDegradationAssessment(
  input: AtlasJudgmentInput,
  baseCertification: WorkflowCertification,
  humanReviewBurden: HumanReviewBurden
): AtlasDegradationAssessment {
  const { workflow, evidenceBundle: bundle, runSummaries, task } = input;
  const successRate = bundle.run_count > 0 ? bundle.successful_run_count / bundle.run_count : 0;
  const failureSignatureCounts = countFailureSignatures(runSummaries, task);
  const recurringFailureSignature = Array.from(failureSignatureCounts.entries()).find(
    ([, count]) => count >= 2
  );
  const triggers: AtlasDegradationTrigger[] = [];

  if (bundle.failed_run_count >= 2 || (bundle.run_count >= 3 && successRate < 0.6)) {
    triggers.push({
      code: 'repeated_failed_runs',
      summary: 'Repeated failed runs show correctness is no longer stable.',
      severity: 'critical',
    });
  }
  if (bundle.policy_fail_count > 0) {
    triggers.push({
      code: 'policy_failures',
      summary: `${bundle.policy_fail_count} policy failure(s) were observed in the current evidence window.`,
      severity: 'critical',
    });
  }
  if (bundle.halt_fail_count > 0) {
    triggers.push({
      code: 'halt_failures',
      summary: 'Halt or escalation behavior failed inside the evidence window.',
      severity: 'critical',
    });
  }
  if (bundle.hidden_cleanup_incidents > 0) {
    triggers.push({
      code: 'hidden_cleanup',
      summary: 'Hidden downstream cleanup burden is now visible.',
      severity: 'critical',
    });
  }
  if (
    bundle.run_count >= 3 &&
    typeof bundle.avg_duration_ms === 'number' &&
    typeof bundle.p95_duration_ms === 'number' &&
    bundle.p95_duration_ms > bundle.avg_duration_ms * 1.75
  ) {
    triggers.push({
      code: 'latency_instability',
      summary: 'Latency has become unstable relative to the normal run envelope.',
      severity: 'warning',
    });
  }
  if (
    bundle.run_count >= 3 &&
    typeof bundle.avg_cost === 'number' &&
    typeof bundle.p95_cost === 'number' &&
    bundle.p95_cost > bundle.avg_cost * 1.75
  ) {
    triggers.push({
      code: 'cost_instability',
      summary: 'Cost variance has widened enough to question current trust assumptions.',
      severity: 'warning',
    });
  }
  if (
    bundle.run_count >= 2 &&
    (bundle.human_review_events ?? 0) >= Math.max(2, Math.ceil(bundle.run_count * 0.75)) &&
    humanReviewBurden === 'high'
  ) {
    triggers.push({
      code: 'human_review_spike',
      summary: 'Human review load spiked relative to the amount of governed automation.',
      severity: 'warning',
    });
  }
  if (recurringFailureSignature) {
    triggers.push({
      code: 'recurring_failure_signature',
      summary: `Failure signature keeps recurring: ${recurringFailureSignature[0]}.`,
      severity: 'critical',
    });
  }

  const trustWasHigher =
    ['ready_for_review', 'certified'].includes(baseCertification.certification_status) ||
    (bundle.evidence_complete && bundle.run_count >= 3 && successRate >= 0.75) ||
    /certif/i.test(
      [
        workflow.status_reason,
        workflow.notes,
        task?.description,
        ...(task?.comments ?? []).map((comment) => comment.text),
      ]
        .filter(Boolean)
        .join(' ')
    );

  const criticalTriggerCount = triggers.filter((trigger) => trigger.severity === 'critical').length;
  const requires_review = trustWasHigher && (criticalTriggerCount > 0 || triggers.length >= 2);

  return {
    active: triggers.length > 0,
    requires_review,
    triggers,
  };
}

function finalizeCertification(
  input: AtlasJudgmentInput,
  baseCertification: WorkflowCertification,
  degradation: AtlasDegradationAssessment
): WorkflowCertification {
  if (!degradation.requires_review) {
    return baseCertification;
  }

  const decertifiedReason = degradation.triggers.map((trigger) => trigger.summary).join(' ');

  return {
    ...baseCertification,
    certification_status: 'decertified',
    certification_reason: decertifiedReason,
    review_required: true,
    decertified_at: input.evidenceBundle.updated_at,
    decertified_reason: decertifiedReason,
    certified_at: null,
    certified_by: null,
  };
}

function buildEvidenceExplanation(
  input: AtlasJudgmentInput,
  humanReviewBurden: HumanReviewBurden
): string {
  const { evidenceBundle: bundle } = input;
  const evidenceLines = [
    `${bundle.successful_run_count}/${bundle.run_count} successful run(s) in the current window.`,
    `${bundle.policy_fail_count} policy failure(s) and ${bundle.halt_fail_count} halt failure(s).`,
    `Evidence bundle is ${bundle.evidence_complete ? 'complete' : 'still incomplete'}.`,
    `Human review burden is ${humanReviewBurden}.`,
  ];

  if (bundle.hidden_cleanup_incidents > 0) {
    evidenceLines.push(
      `${bundle.hidden_cleanup_incidents} hidden cleanup incident(s) were observed.`
    );
  }

  return evidenceLines.join(' ');
}

function buildBlockersExplanation(temporaryBlockers: string[], structuralLimits: string[]): string {
  if (temporaryBlockers.length === 0 && structuralLimits.length === 0) {
    return 'No material blockers are stopping the current workflow state.';
  }
  if (temporaryBlockers.length === 0) {
    return `Structural limits: ${structuralLimits.join(' ')} This is a durable autonomy boundary, not an almost-ready queue.`;
  }
  if (structuralLimits.length === 0) {
    return `Temporary blockers: ${temporaryBlockers.join(' ')} These are promotable once fixed.`;
  }
  return `Temporary blockers: ${temporaryBlockers.join(' ')} Structural limits: ${structuralLimits.join(' ')} ATLAS is separating fixable blockers from durable autonomy boundaries.`;
}

function buildDegradationExplanation(degradation: AtlasDegradationAssessment): string | null {
  if (!degradation.active) return null;
  return `Degradation triggers: ${degradation.triggers.map((trigger) => trigger.summary).join(' ')}`;
}

function buildRecommendedNextAction(
  certification: WorkflowCertification,
  temporaryBlockers: string[],
  structuralLimits: string[],
  degradation: AtlasDegradationAssessment
): string {
  if (degradation.requires_review) {
    return 'Investigate the regression, clear the failing signals, and requalify the workflow before restoring trust.';
  }
  if (temporaryBlockers.length > 0) {
    return temporaryBlockers[0] ?? 'Resolve the leading temporary blocker.';
  }
  if (structuralLimits.length > 0) {
    return 'Keep this workflow human-governed and stop treating it like a near-term certification candidate.';
  }
  if (certification.certification_status === 'ready_for_review') {
    return 'Run human certification review and decide whether to promote the workflow.';
  }
  if (certification.certification_status === 'certified') {
    return 'Keep monitoring for regression and re-run review on schedule.';
  }
  return 'Gather another clean run plus accepted evidence.';
}

export function deriveEfficiencyDiagnosis(
  bundle: WorkflowEvidenceBundle,
  runSummaries: WorkflowRunSummary[]
): WorkflowEfficiencyDiagnosis {
  const bundleSignals = [
    bundle.avg_tool_call_count,
    bundle.p95_tool_call_count,
    bundle.avg_read_call_count,
    bundle.avg_search_call_count,
    bundle.repeated_read_ratio,
    bundle.avg_cold_start_discovery_ms,
    bundle.avg_time_to_first_meaningful_action_ms,
    bundle.context_bundle_hit_rate,
    bundle.workspace_index_hit_rate,
    bundle.batch_read_utilization,
  ];
  const runSignals = runSummaries.flatMap((summary) => [
    summary.tool_call_count,
    summary.read_call_count,
    summary.search_call_count,
    summary.repeated_read_count,
    summary.context_bundle_hits,
    summary.context_bundle_misses,
    summary.workspace_index_hits,
    summary.workspace_index_misses,
    summary.batch_read_call_count,
    summary.time_to_first_meaningful_action_ms,
  ]);
  const hasEfficiencySignal = [...bundleSignals, ...runSignals].some(
    (value) => value !== null && value !== undefined
  );

  if (bundle.run_count < 2 || !hasEfficiencySignal) {
    return 'unknown';
  }

  if ((bundle.repeated_read_ratio ?? 0) > 0.4) {
    const hitRate = bundle.context_bundle_hit_rate;

    if (hitRate != null && hitRate > 0.5) {
      return 'agent_bound';
    }
    if (hitRate == null || hitRate <= 0.1) {
      return 'platform_bound';
    }
    if (hitRate > 0.1 && hitRate < 0.5) {
      return 'mixed';
    }
  }

  if (bundle.avg_cold_start_discovery_ms != null && bundle.avg_cold_start_discovery_ms > 15000) {
    return 'platform_bound';
  }

  if (
    bundle.batch_read_utilization != null &&
    bundle.batch_read_utilization < 0.1 &&
    bundle.avg_read_call_count != null &&
    bundle.avg_read_call_count > 10
  ) {
    return 'agent_bound';
  }

  return 'unknown';
}

function deriveReadiness(
  input: AtlasJudgmentInput,
  certification: WorkflowCertification,
  temporaryBlockers: string[],
  structuralLimits: string[],
  humanReviewBurden: HumanReviewBurden,
  degradation: AtlasDegradationAssessment,
  state: WorkflowState,
  efficiencyDiagnosis: WorkflowEfficiencyDiagnosis
): WorkflowReadiness {
  const { workflow, evidenceBundle: bundle, runSummaries, asOf, task } = input;
  const successRate = bundle.run_count > 0 ? bundle.successful_run_count / bundle.run_count : 0;
  const degradationExplanation = buildDegradationExplanation(degradation);
  const blockersExplanation = buildBlockersExplanation(temporaryBlockers, structuralLimits);
  const recommendedNextAction = buildRecommendedNextAction(
    certification,
    temporaryBlockers,
    structuralLimits,
    degradation
  );

  let readiness_label: WorkflowReadiness['readiness_label'] = 'emerging';
  let readiness_summary =
    'Workflow has early founder-surface coverage but limited corroborated trust evidence.';

  if (certification.certification_status === 'certified') {
    readiness_label = 'certified';
    readiness_summary = 'Workflow has earned certified autonomous status from repeated clean runs.';
  } else if (degradation.requires_review || certification.certification_status === 'decertified') {
    readiness_label = 'degrading';
    readiness_summary = degradationExplanation ?? certification.certification_reason;
  } else if (structuralLimits.length > 0 && temporaryBlockers.length === 0) {
    readiness_label = 'emerging';
    readiness_summary =
      'Workflow has governed coverage, but structural limits keep final trust with a human operator.';
  } else if (task?.status === 'blocked' || (temporaryBlockers.length > 0 && successRate < 0.5)) {
    readiness_label = 'blocked';
    readiness_summary = temporaryBlockers[0] ?? 'Workflow is blocked and needs intervention.';
  } else if (certification.certification_status === 'ready_for_review') {
    readiness_label = 'near_ready';
    readiness_summary = certification.certification_reason;
  } else if (certification.certification_status === 'candidate' && successRate >= 0.5) {
    readiness_label = 'advancing';
    readiness_summary = 'Workflow is accumulating enough governed evidence to move toward review.';
  }

  const efficiencyNote =
    efficiencyDiagnosis === 'agent_bound'
      ? 'Execution drag appears agent-bound — consider tighter workflow instructions.'
      : efficiencyDiagnosis === 'platform_bound'
        ? 'Execution drag appears platform-bound — routed to Candyland backlog.'
        : efficiencyDiagnosis === 'mixed'
          ? 'Execution drag has both agent and platform factors.'
          : null;

  if (efficiencyNote) {
    readiness_summary = `${readiness_summary} ${efficiencyNote}`;
  }

  const stateExplanation = (() => {
    switch (state) {
      case 'certified_autonomous':
        return `${workflow.name} is ${humanizeState(state)} because repeated clean runs, complete evidence, and acceptable control behavior have been observed.`;
      case 'under_review':
        return `${workflow.name} is ${humanizeState(state)} because ATLAS detected trust regression that now needs review.`;
      case 'certifying':
        return `${workflow.name} is ${humanizeState(state)} because the evidence bundle is strong enough to justify formal certification review.`;
      case 'governed_copilot':
        return `${workflow.name} is ${humanizeState(state)} because controls and evidence are real, but promotion conditions are not fully met.`;
      case 'assisted':
        return `${workflow.name} is ${humanizeState(state)} because AI is contributing, but governed evidence is still thin.`;
      default:
        return `${workflow.name} is ${humanizeState(state)} because the work is still primarily human-run.`;
    }
  })();

  const promotionBase = clampNumber(
    (bundle.run_count > 0 ? bundle.successful_run_count / bundle.run_count : 0) +
      (bundle.evidence_complete ? 0.2 : 0) -
      structuralLimits.length * 0.25 -
      temporaryBlockers.length * 0.1,
    0,
    1
  );
  const degradationBase = clampNumber(
    degradation.triggers.reduce(
      (acc, trigger) => acc + (trigger.severity === 'critical' ? 0.3 : 0.15),
      0
    ),
    0,
    1
  );

  return {
    workflow_id: workflow.workflow_id,
    readiness_label,
    readiness_summary,
    temporary_blockers: temporaryBlockers,
    structural_limits: structuralLimits,
    top_failure_signatures: topFailureSignatures(runSummaries, task),
    human_review_burden: humanReviewBurden,
    updated_at: maxIso(
      [bundle.updated_at, certification.last_evaluated_at, workflow.updated_at],
      asOf
    ),
    recommended_next_action: recommendedNextAction,
    promotion_confidence: Number(promotionBase.toFixed(2)),
    degradation_confidence: Number(degradationBase.toFixed(2)),
    state_explanation: stateExplanation,
    blockers_explanation: blockersExplanation,
    degradation_explanation: degradationExplanation,
  };
}

function deriveWorkflowState(
  input: AtlasJudgmentInput,
  certification: WorkflowCertification,
  degradation: AtlasDegradationAssessment
): WorkflowState {
  const { evidenceBundle: bundle, task, definition } = input;

  if (certification.certification_status === 'certified') {
    return 'certified_autonomous';
  }
  if (degradation.requires_review || certification.certification_status === 'decertified') {
    return 'under_review';
  }
  if (certification.certification_status === 'ready_for_review') {
    return 'certifying';
  }
  if (
    bundle.run_count > 0 ||
    (task?.verificationSteps?.length ?? 0) > 0 ||
    (task?.deliverables?.length ?? 0) > 0 ||
    Boolean(definition)
  ) {
    return 'governed_copilot';
  }
  if (Boolean(task?.agent) || Boolean(task?.attempt) || Boolean(task?.automation?.sessionKey)) {
    return 'assisted';
  }
  return 'human_native';
}

function finalizeWorkflow(
  input: AtlasJudgmentInput,
  state: WorkflowState,
  readiness: WorkflowReadiness
): Workflow {
  const { workflow, evidenceBundle: bundle } = input;
  const humanReviewRequired =
    readiness.human_review_burden !== 'none' || readiness.structural_limits.length > 0;

  return {
    ...workflow,
    state,
    status_reason: readiness.state_explanation ?? readiness.readiness_summary,
    updated_at: maxIso(
      [workflow.updated_at, bundle.updated_at, readiness.updated_at],
      workflow.updated_at
    ),
    human_review_required: humanReviewRequired,
    human_review_reason:
      readiness.structural_limits[0] ??
      (humanReviewRequired
        ? `${readiness.human_review_burden} review burden still present.`
        : null),
    notes: readiness.blockers_explanation,
  };
}

export function judgeWorkflowForFounderSurface(input: AtlasJudgmentInput): AtlasWorkflowJudgment {
  const efficiencyDiagnosis = deriveEfficiencyDiagnosis(input.evidenceBundle, input.runSummaries);
  const structuralLimits = deriveStructuralLimits(input.workflow, input.task, input.definition);
  const humanReviewBurden = deriveHumanReviewBurden(
    input.workflow,
    input.evidenceBundle,
    input.task,
    structuralLimits
  );
  const baseCertification = deriveBaseCertification(input, structuralLimits, humanReviewBurden);
  const temporaryBlockers = deriveTemporaryBlockers(input, baseCertification, structuralLimits);
  const degradation = deriveDegradationAssessment(input, baseCertification, humanReviewBurden);
  const certification = finalizeCertification(input, baseCertification, degradation);
  const state = deriveWorkflowState(input, certification, degradation);
  const readiness = deriveReadiness(
    input,
    certification,
    temporaryBlockers,
    structuralLimits,
    humanReviewBurden,
    degradation,
    state,
    efficiencyDiagnosis
  );
  const workflow = finalizeWorkflow(input, state, readiness);

  return {
    workflow,
    certification,
    readiness,
    efficiency_diagnosis: efficiencyDiagnosis,
    explanation: {
      current_state: readiness.state_explanation ?? readiness.readiness_summary,
      blockers:
        readiness.blockers_explanation ??
        'No material blockers are stopping the current workflow state.',
      degradation: readiness.degradation_explanation ?? null,
      evidence: buildEvidenceExplanation(input, humanReviewBurden),
      next_action:
        readiness.recommended_next_action ?? 'Gather another clean run plus accepted evidence.',
    },
    degradation,
  };
}
