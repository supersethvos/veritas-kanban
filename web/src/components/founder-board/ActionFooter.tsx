import { useState } from 'react';
import { Check, X, Bell, ArrowUpRight, Repeat2 } from 'lucide-react';
import { useFounderDispatch } from '@/hooks/useFounderDispatch';
import type { DispatchAction, DispatchPayload } from '@/lib/dispatch-signal';
import type { FounderSurfaceAttentionCategory } from '@veritas-kanban/shared';

const CATEGORY_ACTIONS: Record<
  Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>,
  { action: DispatchAction; label: string; icon: typeof Check; className: string }[]
> = {
  blocked: [
    {
      action: 'approve',
      label: 'Clear',
      icon: Check,
      className: 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
    },
    {
      action: 'reassign',
      label: 'Redirect',
      icon: Repeat2,
      className: 'bg-primal-gold/10 text-primal-gold/70 hover:bg-primal-gold/20',
    },
    {
      action: 'escalate',
      label: 'Escalate',
      icon: ArrowUpRight,
      className: 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
    },
  ],
  overdue: [
    {
      action: 'nudge',
      label: 'Nudge',
      icon: Bell,
      className: 'bg-primal-gold/10 text-primal-gold/70 hover:bg-primal-gold/20',
    },
    {
      action: 'escalate',
      label: 'Escalate',
      icon: ArrowUpRight,
      className: 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
    },
  ],
  awaiting_decision: [
    {
      action: 'approve',
      label: 'Approve',
      icon: Check,
      className: 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
    },
    {
      action: 'reject',
      label: 'Reject',
      icon: X,
      className: 'bg-primal-red/10 text-primal-red/70 hover:bg-primal-red/20',
    },
    {
      action: 'reassign',
      label: 'Redirect',
      icon: Repeat2,
      className: 'bg-primal-gold/10 text-primal-gold/70 hover:bg-primal-gold/20',
    },
  ],
};

interface Props {
  category: Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>;
  targetAgent: string;
  taskId?: string | null;
  workflowName: string;
}

export default function ActionFooter({ category, targetAgent, taskId, workflowName }: Props) {
  const [dispatched, setDispatched] = useState<string | null>(null);
  const actions = CATEGORY_ACTIONS[category];

  const { dispatch, isPending } = useFounderDispatch({
    label: workflowName,
    onDispatched: (action) => setDispatched(action),
  });

  const handleAction = (action: DispatchAction, e: React.MouseEvent) => {
    e.stopPropagation();
    const payload: DispatchPayload = {
      targetAgent,
      action,
      message: `${action} from founder board: ${workflowName}`,
    };
    if (taskId) payload.taskId = taskId;
    dispatch(payload);
  };

  if (dispatched) {
    return (
      <div className="flex items-center gap-2 pt-3 text-xs text-primal-gray-mid">
        <Check className="h-3.5 w-3.5 text-emerald-400" />
        <span className="capitalize">{dispatched}</span> dispatched to {targetAgent}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 pt-3 border-t border-primal-rule-light/30">
      {actions.map(({ action, label, icon: Icon, className }) => (
        <button
          key={action}
          onClick={(e) => handleAction(action, e)}
          disabled={isPending}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${className}`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}
