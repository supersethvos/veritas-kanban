import type { FounderSurfaceExecutiveOverview } from '@veritas-kanban/shared';

interface Props {
  overview: FounderSurfaceExecutiveOverview;
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export default function AutonomyNumber({ overview }: Props) {
  const { primary_number, surface_state } = overview;

  return (
    <section className="text-center space-y-4">
      <div className="animate-in fade-in duration-500 space-y-3">
        <div
          className="text-7xl font-bold tracking-tight text-primal-gold md:text-8xl"
          aria-label={`${formatPercentage(primary_number.percentage)} percent certified autonomy rate`}
        >
          {formatPercentage(primary_number.percentage)}%
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.28em] text-primal-muted">
            {primary_number.label}
          </p>
          <p className="text-sm text-primal-gray-mid">
            {primary_number.certified_workflow_count} of {primary_number.workflow_count} workflows
          </p>
        </div>
      </div>

      {surface_state.mode === 'quiet' && (
        <p className="text-xs text-primal-muted">Quiet. Nothing needs your attention.</p>
      )}
    </section>
  );
}
