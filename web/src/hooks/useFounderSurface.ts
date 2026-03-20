import { useQuery } from '@tanstack/react-query';
import type {
  FounderSurfaceAttentionCategory,
  FounderSurfaceCertificationPipeline,
  FounderSurfaceExecutiveOverview,
  FounderSurfaceVentureCoverageView,
  FounderSurfaceWorkflowDetail,
} from '@veritas-kanban/shared';
import { apiFetch, API_BASE } from '@/lib/api/helpers';
import { useWebSocketStatus } from '@/contexts/WebSocketContext';

export interface FounderSurfaceReviewSurface {
  overview: FounderSurfaceExecutiveOverview;
  compatibility: {
    routeMode: 'control-plane-preserved';
    founderActionRoute: '/api/signals/dispatch';
    cockpitRoute: '/api/cockpit';
    founderSurfaceMigration: 'coexistence';
    signalFeedOrdering: 'newest-first';
  };
  control_plane: {
    overall: 'GREEN' | 'YELLOW' | 'RED';
    active_signal_count: number;
    active_agent_count: number;
    fresh_agent_count: number;
    total_agent_count: number;
    degraded_agent_count: number;
    latest_sweep: {
      healthClass: string;
      summary: string;
      timestamp: string;
    } | null;
  };
  operator_leverage?: {
    total_receipts: number;
    credited_receipt_count: number;
    by_kind: Record<string, number>;
    by_verification_status: Record<string, number>;
    by_resolution_scope: Record<string, number>;
    by_leverage_class: Record<string, number>;
    latest_created_at: string | null;
    latest_verified_at: string | null;
  };
  updated_at: string;
}

export const FOUNDER_ATTENTION_LABELS: Record<FounderSurfaceAttentionCategory, string> = {
  blocked: 'Waiting on dependency',
  overdue: 'Needs founder checkpoint',
  awaiting_decision: 'Founder decision',
  newly_complete: 'Newly complete',
};

async function fetchFounderSurfaceReviewSurface(): Promise<FounderSurfaceReviewSurface> {
  return apiFetch<FounderSurfaceReviewSurface>(`${API_BASE}/v1/founder-surface/review-surface`);
}

async function fetchFounderSurfaceOverview(): Promise<FounderSurfaceExecutiveOverview> {
  return apiFetch<FounderSurfaceExecutiveOverview>(`${API_BASE}/v1/founder-surface/overview`);
}

async function fetchFounderSurfaceVentures(): Promise<FounderSurfaceVentureCoverageView> {
  return apiFetch<FounderSurfaceVentureCoverageView>(`${API_BASE}/v1/founder-surface/ventures`);
}

async function fetchFounderSurfacePipeline(): Promise<FounderSurfaceCertificationPipeline> {
  return apiFetch<FounderSurfaceCertificationPipeline>(`${API_BASE}/v1/founder-surface/pipeline`);
}

async function fetchFounderSurfaceWorkflowDetail(
  workflowId: string
): Promise<FounderSurfaceWorkflowDetail> {
  return apiFetch<FounderSurfaceWorkflowDetail>(
    `${API_BASE}/v1/founder-surface/workflows/${workflowId}`
  );
}

function getFounderSurfaceQueryTiming(isConnected: boolean) {
  return {
    refetchInterval: isConnected ? 30_000 : 15_000,
    staleTime: isConnected ? 15_000 : 5_000,
  };
}

export function hasFounderInterruptions(overview: FounderSurfaceExecutiveOverview): boolean {
  return (
    overview.surface_state.mode === 'attention_required' && overview.attention_items.length > 0
  );
}

export function useFounderSurfaceReviewSurface() {
  const { isConnected } = useWebSocketStatus();

  return useQuery({
    queryKey: ['founder-surface', 'review-surface'],
    queryFn: fetchFounderSurfaceReviewSurface,
    ...getFounderSurfaceQueryTiming(isConnected),
  });
}

export function useFounderSurfaceOverview() {
  const { isConnected } = useWebSocketStatus();

  return useQuery({
    queryKey: ['founder-surface', 'overview'],
    queryFn: fetchFounderSurfaceOverview,
    ...getFounderSurfaceQueryTiming(isConnected),
  });
}

export function useFounderSurfaceVentures() {
  const { isConnected } = useWebSocketStatus();

  return useQuery({
    queryKey: ['founder-surface', 'ventures'],
    queryFn: fetchFounderSurfaceVentures,
    ...getFounderSurfaceQueryTiming(isConnected),
  });
}

export function useFounderSurfacePipeline() {
  const { isConnected } = useWebSocketStatus();

  return useQuery({
    queryKey: ['founder-surface', 'pipeline'],
    queryFn: fetchFounderSurfacePipeline,
    ...getFounderSurfaceQueryTiming(isConnected),
  });
}

export function useFounderSurfaceWorkflowDetail(workflowId: string | null) {
  const { isConnected } = useWebSocketStatus();

  return useQuery({
    queryKey: ['founder-surface', 'workflow', workflowId],
    queryFn: () => (workflowId ? fetchFounderSurfaceWorkflowDetail(workflowId) : null),
    enabled: workflowId !== null,
    ...getFounderSurfaceQueryTiming(isConnected),
  });
}
