import type { FounderSurfaceVentureRate } from '@veritas-kanban/shared';

interface Props {
  rates: FounderSurfaceVentureRate[];
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function compactPressure(rate: FounderSurfaceVentureRate): string {
  return [
    rate.blocked_count > 0 ? `${rate.blocked_count} blocked` : null,
    rate.overdue_count > 0 ? `${rate.overdue_count} overdue` : null,
    rate.awaiting_decision_count > 0 ? `${rate.awaiting_decision_count} decision` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function completionSummary(rate: FounderSurfaceVentureRate): string {
  if (rate.newly_complete_count <= 0) {
    return 'Completion: no fresh verified wins.';
  }

  return `Completion: ${rate.newly_complete_count} newly verified.`;
}

export default function VentureStrip({ rates }: Props) {
  if (rates.length === 0) {
    return null;
  }

  return (
    <section aria-label="Venture autonomy rates" className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-primal-muted">
        <span>By venture</span>
        <span>Trust / pressure</span>
      </div>

      {rates.map((rate) => {
        const pressure = compactPressure(rate);

        return (
          <div
            key={rate.venture_id}
            className="rounded-xl border border-primal-rule-light/70 bg-primal-bg/30 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium text-primal-gray-light">
                  {rate.venture_id}
                </p>
                <p className="text-xs text-primal-muted">
                  Critical path {formatPercentage(rate.critical_path_certified_rate * 100)}% ·{' '}
                  {rate.active_initiative_count} active
                </p>
                <p className="text-xs text-primal-gray-mid">
                  {pressure ? `Pressure: ${pressure}` : 'Pressure: quiet.'}
                </p>
                <p className="text-xs text-primal-gray-mid">{completionSummary(rate)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-semibold text-primal-gold">
                  {formatPercentage(rate.percentage)}%
                </p>
                <p className="text-[11px] text-primal-muted">
                  {rate.certified_workflow_count}/{rate.workflow_count}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
