import type {
  FounderSurfaceOverviewAttentionItem,
  FounderSurfaceAttentionCategory,
} from '@veritas-kanban/shared';
import { FOUNDER_ATTENTION_LABELS } from '@/hooks/useFounderSurface';
import WorkflowDrillDown from './WorkflowDrillDown';

// ── Glow styles by category ──────────────────────────────────────

const glowStyles: Record<Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>, string> = {
  blocked:
    'border-[rgba(192,57,43,0.5)] shadow-[0_0_20px_rgba(192,57,43,0.35),inset_0_0_20px_rgba(192,57,43,0.04)]',
  overdue:
    'border-[rgba(251,191,36,0.5)] shadow-[0_0_20px_rgba(251,191,36,0.35),inset_0_0_20px_rgba(251,191,36,0.04)]',
  awaiting_decision:
    'border-[rgba(201,168,76,0.5)] shadow-[0_0_20px_rgba(201,168,76,0.35),inset_0_0_20px_rgba(201,168,76,0.04)]',
};

const categoryBadgeClass: Record<
  Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>,
  string
> = {
  blocked: 'bg-primal-red/15 text-primal-red border-primal-red/30',
  overdue: 'bg-amber-400/15 text-amber-300 border-amber-300/30',
  awaiting_decision: 'bg-primal-gold/15 text-primal-gold border-primal-gold/30',
};

function formatAge(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '';

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

interface Props {
  item: FounderSurfaceOverviewAttentionItem;
  expanded: boolean;
  onToggle: () => void;
  onInspect?: (workflowId: string) => void;
}

export default function AttentionCard({ item, expanded, onToggle, onInspect }: Props) {
  const isCritical = item.severity === 'critical';
  const cardClass = isCritical ? 'card-glow-critical' : `border ${glowStyles[item.category]}`;

  return (
    <article
      className={`rounded-2xl ${cardClass} bg-primal-bg/60 backdrop-blur-sm transition-shadow duration-300`}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-6 py-5 cursor-pointer"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-primal-muted">
            <span className={`rounded-full border px-2 py-1 ${categoryBadgeClass[item.category]}`}>
              {FOUNDER_ATTENTION_LABELS[item.category]}
            </span>
            <span>{item.venture_id}</span>
            <span>{formatAge(item.waiting_since)}</span>
          </div>
          <div className="flex items-center gap-2">
            {onInspect && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspect(item.workflow_id);
                }}
                className="text-[11px] text-primal-gold/70 uppercase tracking-wider hover:text-primal-gold transition-colors"
              >
                Inspect
              </button>
            )}
            <span className="text-[11px] text-primal-gold uppercase tracking-wider">
              {item.action}
            </span>
            <span
              className={`text-primal-muted transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            >
              ▸
            </span>
          </div>
        </div>

        <h3 className="mt-3 text-base font-medium text-primal-gray-light">{item.what}</h3>

        <p className="mt-1 text-sm text-primal-gray-mid leading-relaxed">{item.why}</p>
      </button>

      {/* Drill-down — expand in place */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-6 pb-5">
            {expanded && (
              <WorkflowDrillDown workflowId={item.workflow_id} category={item.category} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
