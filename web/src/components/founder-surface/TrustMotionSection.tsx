import type { FounderSurfaceWorkflowTrustSummary } from '@veritas-kanban/shared';

function trustReason(item: FounderSurfaceWorkflowTrustSummary): string {
  return (
    item.readiness.degradation_explanation ??
    item.certification.certification_reason ??
    item.readiness.readiness_summary
  );
}

function TrustMotionList({
  title,
  items,
  empty,
}: {
  title: string;
  items: FounderSurfaceWorkflowTrustSummary[];
  empty: string;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-primal-rule-light/70 bg-primal-bg/25 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-primal-gray-light">{title}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-primal-muted">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 3).map((item) => (
            <div
              key={`${title}-${item.workflow.workflow_id}`}
              className="rounded-xl border border-primal-rule-light/70 bg-primal-bg/30 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-primal-gray-light">{item.workflow.name}</p>
                <span className="rounded-full border border-primal-rule-light/70 px-2 py-1 text-[11px] text-primal-muted">
                  {item.completion_truth.state.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-2 text-xs text-primal-gray-mid">{trustReason(item)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrustMotionSection({
  gains,
  degradations,
}: {
  gains: FounderSurfaceWorkflowTrustSummary[];
  degradations: FounderSurfaceWorkflowTrustSummary[];
}) {
  return (
    <section className="grid gap-3 lg:grid-cols-2" aria-label="Trust motion">
      <TrustMotionList
        title="Trust gains"
        items={gains}
        empty="No fresh promotions are waiting to be judged right now."
      />
      <TrustMotionList
        title="Drift / self-heal"
        items={degradations}
        empty="No trust regression is currently earning review."
      />
    </section>
  );
}
