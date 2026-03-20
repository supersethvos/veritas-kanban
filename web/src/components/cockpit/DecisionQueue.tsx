import { useState } from 'react';
import { AlertTriangle, Clock, ExternalLink, Zap, Check, X, Bell } from 'lucide-react';
import { useView } from '@/contexts/ViewContext';
import { useFounderDispatch } from '@/hooks/useFounderDispatch';
import type { DispatchAction, DispatchPayload } from '@/lib/dispatch-signal';
import type { CockpitDecision } from '@/hooks/useCockpit';

interface Props {
  decisions: CockpitDecision[];
}

const severityStyles: Record<string, { bg: string; border: string; icon: string; badge: string }> =
  {
    critical: {
      bg: 'bg-primal-red/5',
      border: 'border-primal-red/30',
      icon: 'text-primal-red',
      badge: 'bg-primal-red/20 text-primal-red/70',
    },
    action_required: {
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/30',
      icon: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300',
    },
    attention: {
      bg: 'bg-primal-gold/5',
      border: 'border-primal-gold/30',
      icon: 'text-primal-gold',
      badge: 'bg-primal-gold/20 text-primal-gold/70',
    },
  };

function formatWaitTime(since: string): string {
  const diff = Date.now() - new Date(since).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function DecisionCard({ decision }: { decision: CockpitDecision }) {
  const { navigateToTask } = useView();
  const [dispatched, setDispatched] = useState<string | null>(null);
  const style = severityStyles[decision.severity] || severityStyles.attention;

  const { dispatch, isPending } = useFounderDispatch({
    label: decision.title,
    onDispatched: (action) => setDispatched(action),
  });

  const handleAction = (action: DispatchAction, e: React.MouseEvent) => {
    e.stopPropagation();
    const payload: DispatchPayload = {
      targetAgent: decision.agent,
      action,
      taskId: decision.taskId,
      message: `${action} from cockpit: ${decision.title}`,
    };
    dispatch(payload);
  };

  const handleClick = () => {
    if (decision.taskId) {
      navigateToTask(decision.taskId);
    }
  };

  if (dispatched) {
    return (
      <div className="rounded-lg border border-primal-rule/50 bg-primal-card/30 p-3 opacity-60">
        <div className="flex items-center gap-2 text-xs text-primal-gray-mid">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span className="capitalize">{dispatched}</span> dispatched to {decision.agent}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border ${style.bg} ${style.border} p-3 cursor-pointer hover:brightness-110 transition-all`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {decision.severity === 'critical' ? (
            <Zap className={`h-4 w-4 mt-0.5 shrink-0 ${style.icon}`} />
          ) : (
            <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${style.icon}`} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-primal-gray-light truncate">{decision.title}</p>
            <p className="text-xs text-primal-gray-mid mt-0.5 line-clamp-2">{decision.summary}</p>
          </div>
        </div>
        {decision.taskId && (
          <ExternalLink className="h-3.5 w-3.5 text-primal-gray-mid shrink-0 mt-0.5" />
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${style.badge}`}
        >
          {decision.severity.replace('_', ' ')}
        </span>
        <span className="text-[10px] text-primal-gray-mid">
          {decision.source === 'task' ? 'task' : 'signal'} · {decision.agent}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-primal-gray-mid">
          <Clock className="h-3 w-3" />
          {formatWaitTime(decision.waitingSince)}
        </span>
      </div>

      {/* Action buttons */}
      {decision.source === 'task' && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-primal-rule-light/50">
          <button
            onClick={(e) => handleAction('approve', e)}
            disabled={isPending}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            Approve
          </button>
          <button
            onClick={(e) => handleAction('reject', e)}
            disabled={isPending}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-primal-red/10 text-primal-red/70 hover:bg-primal-red/20 transition-colors disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Reject
          </button>
          <button
            onClick={(e) => handleAction('nudge', e)}
            disabled={isPending}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-primal-gold/10 text-primal-gold/70 hover:bg-primal-gold/20 transition-colors disabled:opacity-50"
          >
            <Bell className="h-3 w-3" />
            Nudge
          </button>
        </div>
      )}
    </div>
  );
}

export default function DecisionQueue({ decisions }: Props) {
  if (decisions.length === 0) {
    return (
      <div className="rounded-lg border border-primal-rule-light bg-primal-card/50 p-6 text-center">
        <div className="text-primal-gray-mid text-sm">No decisions needed</div>
        <div className="text-primal-muted text-xs mt-1">
          All clear — nothing requires your attention
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-primal-gray-light/80 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Needs Your Decision
          <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium px-1.5">
            {decisions.length}
          </span>
        </h3>
      </div>

      <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
        {decisions.map((d) => (
          <DecisionCard key={d.id} decision={d} />
        ))}
      </div>
    </div>
  );
}
