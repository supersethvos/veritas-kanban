import type { WorkflowReadiness, FounderAttentionItem } from '@veritas-kanban/shared';

interface Props {
  readiness: WorkflowReadiness;
  attentionItems: FounderAttentionItem[];
}

export default function LegalNextActions({ readiness, attentionItems }: Props) {
  const hasRecommended = !!readiness.recommended_next_action;
  const secondaryActions = attentionItems
    .filter((a) => a.recommended_action)
    .map((a) => a.recommended_action);

  if (!hasRecommended && secondaryActions.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">Next Actions</p>

      {hasRecommended && (
        <div className="border-l-2 border-l-primal-gold/50 pl-3 rounded-r-lg bg-primal-gold/5 py-2 pr-3">
          <p className="text-xs text-primal-gray-light leading-relaxed">
            {readiness.recommended_next_action}
          </p>
        </div>
      )}

      {secondaryActions.length > 0 && (
        <div className="space-y-1">
          {secondaryActions.map((action, i) => (
            <p key={i} className="text-xs text-primal-gray-mid pl-3">
              · {action}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
