import { useQuery } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/api/helpers';
import { useWebSocketStatus } from '@/contexts/WebSocketContext';

// ── Types matching server CockpitResponse ─────────────────────────

export interface CockpitDecision {
  source: 'task' | 'signal';
  id: string;
  title: string;
  agent: string;
  severity: string;
  summary: string;
  waitingSince: string;
  taskId?: string;
  venture?: string;
}

export interface CockpitSignal {
  type: string;
  agent: string;
  severity: string;
  summary: string;
  timestamp: string;
  taskId?: string;
  venture?: string;
  healthClass?: string;
  classification?: string;
}

export interface CockpitAgentStatus {
  id: string;
  name: string;
  status: string;
  activityState: 'active' | 'idle' | 'unknown';
  activityReason: string;
  healthState: 'fresh' | 'stale' | 'offline';
  lastHeartbeat: string;
  lastActivityAt: string;
  stale: boolean;
  currentTaskId?: string;
  currentTaskTitle?: string;
  lane?: string;
}

export interface CockpitSystemHealth {
  overall: 'GREEN' | 'YELLOW' | 'RED';
  agents: CockpitAgentStatus[];
  latestSweep?: {
    healthClass: string;
    summary: string;
    timestamp: string;
  };
  blockedCount: number;
  activeSignalCount: number;
  activeAgentCount: number;
  freshAgentCount: number;
}

export interface CockpitBoardSnapshot {
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
  review: number;
  total: number;
}

export interface CockpitData {
  decisionsNeeded: CockpitDecision[];
  signalFeed: CockpitSignal[];
  systemHealth: CockpitSystemHealth;
  boardSnapshot: CockpitBoardSnapshot;
  generatedAt: string;
}

// ── Fetch ─────────────────────────────────────────────────────────

async function fetchCockpit(): Promise<CockpitData> {
  return apiFetch<CockpitData>(`${API_BASE}/cockpit`);
}

// ── Hook ──────────────────────────────────────────────────────────

export function useCockpit() {
  const { isConnected } = useWebSocketStatus();

  return useQuery({
    queryKey: ['cockpit'],
    queryFn: fetchCockpit,
    refetchInterval: isConnected ? 30_000 : 15_000,
    staleTime: isConnected ? 15_000 : 5_000,
  });
}

// ── Signal count hook (for badge) ─────────────────────────────────

export function useSignalCount() {
  const { data } = useCockpit();

  if (!data) return 0;

  return data.systemHealth.activeSignalCount + data.decisionsNeeded.length;
}
