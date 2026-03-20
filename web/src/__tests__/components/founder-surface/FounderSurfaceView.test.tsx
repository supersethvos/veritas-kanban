import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FounderSurfaceExecutiveOverview,
  FounderSurfaceWorkflowDetail,
} from '@veritas-kanban/shared';
import { renderWithProviders } from '@/__tests__/test-utils';
import FounderSurfaceView from '@/components/founder-surface/FounderSurfaceView';
import AttentionQueue from '@/components/founder-surface/AttentionQueue';
import VentureStrip from '@/components/founder-surface/VentureStrip';
import type { FounderSurfaceReviewSurface } from '@/hooks/useFounderSurface';

const hookMocks = vi.hoisted(() => ({
  useFounderSurfaceReviewSurface: vi.fn(),
  useFounderSurfaceWorkflowDetail: vi.fn(),
}));

vi.mock('@/hooks/useFounderSurface', () => ({
  useFounderSurfaceReviewSurface: hookMocks.useFounderSurfaceReviewSurface,
  useFounderSurfaceWorkflowDetail: hookMocks.useFounderSurfaceWorkflowDetail,
  hasFounderInterruptions: (overview: FounderSurfaceExecutiveOverview) =>
    overview.surface_state.mode === 'attention_required' && overview.attention_items.length > 0,
  FOUNDER_ATTENTION_LABELS: {
    blocked: 'Waiting on dependency',
    overdue: 'Needs founder checkpoint',
    awaiting_decision: 'Founder decision',
    newly_complete: 'Newly complete',
  },
}));

function createOverview(
  overrides: Partial<FounderSurfaceExecutiveOverview> = {}
): FounderSurfaceExecutiveOverview {
  return {
    primary_number: {
      label: 'Certified Autonomy Rate',
      rate: 0.7368,
      percentage: 73,
      certified_workflow_count: 14,
      workflow_count: 19,
      updated_at: '2026-03-17T07:00:00.000Z',
    },
    summary_strip: {
      active_initiative_count: 5,
      active_agent_count: 3,
      at_risk_count: 2,
    },
    attention_summary: {
      blocked_count: 1,
      overdue_count: 1,
      awaiting_decision_count: 1,
      newly_complete_count: 2,
      requires_attention_count: 3,
    },
    venture_rates: [
      {
        venture_id: 'lab-vos-system',
        certified_autonomy_rate: 0.73,
        percentage: 73,
        certified_workflow_count: 8,
        workflow_count: 11,
        critical_path_certified_rate: 0.8,
        active_initiative_count: 3,
        blocked_count: 1,
        overdue_count: 0,
        awaiting_decision_count: 1,
        newly_complete_count: 1,
        updated_at: '2026-03-17T07:00:00.000Z',
      },
      {
        venture_id: 'candyland',
        certified_autonomy_rate: 0.5,
        percentage: 50,
        certified_workflow_count: 6,
        workflow_count: 12,
        critical_path_certified_rate: 0.67,
        active_initiative_count: 2,
        blocked_count: 0,
        overdue_count: 1,
        awaiting_decision_count: 0,
        newly_complete_count: 1,
        updated_at: '2026-03-17T07:00:00.000Z',
      },
    ],
    surface_state: {
      mode: 'quiet',
      summary: 'Quiet. Nothing needs your attention. 2 workflows newly complete.',
      earned_interruption: false,
      interruption_count: 0,
    },
    attention_items: [],
    newly_complete_items: [
      {
        attention_id: 'newly_complete:wf_done_1',
        category: 'newly_complete',
        venture_id: 'lab-vos-system',
        workflow_id: 'wf_done_1',
        owner_agent: 'SETH-LEAD',
        what: 'Founder workflow API',
        why: 'Completion is verified across board, artifact, channel, and evidence truth.',
        action: 'Acknowledge',
        recommended_action: 'Acknowledge the result and keep moving.',
        completed_at: '2026-03-17T06:40:00.000Z',
        updated_at: '2026-03-17T06:40:00.000Z',
      },
    ],
    trust_gains: [
      {
        workflow: {
          workflow_id: 'wf_gain',
          name: 'Autonomy evidence bundler',
          venture_id: 'lab-vos-system',
          workflow_family: 'operations',
          description: 'Improves evidence coverage.',
          owner_agent: 'MAYA',
          critical_path: true,
          risk_class: 'high',
          data_class: 'B',
          state: 'certifying',
          status_reason: 'Ready for review.',
          success_criteria: [],
          created_at: '2026-03-17T06:00:00.000Z',
          updated_at: '2026-03-17T07:00:00.000Z',
          completion_truth: {
            state: 'verified',
            summary: 'Completion is verified across board, artifact, channel, and evidence truth.',
            checked_at: '2026-03-17T07:00:00.000Z',
            blockers: [],
            missing_surfaces: [],
            artifact: { state: 'verified', summary: 'Artifact truth established.', sources: [] },
            board: { state: 'verified', summary: 'Board truth established.', sources: [] },
            channel: { state: 'verified', summary: 'Channel truth established.', sources: [] },
            evidence: { state: 'verified', summary: 'Evidence truth established.', sources: [] },
          },
        },
        completion_truth: {
          state: 'verified',
          summary: 'Completion is verified across board, artifact, channel, and evidence truth.',
          checked_at: '2026-03-17T07:00:00.000Z',
          blockers: [],
          missing_surfaces: [],
          artifact: { state: 'verified', summary: 'Artifact truth established.', sources: [] },
          board: { state: 'verified', summary: 'Board truth established.', sources: [] },
          channel: { state: 'verified', summary: 'Channel truth established.', sources: [] },
          evidence: { state: 'verified', summary: 'Evidence truth established.', sources: [] },
        },
        evidence_bundle: {
          workflow_id: 'wf_gain',
          window_start: '2026-03-17T06:00:00.000Z',
          window_end: '2026-03-17T07:00:00.000Z',
          run_count: 3,
          successful_run_count: 3,
          failed_run_count: 0,
          policy_pass_count: 3,
          policy_fail_count: 0,
          halt_pass_count: 3,
          halt_fail_count: 0,
          hidden_cleanup_incidents: 0,
          evidence_complete: true,
          updated_at: '2026-03-17T07:00:00.000Z',
        },
        certification: {
          workflow_id: 'wf_gain',
          certification_status: 'ready_for_review',
          certification_reason:
            'Evidence bundle is populated and run quality is strong enough for human review.',
          review_required: true,
          last_evaluated_at: '2026-03-17T07:00:00.000Z',
        },
        readiness: {
          workflow_id: 'wf_gain',
          readiness_label: 'near_ready',
          readiness_summary:
            'Workflow is accumulating enough governed evidence to move toward review.',
          temporary_blockers: [],
          structural_limits: [],
          top_failure_signatures: [],
          human_review_burden: 'low',
          updated_at: '2026-03-17T07:00:00.000Z',
        },
        latest_run: null,
        attention_item: null,
      },
    ],
    trust_degradations: [],
    human_review_burden: {
      none: 4,
      low: 7,
      moderate: 6,
      high: 2,
    },
    updated_at: '2026-03-17T07:00:00.000Z',
    ...overrides,
  };
}

function createReviewSurface(
  overrides: Partial<FounderSurfaceReviewSurface> = {}
): FounderSurfaceReviewSurface {
  return {
    overview: createOverview(),
    compatibility: {
      routeMode: 'control-plane-preserved',
      founderActionRoute: '/api/signals/dispatch',
      cockpitRoute: '/api/cockpit',
      founderSurfaceMigration: 'coexistence',
      signalFeedOrdering: 'newest-first',
    },
    control_plane: {
      overall: 'YELLOW',
      active_signal_count: 3,
      active_agent_count: 2,
      fresh_agent_count: 5,
      total_agent_count: 8,
      degraded_agent_count: 3,
      latest_sweep: {
        healthClass: 'YELLOW',
        summary: 'Resolved noise stripped from the queue; drift loop still watching stale agents.',
        timestamp: '2026-03-17T07:00:00.000Z',
      },
    },
    updated_at: '2026-03-17T07:00:00.000Z',
    ...overrides,
  };
}

function createWorkflowDetail(
  overrides: Partial<FounderSurfaceWorkflowDetail> = {}
): FounderSurfaceWorkflowDetail {
  return {
    workflow: {
      workflow_id: 'wf_1',
      name: 'Founder workflow API',
      venture_id: 'lab-vos-system',
      workflow_family: 'operations',
      description: 'Founder review workstream.',
      owner_agent: 'MAYA',
      critical_path: true,
      risk_class: 'high',
      data_class: 'B',
      state: 'under_review',
      status_reason: 'Workflow is under review because drift is being watched.',
      success_criteria: [],
      created_at: '2026-03-17T06:00:00.000Z',
      updated_at: '2026-03-17T07:00:00.000Z',
      completion_truth: {
        state: 'at_risk',
        summary: 'Completion is at risk: channel truth is missing.',
        checked_at: '2026-03-17T07:00:00.000Z',
        blockers: ['Channel truth is missing.'],
        missing_surfaces: ['channel'],
        artifact: { state: 'verified', summary: 'Artifact truth established.', sources: [] },
        board: { state: 'verified', summary: 'Board truth established.', sources: [] },
        channel: { state: 'at_risk', summary: 'Channel truth missing.', sources: [] },
        evidence: { state: 'verified', summary: 'Evidence truth established.', sources: [] },
      },
    },
    completion_truth: {
      state: 'at_risk',
      summary: 'Completion is at risk: channel truth is missing.',
      checked_at: '2026-03-17T07:00:00.000Z',
      blockers: ['Channel truth is missing.'],
      missing_surfaces: ['channel'],
      artifact: { state: 'verified', summary: 'Artifact truth established.', sources: [] },
      board: { state: 'verified', summary: 'Board truth established.', sources: [] },
      channel: { state: 'at_risk', summary: 'Channel truth missing.', sources: [] },
      evidence: { state: 'verified', summary: 'Evidence truth established.', sources: [] },
    },
    evidence_bundle: {
      workflow_id: 'wf_1',
      window_start: '2026-03-17T06:00:00.000Z',
      window_end: '2026-03-17T07:00:00.000Z',
      run_count: 2,
      successful_run_count: 1,
      failed_run_count: 1,
      policy_pass_count: 1,
      policy_fail_count: 1,
      halt_pass_count: 1,
      halt_fail_count: 1,
      hidden_cleanup_incidents: 0,
      evidence_complete: true,
      updated_at: '2026-03-17T07:00:00.000Z',
      efficiency_diagnosis: 'mixed',
    },
    certification: {
      workflow_id: 'wf_1',
      certification_status: 'decertified',
      certification_reason:
        'Previously trusted workflow now shows failure, policy, or cleanup regression.',
      review_required: true,
      last_evaluated_at: '2026-03-17T07:00:00.000Z',
    },
    readiness: {
      workflow_id: 'wf_1',
      readiness_label: 'blocked',
      readiness_summary: 'Workflow is blocked and needs intervention.',
      temporary_blockers: ['Dispatch blocked by policy gate'],
      structural_limits: [],
      top_failure_signatures: ['Dispatch blocked by policy gate'],
      human_review_burden: 'high',
      updated_at: '2026-03-17T07:00:00.000Z',
      recommended_next_action: 'Resolve the gate failure.',
      blockers_explanation:
        'Delegated handoff is overdue and still missing ACK / PLAN / ETA / RUN_ID.',
      degradation_explanation: 'Trust drift is active until the workflow requalifies.',
    },
    recent_runs: [],
    founder_attention: [],
    efficiency_diagnosis: 'mixed',
    updated_at: '2026-03-17T07:00:00.000Z',
    ...overrides,
  };
}

describe('FounderSurfaceView', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    hookMocks.useFounderSurfaceReviewSurface.mockReset();
    hookMocks.useFounderSurfaceWorkflowDetail.mockReset();
    hookMocks.useFounderSurfaceWorkflowDetail.mockReturnValue({
      data: createWorkflowDetail(),
      isLoading: false,
      isError: false,
    });
  });

  it('renders the autonomy number from the overview payload', () => {
    hookMocks.useFounderSurfaceReviewSurface.mockReturnValue({
      data: createReviewSurface(),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<FounderSurfaceView />);

    expect(screen.getByLabelText('73 percent certified autonomy rate')).toBeTruthy();
    expect(screen.getByText('Certified Autonomy Rate')).toBeTruthy();
    expect(screen.getByText('14 of 19 workflows')).toBeTruthy();
  });

  it('renders the summary strip, cockpit coexistence, and quiet mode with newly complete truth', () => {
    hookMocks.useFounderSurfaceReviewSurface.mockReturnValue({
      data: createReviewSurface(),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<FounderSurfaceView />);

    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Agents')).toBeTruthy();
    expect(screen.getByText('At risk')).toBeTruthy();
    expect(screen.getByText('Waiting on dependency')).toBeTruthy();
    expect(screen.getByText('Needs founder checkpoint')).toBeTruthy();
    expect(screen.getAllByText('Newly complete').length).toBeGreaterThan(0);
    expect(screen.getByText('Cockpit preserved')).toBeTruthy();
    expect(screen.getByText(/Activity is not trust/i)).toBeTruthy();
    expect(screen.getByText('Everything certified is running clean.')).toBeTruthy();
    expect(screen.getByText('Quiet founder mode is intact.')).toBeTruthy();
    expect(screen.getByText('1 fresh completion below.')).toBeTruthy();
    expect(screen.getByText('Founder workflow API')).toBeTruthy();
    expect(
      screen.getByText(
        'Completion is verified across board, artifact, channel, and evidence truth.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Trust gains')).toBeTruthy();
    expect(screen.getByText('Autonomy evidence bundler')).toBeTruthy();
  });

  it('renders attention items and expands inline truth details', () => {
    hookMocks.useFounderSurfaceReviewSurface.mockReturnValue({
      data: createReviewSurface({
        overview: createOverview({
          surface_state: {
            mode: 'attention_required',
            summary: '1 workflow has earned interruption.',
            earned_interruption: true,
            interruption_count: 1,
          },
          newly_complete_items: [],
          attention_summary: {
            blocked_count: 1,
            overdue_count: 0,
            awaiting_decision_count: 0,
            newly_complete_count: 0,
            requires_attention_count: 1,
          },
          attention_items: [
            {
              attention_id: 'blocked_workflow:wf_1',
              kind: 'blocked_workflow',
              category: 'blocked',
              severity: 'attention',
              constraint_kind: 'external_dependency',
              attention_target: 'founder',
              requires_founder_action: true,
              resolution_owner: 'founder',
              venture_id: 'lab-vos-system',
              workflow_id: 'wf_1',
              what: 'Founder workflow API',
              why: 'Policy gate is blocking promotion. Completion at risk. Dispatch blocked by policy gate.',
              action: 'Inspect',
              recommended_action: 'Resolve the gate failure. Repair channel truth next.',
              waiting_since: '2026-03-17T06:30:00.000Z',
              updated_at: '2026-03-17T07:00:00.000Z',
            },
          ],
        }),
      }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<FounderSurfaceView />);

    expect(screen.getByText('Founder attention')).toBeTruthy();
    expect(screen.getByText(/Inspect expands in place/i)).toBeTruthy();
    expect(screen.getByText('Founder workflow API')).toBeTruthy();
    expect(
      screen.getByText(
        'Policy gate is blocking promotion. Completion at risk. Dispatch blocked by policy gate.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Resolve the gate failure. Repair channel truth next.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));

    expect(screen.getAllByText('Completion truth').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Handoff / blocker truth').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Drift / self-heal').length).toBeGreaterThan(0);
    expect(screen.getByText(/Missing: channel/i)).toBeTruthy();
    expect(screen.getByText('Trust drift is active until the workflow requalifies.')).toBeTruthy();
  });

  it('renders nothing for an empty attention queue', () => {
    const { container } = renderWithProviders(<AttentionQueue items={[]} />);

    expect(container.innerHTML).toBe('');
  });

  it('renders per-venture rates in the venture strip with pressure and completion cues', () => {
    renderWithProviders(<VentureStrip rates={createOverview().venture_rates} />);

    expect(screen.getByText('lab-vos-system')).toBeTruthy();
    expect(screen.getByText('candyland')).toBeTruthy();
    expect(screen.getByText('73%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('Critical path 80% · 3 active')).toBeTruthy();
    expect(screen.getByText('Pressure: 1 blocked · 1 decision')).toBeTruthy();
    expect(screen.getAllByText('Completion: 1 newly verified.').length).toBeGreaterThan(0);
  });
});
