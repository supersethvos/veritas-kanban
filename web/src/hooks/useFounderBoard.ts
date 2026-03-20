import { useMemo } from 'react';
import type {
  FounderSurfaceOverviewAttentionItem,
  FounderSurfaceNewlyCompleteItem,
  FounderSurfaceVentureRate,
  WorkflowState,
} from '@veritas-kanban/shared';
import {
  useFounderSurfaceReviewSurface,
  useFounderSurfaceVentures,
  type FounderSurfaceReviewSurface,
} from '@/hooks/useFounderSurface';
import { useCockpit, type CockpitAgentStatus } from '@/hooks/useCockpit';

// ── Derived types ────────────────────────────────────────────────

export interface VentureCoverageEntry {
  ventureId: string;
  stateDistribution: Record<WorkflowState, number>;
  workflowCount: number;
  certifiedRate: number;
  criticalPathRate: number;
  criticalPathCount: number;
  blockedCount: number;
  awaitingDecisionCount: number;
}

export interface FounderBoardData {
  // Primary number
  percentage: number;
  label: string;
  certifiedCount: number;
  workflowCount: number;

  // Health
  healthOverall: 'GREEN' | 'YELLOW' | 'RED';

  // Surface state
  mode: 'quiet' | 'attention_required';
  interruptionCount: number;

  // Counts for status line
  blockedCount: number;
  overdueCount: number;
  awaitingDecisionCount: number;
  newlyCompleteCount: number;

  // Agent info (from cockpit — all non-dormant agents)
  agents: Array<{
    id: string;
    name: string;
    activityState: 'active' | 'idle' | 'unknown';
    healthState: 'fresh' | 'stale' | 'offline';
  }>;

  // Attention items
  attentionItems: FounderSurfaceOverviewAttentionItem[];
  newlyCompleteItems: FounderSurfaceNewlyCompleteItem[];

  // Venture rates
  ventureRates: FounderSurfaceVentureRate[];

  // Per-venture coverage with state breakdown
  ventureCoverage: VentureCoverageEntry[];

  // State distribution (summed across ventures)
  stateDistribution: Record<WorkflowState, number>;

  // Momentum — synthesized from trust motion
  momentum: 'advancing' | 'drifting' | 'steady';
  trustGainCount: number;
  trustDegradationCount: number;

  // Pipeline position — the largest non-certified cohort
  pipelineCohort: { state: WorkflowState; count: number } | null;

  // Timestamps
  updatedAt: string;
}

function sumStateDistribution(
  ventures: Array<{ state_distribution: Record<WorkflowState, number> }>
): Record<WorkflowState, number> {
  const result: Record<WorkflowState, number> = {
    human_native: 0,
    assisted: 0,
    governed_copilot: 0,
    certifying: 0,
    certified_autonomous: 0,
    under_review: 0,
  };

  for (const v of ventures) {
    for (const [key, count] of Object.entries(v.state_distribution)) {
      if (key in result) {
        result[key as WorkflowState] += count;
      }
    }
  }

  return result;
}

// ── Hook ─────────────────────────────────────────────────────────

export function useFounderBoard() {
  const reviewSurface = useFounderSurfaceReviewSurface();
  const cockpit = useCockpit();
  const ventures = useFounderSurfaceVentures();

  const isLoading = reviewSurface.isLoading;
  const isError = reviewSurface.isError;

  const data = useMemo<FounderBoardData | null>(() => {
    const rs = reviewSurface.data;
    if (!rs) return null;

    const overview = rs.overview;
    const cp = rs.control_plane;

    // All non-dormant agents from cockpit (optional — might still be loading)
    const agents: FounderBoardData['agents'] =
      cockpit.data?.systemHealth.agents
        .filter((a: CockpitAgentStatus) => a.status !== 'dormant')
        .map((a: CockpitAgentStatus) => ({
          id: a.id,
          name: a.name,
          activityState: a.activityState,
          healthState: a.healthState,
        })) ?? [];

    // Per-venture coverage entries (merge coverage + venture rates for pressure counts)
    const ratesByVenture = new Map(overview.venture_rates.map((r) => [r.venture_id, r]));
    const ventureCoverage: VentureCoverageEntry[] =
      ventures.data?.ventures.map((v) => {
        const rate = ratesByVenture.get(v.coverage.venture_id);
        return {
          ventureId: v.coverage.venture_id,
          stateDistribution: v.state_distribution,
          workflowCount: v.coverage.workflow_count,
          certifiedRate: v.coverage.certified_autonomy_rate,
          criticalPathRate: v.coverage.critical_path_certified_rate,
          criticalPathCount: v.critical_path.workflow_count,
          blockedCount: rate?.blocked_count ?? 0,
          awaitingDecisionCount: rate?.awaiting_decision_count ?? 0,
        };
      }) ?? [];

    // State distribution from ventures
    const stateDistribution = ventures.data?.ventures
      ? sumStateDistribution(ventures.data.ventures)
      : {
          human_native: 0,
          assisted: 0,
          governed_copilot: 0,
          certifying: 0,
          certified_autonomous: 0,
          under_review: 0,
        };

    // Momentum — derived from trust motion counts
    const trustGainCount = overview.trust_gains.length;
    const trustDegradationCount = overview.trust_degradations.length;
    const momentum: FounderBoardData['momentum'] =
      trustGainCount > trustDegradationCount
        ? 'advancing'
        : trustDegradationCount > trustGainCount
          ? 'drifting'
          : 'steady';

    // Pipeline position — find the largest non-certified cohort to show where the mass sits
    const PIPELINE_ORDER: WorkflowState[] = [
      'certifying',
      'governed_copilot',
      'assisted',
      'human_native',
      'under_review',
    ];
    let pipelineCohort: FounderBoardData['pipelineCohort'] = null;
    for (const state of PIPELINE_ORDER) {
      const count = stateDistribution[state];
      if (count > 0) {
        pipelineCohort = { state, count };
        break;
      }
    }

    return {
      percentage: overview.primary_number.percentage,
      label: overview.primary_number.label,
      certifiedCount: overview.primary_number.certified_workflow_count,
      workflowCount: overview.primary_number.workflow_count,

      healthOverall: cp.overall,

      mode: overview.surface_state.mode,
      interruptionCount:
        overview.surface_state.interruption_count ?? overview.attention_items.length,

      blockedCount: overview.attention_summary.blocked_count,
      overdueCount: overview.attention_summary.overdue_count,
      awaitingDecisionCount: overview.attention_summary.awaiting_decision_count,
      newlyCompleteCount: overview.attention_summary.newly_complete_count,

      agents,

      attentionItems: overview.attention_items,
      newlyCompleteItems: overview.newly_complete_items,

      ventureRates: overview.venture_rates,

      ventureCoverage,

      stateDistribution,

      momentum,
      trustGainCount,
      trustDegradationCount,

      pipelineCohort,

      updatedAt: rs.updated_at,
    };
  }, [reviewSurface.data, cockpit.data, ventures.data]);

  const refetch = () => {
    reviewSurface.refetch();
    cockpit.refetch();
    ventures.refetch();
  };

  return {
    data,
    /** Raw review-surface response for MAYA's shared components (ControlPlaneCard, TrustMotionSection, etc.) */
    rawReviewSurface: reviewSurface.data as FounderSurfaceReviewSurface | undefined,
    isLoading,
    isError,
    isFetching: reviewSurface.isFetching,
    refetch,
  };
}
