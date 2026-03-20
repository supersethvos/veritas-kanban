import { useState } from 'react';
import { Check, ArrowUpRight } from 'lucide-react';
import { useFounderDispatch } from '@/hooks/useFounderDispatch';
import type { DispatchAction } from '@/lib/dispatch-signal';

export interface DispatchIntent {
  verb: DispatchAction;
  targetAgent: string;
  taskId?: string;
  label: string;
  message?: string;
}

/**
 * Inline dispatch card rendered inside chat messages when
 * the agent detects a dispatchable intent.
 *
 * Shows the action verb + target, with a Commit button.
 * After dispatch, settles into a confirmed state.
 */
export function DispatchCard({ intent }: { intent: DispatchIntent }) {
  const [committed, setCommitted] = useState(false);

  const { dispatch, isPending } = useFounderDispatch({
    label: intent.label,
    onDispatched: () => setCommitted(true),
  });

  const handleCommit = () => {
    dispatch({
      targetAgent: intent.targetAgent,
      action: intent.verb,
      taskId: intent.taskId,
      message: intent.message ?? `${intent.verb} via cockpit chat: ${intent.label}`,
    });
  };

  if (committed) {
    return (
      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 my-1">
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <Check className="h-3 w-3" />
          <span className="capitalize">{intent.verb}</span> dispatched to {intent.targetAgent}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primal-gold/30 bg-primal-gold/5 px-3 py-2 my-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <ArrowUpRight className="h-3 w-3 text-primal-gold" />
          <span className="text-primal-gray-light capitalize">{intent.verb}</span>
          <span className="text-primal-muted">→ {intent.targetAgent}</span>
        </div>
        <button
          onClick={handleCommit}
          disabled={isPending}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium bg-primal-gold/15 text-primal-gold hover:bg-primal-gold/25 transition-colors disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          {isPending ? 'Sending…' : 'Commit'}
        </button>
      </div>
      {intent.label && <p className="text-[11px] text-primal-gray-mid mt-1">{intent.label}</p>}
    </div>
  );
}
