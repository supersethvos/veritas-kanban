import type { FounderBoardData } from '@/hooks/useFounderBoard';

type AgentEntry = FounderBoardData['agents'][number];

function dotColor(agent: AgentEntry): string {
  if (agent.healthState === 'offline') return 'bg-primal-muted/40';
  if (agent.healthState === 'stale') return 'bg-red-400/60';
  if (agent.activityState === 'active') return 'bg-emerald-400';
  return 'bg-primal-gold/30';
}

function statusLabel(agent: AgentEntry): string {
  if (agent.healthState === 'offline') return 'offline';
  if (agent.healthState === 'stale') return 'stale';
  if (agent.activityState === 'active') return 'active';
  return 'idle';
}

interface Props {
  agents: FounderBoardData['agents'];
}

export default function AgentPulse({ agents }: Props) {
  if (agents.length === 0) {
    return (
      <p className="text-xs md:text-lg text-primal-muted text-center">No agents registered.</p>
    );
  }

  const anyActive = agents.some((a) => a.activityState === 'active');

  // If all quiet, collapse to a single line
  if (!anyActive) {
    return (
      <p className="text-xs md:text-lg text-primal-muted text-center">
        {agents.length} agent{agents.length === 1 ? '' : 's'} quiet
      </p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      {agents.map((agent) => (
        <span
          key={agent.id}
          className="inline-flex items-center gap-1.5 md:gap-2 text-xs md:text-lg text-primal-gray-mid"
        >
          <span
            className={`inline-block h-2 w-2 md:h-3 md:w-3 rounded-full ${dotColor(agent)} ${
              agent.activityState === 'active' ? 'animate-pulse' : ''
            }`}
          />
          <span className={agent.activityState === 'active' ? 'text-primal-gold' : undefined}>
            {agent.name.toLowerCase()}
          </span>
          <span className="text-primal-muted">{statusLabel(agent)}</span>
        </span>
      ))}
    </div>
  );
}
