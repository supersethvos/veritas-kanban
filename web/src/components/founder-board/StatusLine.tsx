import type { FounderBoardData } from '@/hooks/useFounderBoard';

interface Props {
  data: FounderBoardData;
}

export default function StatusLine({ data }: Props) {
  const parts: Array<{ text: string; gold?: boolean }> = [];

  // Active agents
  const activeAgents = data.agents.filter((a) => a.activityState === 'active');
  if (activeAgents.length > 0) {
    const names = activeAgents.map((a) => a.name).join(', ');
    parts.push({ text: `${names} busy`, gold: true });
  }

  // Non-zero counts — only actionable signals
  if (data.blockedCount > 0) parts.push({ text: `${data.blockedCount} blocked` });
  if (data.awaitingDecisionCount > 0)
    parts.push({ text: `${data.awaitingDecisionCount} awaiting` });
  if (data.overdueCount > 0) parts.push({ text: `${data.overdueCount} overdue` });
  if (data.newlyCompleteCount > 0) parts.push({ text: `${data.newlyCompleteCount} complete` });

  if (parts.length === 0) {
    return (
      <p className="text-sm md:text-[1.3125rem] text-primal-gray-mid text-center">System quiet.</p>
    );
  }

  return (
    <p className="text-sm md:text-[1.3125rem] text-primal-gray-mid text-center">
      {parts.map((part, i) => (
        <span key={part.text}>
          {i > 0 && <span className="text-primal-muted"> · </span>}
          <span className={part.gold ? 'text-primal-gold' : undefined}>{part.text}</span>
        </span>
      ))}
    </p>
  );
}
