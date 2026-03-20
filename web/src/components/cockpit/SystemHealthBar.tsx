import { Activity, Wifi, WifiOff, Clock } from 'lucide-react';
import type { CockpitSystemHealth, CockpitAgentStatus } from '@/hooks/useCockpit';

interface Props {
  health: CockpitSystemHealth;
}

const healthColors: Record<string, string> = {
  GREEN: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  YELLOW: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  RED: 'bg-primal-red/10 border-primal-red/30 text-primal-red/70',
};

const healthLabels: Record<string, string> = {
  GREEN: 'All Systems Operational',
  YELLOW: 'Degraded — Attention Needed',
  RED: 'Critical — Action Required',
};

const activityDotColors: Record<string, string> = {
  active: 'bg-primal-gold animate-pulse',
  idle: 'bg-gray-400',
  unknown: 'bg-gray-600',
};

const healthTextColors: Record<string, string> = {
  fresh: 'text-emerald-400',
  stale: 'text-amber-400',
  offline: 'text-primal-red',
};

function AgentDot({ agent }: { agent: CockpitAgentStatus }) {
  const dotColor = activityDotColors[agent.activityState] || activityDotColors.unknown;
  const mutedClass =
    agent.healthState !== 'fresh' && agent.activityState !== 'active' ? 'opacity-60' : '';
  const healthTone = healthTextColors[agent.healthState] || healthTextColors.stale;

  return (
    <div className={`group relative flex items-center gap-1.5 ${mutedClass}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      <span className="text-xs text-primal-gray-mid">{agent.name}</span>
      <span className={`text-[10px] uppercase tracking-wide ${healthTone}`}>
        {agent.healthState}
      </span>
      <span className="hidden group-hover:block absolute left-0 top-full mt-1 z-50 min-w-[220px] rounded bg-primal-rule-light px-2 py-1 text-xs text-primal-gray-light/80 shadow-lg border border-primal-rule">
        <span className="block">{agent.currentTaskTitle || agent.activityReason}</span>
        <span className="block opacity-70">
          Activity: {agent.activityState} · Heartbeat: {formatTimestamp(agent.lastHeartbeat)}
        </span>
      </span>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SystemHealthBar({ health }: Props) {
  const colorClass = healthColors[health.overall] || healthColors.GREEN;
  const label = healthLabels[health.overall] || 'Unknown';

  const totalAgents = health.agents.length;

  return (
    <div className={`rounded-lg border px-4 py-3 ${colorClass}`}>
      <div className="flex items-center justify-between">
        {/* Left: Status */}
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5" />
          <div>
            <span className="font-semibold text-sm">{label}</span>
            {health.latestSweep && (
              <span className="ml-2 text-xs opacity-70">
                Last sweep: {formatTimestamp(health.latestSweep.timestamp)}
              </span>
            )}
          </div>
        </div>

        {/* Right: Agent summary + stats */}
        <div className="flex items-center gap-6">
          {health.blockedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-400 font-medium">{health.blockedCount} blocked</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5 text-primal-gold" />
            <span className="text-primal-gray-mid">{health.activeAgentCount} active</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {health.freshAgentCount === totalAgents ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-primal-gray-mid" />
            )}
            <span className="text-primal-gray-mid">
              {health.freshAgentCount}/{totalAgents} fresh
            </span>
          </div>
        </div>
      </div>

      {/* Agent dots row */}
      <div className="mt-2 flex flex-wrap gap-3">
        {health.agents.map((agent) => (
          <AgentDot key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
