import type {
  AgentCertificationSummary,
  AnyTelemetryEvent,
  CompletionTruthOverlay,
  CompletionTruthState,
  CompletionTruthSurface,
  FounderAttentionItem,
  FounderAttentionKind,
  FounderAttentionSeverity,
  FounderAttentionConstraintKind,
  FounderAttentionTarget,
  FounderAttentionResolutionOwner,
  FounderSurfaceActionVerb,
  FounderSurfaceAgentCertificationView,
  FounderSurfaceAttentionCategory,
  FounderSurfaceAttentionSummary,
  FounderSurfaceCertificationPipeline,
  FounderSurfaceExecutiveOverview,
  FounderSurfaceNewlyCompleteItem,
  FounderSurfaceOverviewAttentionItem,
  FounderSurfacePrimaryNumber,
  FounderSurfaceSnapshot,
  FounderSurfaceSummaryStrip,
  FounderSurfaceVentureCoverageEntry,
  FounderSurfaceVentureCoverageView,
  FounderSurfaceVentureRate,
  FounderSurfaceWorkflowDetail,
  FounderSurfaceWorkflowTrustSummary,
  HumanReviewBurden,
  OperatorInterventionReceipt,
  RunCompletedEvent,
  RunErrorEvent,
  RunStartedEvent,
  Task,
  TokenTelemetryEvent,
  VentureCoverage,
  Workflow,
  WorkflowCertification,
  WorkflowDataClass,
  WorkflowEvidenceBundle,
  WorkflowFamily,
  WorkflowPolicyResult,
  WorkflowReadiness,
  WorkflowRiskClass,
  WorkflowRunSummary,
  WorkflowState,
} from '@veritas-kanban/shared';
import type { WorkflowDefinition, WorkflowRun as EngineWorkflowRun } from '../types/workflow.js';
import { getTaskService, type TaskService } from './task-service.js';
import { getTelemetryService, type TelemetryService } from './telemetry-service.js';
import { getWorkflowRunService, type WorkflowRunService } from './workflow-run-service.js';
import { getWorkflowService, type WorkflowService } from './workflow-service.js';
import {
  operatorInterventionService,
  type OperatorInterventionService,
} from './operator-intervention-service.js';
import {
  judgeWorkflowForFounderSurface,
  summarizeAgentCertificationsForAtlas,
  type FamilyEvidence,
} from './atlas-judgment-service.js';

export interface FounderSurfaceSourceBundle {
  tasks: Task[];
  telemetryEvents: AnyTelemetryEvent[];
  workflowRuns: EngineWorkflowRun[];
  workflowDefinitions: WorkflowDefinition[];
  operatorInterventions?: OperatorInterventionReceipt[];
  asOf?: string;
}

export interface FounderSurfaceReadModelServiceOptions {
  taskService?: Pick<TaskService, 'listTasks'>;
  telemetryService?: Pick<TelemetryService, 'getEvents'>;
  workflowRunService?: Pick<WorkflowRunService, 'listRuns'>;
  workflowService?: Pick<WorkflowService, 'listWorkflows'>;
  operatorInterventionService?: Pick<OperatorInterventionService, 'listReceipts'>;
}

interface WorkflowContext {
  workflow: Workflow;
  task?: Task;
  definition?: WorkflowDefinition;
}

interface RelatedSignals {
  signals: AnyTelemetryEvent[];
  windowStart: string;
  windowEnd: string;
}

const RUN_MATCH_WINDOW_MS = 60 * 60 * 1000;
const CRITICAL_WORDS = ['critical', 'payment', 'billing', 'prod', 'security', 'auth', 'permission'];
const HIGH_RISK_WORDS = ['compliance', 'policy', 'approval', 'client', 'certification', 'holdco'];
const DATA_CLASS_A_WORDS = ['auth', 'credential', 'permission', 'security', 'billing', 'finance'];
const DATA_CLASS_B_WORDS = ['client', 'retention', 'logistics', 'holdco', 'venture'];
const CLEANUP_WORDS = ['cleanup', 'backfill', 'drift', 'stale', 'mismatch', 'manual'];
const HANDOFF_OVERDUE_WINDOW_MS = 5 * 60_000;
const BLOCKED_OVERDUE_WINDOW_MS = 12 * 60 * 60 * 1000;
const IN_PROGRESS_OVERDUE_WINDOW_MS = 24 * 60 * 60 * 1000;
const NEWLY_COMPLETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_COMPLETED_REVIEW_WINDOW_MS = 48 * 60 * 60 * 1000;
const FOUNDER_DECISION_WORDS = [
  'founder approval',
  'founder decision',
  'founder override',
  'approval',
  'approve',
  'decision',
  'decide',
  'signoff',
  'sign-off',
  'override',
];
const TRUTH_DRIFT_WORDS = [
  'truth drift',
  'stale telemetry',
  'stale registry',
  'board normalization',
  'timer mismatch',
  'registry mismatch',
  'truth mismatch',
  'board truth',
  'channel truth',
];
const INTERNAL_GATE_WORDS = [
  'ack',
  'plan',
  'eta',
  'run_id',
  'closeout',
  'deliverable',
  'handoff',
  'follow-through',
];

function normalizeSlug(value: string | undefined | null, fallback: string): string {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function workflowIdFromTask(task: Task): string {
  return task.id;
}

function workflowIdFromDefinition(definition: WorkflowDefinition): string {
  return normalizeSlug(definition.id, 'workflow-definition');
}

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

function minIso(values: Array<string | undefined | null>, fallback: string): string {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (filtered.length === 0) return fallback;
  return filtered.reduce((earliest, value) =>
    toEpoch(value) < toEpoch(earliest) ? value : earliest
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? null;
}

function isRecentIso(value: string | undefined | null, windowMs: number, asOf: string): boolean {
  if (!value) return false;
  const ts = toEpoch(value);
  return ts > 0 && toEpoch(asOf) - ts <= windowMs;
}

function minutesBetween(start: string | undefined | null, end: string): number | null {
  const startTs = toEpoch(start);
  const endTs = toEpoch(end);
  if (startTs <= 0 || endTs <= 0 || endTs < startTs) return null;
  return Math.max(0, Math.floor((endTs - startTs) / 60_000));
}

function formatAgeLabel(minutes: number | null): string {
  if (minutes === null) return 'recently';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function includesAny(haystack: string, words: string[]): boolean {
  const normalized = haystack.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function taskSearchText(task: Task): string {
  const blockedReason =
    task.blockedReason && typeof task.blockedReason === 'object'
      ? `${task.blockedReason.category} ${task.blockedReason.note ?? ''}`
      : '';

  return [
    task.title,
    task.description,
    task.project,
    task.type,
    blockedReason,
    ...(task.comments ?? []).map((comment) => comment.text),
    ...(task.deliverables ?? []).map((deliverable) => deliverable.title),
    ...(task.subtasks ?? []).map((subtask) => subtask.title),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function inferWorkflowFamily(task: Task): WorkflowFamily {
  const text = taskSearchText(task);

  if (text.includes('retention')) return 'retention_execution';
  if (text.includes('handoff') || text.includes('routing')) return 'handoff_routing';
  if (text.includes('reconcile') || text.includes('completion')) return 'completion_reconciliation';
  if (text.includes('compliance') || text.includes('review')) return 'compliance_review';
  if (text.includes('incident') || text.includes('outage') || text.includes('blocker')) {
    return 'incident_response';
  }
  if (text.includes('quality') || text.includes('qa') || text.includes('verification')) {
    return 'quality_assurance';
  }
  if (text.includes('governance') || text.includes('policy') || text.includes('audit')) {
    return 'governance';
  }
  if (text.includes('content') || text.includes('copy')) return 'content_production';
  if (text.includes('classification')) return 'classification';
  if (text.includes('automation') || text.includes('telemetry') || text.includes('observability')) {
    return 'automation_control';
  }
  if (task.type === 'research') return 'research';
  if (['code', 'feature', 'bug'].includes(task.type)) return 'implementation';
  if (['ops', 'system', 'automation'].includes(task.type)) return 'operations';

  return 'operations';
}

function inferDefinitionWorkflowFamily(definition: WorkflowDefinition): WorkflowFamily {
  const text = `${definition.id} ${definition.name} ${definition.description}`.toLowerCase();
  if (text.includes('reconcile') || text.includes('completion')) return 'completion_reconciliation';
  if (text.includes('health') || text.includes('observability')) return 'automation_control';
  if (text.includes('audit') || text.includes('policy')) return 'governance';
  if (text.includes('classify')) return 'classification';
  if (text.includes('handoff') || text.includes('route')) return 'handoff_routing';
  return 'operations';
}

function inferRiskClassFromText(
  text: string,
  fallback: WorkflowRiskClass = 'moderate'
): WorkflowRiskClass {
  if (includesAny(text, CRITICAL_WORDS)) return 'critical';
  if (includesAny(text, HIGH_RISK_WORDS)) return 'high';
  if (text.includes('research')) return 'low';
  return fallback;
}

function inferWorkflowRiskClass(task: Task, family: WorkflowFamily): WorkflowRiskClass {
  const text = taskSearchText(task);
  if (task.priority === 'critical') return 'critical';
  if (task.priority === 'high')
    return inferRiskClassFromText(text, family === 'research' ? 'moderate' : 'high');
  return inferRiskClassFromText(text, family === 'research' ? 'low' : 'moderate');
}

function inferDefinitionRiskClass(
  definition: WorkflowDefinition,
  family: WorkflowFamily
): WorkflowRiskClass {
  const text = `${definition.id} ${definition.name} ${definition.description}`.toLowerCase();
  return inferRiskClassFromText(text, family === 'governance' ? 'high' : 'moderate');
}

function inferDataClass(task: Task): WorkflowDataClass {
  const text = taskSearchText(task);
  if (includesAny(text, DATA_CLASS_A_WORDS)) return 'A';
  if (includesAny(text, DATA_CLASS_B_WORDS)) return 'B';
  return 'C';
}

function inferDefinitionDataClass(definition: WorkflowDefinition): WorkflowDataClass {
  const text = `${definition.id} ${definition.name} ${definition.description}`.toLowerCase();
  if (includesAny(text, DATA_CLASS_A_WORDS)) return 'A';
  if (includesAny(text, DATA_CLASS_B_WORDS)) return 'B';
  return 'C';
}

function extractSuccessCriteria(task: Task): string[] {
  const criteria = [
    ...(task.verificationSteps ?? []).map((step) => step.description),
    ...(task.subtasks ?? []).flatMap((subtask) => subtask.acceptanceCriteria ?? [subtask.title]),
    ...(task.deliverables ?? []).map((deliverable) => `Deliver ${deliverable.title}`),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (criteria.length > 0) {
    return Array.from(new Set(criteria));
  }

  return [`Complete ${task.title}`, 'Preserve observable board truth'];
}

function extractDefinitionSuccessCriteria(definition: WorkflowDefinition): string[] {
  const criteria = definition.steps
    .flatMap((step) => step.acceptance_criteria ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (criteria.length > 0) {
    return Array.from(new Set(criteria));
  }

  return definition.steps.map((step) => `Complete ${step.name}`);
}

function inferDefinitionVenture(definition: WorkflowDefinition): string {
  const text = `${definition.id} ${definition.name}`.toLowerCase();
  if (text.includes('klaviyo') || text.includes('retention')) return 'nxt-klaviyo-retention';
  if (text.includes('lod') || text.includes('logistics')) return 'nxt-lod-logistics';
  if (text.includes('holdco')) return 'nxt-holdco-ops';
  if (text.includes('lab') || text.includes('vos') || text.includes('veritas'))
    return 'lab-vos-system';
  return 'eng-dev-factory';
}

function inferTaskOwner(task: Task): string {
  return task.agent ?? task.attempt?.agent ?? task.attempts?.[0]?.agent ?? 'unassigned';
}

function inferDefinitionOwner(definition: WorkflowDefinition): string {
  return definition.agents[0]?.id ?? 'workflow-engine';
}

function inferCriticalPath(task: Task): boolean {
  return task.priority === 'high' || task.priority === 'critical';
}

function inferDefinitionCriticalPath(definition: WorkflowDefinition): boolean {
  const text = `${definition.id} ${definition.name}`.toLowerCase();
  return text.includes('truth') || text.includes('health') || text.includes('reconcile');
}

function collectEscalationModes(task: Task): string[] {
  const modes = ['human_review'];
  if (task.blockedReason) modes.push('task_block');
  if (task.priority === 'critical' || task.priority === 'high') modes.push('founder_decision');
  if (task.automation?.sessionKey) modes.push('thread_escalation');
  return Array.from(new Set(modes));
}

function collectDefinitionEscalationModes(definition: WorkflowDefinition): string[] {
  const modes = new Set<string>();
  for (const step of definition.steps) {
    const escalateTo = step.on_fail?.escalate_to;
    if (escalateTo === 'human') modes.add('human_review');
    if (escalateTo === 'skip') modes.add('skip');
    if (typeof escalateTo === 'string' && escalateTo.startsWith('agent:')) {
      modes.add('agent_escalation');
    }
  }

  return Array.from(modes.size > 0 ? modes : new Set(['human_review']));
}

function buildBaseWorkflowFromTask(task: Task): WorkflowContext {
  const workflowFamily = inferWorkflowFamily(task);
  const workflow: Workflow = {
    workflow_id: workflowIdFromTask(task),
    name: task.title,
    venture_id: normalizeSlug(task.project, 'unassigned-venture'),
    workflow_family: workflowFamily,
    description: task.description?.trim() || task.title,
    owner_agent: inferTaskOwner(task),
    critical_path: inferCriticalPath(task),
    risk_class: inferWorkflowRiskClass(task, workflowFamily),
    data_class: inferDataClass(task),
    state: 'human_native',
    status_reason: 'Awaiting autonomy evidence derivation.',
    success_criteria: extractSuccessCriteria(task),
    created_at: task.created,
    updated_at: task.updated,
    current_task_id: task.id,
    current_thread_id: task.automation?.sessionKey ?? null,
    overlay_id: task.project ?? null,
    allowed_escalation_modes: collectEscalationModes(task),
    human_review_required: false,
    human_review_reason: null,
    notes: null,
  };

  return { workflow, task };
}

function buildBaseWorkflowFromDefinition(
  definition: WorkflowDefinition,
  asOf: string
): WorkflowContext {
  const workflowFamily = inferDefinitionWorkflowFamily(definition);
  const workflow: Workflow = {
    workflow_id: workflowIdFromDefinition(definition),
    name: definition.name,
    venture_id: inferDefinitionVenture(definition),
    workflow_family: workflowFamily,
    description: definition.description?.trim() || definition.name,
    owner_agent: inferDefinitionOwner(definition),
    critical_path: inferDefinitionCriticalPath(definition),
    risk_class: inferDefinitionRiskClass(definition, workflowFamily),
    data_class: inferDefinitionDataClass(definition),
    state: 'governed_copilot',
    status_reason: 'Derived from live workflow definition; evidence bundle pending.',
    success_criteria: extractDefinitionSuccessCriteria(definition),
    created_at: asOf,
    updated_at: asOf,
    current_task_id: null,
    current_thread_id: null,
    overlay_id: inferDefinitionVenture(definition),
    allowed_escalation_modes: collectDefinitionEscalationModes(definition),
    human_review_required: definition.steps.some((step) => step.on_fail?.escalate_to === 'human'),
    human_review_reason: definition.steps.some((step) => step.on_fail?.escalate_to === 'human')
      ? 'Workflow definition routes failures to human review.'
      : null,
    notes: `Workflow definition ${definition.id} contributes founder-surface registry coverage.`,
  };

  return { workflow, definition };
}

function isRunStartedEvent(event: AnyTelemetryEvent): event is RunStartedEvent {
  return event.type === 'run.started';
}

function isRunCompletedEvent(event: AnyTelemetryEvent): event is RunCompletedEvent {
  return event.type === 'run.completed';
}

function isRunErrorEvent(event: AnyTelemetryEvent): event is RunErrorEvent {
  return event.type === 'run.error';
}

function isTokenEvent(event: AnyTelemetryEvent): event is TokenTelemetryEvent {
  return event.type === 'run.tokens';
}

function isSignalEvent(event: AnyTelemetryEvent): boolean {
  return event.type.startsWith('signal.');
}

function signalSeverity(event: AnyTelemetryEvent): string {
  return isSignalEvent(event) && 'severity' in event && typeof event.severity === 'string'
    ? event.severity.toLowerCase()
    : '';
}

function signalSummary(event: AnyTelemetryEvent): string {
  return isSignalEvent(event) && 'summary' in event && typeof event.summary === 'string'
    ? event.summary.toLowerCase()
    : '';
}

function signalClassification(event: AnyTelemetryEvent): string {
  return isSignalEvent(event) &&
    'classification' in event &&
    typeof event.classification === 'string'
    ? event.classification.toLowerCase()
    : '';
}

function isSignalCompletionEvent(event: AnyTelemetryEvent): boolean {
  return event.type === 'signal.completion';
}

function normalizeCompletionTruthState(
  value: string | undefined | null
): CompletionTruthState | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized.includes('verified') ||
    normalized.includes('pass') ||
    normalized.includes('complete') ||
    normalized.includes('success') ||
    normalized.includes('reconciled')
  ) {
    return 'verified';
  }
  if (
    normalized.includes('risk') ||
    normalized.includes('fail') ||
    normalized.includes('missing') ||
    normalized.includes('drift') ||
    normalized.includes('incomplete')
  ) {
    return 'at_risk';
  }
  return 'pending';
}

function normalizeCompletionTruthSurface(
  value: string | undefined | null
): CompletionTruthSurface | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('artifact')) return 'artifact';
  if (normalized.includes('board') || normalized.includes('veritas')) return 'board';
  if (normalized.includes('channel')) return 'channel';
  if (normalized.includes('evidence') || normalized.includes('verification')) return 'evidence';
  return null;
}

function signalPayload(event: AnyTelemetryEvent): Record<string, unknown> | null {
  if (!isSignalEvent(event) || !('payload' in event)) return null;
  const payload = event.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function completionSignalMissingSurfaces(
  event: AnyTelemetryEvent | null | undefined
): CompletionTruthSurface[] {
  if (!event || !isSignalCompletionEvent(event)) return [];
  const payload = signalPayload(event);
  const rawSurfaces = [
    ...(('missingSurfaces' in event && Array.isArray(event.missingSurfaces)
      ? event.missingSurfaces
      : []) as string[]),
    ...stringArrayFromUnknown(payload?.missingSurfaces),
    ...stringArrayFromUnknown(payload?.missing_surfaces),
  ];

  return Array.from(
    new Set(
      rawSurfaces
        .map((surface) => normalizeCompletionTruthSurface(surface))
        .filter((surface): surface is CompletionTruthSurface => Boolean(surface))
    )
  );
}

function latestCompletionSignal(relatedSignals: AnyTelemetryEvent[]): AnyTelemetryEvent | null {
  return (
    relatedSignals
      .filter((event) => isSignalCompletionEvent(event))
      .sort((a, b) => toEpoch(b.timestamp) - toEpoch(a.timestamp))[0] ?? null
  );
}

function allVerificationStepsChecked(task?: Task): boolean {
  const steps = task?.verificationSteps ?? [];
  return steps.length > 0 && steps.every((step) => step.checked);
}

function hasAcceptedArtifact(task?: Task, bundle?: WorkflowEvidenceBundle): boolean {
  const deliverables = task?.deliverables ?? [];
  const acceptedDeliverables = deliverables.filter(
    (deliverable) => deliverable.status === 'accepted' || deliverable.status === 'reviewed'
  );
  return acceptedDeliverables.length > 0 || (bundle?.linked_artifacts?.length ?? 0) > 0;
}

function surfaceStatus(
  state: CompletionTruthState,
  summary: string,
  sources: Array<string | undefined | null>
): CompletionTruthOverlay['artifact'] {
  return {
    state,
    summary,
    sources: uniqueStrings(sources),
  };
}

export interface CompletionTruthOverlayInput {
  task?: Task;
  evidenceBundle?: WorkflowEvidenceBundle;
  relatedSignals?: AnyTelemetryEvent[];
  asOf: string;
}

export function deriveCompletionTruthOverlay({
  task,
  evidenceBundle,
  relatedSignals = [],
  asOf,
}: CompletionTruthOverlayInput): CompletionTruthOverlay {
  const doneOnBoard = task?.status === 'done';
  const latestSignal = latestCompletionSignal(relatedSignals);
  const latestSignalClassification = latestSignal ? signalClassification(latestSignal) : '';
  const latestSignalState = normalizeCompletionTruthState(latestSignalClassification);
  const missingSurfaceSet = new Set(completionSignalMissingSurfaces(latestSignal));
  const acceptedArtifact = hasAcceptedArtifact(task, evidenceBundle);
  const evidenceEstablished =
    Boolean(evidenceBundle?.evidence_complete) ||
    allVerificationStepsChecked(task) ||
    task?.review?.decision === 'approved';

  const board = !doneOnBoard
    ? surfaceStatus('pending', 'Board truth does not yet show this task as done.', [
        `task.status:${task?.status ?? 'unknown'}`,
      ])
    : missingSurfaceSet.has('board') || latestSignalState === 'at_risk'
      ? surfaceStatus(
          'at_risk',
          'Board says done, but Veritas completion truth does not fully corroborate it.',
          [
            `task.status:${task?.status}`,
            latestSignal?.id ? `signal.completion:${latestSignal.id}` : null,
          ]
        )
      : surfaceStatus('verified', 'Board truth marks this task done.', [
          `task.status:${task?.status}`,
          latestSignal?.id ? `signal.completion:${latestSignal.id}` : null,
        ]);

  const artifact = missingSurfaceSet.has('artifact')
    ? surfaceStatus(
        doneOnBoard ? 'at_risk' : 'pending',
        doneOnBoard
          ? 'Artifact truth is explicitly missing from the latest completion signal.'
          : 'Artifact truth is not established yet.',
        [
          task?.deliverables?.length ? `deliverables:${task.deliverables.length}` : null,
          latestSignal?.id ? `signal.completion:${latestSignal.id}` : null,
        ]
      )
    : acceptedArtifact
      ? surfaceStatus('verified', 'Accepted artifact truth is present.', [
          task?.deliverables?.length ? `deliverables:${task.deliverables.length}` : null,
          evidenceBundle?.linked_artifacts?.length
            ? `linked_artifacts:${evidenceBundle.linked_artifacts.length}`
            : null,
        ])
      : surfaceStatus(
          doneOnBoard ? 'at_risk' : 'pending',
          doneOnBoard
            ? 'Task is done on the board, but accepted artifact truth is missing.'
            : 'Artifact truth is still pending.',
          [task?.deliverables?.length ? `deliverables:${task.deliverables.length}` : null]
        );

  const evidence = missingSurfaceSet.has('evidence')
    ? surfaceStatus(
        doneOnBoard ? 'at_risk' : 'pending',
        doneOnBoard
          ? 'Evidence truth is explicitly missing from the latest completion signal.'
          : 'Evidence truth is not established yet.',
        [
          evidenceBundle?.evidence_complete ? 'bundle.evidence_complete:true' : null,
          latestSignal?.id ? `signal.completion:${latestSignal.id}` : null,
        ]
      )
    : evidenceEstablished
      ? surfaceStatus(
          'verified',
          'Evidence truth is established from verification, review, or the evidence bundle.',
          [
            evidenceBundle?.evidence_complete ? 'bundle.evidence_complete:true' : null,
            allVerificationStepsChecked(task)
              ? `verification_steps:${task?.verificationSteps?.length ?? 0}/${task?.verificationSteps?.length ?? 0}`
              : null,
            task?.review?.decision ? `review.decision:${task.review.decision}` : null,
          ]
        )
      : surfaceStatus(
          doneOnBoard ? 'at_risk' : 'pending',
          doneOnBoard
            ? 'Task is done on the board, but evidence truth is still missing.'
            : 'Evidence truth is still pending.',
          [
            task?.verificationSteps?.length
              ? `verification_steps:${task.verificationSteps.length}`
              : null,
          ]
        );

  const channelEstablished =
    Boolean(latestSignal) && latestSignalState === 'verified' && !missingSurfaceSet.has('channel');
  const channel = channelEstablished
    ? surfaceStatus(
        'verified',
        'Channel truth is explicitly established by the latest completion signal.',
        [
          latestSignal?.id ? `signal.completion:${latestSignal.id}` : null,
          latestSignalClassification ? `classification:${latestSignalClassification}` : null,
        ]
      )
    : surfaceStatus(
        doneOnBoard ? 'at_risk' : 'pending',
        doneOnBoard
          ? 'Task is done on the board, but channel truth is not explicitly established.'
          : 'Channel truth is still pending.',
        [latestSignal?.id ? `signal.completion:${latestSignal.id}` : null]
      );

  const surfaceMap: Record<CompletionTruthSurface, ReturnType<typeof surfaceStatus>> = {
    artifact,
    board,
    channel,
    evidence,
  };
  const missing_surfaces = (
    ['artifact', 'board', 'channel', 'evidence'] as CompletionTruthSurface[]
  ).filter((surface) => surfaceMap[surface].state !== 'verified');
  const blockers = missing_surfaces.map((surface) => surfaceMap[surface].summary);

  const state: CompletionTruthState = !doneOnBoard
    ? 'pending'
    : missing_surfaces.length === 0
      ? 'verified'
      : 'at_risk';

  const summary =
    state === 'verified'
      ? 'Completion is verified across board, artifact, channel, and evidence truth.'
      : state === 'pending'
        ? 'Completion is still pending because board truth does not yet show the task as done.'
        : `Completion is at risk: ${blockers.join(' ')}`;

  return {
    state,
    summary,
    checked_at: maxIso(
      [asOf, task?.updated, evidenceBundle?.updated_at, latestSignal?.timestamp],
      asOf
    ),
    blockers,
    missing_surfaces,
    artifact,
    board,
    channel,
    evidence,
    latest_signal_id: latestSignal?.id ?? null,
    latest_signal_classification: latestSignal ? signalClassification(latestSignal) || null : null,
  };
}

function toTaskSignalMap(events: AnyTelemetryEvent[]): Map<string, AnyTelemetryEvent[]> {
  const map = new Map<string, AnyTelemetryEvent[]>();
  for (const event of events) {
    if (!event.taskId || !isSignalEvent(event)) continue;
    const existing = map.get(event.taskId) ?? [];
    existing.push(event);
    map.set(event.taskId, existing);
  }
  return map;
}

function matchKey(taskId: string, agent: string, attemptId?: string): string {
  return `${taskId}::${agent}::${attemptId ?? 'no-attempt'}`;
}

function extractFailureSignature(value: string | undefined | null): string | null {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function getRelatedSignals(
  taskId: string,
  endTimestamp: string,
  signalMap: Map<string, AnyTelemetryEvent[]>,
  startTimestamp?: string
): RelatedSignals {
  const taskSignals = signalMap.get(taskId) ?? [];
  const end = toEpoch(endTimestamp);
  const start = toEpoch(startTimestamp, end - RUN_MATCH_WINDOW_MS);

  const signals = taskSignals.filter((event) => {
    const eventTime = toEpoch(event.timestamp);
    return eventTime >= start - RUN_MATCH_WINDOW_MS && eventTime <= end + RUN_MATCH_WINDOW_MS;
  });

  return {
    signals,
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(end).toISOString(),
  };
}

function inferPolicyResult(success: boolean, signals: AnyTelemetryEvent[]): WorkflowPolicyResult {
  if (signals.some((event) => event.type === 'signal.dispatch_blocked')) return 'fail';
  if (
    signals.some(
      (event) => signalSeverity(event) === 'critical' || signalSeverity(event) === 'action_required'
    )
  ) {
    return 'fail';
  }
  return success ? 'pass' : 'unknown';
}

function inferHaltResult(
  success: boolean,
  signals: AnyTelemetryEvent[],
  task?: Task
): WorkflowPolicyResult {
  const blocked = task?.status === 'blocked';
  const haltFailure = signals.some((event) => {
    const summary = signalSummary(event);
    const classification = signalClassification(event);
    return (
      summary.includes('halt') || summary.includes('escalat') || classification.includes('blocked')
    );
  });

  if (blocked || haltFailure) return 'fail';
  return success ? 'pass' : 'unknown';
}

function verificationCoverage(task?: Task): number {
  if (!task) return 0;
  if ((task.verificationSteps?.length ?? 0) > 0) {
    const checked = (task.verificationSteps ?? []).filter((step) => step.checked).length;
    return checked / (task.verificationSteps?.length ?? 1);
  }
  if ((task.subtasks?.length ?? 0) > 0) {
    const completed = (task.subtasks ?? []).filter((subtask) => subtask.completed).length;
    return completed / (task.subtasks?.length ?? 1);
  }
  return 0;
}

function artifactCoverage(task?: Task): number {
  if (!task || (task.deliverables?.length ?? 0) === 0) return 0;
  const accepted = (task.deliverables ?? []).filter(
    (deliverable) => deliverable.status === 'accepted' || deliverable.status === 'reviewed'
  ).length;
  return accepted / (task.deliverables?.length ?? 1);
}

function estimateRunQuality(
  task: Task | undefined,
  success: boolean,
  signals: AnyTelemetryEvent[]
): number {
  const signalPenalty = signals.some((event) => event.type === 'signal.dispatch_blocked') ? 0.2 : 0;
  const verification = verificationCoverage(task);
  const artifacts = artifactCoverage(task);
  const raw = (success ? 0.65 : 0.15) + verification * 0.2 + artifacts * 0.15 - signalPenalty;
  return Number(clampNumber(raw * 100, 0, 100).toFixed(2));
}

function relatedTokenEvents(
  events: AnyTelemetryEvent[],
  taskId: string,
  agent: string,
  startedAt: string,
  finishedAt: string,
  attemptId?: string
): TokenTelemetryEvent[] {
  const start = toEpoch(startedAt);
  const end = toEpoch(finishedAt);

  return events.filter((event): event is TokenTelemetryEvent => {
    if (!isTokenEvent(event)) return false;
    if (event.taskId !== taskId || event.agent !== agent) return false;
    const eventTime = toEpoch(event.timestamp);
    if (eventTime < start || eventTime > end + RUN_MATCH_WINDOW_MS) return false;
    if (attemptId && event.attemptId && event.attemptId !== attemptId) return false;
    return true;
  });
}

function collectRunSummaries(
  source: FounderSurfaceSourceBundle,
  workflowContexts: Map<string, WorkflowContext>
): WorkflowRunSummary[] {
  const taskMap = new Map(source.tasks.map((task) => [task.id, task]));
  const signalMap = toTaskSignalMap(source.telemetryEvents);
  const startQueues = new Map<string, RunStartedEvent[]>();
  const summaries: WorkflowRunSummary[] = [];

  const telemetryEvents = [...source.telemetryEvents].sort(
    (a, b) => toEpoch(a.timestamp) - toEpoch(b.timestamp)
  );

  for (const event of telemetryEvents) {
    if (isRunStartedEvent(event)) {
      const key = matchKey(event.taskId, event.agent, event.attemptId);
      const queue = startQueues.get(key) ?? [];
      queue.push(event);
      startQueues.set(key, queue);
      continue;
    }

    if (!isRunCompletedEvent(event) && !isRunErrorEvent(event)) {
      continue;
    }

    const task = taskMap.get(event.taskId);
    const taskWorkflowId = task
      ? workflowIdFromTask(task)
      : normalizeSlug(event.taskId, 'unknown-workflow');
    const workflowId = workflowContexts.has(taskWorkflowId) ? taskWorkflowId : taskWorkflowId;
    const key = matchKey(event.taskId, event.agent, event.attemptId);
    const queue = startQueues.get(key) ?? [];
    const matchedStart = queue.shift();
    startQueues.set(key, queue);

    const startedAt = matchedStart?.timestamp ?? event.timestamp;
    const finishedAt = event.timestamp;
    const relatedSignals = getRelatedSignals(event.taskId, finishedAt, signalMap, startedAt);
    const success = isRunCompletedEvent(event) ? Boolean(event.success) : false;
    const tokenEvents = relatedTokenEvents(
      source.telemetryEvents,
      event.taskId,
      event.agent,
      startedAt,
      finishedAt,
      event.attemptId
    );
    const cost = tokenEvents.reduce((sum, tokenEvent) => sum + (tokenEvent.cost ?? 0), 0);
    const eventIds = uniqueStrings([
      matchedStart?.id,
      event.id,
      ...relatedSignals.signals.map((signal) => signal.id),
      ...tokenEvents.map((tokenEvent) => tokenEvent.id),
    ]);

    summaries.push({
      run_id: event.attemptId ?? event.id,
      workflow_id: workflowId,
      task_id: event.taskId,
      agent_id: event.agent,
      started_at: startedAt,
      finished_at: finishedAt,
      success,
      policy_result: inferPolicyResult(success, relatedSignals.signals),
      halt_result: inferHaltResult(success, relatedSignals.signals, task),
      requires_human_intervention:
        !success || task?.status === 'blocked' || relatedSignals.signals.length > 0,
      failure_signature: extractFailureSignature(
        isRunErrorEvent(event)
          ? event.error
          : (event.error ??
              (task?.blockedReason && typeof task.blockedReason === 'object'
                ? task.blockedReason.note
                : undefined))
      ),
      duration_ms:
        'durationMs' in event && typeof event.durationMs === 'number'
          ? event.durationMs
          : Math.max(0, toEpoch(finishedAt) - toEpoch(startedAt)),
      cost: tokenEvents.length > 0 ? Number(cost.toFixed(4)) : null,
      model: matchedStart?.model ?? tokenEvents[tokenEvents.length - 1]?.model ?? null,
      quality_score: estimateRunQuality(task, success, relatedSignals.signals),
      artifact_ids: (task?.deliverables ?? []).map((deliverable) => deliverable.id),
      event_ids: eventIds,
    });
  }

  for (const run of source.workflowRuns) {
    if (summaries.some((summary) => summary.run_id === run.id)) continue;

    const task = run.taskId ? taskMap.get(run.taskId) : undefined;
    const taskWorkflowId = task ? workflowIdFromTask(task) : null;
    const workflowId =
      taskWorkflowId && workflowContexts.has(taskWorkflowId)
        ? taskWorkflowId
        : workflowContexts.has(run.workflowId)
          ? run.workflowId
          : normalizeSlug(run.workflowId, 'workflow-run');
    const definition = source.workflowDefinitions.find(
      (workflowDefinition) => workflowIdFromDefinition(workflowDefinition) === workflowId
    );
    const success = run.status === 'completed';
    const durationMs = run.completedAt
      ? Math.max(0, toEpoch(run.completedAt) - toEpoch(run.startedAt))
      : null;
    const failedStep = run.steps.find((step) => step.status === 'failed');
    const agentId =
      failedStep?.agent ??
      run.steps.find((step) => step.agent)?.agent ??
      definition?.agents[0]?.id ??
      'workflow-engine';

    summaries.push({
      run_id: run.id,
      workflow_id: workflowId,
      task_id: run.taskId ?? `workflow:${run.workflowId}`,
      agent_id: agentId,
      started_at: run.startedAt,
      finished_at: run.completedAt ?? run.lastCheckpoint ?? run.startedAt,
      success,
      policy_result: run.status === 'failed' ? 'fail' : success ? 'pass' : 'unknown',
      halt_result: run.status === 'blocked' ? 'fail' : success ? 'pass' : 'unknown',
      requires_human_intervention: run.status === 'blocked',
      failure_signature: extractFailureSignature(run.error ?? failedStep?.error),
      duration_ms: durationMs,
      cost: null,
      model: definition?.agents[0]?.model ?? null,
      quality_score:
        run.steps.length > 0
          ? Number(
              (
                (run.steps.filter((step) => step.status === 'completed').length /
                  run.steps.length) *
                100
              ).toFixed(2)
            )
          : null,
      artifact_ids: [],
      event_ids: [],
    });
  }

  return summaries.sort((a, b) => toEpoch(b.finished_at) - toEpoch(a.finished_at));
}

function hiddenCleanupIncidents(
  task: Task | undefined,
  runSummaries: WorkflowRunSummary[]
): number {
  // Only scan stable task fields (title, description, type) — not agent comments, which are
  // operational notes and would falsely trigger cleanup scoring for blocked/triage tasks.
  const taskCoreText = [task?.title, task?.description, task?.type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let incidents = CLEANUP_WORDS.filter((word) => taskCoreText.includes(word)).length;
  incidents += runSummaries.filter((summary) =>
    includesAny(summary.failure_signature ?? '', CLEANUP_WORDS)
  ).length;
  return incidents;
}

function humanReviewEventCount(
  task: Task | undefined,
  relatedSignals: AnyTelemetryEvent[]
): number {
  if (!task) return relatedSignals.length;
  const reviewComments = task.reviewComments?.length ?? 0;
  const comments = task.comments?.length ?? 0;
  const founderSignals = relatedSignals.filter((event) => {
    const summary = signalSummary(event);
    return summary.includes('founder') || summary.includes('decision');
  }).length;
  return reviewComments + comments + founderSignals;
}

function deriveEvidenceBundle(
  context: WorkflowContext,
  runSummaries: WorkflowRunSummary[],
  relatedSignals: AnyTelemetryEvent[],
  asOf: string
): WorkflowEvidenceBundle {
  const task = context.task;
  const durations = runSummaries
    .map((summary) => summary.duration_ms)
    .filter((value): value is number => typeof value === 'number');
  const costs = runSummaries
    .map((summary) => summary.cost)
    .filter((value): value is number => typeof value === 'number');
  const artifactPaths = (task?.deliverables ?? [])
    .map((deliverable) => deliverable.path)
    .filter((value): value is string => Boolean(value));
  const runSuccessRate =
    runSummaries.length > 0
      ? runSummaries.filter((summary) => summary.success).length / runSummaries.length
      : 0;
  const verification = verificationCoverage(task);
  const artifacts = artifactCoverage(task);
  const cleanupIncidents = hiddenCleanupIncidents(task, runSummaries);
  const qualityScore = clampNumber(
    (runSuccessRate * 0.55 + verification * 0.25 + artifacts * 0.2 - cleanupIncidents * 0.05) * 100,
    0,
    100
  );
  // Signal-based policy/halt counts — used when there are no run summaries (e.g. a task that
  // was never agent-executed but received dispatch_blocked or escalation signals).
  // When run summaries exist, the signals are already embedded in run-level results.
  const runPolicyFails = runSummaries.filter((s) => s.policy_result === 'fail').length;
  const runHaltFails = runSummaries.filter((s) => s.halt_result === 'fail').length;
  const signalPolicyFails =
    runSummaries.length === 0
      ? relatedSignals.filter(
          (s) =>
            s.type === 'signal.dispatch_blocked' ||
            signalSeverity(s) === 'critical' ||
            signalSeverity(s) === 'action_required'
        ).length
      : 0;
  const signalHaltFails = runSummaries.length === 0 && task?.status === 'blocked' ? 1 : 0;

  const timestamps = [
    context.workflow.created_at,
    context.workflow.updated_at,
    ...runSummaries.flatMap((summary) => [summary.started_at, summary.finished_at]),
    ...relatedSignals.map((signal) => signal.timestamp),
  ];

  return {
    workflow_id: context.workflow.workflow_id,
    window_start: minIso(timestamps, context.workflow.created_at),
    window_end: maxIso(timestamps, asOf),
    run_count: runSummaries.length,
    successful_run_count: runSummaries.filter((summary) => summary.success).length,
    failed_run_count: runSummaries.filter((summary) => !summary.success).length,
    policy_pass_count: runSummaries.filter((summary) => summary.policy_result === 'pass').length,
    policy_fail_count: runPolicyFails + signalPolicyFails,
    halt_pass_count: runSummaries.filter((summary) => summary.halt_result === 'pass').length,
    halt_fail_count: runHaltFails + signalHaltFails,
    hidden_cleanup_incidents: cleanupIncidents,
    evidence_complete:
      runSummaries.length > 0 &&
      ((task?.deliverables?.length ?? 0) > 0 ||
        (task?.verificationSteps?.length ?? 0) > 0 ||
        relatedSignals.length > 0),
    updated_at: maxIso(
      [
        context.workflow.updated_at,
        ...runSummaries.map((summary) => summary.finished_at),
        ...relatedSignals.map((signal) => signal.timestamp),
      ],
      asOf
    ),
    avg_duration_ms:
      durations.length > 0
        ? Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2))
        : null,
    avg_cost:
      costs.length > 0
        ? Number((costs.reduce((sum, value) => sum + value, 0) / costs.length).toFixed(4))
        : null,
    p95_duration_ms: percentile(durations, 0.95),
    p95_cost: percentile(costs, 0.95),
    quality_score: Number(qualityScore.toFixed(2)),
    quality_method: 'weighted_run_success+verification+artifact_coverage-cleanup_penalty',
    artifact_count: task?.deliverables?.length ?? 0,
    human_review_events: humanReviewEventCount(task, relatedSignals),
    linked_artifacts: artifactPaths,
    linked_task_ids: uniqueStrings([task?.id, ...runSummaries.map((summary) => summary.task_id)]),
    linked_event_ids: uniqueStrings([
      ...runSummaries.flatMap((summary) => summary.event_ids ?? []),
      ...relatedSignals.map((signal) => signal.id),
    ]),
  };
}

function deriveHumanReviewBurden(
  workflow: Workflow,
  bundle: WorkflowEvidenceBundle,
  task?: Task,
  structuralLimits: string[] = []
): HumanReviewBurden {
  let score = bundle.human_review_events ?? 0;
  if (task?.status === 'blocked') score += 3;
  if (bundle.policy_fail_count > 0) score += 2;
  if (bundle.halt_fail_count > 0) score += 2;
  if (workflow.data_class === 'A') score += 2;
  score += structuralLimits.length;

  if (score <= 0) return 'none';
  if (score <= 2) return 'low';
  if (score <= 5) return 'moderate';
  return 'high';
}

function deriveCertification(
  context: WorkflowContext,
  bundle: WorkflowEvidenceBundle,
  relatedSignals: AnyTelemetryEvent[],
  asOf: string
): WorkflowCertification {
  const successRate = bundle.run_count > 0 ? bundle.successful_run_count / bundle.run_count : 0;
  const certificationText = `${context.workflow.name} ${context.workflow.description} ${(
    context.task?.comments ?? []
  )
    .map((comment) => comment.text)
    .join(' ')}`.toLowerCase();
  const previousCertificationHints = certificationText.includes('certif');
  const burden = deriveHumanReviewBurden(context.workflow, bundle, context.task);

  let certification_status: WorkflowCertification['certification_status'] = 'not_ready';
  let certification_reason =
    'Workflow does not yet have enough corroborated evidence to enter certification.';
  let certified_at: string | null = null;
  let decertified_at: string | null = null;
  let decertified_reason: string | null = null;

  // Decertification requires explicit evidence of prior trust (text contains "certif") plus
  // a current regression signal. Using critical_path alone as a decertification trigger is
  // incorrect — a newly-blocked critical workflow was never certified in the first place.
  if (
    previousCertificationHints &&
    (bundle.policy_fail_count > 0 ||
      bundle.failed_run_count > 0 ||
      bundle.hidden_cleanup_incidents > 0)
  ) {
    certification_status = 'decertified';
    decertified_at = bundle.updated_at;
    decertified_reason =
      'Previously trusted workflow now shows failure, policy, or cleanup regression.';
    certification_reason = decertified_reason;
  } else if (
    bundle.evidence_complete &&
    bundle.run_count >= 3 &&
    successRate >= 0.9 &&
    bundle.policy_fail_count === 0 &&
    bundle.halt_fail_count === 0 &&
    burden !== 'high'
  ) {
    certification_status = 'certified';
    certified_at = bundle.updated_at;
    certification_reason =
      'Repeated clean runs with complete evidence support certified autonomous operation.';
  } else if (
    bundle.evidence_complete &&
    bundle.run_count >= 2 &&
    successRate >= 0.75 &&
    bundle.policy_fail_count === 0
  ) {
    certification_status = 'ready_for_review';
    certification_reason =
      'Evidence bundle is populated and run quality is strong enough for human review.';
  } else if (
    bundle.run_count > 0 ||
    (context.task?.deliverables?.length ?? 0) > 0 ||
    relatedSignals.length > 0 ||
    Boolean(context.task?.agent)
  ) {
    certification_status = 'candidate';
    certification_reason =
      'Workflow shows governed activity but still needs cleaner repeated evidence.';
  }

  return {
    workflow_id: context.workflow.workflow_id,
    certification_status,
    certification_reason,
    review_required: certification_status !== 'certified' || burden !== 'none',
    last_evaluated_at: bundle.updated_at,
    certified_at,
    decertified_at,
    certified_by: certification_status === 'certified' ? 'atlas-heuristic-v1' : null,
    decertified_reason,
    next_review_at:
      certification_status === 'certified' || certification_status === 'ready_for_review'
        ? new Date(toEpoch(asOf) + 14 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    certification_version: 'v1',
  };
}

function deriveStructuralLimits(workflow: Workflow, task?: Task): string[] {
  const limits: string[] = [];
  if (workflow.data_class === 'A') {
    limits.push('Class A data boundary keeps this workflow under human review.');
  }
  if (workflow.risk_class === 'critical') {
    limits.push('Critical-path risk profile requires explicit operator oversight.');
  }
  if (task?.type === 'research') {
    limits.push('Research workflows still rely on human judgment for final acceptance.');
  }
  return Array.from(new Set(limits));
}

function blockedReasonText(task?: Task): string | null {
  if (!task?.blockedReason) return null;
  if (typeof task.blockedReason === 'string') return task.blockedReason;
  return [task.blockedReason.category, task.blockedReason.note].filter(Boolean).join(': ');
}

function taskIsDelegated(task?: Task): boolean {
  return Boolean(
    task?.agent || task?.attempt || task?.automation?.spawnedAt || task?.automation?.sessionKey
  );
}

function missingHandoffFields(task?: Task): string[] {
  const missingFields: string[] = [];
  if (!task?.automation?.ackAt?.trim()) missingFields.push('ACK');
  if (!task?.plan?.trim()) missingFields.push('PLAN');
  if (!task?.automation?.eta?.trim()) missingFields.push('ETA');
  if (!task?.automation?.sessionKey?.trim()) missingFields.push('RUN_ID');
  return missingFields;
}

function overdueAttentionState(
  task: Task | undefined,
  workflow: Workflow,
  asOf: string
): {
  waitingSince: string;
  summary: string;
  recommendedAction: string;
  severity: FounderAttentionSeverity;
} | null {
  if (!task) return null;

  const handoffAnchor = task.automation?.spawnedAt ?? task.updated ?? task.created;
  const handoffMinutes = minutesBetween(handoffAnchor, asOf);
  const missingFields = missingHandoffFields(task);
  const handoffOverdue = Boolean(
    task.status === 'in-progress' &&
    taskIsDelegated(task) &&
    missingFields.length > 0 &&
    handoffMinutes !== null &&
    handoffMinutes >= HANDOFF_OVERDUE_WINDOW_MS / 60_000
  );

  if (handoffOverdue) {
    return {
      waitingSince: handoffAnchor,
      summary: `Delegated handoff is overdue (${formatAgeLabel(handoffMinutes)} without ${missingFields.join('/')}).`,
      recommendedAction:
        'Inspect the handoff and force an honest ACK/PLAN/ETA/RUN_ID or re-dispatch it.',
      severity: workflow.critical_path ? 'action_required' : 'attention',
    };
  }

  const blockedSince = task.status === 'blocked' ? (task.updated ?? task.created) : null;
  const blockedMinutes = minutesBetween(blockedSince, asOf);
  const blockedOverdue = Boolean(
    blockedSince && blockedMinutes !== null && blockedMinutes >= BLOCKED_OVERDUE_WINDOW_MS / 60_000
  );

  if (blockedOverdue) {
    return {
      waitingSince: blockedSince!,
      summary: `Blocked work has been sitting unresolved for ${formatAgeLabel(blockedMinutes)}.`,
      recommendedAction:
        'Inspect the blocker, decide the owner, or stop pretending this is moving.',
      severity: workflow.critical_path ? 'action_required' : 'attention',
    };
  }

  const staleInProgressAnchor =
    task.status === 'in-progress' ? (task.updated ?? task.created) : null;
  const staleInProgressMinutes = minutesBetween(staleInProgressAnchor, asOf);
  const staleInProgress = Boolean(
    staleInProgressAnchor &&
    staleInProgressMinutes !== null &&
    staleInProgressMinutes >= IN_PROGRESS_OVERDUE_WINDOW_MS / 60_000
  );

  if (staleInProgress) {
    return {
      waitingSince: staleInProgressAnchor!,
      summary: `In-progress work is overdue for a fresh checkpoint (${formatAgeLabel(staleInProgressMinutes)} old).`,
      recommendedAction: 'Inspect the live task and get a fresh checkpoint or close it honestly.',
      severity: workflow.critical_path ? 'action_required' : 'attention',
    };
  }

  return null;
}

function isAwaitingFounderDecision(
  workflow: Workflow,
  certification: WorkflowCertification,
  readiness: WorkflowReadiness,
  task?: Task
): boolean {
  if (certification.certification_status === 'ready_for_review') return true;

  const routingText = [
    workflow.name,
    workflow.description,
    workflow.status_reason,
    workflow.human_review_reason,
    readiness.readiness_summary,
    readiness.blockers_explanation,
    readiness.recommended_next_action,
    blockedReasonText(task),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (workflow.human_review_required && readiness.human_review_burden === 'high') {
    return hasFounderDecisionCue(routingText);
  }

  return Boolean(task?.status === 'blocked' && hasFounderDecisionCue(routingText));
}

function newlyCompleteTimestamp(
  task: Task | undefined,
  workflow: Workflow,
  asOf: string
): string | null {
  if (!task || task.status !== 'done' || workflow.completion_truth?.state !== 'verified')
    return null;
  const completedAt = task.automation?.completedAt ?? task.updated ?? task.created;
  return isRecentIso(completedAt, NEWLY_COMPLETE_WINDOW_MS, asOf) ? completedAt : null;
}

function deriveTemporaryBlockers(
  workflow: Workflow,
  bundle: WorkflowEvidenceBundle,
  certification: WorkflowCertification,
  task?: Task
): string[] {
  const blockers: string[] = [];
  const blockedReason = blockedReasonText(task);
  if (blockedReason) blockers.push(blockedReason);
  if (bundle.run_count < 2)
    blockers.push('Need at least two observed runs to stabilize the evidence bundle.');
  if (!bundle.evidence_complete)
    blockers.push(
      'Add verification or artifact evidence so trust can be judged from more than one source.'
    );
  if (bundle.policy_fail_count > 0) blockers.push('Resolve policy failures before promotion.');
  if (bundle.halt_fail_count > 0)
    blockers.push('Improve halt or escalation behavior before promotion.');
  if (certification.certification_status === 'ready_for_review') {
    blockers.push('Schedule human certification review.');
  }
  if (workflow.critical_path && task?.status !== 'done')
    blockers.push('Critical-path workflow is not yet closed or stabilized.');
  return Array.from(new Set(blockers));
}

function topFailureSignatures(runSummaries: WorkflowRunSummary[], task?: Task): string[] {
  const counts = new Map<string, number>();
  for (const summary of runSummaries) {
    if (!summary.failure_signature) continue;
    counts.set(summary.failure_signature, (counts.get(summary.failure_signature) ?? 0) + 1);
  }

  const blockedReason = blockedReasonText(task);
  if (blockedReason) {
    counts.set(blockedReason, (counts.get(blockedReason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([signature]) => signature);
}

function deriveReadiness(
  context: WorkflowContext,
  bundle: WorkflowEvidenceBundle,
  certification: WorkflowCertification,
  runSummaries: WorkflowRunSummary[],
  asOf: string
): WorkflowReadiness {
  const structuralLimits = deriveStructuralLimits(context.workflow, context.task);
  const temporaryBlockers = deriveTemporaryBlockers(
    context.workflow,
    bundle,
    certification,
    context.task
  );
  const failureSignatures = topFailureSignatures(runSummaries, context.task);
  const humanReviewBurden = deriveHumanReviewBurden(
    context.workflow,
    bundle,
    context.task,
    structuralLimits
  );
  const successRate = bundle.run_count > 0 ? bundle.successful_run_count / bundle.run_count : 0;

  let readiness_label: WorkflowReadiness['readiness_label'] = 'emerging';
  let readiness_summary =
    'Workflow has early founder-surface coverage but limited corroborated trust evidence.';

  if (certification.certification_status === 'certified') {
    readiness_label = 'certified';
    readiness_summary = 'Workflow has earned certified autonomous status from repeated clean runs.';
  } else if (certification.certification_status === 'decertified') {
    readiness_label = 'degrading';
    readiness_summary = certification.certification_reason;
  } else if (
    context.task?.status === 'blocked' ||
    (temporaryBlockers.length > 0 && successRate < 0.5)
  ) {
    readiness_label = 'blocked';
    readiness_summary = temporaryBlockers[0] ?? 'Workflow is blocked and needs intervention.';
  } else if (certification.certification_status === 'ready_for_review') {
    readiness_label = 'near_ready';
    readiness_summary = certification.certification_reason;
  } else if (certification.certification_status === 'candidate' && successRate >= 0.5) {
    readiness_label = 'advancing';
    readiness_summary = 'Workflow is accumulating enough governed evidence to move toward review.';
  }

  return {
    workflow_id: context.workflow.workflow_id,
    readiness_label,
    readiness_summary,
    temporary_blockers: temporaryBlockers,
    structural_limits: structuralLimits,
    top_failure_signatures: failureSignatures,
    human_review_burden: humanReviewBurden,
    updated_at: maxIso(
      [bundle.updated_at, certification.last_evaluated_at, context.workflow.updated_at],
      asOf
    ),
    recommended_next_action:
      readiness_label === 'certified'
        ? 'Keep monitoring for regression and re-run review on schedule.'
        : (temporaryBlockers[0] ??
          (readiness_label === 'near_ready'
            ? 'Run certification review and validate promotion thresholds.'
            : 'Gather another clean run plus accepted evidence.')),
    promotion_confidence:
      readiness_label === 'certified'
        ? 1
        : Number(clampNumber(successRate + (bundle.evidence_complete ? 0.2 : 0), 0, 1).toFixed(2)),
    degradation_confidence: Number(
      clampNumber(
        (bundle.failed_run_count > 0
          ? bundle.failed_run_count / Math.max(bundle.run_count, 1)
          : 0) +
          (bundle.policy_fail_count > 0 ? 0.25 : 0) +
          (bundle.hidden_cleanup_incidents > 0 ? 0.15 : 0),
        0,
        1
      ).toFixed(2)
    ),
  };
}

function finalizeWorkflow(
  context: WorkflowContext,
  bundle: WorkflowEvidenceBundle,
  certification: WorkflowCertification,
  readiness: WorkflowReadiness
): Workflow {
  const task = context.task;
  let state: WorkflowState = 'human_native';

  if (certification.certification_status === 'certified') {
    state = 'certified_autonomous';
  } else if (
    certification.certification_status === 'decertified' ||
    readiness.readiness_label === 'degrading'
  ) {
    state = 'under_review';
  } else if (certification.certification_status === 'ready_for_review') {
    state = 'certifying';
  } else if (
    bundle.run_count > 0 ||
    (task?.verificationSteps?.length ?? 0) > 0 ||
    (task?.deliverables?.length ?? 0) > 0 ||
    Boolean(context.definition)
  ) {
    state = 'governed_copilot';
  } else if (
    Boolean(task?.agent) ||
    Boolean(task?.attempt) ||
    Boolean(task?.automation?.sessionKey)
  ) {
    state = 'assisted';
  }

  const humanReviewRequired =
    readiness.human_review_burden !== 'none' || readiness.structural_limits.length > 0;

  return {
    ...context.workflow,
    state,
    status_reason: readiness.readiness_summary || certification.certification_reason,
    updated_at: maxIso(
      [
        context.workflow.updated_at,
        bundle.updated_at,
        certification.last_evaluated_at,
        readiness.updated_at,
      ],
      context.workflow.updated_at
    ),
    human_review_required: humanReviewRequired,
    human_review_reason:
      readiness.structural_limits[0] ??
      (humanReviewRequired
        ? `${readiness.human_review_burden} review burden still present.`
        : null),
    notes: bundle.evidence_complete
      ? `Evidence bundle complete with ${bundle.run_count} run(s).`
      : 'Evidence bundle still missing corroborating verification or artifact proof.',
  };
}

function deriveVentureCoverage(
  workflows: Workflow[],
  readinessByWorkflowId: Map<string, WorkflowReadiness>,
  certificationsByWorkflowId: Map<string, WorkflowCertification>,
  asOf: string
): VentureCoverage[] {
  const ventureMap = new Map<string, Workflow[]>();
  for (const workflow of workflows) {
    const group = ventureMap.get(workflow.venture_id) ?? [];
    group.push(workflow);
    ventureMap.set(workflow.venture_id, group);
  }

  return Array.from(ventureMap.entries())
    .map(([ventureId, ventureWorkflows]) => {
      const criticalPath = ventureWorkflows.filter((workflow) => workflow.critical_path);
      const certified = ventureWorkflows.filter(
        (workflow) => workflow.state === 'certified_autonomous'
      );
      const burdenScores: Record<HumanReviewBurden, number> = {
        none: 0,
        low: 1,
        moderate: 2,
        high: 3,
      };
      const topBlockers = new Map<string, number>();
      const degrading: string[] = [];
      const recentPromotions: string[] = [];
      const recentDecertifications: string[] = [];
      let burdenTotal = 0;

      for (const workflow of ventureWorkflows) {
        const readiness = readinessByWorkflowId.get(workflow.workflow_id);
        const certification = certificationsByWorkflowId.get(workflow.workflow_id);
        if (readiness) {
          burdenTotal += burdenScores[readiness.human_review_burden];
          for (const blocker of readiness.temporary_blockers) {
            topBlockers.set(blocker, (topBlockers.get(blocker) ?? 0) + 1);
          }
          if (
            readiness.readiness_label === 'degrading' ||
            readiness.readiness_label === 'blocked'
          ) {
            degrading.push(workflow.workflow_id);
          }
        }
        if (certification?.certification_status === 'certified') {
          recentPromotions.push(workflow.workflow_id);
        }
        if (certification?.certification_status === 'decertified') {
          recentDecertifications.push(workflow.workflow_id);
        }
      }

      return {
        venture_id: ventureId,
        workflow_count: ventureWorkflows.length,
        critical_path_workflow_count: criticalPath.length,
        certified_autonomous_count: certified.length,
        governed_copilot_count: ventureWorkflows.filter(
          (workflow) => workflow.state === 'governed_copilot'
        ).length,
        certifying_count: ventureWorkflows.filter((workflow) => workflow.state === 'certifying')
          .length,
        human_native_count: ventureWorkflows.filter((workflow) => workflow.state === 'human_native')
          .length,
        assisted_count: ventureWorkflows.filter((workflow) => workflow.state === 'assisted').length,
        under_review_count: ventureWorkflows.filter((workflow) => workflow.state === 'under_review')
          .length,
        certified_autonomy_rate: Number(
          (certified.length / Math.max(ventureWorkflows.length, 1)).toFixed(4)
        ),
        critical_path_certified_rate: Number(
          (
            certified.filter((workflow) => workflow.critical_path).length /
            Math.max(criticalPath.length, 1)
          ).toFixed(4)
        ),
        updated_at: maxIso(
          ventureWorkflows.map((workflow) => workflow.updated_at),
          asOf
        ),
        human_review_burden_score: Number(
          (burdenTotal / Math.max(ventureWorkflows.length, 1)).toFixed(2)
        ),
        top_blockers: Array.from(topBlockers.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([blocker]) => blocker),
        top_degrading_workflows: degrading.slice(0, 3),
        recent_promotions: recentPromotions.slice(0, 3),
        recent_decertifications: recentDecertifications.slice(0, 3),
      } satisfies VentureCoverage;
    })
    .sort((a, b) => a.venture_id.localeCompare(b.venture_id));
}

function deriveAttentionSeverity(
  kind: FounderAttentionKind,
  workflow: Workflow,
  readiness: WorkflowReadiness,
  bundle: WorkflowEvidenceBundle
): FounderAttentionSeverity {
  if (kind === 'newly_complete') return 'info';
  if (kind === 'policy_failure' && (workflow.critical_path || bundle.policy_fail_count > 1)) {
    return 'critical';
  }
  if (kind === 'degrading_workflow' && workflow.critical_path) return 'critical';
  if (kind === 'overdue_workflow') return workflow.critical_path ? 'action_required' : 'attention';
  if (kind === 'blocked_workflow') return workflow.critical_path ? 'action_required' : 'attention';
  if (kind === 'certification_review')
    return workflow.critical_path ? 'action_required' : 'attention';
  if (readiness.human_review_burden === 'high') return 'action_required';
  return 'attention';
}

function attentionId(kind: FounderAttentionKind, workflowId: string, suffix = ''): string {
  return [kind, workflowId, suffix].filter(Boolean).join(':');
}

interface AttentionRoutingDecision {
  constraint_kind: FounderAttentionConstraintKind;
  attention_target: FounderAttentionTarget;
  requires_founder_action: boolean;
  resolution_owner: FounderAttentionResolutionOwner;
}

function hasFounderDecisionCue(text: string): boolean {
  return includesAny(text, FOUNDER_DECISION_WORDS);
}

function hasTruthDriftCue(text: string): boolean {
  return includesAny(text, TRUTH_DRIFT_WORDS);
}

function hasInternalGateCue(text: string): boolean {
  return includesAny(text, INTERNAL_GATE_WORDS);
}

function classifyAttentionRouting(
  kind: FounderAttentionKind,
  workflow: Workflow,
  task: Task | undefined,
  readiness: WorkflowReadiness,
  certification: WorkflowCertification,
  bundle: WorkflowEvidenceBundle,
  summary: string,
  recommendedAction: string
): AttentionRoutingDecision {
  const blockedCategory =
    task?.blockedReason && typeof task.blockedReason === 'object'
      ? task.blockedReason.category
      : null;
  const routingText = [
    workflow.name,
    workflow.description,
    workflow.status_reason,
    summary,
    recommendedAction,
    readiness.readiness_summary,
    readiness.blockers_explanation,
    readiness.degradation_explanation,
    ...readiness.temporary_blockers,
    blockedReasonText(task),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (kind === 'newly_complete') {
    return {
      constraint_kind: 'none',
      attention_target: 'none',
      requires_founder_action: false,
      resolution_owner: 'owner',
    };
  }

  if (kind === 'certification_review') {
    return {
      constraint_kind: 'founder_decision',
      attention_target: 'founder',
      requires_founder_action: true,
      resolution_owner: 'founder',
    };
  }

  if (kind === 'decision_required') {
    if (hasFounderDecisionCue(routingText)) {
      return {
        constraint_kind: 'founder_decision',
        attention_target: 'founder',
        requires_founder_action: true,
        resolution_owner: 'founder',
      };
    }

    return {
      constraint_kind: 'internal_gate',
      attention_target: 'owner',
      requires_founder_action: false,
      resolution_owner: 'owner',
    };
  }

  if (kind === 'overdue_workflow') {
    if (task?.status === 'blocked' && hasFounderDecisionCue(routingText)) {
      return {
        constraint_kind: 'founder_decision',
        attention_target: 'founder',
        requires_founder_action: true,
        resolution_owner: 'founder',
      };
    }

    if (hasTruthDriftCue(routingText) || workflow.completion_truth?.state === 'at_risk') {
      return {
        constraint_kind: 'truth_drift',
        attention_target: 'operator',
        requires_founder_action: false,
        resolution_owner: 'operator',
      };
    }

    return {
      constraint_kind: hasInternalGateCue(routingText) ? 'internal_gate' : 'external_dependency',
      attention_target: 'owner',
      requires_founder_action: false,
      resolution_owner: 'owner',
    };
  }

  if (kind === 'blocked_workflow') {
    if (hasFounderDecisionCue(routingText)) {
      return {
        constraint_kind: 'founder_decision',
        attention_target: 'founder',
        requires_founder_action: true,
        resolution_owner: 'founder',
      };
    }

    if (hasTruthDriftCue(routingText) || workflow.completion_truth?.state === 'at_risk') {
      return {
        constraint_kind: 'truth_drift',
        attention_target: 'operator',
        requires_founder_action: false,
        resolution_owner: 'operator',
      };
    }

    return {
      constraint_kind: blockedCategory === 'prerequisite' ? 'external_dependency' : 'internal_gate',
      attention_target: 'owner',
      requires_founder_action: false,
      resolution_owner: 'owner',
    };
  }

  if (kind === 'policy_failure' || kind === 'degrading_workflow') {
    return {
      constraint_kind:
        bundle.policy_fail_count > 0 || hasTruthDriftCue(routingText)
          ? 'truth_drift'
          : 'external_dependency',
      attention_target:
        bundle.policy_fail_count > 0 || workflow.completion_truth?.state === 'at_risk'
          ? 'operator'
          : 'owner',
      requires_founder_action: false,
      resolution_owner:
        bundle.policy_fail_count > 0 || workflow.completion_truth?.state === 'at_risk'
          ? 'operator'
          : 'owner',
    };
  }

  if (
    workflow.human_review_required &&
    readiness.human_review_burden === 'high' &&
    certification.certification_status !== 'ready_for_review'
  ) {
    return {
      constraint_kind: 'internal_gate',
      attention_target: 'owner',
      requires_founder_action: false,
      resolution_owner: 'owner',
    };
  }

  return {
    constraint_kind: 'none',
    attention_target: 'none',
    requires_founder_action: false,
    resolution_owner: 'owner',
  };
}

function withAttentionRouting(
  item: Omit<
    FounderAttentionItem,
    'constraint_kind' | 'attention_target' | 'requires_founder_action' | 'resolution_owner'
  >,
  routing: AttentionRoutingDecision
): FounderAttentionItem {
  return {
    ...item,
    ...routing,
  };
}

function shouldSurfaceBlockedWorkflowAttention(
  task: Task | undefined,
  bundle: WorkflowEvidenceBundle,
  runs: WorkflowRunSummary[]
): boolean {
  if (task?.status === 'blocked' || task?.status === 'in-progress') return true;
  if (bundle.run_count > 0 || runs.length > 0) return true;
  return false;
}

function deriveAttentionItems(
  workflows: Workflow[],
  bundlesByWorkflowId: Map<string, WorkflowEvidenceBundle>,
  certificationsByWorkflowId: Map<string, WorkflowCertification>,
  readinessByWorkflowId: Map<string, WorkflowReadiness>,
  runSummariesByWorkflowId: Map<string, WorkflowRunSummary[]>,
  workflowContexts: Map<string, WorkflowContext>,
  asOf: string
): FounderAttentionItem[] {
  const items: FounderAttentionItem[] = [];

  for (const workflow of workflows) {
    const bundle = bundlesByWorkflowId.get(workflow.workflow_id);
    const certification = certificationsByWorkflowId.get(workflow.workflow_id);
    const readiness = readinessByWorkflowId.get(workflow.workflow_id);
    const runs = runSummariesByWorkflowId.get(workflow.workflow_id) ?? [];
    const task = workflowContexts.get(workflow.workflow_id)?.task;

    if (!bundle || !certification || !readiness) continue;

    if (
      readiness.readiness_label === 'blocked' &&
      shouldSurfaceBlockedWorkflowAttention(task, bundle, runs)
    ) {
      const summary = readiness.blockers_explanation ?? readiness.readiness_summary;
      const recommendedAction = readiness.recommended_next_action ?? 'Resolve the active blocker.';
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('blocked_workflow', workflow.workflow_id),
            kind: 'blocked_workflow',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: deriveAttentionSeverity('blocked_workflow', workflow, readiness, bundle),
            summary,
            waiting_since: minIso(
              [task?.updated, workflow.updated_at, ...runs.map((run) => run.started_at)],
              workflow.updated_at
            ),
            recommended_action: recommendedAction,
            updated_at: readiness.updated_at,
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'blocked_workflow',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            summary,
            recommendedAction
          )
        )
      );
    }

    const overdueState = overdueAttentionState(task, workflow, asOf);
    if (overdueState) {
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('overdue_workflow', workflow.workflow_id),
            kind: 'overdue_workflow',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: overdueState.severity,
            summary: overdueState.summary,
            waiting_since: overdueState.waitingSince,
            recommended_action: overdueState.recommendedAction,
            updated_at: maxIso([task?.updated, workflow.updated_at], workflow.updated_at),
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'overdue_workflow',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            overdueState.summary,
            overdueState.recommendedAction
          )
        )
      );
    }

    if (
      readiness.readiness_label === 'degrading' ||
      certification.certification_status === 'decertified'
    ) {
      const summary = readiness.degradation_explanation ?? certification.certification_reason;
      const recommendedAction =
        readiness.recommended_next_action ??
        'Investigate the regression and requalify the workflow.';
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('degrading_workflow', workflow.workflow_id),
            kind: 'degrading_workflow',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: deriveAttentionSeverity('degrading_workflow', workflow, readiness, bundle),
            summary,
            waiting_since: workflow.updated_at,
            recommended_action: recommendedAction,
            updated_at: readiness.updated_at,
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'degrading_workflow',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            summary,
            recommendedAction
          )
        )
      );
    }

    if (bundle.policy_fail_count > 0) {
      const summary = `${bundle.policy_fail_count} policy failure signal(s) detected for this workflow.`;
      const recommendedAction = 'Clear policy violations and rerun validation before promotion.';
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('policy_failure', workflow.workflow_id),
            kind: 'policy_failure',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: deriveAttentionSeverity('policy_failure', workflow, readiness, bundle),
            summary,
            waiting_since: workflow.updated_at,
            recommended_action: recommendedAction,
            updated_at: bundle.updated_at,
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'policy_failure',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            summary,
            recommendedAction
          )
        )
      );
    }

    if (certification.certification_status === 'ready_for_review') {
      const summary = certification.certification_reason;
      const recommendedAction =
        'Review the evidence bundle and decide whether to promote the workflow.';
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('certification_review', workflow.workflow_id),
            kind: 'certification_review',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: deriveAttentionSeverity('certification_review', workflow, readiness, bundle),
            summary,
            waiting_since: certification.last_evaluated_at,
            recommended_action: recommendedAction,
            updated_at: certification.last_evaluated_at,
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'certification_review',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            summary,
            recommendedAction
          )
        )
      );
    }

    if (workflow.human_review_required && readiness.human_review_burden === 'high') {
      const summary =
        workflow.human_review_reason ?? 'Workflow still depends on substantial human review.';
      const recommendedAction =
        readiness.recommended_next_action ??
        'Decide whether to keep this workflow human-governed or invest in stronger controls.';
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('decision_required', workflow.workflow_id),
            kind: 'decision_required',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: 'action_required',
            summary,
            waiting_since: workflow.updated_at,
            recommended_action: recommendedAction,
            updated_at: readiness.updated_at,
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'decision_required',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            summary,
            recommendedAction
          )
        )
      );
    }

    if (isAwaitingFounderDecision(workflow, certification, readiness, task)) {
      const summary =
        certification.certification_status === 'ready_for_review'
          ? 'Workflow is waiting on a founder promotion decision.'
          : (workflow.human_review_reason ??
            'Workflow needs a founder decision before it can move.');
      const recommendedAction =
        certification.certification_status === 'ready_for_review'
          ? 'Review the evidence bundle and decide whether to promote it.'
          : (readiness.recommended_next_action ?? 'Make the call so execution can move again.');
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('decision_required', workflow.workflow_id, 'founder'),
            kind: 'decision_required',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: workflow.critical_path ? 'action_required' : 'attention',
            summary,
            waiting_since: maxIso(
              [certification.last_evaluated_at, task?.updated, workflow.updated_at],
              workflow.updated_at
            ),
            recommended_action: recommendedAction,
            updated_at: maxIso(
              [readiness.updated_at, certification.last_evaluated_at],
              workflow.updated_at
            ),
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'decision_required',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            summary,
            recommendedAction
          )
        )
      );
    }

    const completedAt = newlyCompleteTimestamp(task, workflow, asOf);
    if (completedAt) {
      const summary = 'Completion truth is verified and fresh.';
      const recommendedAction = 'Acknowledge the result and keep moving.';
      items.push(
        withAttentionRouting(
          {
            attention_id: attentionId('newly_complete', workflow.workflow_id),
            kind: 'newly_complete',
            venture_id: workflow.venture_id,
            workflow_id: workflow.workflow_id,
            severity: 'info',
            summary,
            waiting_since: completedAt,
            recommended_action: recommendedAction,
            updated_at: completedAt,
            task_id: workflow.current_task_id ?? null,
            assigned_to: workflow.owner_agent,
          },
          classifyAttentionRouting(
            'newly_complete',
            workflow,
            task,
            readiness,
            certification,
            bundle,
            summary,
            recommendedAction
          )
        )
      );
    }
  }

  return items.sort((a, b) => {
    const severityOrder: Record<FounderAttentionSeverity, number> = {
      critical: 0,
      action_required: 1,
      attention: 2,
      info: 3,
    };
    return (
      severityOrder[a.severity] - severityOrder[b.severity] ||
      toEpoch(a.waiting_since) - toEpoch(b.waiting_since)
    );
  });
}

interface FounderSurfaceSnapshotIndex {
  workflowsById: Map<string, Workflow>;
  bundlesByWorkflowId: Map<string, WorkflowEvidenceBundle>;
  certificationsByWorkflowId: Map<string, WorkflowCertification>;
  readinessByWorkflowId: Map<string, WorkflowReadiness>;
  runsByWorkflowId: Map<string, WorkflowRunSummary[]>;
  attentionByWorkflowId: Map<string, FounderAttentionItem[]>;
}

function roundPercentage(rate: number): number {
  return Number((rate * 100).toFixed(1));
}

function buildSnapshotIndex(snapshot: FounderSurfaceSnapshot): FounderSurfaceSnapshotIndex {
  const runsByWorkflowId = new Map<string, WorkflowRunSummary[]>();
  for (const run of snapshot.run_summaries) {
    const group = runsByWorkflowId.get(run.workflow_id) ?? [];
    group.push(run);
    runsByWorkflowId.set(run.workflow_id, group);
  }

  const attentionByWorkflowId = new Map<string, FounderAttentionItem[]>();
  for (const item of snapshot.attention_items) {
    const group = attentionByWorkflowId.get(item.workflow_id) ?? [];
    group.push(item);
    attentionByWorkflowId.set(item.workflow_id, group);
  }

  return {
    workflowsById: new Map(snapshot.workflows.map((workflow) => [workflow.workflow_id, workflow])),
    bundlesByWorkflowId: new Map(
      snapshot.evidence_bundles.map((bundle) => [bundle.workflow_id, bundle])
    ),
    certificationsByWorkflowId: new Map(
      snapshot.certifications.map((certification) => [certification.workflow_id, certification])
    ),
    readinessByWorkflowId: new Map(snapshot.readiness.map((model) => [model.workflow_id, model])),
    runsByWorkflowId,
    attentionByWorkflowId,
  };
}

function attentionCategoryForItem(
  item: FounderAttentionItem
): FounderSurfaceAttentionCategory | null {
  if (item.kind === 'newly_complete') return 'newly_complete';
  if (item.constraint_kind === 'founder_decision') return 'awaiting_decision';
  if (item.constraint_kind === 'external_dependency') return 'blocked';

  switch (item.kind) {
    case 'blocked_workflow':
      return 'blocked';
    case 'overdue_workflow':
      return 'overdue';
    case 'decision_required':
    case 'certification_review':
      return 'awaiting_decision';
    default:
      return null;
  }
}

function actionVerbForAttentionKind(kind: FounderAttentionKind): FounderSurfaceActionVerb {
  switch (kind) {
    case 'certification_review':
    case 'decision_required':
    case 'policy_failure':
      return 'Review';
    case 'newly_complete':
      return 'Acknowledge';
    default:
      return 'Inspect';
  }
}

function dedupeFounderAttentionItems(items: FounderAttentionItem[]): FounderAttentionItem[] {
  const seen = new Set<string>();
  const deduped: FounderAttentionItem[] = [];

  for (const item of items) {
    const category = attentionCategoryForItem(item);
    if (!category) continue;
    const key = `${category}:${item.workflow_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function humanizeCompletionTruthState(state: CompletionTruthState | undefined): string | null {
  if (!state) return null;
  if (state === 'verified') return 'verified';
  if (state === 'at_risk') return 'at risk';
  return 'pending';
}

function joinFounderSurfaceClauses(values: Array<string | undefined | null>, limit = 3): string {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  )
    .slice(0, limit)
    .join(' ');
}

function buildIntegratedAttentionWhy(
  item: FounderAttentionItem,
  index: FounderSurfaceSnapshotIndex
): string {
  const workflow = index.workflowsById.get(item.workflow_id);
  const readiness = index.readinessByWorkflowId.get(item.workflow_id);
  const certification = index.certificationsByWorkflowId.get(item.workflow_id);
  const completionTruth = humanizeCompletionTruthState(
    workflow?.completion_truth?.state ?? undefined
  );

  const routeClause =
    item.constraint_kind === 'founder_decision'
      ? 'Founder decision is the next legal move.'
      : item.constraint_kind === 'external_dependency'
        ? 'Execution is waiting on a dependency that still needs founder clearance.'
        : null;
  const completionClause = completionTruth ? `Completion ${completionTruth}.` : null;
  const blockerClause =
    item.kind === 'blocked_workflow'
      ? readiness?.temporary_blockers[0]
      : item.kind === 'overdue_workflow'
        ? readiness?.blockers_explanation
        : null;
  const driftClause =
    item.kind === 'degrading_workflow' || certification?.certification_status === 'decertified'
      ? (readiness?.degradation_explanation ?? workflow?.status_reason)
      : item.kind === 'policy_failure'
        ? workflow?.status_reason
        : null;

  return joinFounderSurfaceClauses([
    routeClause,
    item.summary,
    completionClause,
    blockerClause,
    driftClause,
  ]);
}

function buildIntegratedAttentionAction(
  item: FounderAttentionItem,
  index: FounderSurfaceSnapshotIndex
): string {
  const workflow = index.workflowsById.get(item.workflow_id);
  const readiness = index.readinessByWorkflowId.get(item.workflow_id);
  const firstMissingSurface = workflow?.completion_truth?.missing_surfaces?.[0];
  const repairClause =
    item.requires_founder_action || !firstMissingSurface
      ? null
      : `Repair ${firstMissingSurface} truth next.`;

  return joinFounderSurfaceClauses(
    [item.recommended_action, repairClause, readiness?.recommended_next_action],
    2
  );
}

function shouldSurfaceOverviewAttentionItem(
  item: FounderAttentionItem,
  index: FounderSurfaceSnapshotIndex,
  asOf: string
): boolean {
  const category = attentionCategoryForItem(item);
  if (!category || category === 'newly_complete') return false;
  if (!item.requires_founder_action || item.attention_target !== 'founder') return false;

  if (category === 'awaiting_decision') {
    const workflow = index.workflowsById.get(item.workflow_id);
    const boardVerified = workflow?.completion_truth?.board?.state === 'verified';
    const reviewApproved = Boolean(
      workflow?.completion_truth?.evidence?.sources?.some(
        (source) => source === 'review.decision:approved'
      )
    );
    const freshEnough = isRecentIso(
      item.updated_at ?? item.waiting_since,
      STALE_COMPLETED_REVIEW_WINDOW_MS,
      asOf
    );
    if (boardVerified && reviewApproved) return false;
    if (boardVerified && !freshEnough) return false;
  }

  return true;
}

function buildOverviewAttentionItem(
  item: FounderAttentionItem,
  index: FounderSurfaceSnapshotIndex
): FounderSurfaceOverviewAttentionItem | null {
  const workflow = index.workflowsById.get(item.workflow_id);
  const category = attentionCategoryForItem(item);
  if (!category || category === 'newly_complete') return null;

  return {
    attention_id: item.attention_id,
    kind: item.kind,
    category,
    severity: item.severity,
    constraint_kind: item.constraint_kind,
    attention_target: item.attention_target,
    requires_founder_action: item.requires_founder_action,
    resolution_owner: item.resolution_owner,
    venture_id: item.venture_id,
    workflow_id: item.workflow_id,
    what: workflow?.name ?? item.workflow_id,
    why: buildIntegratedAttentionWhy(item, index),
    action: actionVerbForAttentionKind(item.kind),
    recommended_action: buildIntegratedAttentionAction(item, index),
    waiting_since: item.waiting_since,
    updated_at: item.updated_at,
  };
}

function buildNewlyCompleteItem(
  item: FounderAttentionItem,
  workflow?: Workflow
): FounderSurfaceNewlyCompleteItem | null {
  if (attentionCategoryForItem(item) !== 'newly_complete') return null;

  return {
    attention_id: item.attention_id,
    category: 'newly_complete',
    venture_id: item.venture_id,
    workflow_id: item.workflow_id,
    owner_agent: workflow?.owner_agent || 'SETH-LEAD',
    what: workflow?.name ?? item.workflow_id,
    why: workflow?.completion_truth?.summary ?? item.summary,
    action: 'Acknowledge',
    recommended_action: item.recommended_action,
    completed_at: item.waiting_since,
    updated_at: item.updated_at,
  };
}

function isWorkflowAtRisk(workflow: Workflow, index: FounderSurfaceSnapshotIndex): boolean {
  const certification = index.certificationsByWorkflowId.get(workflow.workflow_id);
  const readiness = index.readinessByWorkflowId.get(workflow.workflow_id);

  return Boolean(
    workflow.completion_truth?.state === 'at_risk' ||
    workflow.state === 'under_review' ||
    certification?.certification_status === 'decertified' ||
    readiness?.readiness_label === 'blocked' ||
    readiness?.readiness_label === 'degrading'
  );
}

function buildWorkflowTrustSummary(
  workflowId: string,
  index: FounderSurfaceSnapshotIndex
): FounderSurfaceWorkflowTrustSummary | null {
  const workflow = index.workflowsById.get(workflowId);
  const evidence_bundle = index.bundlesByWorkflowId.get(workflowId);
  const certification = index.certificationsByWorkflowId.get(workflowId);
  const readiness = index.readinessByWorkflowId.get(workflowId);

  if (!workflow || !evidence_bundle || !certification || !readiness) {
    return null;
  }

  const runs = index.runsByWorkflowId.get(workflowId) ?? [];
  const latest_run = runs.length > 0 ? runs[0] : null;
  const attention_item = (index.attentionByWorkflowId.get(workflowId) ?? [])[0] ?? null;

  return {
    workflow,
    completion_truth:
      workflow.completion_truth ?? deriveCompletionTruthOverlay({ asOf: workflow.updated_at }),
    evidence_bundle,
    certification,
    readiness,
    latest_run,
    attention_item,
  };
}

function collectWorkflowTrustSummaries(
  workflowIds: string[],
  index: FounderSurfaceSnapshotIndex
): FounderSurfaceWorkflowTrustSummary[] {
  return workflowIds
    .map((workflowId) => buildWorkflowTrustSummary(workflowId, index))
    .filter((summary): summary is FounderSurfaceWorkflowTrustSummary => Boolean(summary));
}

function compareTrustSummaryRecency(
  left: FounderSurfaceWorkflowTrustSummary,
  right: FounderSurfaceWorkflowTrustSummary
): number {
  const leftTime = maxIso(
    [
      left.certification.certified_at,
      left.certification.decertified_at,
      left.certification.last_evaluated_at,
      left.readiness.updated_at,
      left.workflow.updated_at,
    ],
    left.workflow.updated_at
  );
  const rightTime = maxIso(
    [
      right.certification.certified_at,
      right.certification.decertified_at,
      right.certification.last_evaluated_at,
      right.readiness.updated_at,
      right.workflow.updated_at,
    ],
    right.workflow.updated_at
  );

  return toEpoch(rightTime) - toEpoch(leftTime);
}

export function buildFounderSurfaceExecutiveOverview(
  snapshot: FounderSurfaceSnapshot
): FounderSurfaceExecutiveOverview {
  const index = buildSnapshotIndex(snapshot);
  const workflowCount = snapshot.workflows.length;
  const certifiedWorkflowCount = snapshot.certifications.filter(
    (certification) => certification.certification_status === 'certified'
  ).length;
  const overallRate = workflowCount > 0 ? certifiedWorkflowCount / workflowCount : 0;

  const primary_number: FounderSurfacePrimaryNumber = {
    label: 'Certified Autonomy Rate',
    rate: Number(overallRate.toFixed(4)),
    percentage: roundPercentage(overallRate),
    certified_workflow_count: certifiedWorkflowCount,
    workflow_count: workflowCount,
    updated_at: snapshot.updated_at,
  };

  const normalizedAttention = dedupeFounderAttentionItems(snapshot.attention_items);
  const surfacedAttention = normalizedAttention.filter((item) =>
    shouldSurfaceOverviewAttentionItem(item, index, snapshot.updated_at)
  );
  const overviewAttention = surfacedAttention
    .map((item) => buildOverviewAttentionItem(item, index))
    .filter((item): item is FounderSurfaceOverviewAttentionItem => Boolean(item))
    .slice(0, 5);
  const newly_complete_items = normalizedAttention
    .map((item) => buildNewlyCompleteItem(item, index.workflowsById.get(item.workflow_id)))
    .filter((item): item is FounderSurfaceNewlyCompleteItem => Boolean(item))
    .sort((left, right) => toEpoch(right.completed_at) - toEpoch(left.completed_at))
    .slice(0, 3);

  const attentionSummaryCounts = normalizedAttention.reduce<FounderSurfaceAttentionSummary>(
    (counts, item) => {
      const category = attentionCategoryForItem(item);
      if (!category) return counts;
      if (
        category !== 'newly_complete' &&
        !shouldSurfaceOverviewAttentionItem(item, index, snapshot.updated_at)
      ) {
        return counts;
      }
      if (category === 'blocked') counts.blocked_count += 1;
      if (category === 'overdue') counts.overdue_count += 1;
      if (category === 'awaiting_decision') counts.awaiting_decision_count += 1;
      if (category === 'newly_complete') counts.newly_complete_count += 1;
      return counts;
    },
    {
      blocked_count: 0,
      overdue_count: 0,
      awaiting_decision_count: 0,
      newly_complete_count: 0,
      requires_attention_count: 0,
    }
  );
  attentionSummaryCounts.requires_attention_count =
    attentionSummaryCounts.blocked_count +
    attentionSummaryCounts.overdue_count +
    attentionSummaryCounts.awaiting_decision_count;

  const activeWorkflows = snapshot.workflows.filter(
    (workflow) =>
      Boolean(workflow.current_task_id) && workflow.completion_truth?.state !== 'verified'
  );
  const summary_strip: FounderSurfaceSummaryStrip = {
    active_initiative_count: activeWorkflows.length,
    active_agent_count: new Set(
      activeWorkflows.map((workflow) => workflow.owner_agent).filter(Boolean)
    ).size,
    at_risk_count: snapshot.workflows.filter((workflow) => isWorkflowAtRisk(workflow, index))
      .length,
  };

  const venture_rates: FounderSurfaceVentureRate[] = snapshot.venture_coverage
    .map((coverage) => {
      const ventureWorkflows = snapshot.workflows.filter(
        (workflow) => workflow.venture_id === coverage.venture_id
      );
      const ventureAttention = surfacedAttention.filter(
        (item) => item.venture_id === coverage.venture_id
      );
      const ventureNewlyComplete = normalizedAttention.filter(
        (item) =>
          item.venture_id === coverage.venture_id &&
          attentionCategoryForItem(item) === 'newly_complete'
      );
      const blocked_count = ventureAttention.filter(
        (item) => attentionCategoryForItem(item) === 'blocked'
      ).length;
      const overdue_count = ventureAttention.filter(
        (item) => attentionCategoryForItem(item) === 'overdue'
      ).length;
      const awaiting_decision_count = ventureAttention.filter(
        (item) => attentionCategoryForItem(item) === 'awaiting_decision'
      ).length;
      const newly_complete_count = ventureNewlyComplete.length;

      return {
        venture_id: coverage.venture_id,
        certified_autonomy_rate: coverage.certified_autonomy_rate,
        percentage: roundPercentage(coverage.certified_autonomy_rate),
        certified_workflow_count: coverage.certified_autonomous_count,
        workflow_count: coverage.workflow_count,
        critical_path_certified_rate: coverage.critical_path_certified_rate,
        active_initiative_count: ventureWorkflows.filter(
          (workflow) =>
            Boolean(workflow.current_task_id) && workflow.completion_truth?.state !== 'verified'
        ).length,
        blocked_count,
        overdue_count,
        awaiting_decision_count,
        newly_complete_count,
        updated_at: coverage.updated_at,
      };
    })
    .sort((a, b) => {
      const pressureA = a.blocked_count + a.overdue_count + a.awaiting_decision_count;
      const pressureB = b.blocked_count + b.overdue_count + b.awaiting_decision_count;
      return (
        pressureB - pressureA ||
        b.active_initiative_count - a.active_initiative_count ||
        b.certified_autonomy_rate - a.certified_autonomy_rate ||
        a.venture_id.localeCompare(b.venture_id)
      );
    });

  const trust_gains = snapshot.certifications
    .filter((certification) =>
      ['certified', 'ready_for_review'].includes(certification.certification_status)
    )
    .map((certification) => certification.workflow_id)
    .map((workflowId) => buildWorkflowTrustSummary(workflowId, index))
    .filter((summary): summary is FounderSurfaceWorkflowTrustSummary => Boolean(summary))
    .sort(compareTrustSummaryRecency)
    .slice(0, 5);

  const trust_degradations = snapshot.workflows
    .filter((workflow) => {
      const certification = index.certificationsByWorkflowId.get(workflow.workflow_id);
      const readiness = index.readinessByWorkflowId.get(workflow.workflow_id);
      return (
        workflow.state === 'under_review' ||
        certification?.certification_status === 'decertified' ||
        readiness?.readiness_label === 'degrading' ||
        readiness?.readiness_label === 'blocked'
      );
    })
    .map((workflow) => buildWorkflowTrustSummary(workflow.workflow_id, index))
    .filter((summary): summary is FounderSurfaceWorkflowTrustSummary => Boolean(summary))
    .sort(compareTrustSummaryRecency)
    .slice(0, 5);

  const human_review_burden = snapshot.readiness.reduce<Record<HumanReviewBurden, number>>(
    (counts, readiness) => {
      counts[readiness.human_review_burden] += 1;
      return counts;
    },
    { none: 0, low: 0, moderate: 0, high: 0 }
  );

  const earnedInterruption = overviewAttention.length > 0;

  return {
    primary_number,
    summary_strip,
    attention_summary: attentionSummaryCounts,
    venture_rates,
    surface_state: earnedInterruption
      ? {
          mode: 'attention_required',
          summary:
            overviewAttention.length === 1
              ? '1 workflow has earned interruption.'
              : `${overviewAttention.length} workflows have earned interruption.`,
          earned_interruption: true,
          interruption_count: overviewAttention.length,
        }
      : {
          mode: 'quiet',
          summary:
            newly_complete_items.length > 0
              ? `Quiet. Nothing needs your attention. ${newly_complete_items.length} workflow${newly_complete_items.length === 1 ? '' : 's'} newly complete.`
              : 'Certified Autonomy is steady. No workflows have earned interruption right now.',
          earned_interruption: false,
          interruption_count: 0,
        },
    attention_items: overviewAttention,
    newly_complete_items,
    trust_gains,
    trust_degradations,
    human_review_burden,
    updated_at: snapshot.updated_at,
  };
}

export function buildFounderSurfaceVentureCoverageView(
  snapshot: FounderSurfaceSnapshot
): FounderSurfaceVentureCoverageView {
  const index = buildSnapshotIndex(snapshot);

  const ventures: FounderSurfaceVentureCoverageEntry[] = snapshot.venture_coverage
    .map((coverage) => {
      const workflows = snapshot.workflows.filter(
        (workflow) => workflow.venture_id === coverage.venture_id
      );
      const stateDistribution = workflows.reduce<Record<WorkflowState, number>>(
        (counts, workflow) => {
          counts[workflow.state] += 1;
          return counts;
        },
        {
          human_native: 0,
          assisted: 0,
          governed_copilot: 0,
          certifying: 0,
          certified_autonomous: 0,
          under_review: 0,
        }
      );

      return {
        coverage,
        state_distribution: stateDistribution,
        critical_path: {
          workflow_count: coverage.critical_path_workflow_count,
          certified_rate: coverage.critical_path_certified_rate,
        },
        top_blockers: coverage.top_blockers ?? [],
        top_degrading_workflows: collectWorkflowTrustSummaries(
          coverage.top_degrading_workflows ?? [],
          index
        ),
        recent_promotions: collectWorkflowTrustSummaries(coverage.recent_promotions ?? [], index),
        recent_decertifications: collectWorkflowTrustSummaries(
          coverage.recent_decertifications ?? [],
          index
        ),
      } satisfies FounderSurfaceVentureCoverageEntry;
    })
    .sort(
      (a, b) =>
        b.coverage.certified_autonomy_rate - a.coverage.certified_autonomy_rate ||
        a.coverage.venture_id.localeCompare(b.coverage.venture_id)
    );

  return {
    ventures,
    updated_at: snapshot.updated_at,
  };
}

export function buildFounderSurfaceCertificationPipeline(
  snapshot: FounderSurfaceSnapshot
): FounderSurfaceCertificationPipeline {
  const index = buildSnapshotIndex(snapshot);
  const trustSummaries = snapshot.workflows
    .map((workflow) => buildWorkflowTrustSummary(workflow.workflow_id, index))
    .filter((summary): summary is FounderSurfaceWorkflowTrustSummary => Boolean(summary));

  const certifying = trustSummaries
    .filter(
      (summary) =>
        summary.certification.certification_status === 'candidate' ||
        summary.certification.certification_status === 'ready_for_review'
    )
    .sort(compareTrustSummaryRecency);

  const ready_for_review = trustSummaries
    .filter((summary) => summary.certification.certification_status === 'ready_for_review')
    .sort(compareTrustSummaryRecency);

  const recently_certified = trustSummaries
    .filter((summary) => summary.certification.certification_status === 'certified')
    .sort(compareTrustSummaryRecency);

  const under_review = trustSummaries
    .filter(
      (summary) =>
        summary.workflow.state === 'under_review' ||
        summary.certification.certification_status === 'decertified' ||
        summary.readiness.readiness_label === 'degrading' ||
        summary.readiness.readiness_label === 'blocked'
    )
    .sort(compareTrustSummaryRecency);

  const recently_decertified = trustSummaries
    .filter((summary) => summary.certification.certification_status === 'decertified')
    .sort(compareTrustSummaryRecency);

  return {
    certifying,
    ready_for_review,
    recently_certified,
    under_review,
    recently_decertified,
    updated_at: snapshot.updated_at,
  };
}

export function buildFounderSurfaceAgentCertificationView(
  snapshot: FounderSurfaceSnapshot
): FounderSurfaceAgentCertificationView {
  return {
    summaries: [...snapshot.agent_certifications],
    updated_at: snapshot.updated_at,
  };
}

export function buildFounderSurfaceWorkflowDetail(
  snapshot: FounderSurfaceSnapshot,
  workflowId: string
): FounderSurfaceWorkflowDetail | null {
  const index = buildSnapshotIndex(snapshot);
  const workflow = index.workflowsById.get(workflowId);
  const evidence_bundle = index.bundlesByWorkflowId.get(workflowId);
  const certification = index.certificationsByWorkflowId.get(workflowId);
  const readiness = index.readinessByWorkflowId.get(workflowId);

  if (!workflow || !evidence_bundle || !certification || !readiness) {
    return null;
  }

  const recent_runs = [...(index.runsByWorkflowId.get(workflowId) ?? [])].sort(
    (a, b) => toEpoch(b.finished_at) - toEpoch(a.finished_at)
  );
  const founder_attention = [...(index.attentionByWorkflowId.get(workflowId) ?? [])].sort(
    (a, b) => toEpoch(b.updated_at) - toEpoch(a.updated_at)
  );

  return {
    workflow,
    completion_truth:
      workflow.completion_truth ?? deriveCompletionTruthOverlay({ asOf: workflow.updated_at }),
    evidence_bundle,
    certification,
    readiness,
    recent_runs,
    founder_attention,
    efficiency_diagnosis: evidence_bundle.efficiency_diagnosis ?? null,
    updated_at: maxIso(
      [
        workflow.updated_at,
        evidence_bundle.updated_at,
        certification.last_evaluated_at,
        readiness.updated_at,
        ...recent_runs.map((run) => run.finished_at),
        ...founder_attention.map((item) => item.updated_at),
      ],
      snapshot.updated_at
    ),
  };
}

export function deriveFounderSurfaceSnapshot(
  source: FounderSurfaceSourceBundle
): FounderSurfaceSnapshot {
  const asOf = source.asOf ?? new Date().toISOString();
  const workflowContexts = new Map<string, WorkflowContext>();
  const operatorInterventions = source.operatorInterventions ?? [];

  for (const task of source.tasks) {
    const context = buildBaseWorkflowFromTask(task);
    workflowContexts.set(context.workflow.workflow_id, context);
  }

  for (const definition of source.workflowDefinitions) {
    const context = buildBaseWorkflowFromDefinition(definition, asOf);
    if (!workflowContexts.has(context.workflow.workflow_id)) {
      workflowContexts.set(context.workflow.workflow_id, context);
    }
  }

  const runSummaries = collectRunSummaries(source, workflowContexts);
  const signalMap = toTaskSignalMap(source.telemetryEvents);
  const runSummariesByWorkflowId = new Map<string, WorkflowRunSummary[]>();

  for (const summary of runSummaries) {
    const group = runSummariesByWorkflowId.get(summary.workflow_id) ?? [];
    group.push(summary);
    runSummariesByWorkflowId.set(summary.workflow_id, group);
  }

  // ── Family-level evidence pooling ──
  // First pass: compute evidence bundles per workflow so we can aggregate by family.
  const preBundles = new Map<
    string,
    { bundle: WorkflowEvidenceBundle; ventureId: string; family: string }
  >();
  for (const context of workflowContexts.values()) {
    const workflowRunSummaries = runSummariesByWorkflowId.get(context.workflow.workflow_id) ?? [];
    const relatedSignals = context.task ? (signalMap.get(context.task.id) ?? []) : [];
    const bundle = deriveEvidenceBundle(context, workflowRunSummaries, relatedSignals, asOf);
    preBundles.set(context.workflow.workflow_id, {
      bundle,
      ventureId: context.workflow.venture_id,
      family: context.workflow.workflow_family,
    });
  }

  // Aggregate by (venture_id, workflow_family) to build FamilyEvidence
  const familyKey = (ventureId: string, family: string) => `${ventureId}::${family}`;
  const familyAggregates = new Map<
    string,
    { count: number; runs: number; successes: number; failures: number; policyFailures: number }
  >();
  for (const { bundle, ventureId, family } of preBundles.values()) {
    const key = familyKey(ventureId, family);
    const agg = familyAggregates.get(key) ?? {
      count: 0,
      runs: 0,
      successes: 0,
      failures: 0,
      policyFailures: 0,
    };
    agg.count += 1;
    agg.runs += bundle.run_count;
    agg.successes += bundle.successful_run_count;
    agg.failures += bundle.failed_run_count;
    agg.policyFailures += bundle.policy_fail_count;
    familyAggregates.set(key, agg);
  }

  // Build FamilyEvidence map: trust is established when the family has enough
  // pooled runs with high success rate and zero policy failures.
  const familyEvidenceMap = new Map<string, FamilyEvidence>();
  for (const [key, agg] of familyAggregates.entries()) {
    const successRate = agg.runs > 0 ? agg.successes / agg.runs : 0;
    familyEvidenceMap.set(key, {
      workflowCount: agg.count,
      totalRuns: agg.runs,
      successfulRuns: agg.successes,
      failedRuns: agg.failures,
      policyFailures: agg.policyFailures,
      familyTrustEstablished: agg.runs >= 5 && successRate >= 0.9 && agg.policyFailures === 0,
    });
  }

  const evidenceBundles: WorkflowEvidenceBundle[] = [];
  const certifications: WorkflowCertification[] = [];
  const readiness: WorkflowReadiness[] = [];
  const workflows: Workflow[] = [];

  for (const context of workflowContexts.values()) {
    const workflowRunSummaries = runSummariesByWorkflowId.get(context.workflow.workflow_id) ?? [];
    const relatedSignals = context.task ? (signalMap.get(context.task.id) ?? []) : [];
    const bundle = preBundles.get(context.workflow.workflow_id)!.bundle;
    const fKey = familyKey(context.workflow.venture_id, context.workflow.workflow_family);
    const familyEvidence = familyEvidenceMap.get(fKey);
    const judgment = judgeWorkflowForFounderSurface({
      workflow: context.workflow,
      task: context.task,
      definition: context.definition,
      evidenceBundle: bundle,
      runSummaries: workflowRunSummaries,
      relatedSignals,
      asOf,
      familyEvidence,
    });

    const completionTruth = deriveCompletionTruthOverlay({
      task: context.task,
      evidenceBundle: {
        ...bundle,
        efficiency_diagnosis: judgment.efficiency_diagnosis,
      },
      relatedSignals,
      asOf,
    });

    evidenceBundles.push({
      ...bundle,
      efficiency_diagnosis: judgment.efficiency_diagnosis,
    });
    certifications.push(judgment.certification);
    readiness.push(judgment.readiness);
    workflows.push({
      ...judgment.workflow,
      completion_truth: completionTruth,
    });
  }

  const bundlesByWorkflowId = new Map(
    evidenceBundles.map((bundle) => [bundle.workflow_id, bundle])
  );
  const certificationsByWorkflowId = new Map(
    certifications.map((certification) => [certification.workflow_id, certification])
  );
  const readinessByWorkflowId = new Map(readiness.map((model) => [model.workflow_id, model]));
  const ventureCoverage = deriveVentureCoverage(
    workflows,
    readinessByWorkflowId,
    certificationsByWorkflowId,
    asOf
  );
  const attentionItems = deriveAttentionItems(
    workflows,
    bundlesByWorkflowId,
    certificationsByWorkflowId,
    readinessByWorkflowId,
    runSummariesByWorkflowId,
    workflowContexts,
    asOf
  );
  const agentCertifications: AgentCertificationSummary[] = summarizeAgentCertificationsForAtlas({
    workflows,
    evidenceBundles,
    certifications,
    operatorInterventions,
    asOf,
  });

  return {
    workflows: workflows.sort((a, b) => a.workflow_id.localeCompare(b.workflow_id)),
    evidence_bundles: evidenceBundles.sort((a, b) => a.workflow_id.localeCompare(b.workflow_id)),
    certifications: certifications.sort((a, b) => a.workflow_id.localeCompare(b.workflow_id)),
    readiness: readiness.sort((a, b) => a.workflow_id.localeCompare(b.workflow_id)),
    run_summaries: runSummaries,
    venture_coverage: ventureCoverage,
    attention_items: attentionItems,
    agent_certifications: agentCertifications,
    updated_at: maxIso(
      [
        ...workflows.map((workflow) => workflow.updated_at),
        ...evidenceBundles.map((bundle) => bundle.updated_at),
        ...certifications.map((certification) => certification.last_evaluated_at),
        ...readiness.map((model) => model.updated_at),
        ...ventureCoverage.map((coverage) => coverage.updated_at),
        ...agentCertifications.map((summary) => summary.last_evaluated_at),
      ],
      asOf
    ),
  };
}

export class FounderSurfaceReadModelService {
  private readonly taskService: Pick<TaskService, 'listTasks'>;
  private readonly telemetryService: Pick<TelemetryService, 'getEvents'>;
  private readonly workflowRunService: Pick<WorkflowRunService, 'listRuns'>;
  private readonly workflowService: Pick<WorkflowService, 'listWorkflows'>;
  private readonly operatorInterventionService: Pick<OperatorInterventionService, 'listReceipts'>;

  constructor(options: FounderSurfaceReadModelServiceOptions = {}) {
    this.taskService = options.taskService ?? getTaskService();
    this.telemetryService = options.telemetryService ?? getTelemetryService();
    this.workflowRunService = options.workflowRunService ?? getWorkflowRunService();
    this.workflowService = options.workflowService ?? getWorkflowService();
    this.operatorInterventionService =
      options.operatorInterventionService ?? operatorInterventionService;
  }

  async collectSourceBundle(): Promise<FounderSurfaceSourceBundle> {
    const [tasks, telemetryEvents, workflowRuns, workflowDefinitions, operatorInterventions] =
      await Promise.all([
        this.taskService.listTasks(),
        this.telemetryService.getEvents({ limit: 5000 }),
        this.workflowRunService.listRuns().catch(() => []),
        this.workflowService.listWorkflows().catch(() => []),
        this.operatorInterventionService.listReceipts().catch(() => []),
      ]);

    return {
      tasks,
      telemetryEvents,
      workflowRuns,
      workflowDefinitions,
      operatorInterventions,
      asOf: new Date().toISOString(),
    };
  }

  async getSnapshot(): Promise<FounderSurfaceSnapshot> {
    return deriveFounderSurfaceSnapshot(await this.collectSourceBundle());
  }

  async getExecutiveOverview(): Promise<FounderSurfaceExecutiveOverview> {
    return buildFounderSurfaceExecutiveOverview(await this.getSnapshot());
  }

  async getVentureCoverageView(): Promise<FounderSurfaceVentureCoverageView> {
    return buildFounderSurfaceVentureCoverageView(await this.getSnapshot());
  }

  async getCertificationPipeline(): Promise<FounderSurfaceCertificationPipeline> {
    return buildFounderSurfaceCertificationPipeline(await this.getSnapshot());
  }

  async getAgentCertificationView(): Promise<FounderSurfaceAgentCertificationView> {
    return buildFounderSurfaceAgentCertificationView(await this.getSnapshot());
  }

  async getWorkflowDetail(workflowId: string): Promise<FounderSurfaceWorkflowDetail | null> {
    return buildFounderSurfaceWorkflowDetail(await this.getSnapshot(), workflowId);
  }
}

let founderSurfaceReadModelServiceInstance: FounderSurfaceReadModelService | null = null;

export function getFounderSurfaceReadModelService(): FounderSurfaceReadModelService {
  if (!founderSurfaceReadModelServiceInstance) {
    founderSurfaceReadModelServiceInstance = new FounderSurfaceReadModelService();
  }

  return founderSurfaceReadModelServiceInstance;
}
