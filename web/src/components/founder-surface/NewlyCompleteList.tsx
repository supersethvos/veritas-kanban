import { useState } from 'react';
import { Check } from 'lucide-react';
import { useFounderDispatch } from '@/hooks/useFounderDispatch';
import type { FounderSurfaceNewlyCompleteItem } from '@veritas-kanban/shared';

function AcknowledgeButton({ item }: { item: FounderSurfaceNewlyCompleteItem }) {
  const [acked, setAcked] = useState(false);

  const { dispatch, isPending } = useFounderDispatch({
    label: item.what,
    onDispatched: () => setAcked(true),
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({
      targetAgent: item.owner_agent,
      action: 'acknowledge',
      workflowId: item.workflow_id,
      message: `Acknowledged completion: ${item.what}`,
    });
  };

  if (acked) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-300">
        <Check className="h-3 w-3" />
        Acknowledged
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-full border border-primal-gold/30 bg-primal-gold/10 px-2 py-1 text-[11px] text-primal-gold hover:bg-primal-gold/20 transition-colors disabled:opacity-50 cursor-pointer"
    >
      {isPending ? 'Sending…' : item.action}
    </button>
  );
}

export default function NewlyCompleteList({ items }: { items: FounderSurfaceNewlyCompleteItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-label="Newly complete workflows">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primal-gray-light">Newly complete</p>
          <p className="text-xs text-primal-muted">Fresh wins, compressed and quiet.</p>
        </div>
        <p className="text-xs text-primal-muted">{items.length} fresh</p>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.attention_id}
            className="rounded-xl border border-primal-rule-light/70 bg-primal-bg/30 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primal-gray-light">{item.what}</p>
                <p className="mt-1 text-xs text-primal-gray-mid">{item.why}</p>
              </div>
              <AcknowledgeButton item={item} />
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-primal-muted">
              {item.venture_id}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
