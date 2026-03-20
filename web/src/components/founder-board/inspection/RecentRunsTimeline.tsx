import type { WorkflowRunSummary } from '@veritas-kanban/shared';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

interface Props {
  runs: WorkflowRunSummary[];
}

export default function RecentRunsTimeline({ runs }: Props) {
  if (runs.length === 0) return null;

  const display = runs.slice(0, 8);

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">
        Recent runs ({runs.length})
      </p>

      <div className="space-y-1">
        {display.map((run) => {
          const duration =
            run.finished_at && run.started_at
              ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
              : null;

          return (
            <div key={run.run_id} className="flex items-center gap-2 text-[11px] font-mono">
              <span
                className={`h-1.5 w-1.5 rounded-full ${run.success ? 'bg-emerald-400' : 'bg-primal-red'}`}
              />
              <span className="text-primal-gray-mid w-28 shrink-0">
                {formatTime(run.finished_at)}
              </span>
              {duration != null && (
                <span className="text-primal-muted w-12 shrink-0">{formatDuration(duration)}</span>
              )}
              {run.cost != null && (
                <span className="text-primal-muted w-14 shrink-0">${run.cost.toFixed(2)}</span>
              )}
              <span
                className={`text-[10px] ${run.policy_result === 'pass' ? 'text-primal-muted' : 'text-amber-300'}`}
              >
                {run.policy_result !== 'pass' ? run.policy_result : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
