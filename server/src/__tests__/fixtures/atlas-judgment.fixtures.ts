import type {
  Task,
  Workflow,
  WorkflowEvidenceBundle,
  WorkflowRunSummary,
} from '@veritas-kanban/shared';

export const ATLAS_FIXTURE_AS_OF = '2026-03-17T06:00:00.000Z';

function iso(hour: number, minute = 0): string {
  return `2026-03-17T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}

export function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    workflow_id: overrides.workflow_id ?? 'wf-base',
    name: overrides.name ?? 'Base workflow',
    venture_id: overrides.venture_id ?? 'lab-vos-system',
    workflow_family: overrides.workflow_family ?? 'operations',
    description: overrides.description ?? 'Base founder-surface workflow fixture.',
    owner_agent: overrides.owner_agent ?? 'ATLAS',
    critical_path: overrides.critical_path ?? false,
    risk_class: overrides.risk_class ?? 'moderate',
    data_class: overrides.data_class ?? 'B',
    state: overrides.state ?? 'human_native',
    status_reason: overrides.status_reason ?? 'Awaiting ATLAS judgment.',
    success_criteria: overrides.success_criteria ?? [
      'Produce correct outcome',
      'Stay inside policy',
    ],
    created_at: overrides.created_at ?? iso(1),
    updated_at: overrides.updated_at ?? iso(5),
    current_task_id: overrides.current_task_id ?? null,
    current_thread_id: overrides.current_thread_id ?? null,
    overlay_id: overrides.overlay_id ?? null,
    allowed_escalation_modes: overrides.allowed_escalation_modes ?? [],
    human_review_required: overrides.human_review_required ?? false,
    human_review_reason: overrides.human_review_reason ?? null,
    notes: overrides.notes ?? null,
    completion_truth: overrides.completion_truth ?? null,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? 'task-base',
    title: overrides.title ?? 'Base task',
    description: overrides.description ?? 'Base task backing the workflow fixture.',
    type: overrides.type ?? 'ops',
    status: overrides.status ?? 'done',
    priority: overrides.priority ?? 'medium',
    project: overrides.project ?? 'lab-vos-system',
    created: overrides.created ?? iso(1),
    updated: overrides.updated ?? iso(5),
    agent: overrides.agent ?? 'ATLAS',
    verificationSteps: overrides.verificationSteps,
    deliverables: overrides.deliverables,
    blockedReason: overrides.blockedReason,
    comments: overrides.comments,
    subtasks: overrides.subtasks,
    automation: overrides.automation,
    attempt: overrides.attempt,
  };
}

export function makeEvidenceBundle(
  overrides: Partial<WorkflowEvidenceBundle> = {}
): WorkflowEvidenceBundle {
  return {
    workflow_id: overrides.workflow_id ?? 'wf-base',
    window_start: overrides.window_start ?? iso(2),
    window_end: overrides.window_end ?? iso(5),
    run_count: overrides.run_count ?? 0,
    successful_run_count: overrides.successful_run_count ?? 0,
    failed_run_count: overrides.failed_run_count ?? 0,
    policy_pass_count: overrides.policy_pass_count ?? 0,
    policy_fail_count: overrides.policy_fail_count ?? 0,
    halt_pass_count: overrides.halt_pass_count ?? 0,
    halt_fail_count: overrides.halt_fail_count ?? 0,
    hidden_cleanup_incidents: overrides.hidden_cleanup_incidents ?? 0,
    evidence_complete: overrides.evidence_complete ?? false,
    updated_at: overrides.updated_at ?? iso(5),
    avg_duration_ms: overrides.avg_duration_ms ?? null,
    avg_cost: overrides.avg_cost ?? null,
    p95_duration_ms: overrides.p95_duration_ms ?? null,
    p95_cost: overrides.p95_cost ?? null,
    quality_score: overrides.quality_score ?? null,
    quality_method: overrides.quality_method ?? null,
    artifact_count: overrides.artifact_count ?? 0,
    human_review_events: overrides.human_review_events ?? 0,
    linked_artifacts: overrides.linked_artifacts ?? [],
    linked_task_ids: overrides.linked_task_ids ?? [],
    linked_event_ids: overrides.linked_event_ids ?? [],
  };
}

export function makeRunSummary(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    run_id: overrides.run_id ?? `run-${Math.random().toString(36).slice(2, 8)}`,
    workflow_id: overrides.workflow_id ?? 'wf-base',
    task_id: overrides.task_id ?? 'task-base',
    agent_id: overrides.agent_id ?? 'ATLAS',
    started_at: overrides.started_at ?? iso(2),
    finished_at: overrides.finished_at ?? iso(2, 5),
    success: overrides.success ?? true,
    policy_result: overrides.policy_result ?? 'pass',
    halt_result: overrides.halt_result ?? 'pass',
    requires_human_intervention: overrides.requires_human_intervention ?? false,
    failure_signature: overrides.failure_signature ?? null,
    duration_ms: overrides.duration_ms ?? 300000,
    cost: overrides.cost ?? 0.15,
    model: overrides.model ?? 'openai-codex/gpt-5.4',
    quality_score: overrides.quality_score ?? 0.95,
    artifact_ids: overrides.artifact_ids ?? [],
    event_ids: overrides.event_ids ?? [],
  };
}
