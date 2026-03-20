import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { AnyTelemetryEvent, OperatorInterventionReceipt, Task } from '@veritas-kanban/shared';
import type { WorkflowDefinition, WorkflowRun } from '../../types/workflow.js';
import {
  buildFounderSurfaceAgentCertificationView,
  buildFounderSurfaceCertificationPipeline,
  buildFounderSurfaceExecutiveOverview,
  buildFounderSurfaceVentureCoverageView,
  buildFounderSurfaceWorkflowDetail,
  deriveFounderSurfaceSnapshot,
  FounderSurfaceReadModelService,
  type FounderSurfaceSourceBundle,
} from '../../services/founder-surface-service.js';
import { TaskService } from '../../services/task-service.js';
import { TelemetryService } from '../../services/telemetry-service.js';
import { WorkflowService } from '../../services/workflow-service.js';
import { WorkflowRunService } from '../../services/workflow-run-service.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const NOW = '2026-03-17T06:00:00.000Z';

const retentionTask: Task = {
  id: 'task_20260317_reten01',
  title: 'Klaviyo retention execution readiness',
  description: 'Govern the retention lane with enough proof to promote autonomy.',
  type: 'ops',
  status: 'done',
  priority: 'high',
  project: 'nxt-klaviyo-retention',
  created: '2026-03-17T02:00:00.000Z',
  updated: '2026-03-17T05:00:00.000Z',
  agent: 'MAYA',
  verificationSteps: [
    {
      id: 'verify_output',
      description: 'Retention output was manually spot-checked and approved.',
      checked: true,
    },
    {
      id: 'verify_halt',
      description: 'Halt path observed and accepted for missing inputs.',
      checked: true,
    },
  ],
  deliverables: [
    {
      id: 'deliverable_report',
      title: 'Retention rollout evidence report',
      type: 'document',
      status: 'accepted',
      created: '2026-03-17T04:58:00.000Z',
      path: '/tmp/retention-rollout-report.md',
    },
  ],
};

const blockedTask: Task = {
  id: 'task_20260317_block01',
  title: 'Permission model compliance review',
  description: 'Review permission drift and boundary enforcement for the ACP runtime.',
  type: 'ops',
  status: 'blocked',
  priority: 'high',
  project: 'lab-vos-system',
  created: '2026-03-17T01:00:00.000Z',
  updated: '2026-03-17T05:10:00.000Z',
  agent: 'ATLAS',
  blockedReason: {
    category: 'technical-snag',
    note: 'Dispatch blocked by policy gate',
  },
  comments: [
    {
      id: 'comment_cleanup',
      author: 'SETH',
      text: 'Manual cleanup is required after the latest boundary violation.',
      timestamp: '2026-03-17T05:09:00.000Z',
    },
  ],
};

const founderDecisionTask: Task = {
  id: 'task_20260317_founder01',
  title: 'Founder approval for pricing override',
  description: 'Shared-venture launch is waiting on founder approval for the pricing override.',
  type: 'ops',
  status: 'blocked',
  priority: 'critical',
  project: 'lab-vos-system',
  created: '2026-03-17T02:30:00.000Z',
  updated: '2026-03-17T05:30:00.000Z',
  agent: 'MAYA',
  blockedReason: {
    category: 'waiting-on-feedback',
    note: 'Need founder approval to clear the pricing override and ship.',
  },
};

const overdueTask: Task = {
  id: 'task_20260317_overdue01',
  title: 'Founder surface handoff confirmation',
  description: 'Finish the delegated founder-surface handoff and checkpoint truth.',
  type: 'ops',
  status: 'in-progress',
  priority: 'high',
  project: 'lab-vos-system',
  created: '2026-03-17T00:30:00.000Z',
  updated: '2026-03-17T01:00:00.000Z',
  agent: 'MAYA',
  automation: {
    sessionKey: 'agent:maya:subagent:overdue',
    spawnedAt: '2026-03-17T01:00:00.000Z',
  },
};

const researchTask: Task = {
  id: 'task_20260317_research01',
  title: 'LOD logistics workflow model',
  description: 'Define current-state and target-state LOD ops.',
  type: 'research',
  status: 'todo',
  priority: 'medium',
  project: 'nxt-lod-logistics',
  created: '2026-03-17T00:00:00.000Z',
  updated: '2026-03-17T00:00:00.000Z',
};

const untouchedBacklogTask: Task = {
  id: 'task_20260317_backlog01',
  title: 'Mission Control truth-audit checks',
  description: 'Add checks that flag stale or contradictory UI states.',
  type: 'ops',
  status: 'todo',
  priority: 'high',
  project: 'eng-dev-factory',
  created: '2026-03-17T00:10:00.000Z',
  updated: '2026-03-17T00:10:00.000Z',
  subtasks: [
    {
      id: 'subtask_backlog_truth_gate',
      title: 'Implement truth gate for stale or contradictory UI states',
      completed: false,
      created: '2026-03-17T00:10:00.000Z',
    },
  ],
};

const workflowDefinition: WorkflowDefinition = {
  id: 'vos-truth-reconcile-sweep',
  name: 'VOS Truth Reconcile Sweep',
  version: 1,
  description: 'Reconciles board truth against workflow and artifact evidence.',
  agents: [
    {
      id: 'seth-planner',
      name: 'SETH Planner',
      role: 'reviewer',
      description: 'Reviews founder-surface truth.',
      model: 'openai-codex/gpt-5.4',
    },
  ],
  steps: [
    {
      id: 'inspect-truth',
      name: 'Inspect truth',
      type: 'agent',
      agent: 'seth-planner',
      input: 'Inspect workflow and board truth.',
      acceptance_criteria: ['TRUTH_REPORT'],
      on_fail: { escalate_to: 'human' },
    },
  ],
};

const completedRun: WorkflowRun = {
  id: 'run_1773703875150_k8rlRN1Z',
  workflowId: 'vos-truth-reconcile-sweep',
  workflowVersion: 1,
  status: 'completed',
  currentStep: 'inspect-truth',
  context: {},
  startedAt: '2026-03-17T03:30:00.000Z',
  completedAt: '2026-03-17T03:34:00.000Z',
  lastCheckpoint: '2026-03-17T03:34:00.000Z',
  steps: [
    {
      stepId: 'inspect-truth',
      agent: 'seth-planner',
      status: 'completed',
      retries: 0,
      startedAt: '2026-03-17T03:30:00.000Z',
      completedAt: '2026-03-17T03:34:00.000Z',
      duration: 240,
    },
  ],
};

const failedRun: WorkflowRun = {
  id: 'run_1773704000000_failXX',
  workflowId: 'vos-truth-reconcile-sweep',
  workflowVersion: 1,
  status: 'failed',
  currentStep: 'inspect-truth',
  context: {},
  startedAt: '2026-03-17T04:00:00.000Z',
  completedAt: '2026-03-17T04:02:00.000Z',
  lastCheckpoint: '2026-03-17T04:02:00.000Z',
  error: 'Agent timed out',
  steps: [
    {
      stepId: 'inspect-truth',
      agent: 'seth-planner',
      status: 'failed',
      retries: 1,
      startedAt: '2026-03-17T04:00:00.000Z',
      completedAt: '2026-03-17T04:02:00.000Z',
      duration: 120,
      error: 'Agent timed out',
    },
  ],
};

const retentionRunStart: AnyTelemetryEvent = {
  id: 'evt_r_start_1',
  type: 'run.started',
  timestamp: '2026-03-17T02:05:00.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  attemptId: 'attempt_reten_1',
  model: 'openai-codex/gpt-5.4',
};

const retentionRunComplete: AnyTelemetryEvent = {
  id: 'evt_r_complete_1',
  type: 'run.completed',
  timestamp: '2026-03-17T02:09:00.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  attemptId: 'attempt_reten_1',
  success: true,
  durationMs: 240000,
};

const retentionRunTokens: AnyTelemetryEvent = {
  id: 'evt_r_tokens_1',
  type: 'run.tokens',
  timestamp: '2026-03-17T02:09:10.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  attemptId: 'attempt_reten_1',
  inputTokens: 1200,
  outputTokens: 400,
  totalTokens: 1600,
  cost: 0.12,
  model: 'openai-codex/gpt-5.4',
};

const retentionRunStart2: AnyTelemetryEvent = {
  id: 'evt_r_start_2',
  type: 'run.started',
  timestamp: '2026-03-17T03:05:00.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  attemptId: 'attempt_reten_2',
  model: 'openai-codex/gpt-5.4',
};

const retentionRunComplete2: AnyTelemetryEvent = {
  id: 'evt_r_complete_2',
  type: 'run.completed',
  timestamp: '2026-03-17T03:08:00.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  attemptId: 'attempt_reten_2',
  success: true,
  durationMs: 180000,
};

const retentionRunStart3: AnyTelemetryEvent = {
  id: 'evt_r_start_3',
  type: 'run.started',
  timestamp: '2026-03-17T04:10:00.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  attemptId: 'attempt_reten_3',
  model: 'openai-codex/gpt-5.4',
};

const retentionRunComplete3: AnyTelemetryEvent = {
  id: 'evt_r_complete_3',
  type: 'run.completed',
  timestamp: '2026-03-17T04:14:00.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  attemptId: 'attempt_reten_3',
  success: true,
  durationMs: 240000,
};

const retentionCompletionSignal: AnyTelemetryEvent = {
  id: 'evt_retention_completion',
  type: 'signal.completion',
  timestamp: '2026-03-17T05:01:00.000Z',
  taskId: retentionTask.id,
  project: retentionTask.project,
  agent: 'MAYA',
  severity: 'info',
  summary: 'Completion truth reconciled across board, artifact, channel, and evidence surfaces.',
  classification: 'PASS',
  missingSurfaces: [],
} as any;

const policyBlockedSignal: AnyTelemetryEvent = {
  id: 'evt_blocked_signal',
  type: 'signal.dispatch_blocked',
  timestamp: '2026-03-17T05:08:00.000Z',
  taskId: blockedTask.id,
  project: blockedTask.project,
  agent: 'ATLAS',
  severity: 'action_required',
  summary: 'Dispatch blocked by policy gate — boundary enforcement failed.',
  antiPatterns: ['policy_gate_fail'],
};

const mayaOperatorReceipt: OperatorInterventionReceipt = {
  intervention_id: 'oir_maya_dispatch_quality',
  agent_id: 'MAYA',
  kind: 'dispatch_quality',
  summary: 'Tightened dispatch quality for founder-surface work.',
  why_it_mattered: 'Reduced wrapper-card drift and made successor state legible.',
  created_at: '2026-03-17T05:15:00.000Z',
  verified_at: '2026-03-17T05:20:00.000Z',
  verification_status: 'verified',
  resolution_scope: 'cross_surface',
  evidence_paths: ['/vault/projects/mission_control/dispatch-quality-note.md'],
  affected_tasks: [retentionTask.id],
  affected_surfaces: ['board', 'dispatch-gate'],
  verified_outcomes: ['Founder-surface dispatches now land with explicit artifact targets'],
};

function makeBundle(
  overrides: Partial<FounderSurfaceSourceBundle> = {}
): FounderSurfaceSourceBundle {
  return {
    tasks: [retentionTask, blockedTask, researchTask],
    telemetryEvents: [
      retentionRunStart,
      retentionRunComplete,
      retentionRunTokens,
      retentionRunStart2,
      retentionRunComplete2,
      retentionRunStart3,
      retentionRunComplete3,
      retentionCompletionSignal,
      policyBlockedSignal,
    ],
    workflowDefinitions: [workflowDefinition],
    workflowRuns: [completedRun, failedRun],
    operatorInterventions: [mayaOperatorReceipt],
    asOf: NOW,
    ...overrides,
  };
}

function makeBundleWithOverdue(
  overrides: Partial<FounderSurfaceSourceBundle> = {}
): FounderSurfaceSourceBundle {
  return makeBundle({
    tasks: [retentionTask, blockedTask, overdueTask, researchTask],
    ...overrides,
  });
}

function makeBundleWithFounderDecision(
  overrides: Partial<FounderSurfaceSourceBundle> = {}
): FounderSurfaceSourceBundle {
  return makeBundle({
    tasks: [retentionTask, blockedTask, founderDecisionTask, researchTask],
    ...overrides,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('deriveFounderSurfaceSnapshot — shape', () => {
  it('returns all six required read model arrays', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    expect(snapshot.workflows).toBeDefined();
    expect(snapshot.evidence_bundles).toBeDefined();
    expect(snapshot.certifications).toBeDefined();
    expect(snapshot.readiness).toBeDefined();
    expect(snapshot.run_summaries).toBeDefined();
    expect(snapshot.venture_coverage).toBeDefined();
    expect(snapshot.attention_items).toBeDefined();
    expect(snapshot.agent_certifications).toBeDefined();
    expect(snapshot.updated_at).toBeDefined();
  });

  it('produces one Workflow per task plus one per workflow definition', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    // 3 tasks + 1 workflow definition (new id not in tasks)
    expect(snapshot.workflows.length).toBe(4);
    expect(snapshot.evidence_bundles.length).toBe(4);
    expect(snapshot.certifications.length).toBe(4);
    expect(snapshot.readiness.length).toBe(4);
  });

  it('every workflow has a stable workflow_id', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const workflow of snapshot.workflows) {
      expect(typeof workflow.workflow_id).toBe('string');
      expect(workflow.workflow_id.length).toBeGreaterThan(0);
    }
  });

  it('every workflow has a valid workflow_family', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const families = [
      'classification',
      'content_production',
      'compliance_review',
      'retention_execution',
      'handoff_routing',
      'completion_reconciliation',
      'research',
      'implementation',
      'operations',
      'governance',
      'quality_assurance',
      'incident_response',
      'automation_control',
    ];
    for (const workflow of snapshot.workflows) {
      expect(families).toContain(workflow.workflow_family);
    }
  });

  it('every workflow has a valid state', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const states = [
      'human_native',
      'assisted',
      'governed_copilot',
      'certifying',
      'certified_autonomous',
      'under_review',
    ];
    for (const workflow of snapshot.workflows) {
      expect(states).toContain(workflow.state);
      expect(typeof workflow.status_reason).toBe('string');
      expect(workflow.status_reason.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveFounderSurfaceSnapshot — Workflow derivation', () => {
  it('infers retention_execution family for the retention task', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const workflow = snapshot.workflows.find((w) => w.workflow_id === retentionTask.id);
    expect(workflow).toBeDefined();
    expect(workflow?.workflow_family).toBe('retention_execution');
  });

  it('assigns the correct venture_id from task project', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const retentionWorkflow = snapshot.workflows.find((w) => w.workflow_id === retentionTask.id);
    const blockedWorkflow = snapshot.workflows.find((w) => w.workflow_id === blockedTask.id);
    expect(retentionWorkflow?.venture_id).toBe('nxt-klaviyo-retention');
    expect(blockedWorkflow?.venture_id).toBe('lab-vos-system');
  });

  it('marks critical_path true for high-priority tasks', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const retention = snapshot.workflows.find((w) => w.workflow_id === retentionTask.id);
    expect(retention?.critical_path).toBe(true);
  });

  it('marks critical_path false for medium-priority research task', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const research = snapshot.workflows.find((w) => w.workflow_id === researchTask.id);
    expect(research?.critical_path).toBe(false);
  });

  it('infers research family for research-type task', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const research = snapshot.workflows.find((w) => w.workflow_id === researchTask.id);
    expect(research?.workflow_family).toBe('research');
  });

  it('workflow definition produces a governed_copilot or under_review state (not human_native)', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const defnWorkflow = snapshot.workflows.find((w) =>
      w.workflow_id.includes('vos-truth-reconcile')
    );
    // Must exist
    expect(defnWorkflow).toBeDefined();
    // A definition with mixed run results should land in governed_copilot or under_review,
    // not fall back to human_native (which would mean evidence derivation missed it entirely).
    expect(defnWorkflow?.state).not.toBe('human_native');
    expect(['governed_copilot', 'under_review', 'certifying', 'certified_autonomous']).toContain(
      defnWorkflow?.state
    );
  });

  it('links current_task_id for task-derived workflows', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const retention = snapshot.workflows.find((w) => w.workflow_id === retentionTask.id);
    expect(retention?.current_task_id).toBe(retentionTask.id);
  });

  it('adds deterministic completion truth overlays to workflow payloads', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const retention = snapshot.workflows.find((w) => w.workflow_id === retentionTask.id);
    const blocked = snapshot.workflows.find((w) => w.workflow_id === blockedTask.id);
    const research = snapshot.workflows.find((w) => w.workflow_id === researchTask.id);

    expect(retention?.completion_truth).toMatchObject({
      state: 'verified',
      board: expect.objectContaining({ state: 'verified' }),
      artifact: expect.objectContaining({ state: 'verified' }),
      channel: expect.objectContaining({ state: 'verified' }),
      evidence: expect.objectContaining({ state: 'verified' }),
    });
    expect(blocked?.completion_truth).toMatchObject({
      state: 'pending',
      board: expect.objectContaining({ state: 'pending' }),
      channel: expect.objectContaining({ state: 'pending' }),
    });
    expect(research?.completion_truth).toMatchObject({
      state: 'pending',
      board: expect.objectContaining({ state: 'pending' }),
    });
  });

  it('marks done work at_risk when channel truth cannot actually be established', () => {
    const snapshot = deriveFounderSurfaceSnapshot(
      makeBundle({
        telemetryEvents: [
          retentionRunStart,
          retentionRunComplete,
          retentionRunTokens,
          retentionRunStart2,
          retentionRunComplete2,
          retentionRunStart3,
          retentionRunComplete3,
          policyBlockedSignal,
        ],
      })
    );
    const retention = snapshot.workflows.find((w) => w.workflow_id === retentionTask.id);

    expect(retention?.completion_truth).toMatchObject({
      state: 'at_risk',
      channel: expect.objectContaining({ state: 'at_risk' }),
    });
    expect(retention?.completion_truth?.summary.toLowerCase()).toContain('at risk');
  });
});

describe('deriveFounderSurfaceSnapshot — WorkflowEvidenceBundle', () => {
  it('counts runs correctly for the retention workflow', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === retentionTask.id);
    expect(bundle).toBeDefined();
    expect(bundle?.run_count).toBe(3);
    expect(bundle?.successful_run_count).toBe(3);
    expect(bundle?.failed_run_count).toBe(0);
  });

  it('marks evidence_complete when verification + artifact coverage present', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === retentionTask.id);
    expect(bundle?.evidence_complete).toBe(true);
  });

  it('records policy_fail_count for the blocked task with dispatch blocked signal', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === blockedTask.id);
    expect(bundle).toBeDefined();
    expect(bundle?.policy_fail_count).toBeGreaterThan(0);
  });

  it('records halt_fail_count for the blocked task', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === blockedTask.id);
    expect(bundle?.halt_fail_count).toBeGreaterThan(0);
  });

  it('computes avg_duration_ms from telemetry run events', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === retentionTask.id);
    expect(typeof bundle?.avg_duration_ms).toBe('number');
    // Three runs: 240000, 180000, 240000 → avg 220000
    expect(bundle?.avg_duration_ms).toBeCloseTo(220000, -3);
  });

  it('computes avg_cost from token events', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === retentionTask.id);
    expect(typeof bundle?.avg_cost).toBe('number');
    // Only one token event with cost=0.12; other two runs have no token events
    expect(bundle?.avg_cost).toBe(0.12);
  });

  it('workflow definition runs are captured in its evidence bundle', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const defnWorkflow = snapshot.workflows.find((w) =>
      w.workflow_id.includes('vos-truth-reconcile')
    )!;
    const bundle = snapshot.evidence_bundles.find(
      (b) => b.workflow_id === defnWorkflow.workflow_id
    );
    expect(bundle).toBeDefined();
    // completedRun + failedRun → 2 runs
    expect(bundle?.run_count).toBe(2);
    expect(bundle?.successful_run_count).toBe(1);
    expect(bundle?.failed_run_count).toBe(1);
  });
});

describe('deriveFounderSurfaceSnapshot — WorkflowCertification', () => {
  it('retention workflow with 3 clean runs reaches at least candidate status', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const cert = snapshot.certifications.find((c) => c.workflow_id === retentionTask.id);
    expect(cert).toBeDefined();
    const promotedStatuses = ['candidate', 'ready_for_review', 'certified'];
    expect(promotedStatuses).toContain(cert?.certification_status);
  });

  it('blocked task with policy failures does not reach certified status', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const cert = snapshot.certifications.find((c) => c.workflow_id === blockedTask.id);
    expect(cert).toBeDefined();
    expect(cert?.certification_status).not.toBe('certified');
  });

  it('every certification has a non-empty certification_reason', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const cert of snapshot.certifications) {
      expect(typeof cert.certification_reason).toBe('string');
      expect(cert.certification_reason.length).toBeGreaterThan(0);
    }
  });

  it('every certification has a last_evaluated_at timestamp', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const cert of snapshot.certifications) {
      expect(typeof cert.last_evaluated_at).toBe('string');
      expect(cert.last_evaluated_at.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveFounderSurfaceSnapshot — WorkflowReadiness', () => {
  it('retention workflow readiness is not blocked', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const readiness = snapshot.readiness.find((r) => r.workflow_id === retentionTask.id);
    expect(readiness).toBeDefined();
    expect(readiness?.readiness_label).not.toBe('blocked');
  });

  it('blocked task readiness label is blocked', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const readiness = snapshot.readiness.find((r) => r.workflow_id === blockedTask.id);
    expect(readiness?.readiness_label).toBe('blocked');
  });

  it('every readiness model has human_review_burden within allowed values', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const allowed = ['none', 'low', 'moderate', 'high'];
    for (const r of snapshot.readiness) {
      expect(allowed).toContain(r.human_review_burden);
    }
  });

  it('research task has structural_limits for research judgment', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const readiness = snapshot.readiness.find((r) => r.workflow_id === researchTask.id);
    expect(readiness?.structural_limits.length).toBeGreaterThan(0);
  });

  it('blocked task has at least one temporary_blocker', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const readiness = snapshot.readiness.find((r) => r.workflow_id === blockedTask.id);
    expect(readiness?.temporary_blockers.length).toBeGreaterThan(0);
  });

  it('every readiness record has a recommended_next_action', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const r of snapshot.readiness) {
      expect(typeof r.recommended_next_action).toBe('string');
      expect((r.recommended_next_action ?? '').length).toBeGreaterThan(0);
    }
  });
});

describe('deriveFounderSurfaceSnapshot — WorkflowRunSummary', () => {
  it('produces run summaries from telemetry paired events', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    // 3 telemetry run pairs from retention task
    const retentionRuns = snapshot.run_summaries.filter((s) => s.workflow_id === retentionTask.id);
    expect(retentionRuns.length).toBe(3);
  });

  it('retention run summaries are all successful', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const retentionRuns = snapshot.run_summaries.filter((s) => s.workflow_id === retentionTask.id);
    for (const run of retentionRuns) {
      expect(run.success).toBe(true);
    }
  });

  it('retention run summaries carry duration_ms', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const run = snapshot.run_summaries.find(
      (s) => s.run_id === 'attempt_reten_1' && s.workflow_id === retentionTask.id
    );
    expect(run?.duration_ms).toBe(240000);
  });

  it('retention run summary with cost carries avg_cost', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const run = snapshot.run_summaries.find((s) => s.run_id === 'attempt_reten_1');
    expect(run?.cost).toBe(0.12);
  });

  it('engine workflow runs are captured as WorkflowRunSummaries', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const defnWorkflow = snapshot.workflows.find((w) =>
      w.workflow_id.includes('vos-truth-reconcile')
    )!;
    const defnRuns = snapshot.run_summaries.filter(
      (s) => s.workflow_id === defnWorkflow.workflow_id
    );
    expect(defnRuns.length).toBe(2);
    const completed = defnRuns.find((r) => r.run_id === completedRun.id);
    const failed = defnRuns.find((r) => r.run_id === failedRun.id);
    expect(completed?.success).toBe(true);
    expect(failed?.success).toBe(false);
    expect(failed?.failure_signature).toContain('timed out');
  });

  it('run summaries have valid policy_result values', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const valid = ['pass', 'fail', 'unknown'];
    for (const s of snapshot.run_summaries) {
      expect(valid).toContain(s.policy_result);
      expect(valid).toContain(s.halt_result);
    }
  });
});

describe('deriveFounderSurfaceSnapshot — VentureCoverage', () => {
  it('produces one VentureCoverage per distinct venture_id', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const ventureIds = new Set(snapshot.workflows.map((w) => w.venture_id));
    expect(snapshot.venture_coverage.length).toBe(ventureIds.size);
  });

  it('venture_coverage counts add up correctly', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const coverage of snapshot.venture_coverage) {
      const total =
        coverage.certified_autonomous_count +
        coverage.governed_copilot_count +
        coverage.certifying_count +
        coverage.human_native_count +
        coverage.assisted_count +
        coverage.under_review_count;
      expect(total).toBe(coverage.workflow_count);
    }
  });

  it('certified_autonomy_rate is between 0 and 1', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const coverage of snapshot.venture_coverage) {
      expect(coverage.certified_autonomy_rate).toBeGreaterThanOrEqual(0);
      expect(coverage.certified_autonomy_rate).toBeLessThanOrEqual(1);
    }
  });

  it('critical_path_certified_rate is between 0 and 1', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const coverage of snapshot.venture_coverage) {
      expect(coverage.critical_path_certified_rate).toBeGreaterThanOrEqual(0);
      expect(coverage.critical_path_certified_rate).toBeLessThanOrEqual(1);
    }
  });
});

describe('deriveFounderSurfaceSnapshot — FounderAttentionItem', () => {
  it('blocked task generates a blocked_workflow attention item', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const blocked = snapshot.attention_items.find(
      (a) => a.kind === 'blocked_workflow' && a.workflow_id === blockedTask.id
    );
    expect(blocked).toBeDefined();
  });

  it('owner/operator cleanup debt stays out of founder routing metadata', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const blocked = snapshot.attention_items.find(
      (a) => a.kind === 'blocked_workflow' && a.workflow_id === blockedTask.id
    );

    expect(blocked).toMatchObject({
      constraint_kind: 'internal_gate',
      attention_target: 'owner',
      requires_founder_action: false,
      resolution_owner: 'owner',
    });
  });

  it('explicit founder-decision blockers carry founder routing metadata', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundleWithFounderDecision());
    const founderDecision = snapshot.attention_items.find(
      (a) => a.kind === 'blocked_workflow' && a.workflow_id === founderDecisionTask.id
    );

    expect(founderDecision).toMatchObject({
      constraint_kind: 'founder_decision',
      attention_target: 'founder',
      requires_founder_action: true,
      resolution_owner: 'founder',
    });
  });

  it('untouched todo backlog does not generate a blocked_workflow attention item', () => {
    const snapshot = deriveFounderSurfaceSnapshot(
      makeBundle({ tasks: [retentionTask, blockedTask, researchTask, untouchedBacklogTask] })
    );
    const blocked = snapshot.attention_items.find(
      (a) => a.kind === 'blocked_workflow' && a.workflow_id === untouchedBacklogTask.id
    );
    expect(blocked).toBeUndefined();
  });

  it('delegated stale work generates an overdue_workflow attention item', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundleWithOverdue());
    const overdue = snapshot.attention_items.find(
      (a) => a.kind === 'overdue_workflow' && a.workflow_id === overdueTask.id
    );
    expect(overdue).toBeDefined();
    expect(overdue?.summary.toLowerCase()).toContain('overdue');
  });

  it('policy failure signal generates a policy_failure attention item', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const policy = snapshot.attention_items.find(
      (a) => a.kind === 'policy_failure' && a.workflow_id === blockedTask.id
    );
    expect(policy).toBeDefined();
  });

  it('attention items are sorted critical → action_required → attention → info', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const severityOrder: Record<string, number> = {
      critical: 0,
      action_required: 1,
      attention: 2,
      info: 3,
    };
    for (let i = 1; i < snapshot.attention_items.length; i++) {
      const prev = severityOrder[snapshot.attention_items[i - 1].severity] ?? 99;
      const curr = severityOrder[snapshot.attention_items[i].severity] ?? 99;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('every attention item has a non-empty summary and recommended_action', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const item of snapshot.attention_items) {
      expect(item.summary.length).toBeGreaterThan(0);
      expect(item.recommended_action.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveFounderSurfaceSnapshot — integrity rules', () => {
  it('no certified workflow has zero run_count in its evidence bundle', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const certified = snapshot.certifications.filter((c) => c.certification_status === 'certified');
    for (const cert of certified) {
      const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === cert.workflow_id);
      expect(bundle?.run_count ?? 0).toBeGreaterThan(0);
    }
  });

  it('no certified workflow has pending policy failures in its evidence bundle', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const certified = snapshot.certifications.filter((c) => c.certification_status === 'certified');
    for (const cert of certified) {
      const bundle = snapshot.evidence_bundles.find((b) => b.workflow_id === cert.workflow_id);
      expect(bundle?.policy_fail_count ?? 0).toBe(0);
    }
  });

  it('every venture coverage has a non-zero workflow_count denominator', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    for (const coverage of snapshot.venture_coverage) {
      expect(coverage.workflow_count).toBeGreaterThan(0);
    }
  });

  it('empty source bundle produces valid empty snapshot', () => {
    const snapshot = deriveFounderSurfaceSnapshot({
      tasks: [],
      telemetryEvents: [],
      workflowDefinitions: [],
      workflowRuns: [],
      asOf: NOW,
    });
    expect(snapshot.workflows).toHaveLength(0);
    expect(snapshot.evidence_bundles).toHaveLength(0);
    expect(snapshot.certifications).toHaveLength(0);
    expect(snapshot.readiness).toHaveLength(0);
    expect(snapshot.run_summaries).toHaveLength(0);
    expect(snapshot.venture_coverage).toHaveLength(0);
    expect(snapshot.attention_items).toHaveLength(0);
    expect(snapshot.agent_certifications).toHaveLength(0);
    expect(typeof snapshot.updated_at).toBe('string');
  });

  it('workflow_ids are stable across identical inputs', () => {
    const bundle = makeBundle();
    const first = deriveFounderSurfaceSnapshot(bundle);
    const second = deriveFounderSurfaceSnapshot(bundle);
    const firstIds = first.workflows.map((w) => w.workflow_id).sort();
    const secondIds = second.workflows.map((w) => w.workflow_id).sort();
    expect(firstIds).toEqual(secondIds);
  });
});

describe('buildFounderSurfaceExecutiveOverview', () => {
  it('builds a dominant autonomy number plus per-venture rates', () => {
    const overview = buildFounderSurfaceExecutiveOverview(
      deriveFounderSurfaceSnapshot(makeBundle())
    );

    expect(overview.primary_number).toMatchObject({
      label: 'Certified Autonomy Rate',
      workflow_count: 4,
    });
    expect(overview.summary_strip).toMatchObject({
      active_initiative_count: expect.any(Number),
      active_agent_count: expect.any(Number),
      at_risk_count: expect.any(Number),
    });
    expect(overview.attention_summary).toMatchObject({
      blocked_count: expect.any(Number),
      overdue_count: expect.any(Number),
      awaiting_decision_count: expect.any(Number),
      newly_complete_count: expect.any(Number),
    });
    expect(overview.primary_number.rate).toBeGreaterThanOrEqual(0);
    expect(overview.primary_number.percentage).toBeGreaterThanOrEqual(0);
    expect(overview.venture_rates.length).toBeGreaterThan(0);
    expect(overview.venture_rates[0]).toHaveProperty('venture_id');
    expect(overview.venture_rates[0]).toHaveProperty('percentage');
    expect(overview.venture_rates[0]).toHaveProperty('active_initiative_count');
    expect(overview.venture_rates[0]).toHaveProperty('blocked_count');
  });

  it('supports earned interruption semantics with what/why/action attention items', () => {
    const overview = buildFounderSurfaceExecutiveOverview(
      deriveFounderSurfaceSnapshot(makeBundleWithFounderDecision())
    );

    expect(overview.surface_state.mode).toBe('attention_required');
    expect(overview.surface_state.earned_interruption).toBe(true);
    expect(overview.attention_items.length).toBeGreaterThan(0);
    expect(overview.attention_items[0]).toEqual(
      expect.objectContaining({
        category: expect.stringMatching(/blocked|overdue|awaiting_decision/),
        what: expect.any(String),
        why: expect.any(String),
        action: expect.stringMatching(/Review|Inspect|Acknowledge/),
        constraint_kind: expect.stringMatching(/founder_decision|external_dependency/),
        attention_target: 'founder',
        requires_founder_action: true,
      })
    );
  });

  it('owner-hygiene overdue items stay off the founder overview', () => {
    const overview = buildFounderSurfaceExecutiveOverview(
      deriveFounderSurfaceSnapshot(makeBundleWithOverdue())
    );

    expect(overview.attention_items.some((item) => item.workflow_id === overdueTask.id)).toBe(
      false
    );
    expect(overview.attention_summary.overdue_count).toBe(0);
  });

  it('internal gate blockers do not render as founder-needed interruption', () => {
    const overview = buildFounderSurfaceExecutiveOverview(
      deriveFounderSurfaceSnapshot(makeBundle())
    );

    expect(overview.attention_items.some((item) => item.workflow_id === blockedTask.id)).toBe(
      false
    );
    expect(overview.attention_summary.blocked_count).toBe(0);
  });

  it('surfaces newly complete truth without turning quiet mode into noise', () => {
    const overview = buildFounderSurfaceExecutiveOverview(
      deriveFounderSurfaceSnapshot(makeBundle())
    );

    expect(overview.attention_summary.newly_complete_count).toBeGreaterThan(0);
    expect(overview.newly_complete_items.length).toBeGreaterThan(0);
    expect(overview.newly_complete_items[0]).toEqual(
      expect.objectContaining({
        category: 'newly_complete',
        action: 'Acknowledge',
      })
    );
  });

  it('ages completed review items out of founder attention once they are stale', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle({ asOf: '2026-03-20T12:00:00.000Z' }));
    snapshot.attention_items.push({
      attention_id: 'certification_review:task_20260317_reten01:stale',
      kind: 'certification_review',
      venture_id: 'nxt-klaviyo-retention',
      workflow_id: retentionTask.id,
      severity: 'action_required',
      constraint_kind: 'founder_decision',
      attention_target: 'founder',
      requires_founder_action: true,
      resolution_owner: 'founder',
      summary: 'Old certification review item that should age out of founder attention.',
      waiting_since: '2026-03-17T05:00:00.000Z',
      recommended_action: 'Review the evidence bundle and decide whether to promote it.',
      updated_at: '2026-03-17T05:00:00.000Z',
      task_id: retentionTask.id,
      assigned_to: 'MAYA',
    });

    const agedOverview = buildFounderSurfaceExecutiveOverview(snapshot);
    expect(agedOverview.attention_items.some((item) => item.workflow_id === retentionTask.id)).toBe(
      false
    );
  });

  it('removes awaiting-decision items once completion review is already approved', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const workflow = snapshot.workflows.find((entry) => entry.workflow_id === retentionTask.id);
    if (!workflow?.completion_truth)
      throw new Error('expected retention workflow completion truth');
    workflow.completion_truth = {
      ...workflow.completion_truth,
      board: { ...workflow.completion_truth.board, state: 'verified' },
      evidence: {
        ...workflow.completion_truth.evidence,
        state: 'verified',
        sources: Array.from(
          new Set([
            ...(workflow.completion_truth.evidence.sources ?? []),
            'review.decision:approved',
          ])
        ),
      },
    };
    snapshot.attention_items.push({
      attention_id: 'decision_required:task_20260317_reten01:approved',
      kind: 'decision_required',
      venture_id: 'nxt-klaviyo-retention',
      workflow_id: retentionTask.id,
      severity: 'action_required',
      constraint_kind: 'founder_decision',
      attention_target: 'founder',
      requires_founder_action: true,
      resolution_owner: 'founder',
      summary: 'Founder decision is already recorded and should not remain live attention.',
      waiting_since: NOW,
      recommended_action: 'Review the evidence bundle and decide whether to promote it.',
      updated_at: NOW,
      task_id: retentionTask.id,
      assigned_to: 'MAYA',
    });

    const overview = buildFounderSurfaceExecutiveOverview(snapshot);
    expect(overview.attention_items.some((item) => item.workflow_id === retentionTask.id)).toBe(
      false
    );
  });

  it('supports quiet steady-state semantics when nothing has earned interruption', () => {
    const snapshot = deriveFounderSurfaceSnapshot({
      tasks: [],
      telemetryEvents: [],
      workflowDefinitions: [],
      workflowRuns: [],
      asOf: NOW,
    });
    const overview = buildFounderSurfaceExecutiveOverview(snapshot);

    expect(overview.surface_state.mode).toBe('quiet');
    expect(overview.surface_state.earned_interruption).toBe(false);
    expect(overview.attention_items).toHaveLength(0);
    expect(overview.surface_state.summary.toLowerCase()).toContain(
      'no workflows have earned interruption'
    );
  });
});

describe('buildFounderSurfaceVentureCoverageView', () => {
  it('returns venture coverage entries with trust objects for promotions and degradations', () => {
    const view = buildFounderSurfaceVentureCoverageView(deriveFounderSurfaceSnapshot(makeBundle()));
    const labVos = view.ventures.find(
      (venture) => venture.coverage.venture_id === 'lab-vos-system'
    );

    expect(labVos).toBeDefined();
    expect(labVos?.coverage.workflow_count).toBeGreaterThan(0);
    expect(labVos?.state_distribution.under_review ?? 0).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(labVos?.top_degrading_workflows)).toBe(true);
    if ((labVos?.recent_promotions.length ?? 0) > 0) {
      expect(labVos?.recent_promotions[0]).toEqual(
        expect.objectContaining({
          workflow: expect.objectContaining({ workflow_id: expect.any(String) }),
          certification: expect.any(Object),
          readiness: expect.any(Object),
        })
      );
    }
  });
});

describe('buildFounderSurfaceCertificationPipeline', () => {
  it('groups workflows into certifying, review, certified, and under-review lanes', () => {
    const pipeline = buildFounderSurfaceCertificationPipeline(
      deriveFounderSurfaceSnapshot(makeBundle())
    );

    expect(pipeline.certifying.length).toBeGreaterThan(0);
    expect(pipeline.ready_for_review.length).toBeGreaterThan(0);
    expect(Array.isArray(pipeline.recently_certified)).toBe(true);
    expect(pipeline.under_review.length).toBeGreaterThan(0);
    expect(pipeline.ready_for_review[0]).toEqual(
      expect.objectContaining({
        workflow: expect.any(Object),
        certification: expect.objectContaining({ certification_status: 'ready_for_review' }),
        readiness: expect.any(Object),
      })
    );
  });
});

describe('buildFounderSurfaceAgentCertificationView', () => {
  it('returns inspectable agent-certification summaries without changing workflow truth payloads', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const view = buildFounderSurfaceAgentCertificationView(snapshot);
    const maya = view.summaries.find((summary) => summary.agent_id === 'MAYA');
    const atlas = view.summaries.find((summary) => summary.agent_id === 'ATLAS');

    expect(view.updated_at).toBe(snapshot.updated_at);
    expect(maya).toMatchObject({
      certification_tier: 'certified_operator',
      supporting_receipt_ids: ['oir_maya_dispatch_quality'],
    });
    expect(maya?.supporting_workflow_ids).toContain(retentionTask.id);
    expect(atlas).toMatchObject({
      certification_tier: 'under_review',
    });
  });
});

describe('buildFounderSurfaceWorkflowDetail', () => {
  it('returns workflow detail with trust objects and recent runs', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const detail = buildFounderSurfaceWorkflowDetail(snapshot, retentionTask.id);

    expect(detail).toBeDefined();
    expect(detail?.workflow.workflow_id).toBe(retentionTask.id);
    expect(detail?.completion_truth.state).toBe('verified');
    expect(detail?.evidence_bundle.workflow_id).toBe(retentionTask.id);
    expect(detail?.certification.workflow_id).toBe(retentionTask.id);
    expect(detail?.readiness.workflow_id).toBe(retentionTask.id);
    expect(detail?.recent_runs.length).toBe(3);
  });

  it('returns founder attention context when relevant', () => {
    const snapshot = deriveFounderSurfaceSnapshot(makeBundle());
    const detail = buildFounderSurfaceWorkflowDetail(snapshot, blockedTask.id);

    expect(detail).toBeDefined();
    expect(detail?.founder_attention.length).toBeGreaterThan(0);
    expect(detail?.founder_attention[0]).toEqual(
      expect.objectContaining({
        workflow_id: blockedTask.id,
      })
    );
  });

  it('returns null for an unknown workflow id', () => {
    const detail = buildFounderSurfaceWorkflowDetail(
      deriveFounderSurfaceSnapshot(makeBundle()),
      'missing-workflow'
    );

    expect(detail).toBeNull();
  });
});

describe('FounderSurfaceReadModelService integration (tempdir)', () => {
  let testRoot: string;
  let taskService: TaskService;
  let telemetryService: TelemetryService;
  let workflowService: WorkflowService;
  let workflowRunService: WorkflowRunService;
  let service: FounderSurfaceReadModelService;

  beforeEach(async () => {
    const suffix = Math.random().toString(36).substring(7);
    testRoot = path.join(os.tmpdir(), `veritas-founder-surface-${suffix}`);
    const tasksActive = path.join(testRoot, 'tasks', 'active');
    const tasksArchive = path.join(testRoot, 'tasks', 'archive');
    const telemetryDir = path.join(testRoot, 'telemetry');
    const workflowsDir = path.join(testRoot, 'workflows');
    const runsDir = path.join(testRoot, 'workflow-runs');

    await fs.mkdir(tasksActive, { recursive: true });
    await fs.mkdir(tasksArchive, { recursive: true });
    await fs.mkdir(telemetryDir, { recursive: true });
    await fs.mkdir(workflowsDir, { recursive: true });
    await fs.mkdir(runsDir, { recursive: true });

    taskService = new TaskService({ tasksDir: tasksActive, archiveDir: tasksArchive });
    telemetryService = new TelemetryService({ telemetryDir });
    workflowService = new WorkflowService(workflowsDir);
    workflowRunService = new WorkflowRunService(runsDir);

    service = new FounderSurfaceReadModelService({
      taskService,
      telemetryService,
      workflowRunService,
      workflowService,
      operatorInterventionService: {
        listReceipts: async () => [],
      },
    });
  });

  afterEach(async () => {
    taskService.dispose?.();
    await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('returns a valid snapshot from an empty live store', async () => {
    const snapshot = await service.getSnapshot();
    expect(snapshot.workflows).toHaveLength(0);
    expect(snapshot.venture_coverage).toHaveLength(0);
    expect(snapshot.attention_items).toHaveLength(0);
    expect(snapshot.agent_certifications).toHaveLength(0);
    expect(typeof snapshot.updated_at).toBe('string');
  });

  it('creates a task and it appears in the live snapshot', async () => {
    await taskService.createTask({
      title: 'Retention lane kickoff',
      type: 'ops',
      priority: 'high',
      project: 'nxt-klaviyo-retention',
    });
    const snapshot = await service.getSnapshot();
    expect(snapshot.workflows.length).toBe(1);
    expect(snapshot.workflows[0].workflow_family).toBe('retention_execution');
    expect(snapshot.workflows[0].venture_id).toBe('nxt-klaviyo-retention');
    expect(snapshot.evidence_bundles.length).toBe(1);
    expect(snapshot.certifications.length).toBe(1);
    expect(snapshot.readiness.length).toBe(1);
  });

  it('collectSourceBundle surfaces tasks, telemetry, and runs', async () => {
    await taskService.createTask({ title: 'Test task', type: 'code' });
    await telemetryService.emit({
      type: 'signal.health',
      agent: 'SETH',
      severity: 'info',
      summary: 'Health OK',
      healthClass: 'GREEN',
    });
    const bundle = await service.collectSourceBundle();
    expect(bundle.tasks.length).toBeGreaterThanOrEqual(1);
    expect(bundle.telemetryEvents.length).toBeGreaterThanOrEqual(1);
  });
});
