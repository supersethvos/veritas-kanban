import type { WorkflowReadiness, Workflow } from '@veritas-kanban/shared';

interface Props {
  workflow: Workflow;
  readiness: WorkflowReadiness;
}

export default function DriftBlockerTruth({ workflow, readiness }: Props) {
  const hasBlockers = readiness.temporary_blockers.length > 0;
  const hasLimits = readiness.structural_limits.length > 0;
  const hasFailureSigs =
    readiness.top_failure_signatures && readiness.top_failure_signatures.length > 0;
  const isDegrading =
    readiness.degradation_confidence != null && readiness.degradation_confidence > 0.3;
  const isUnderReview = workflow.state === 'under_review';

  const show = hasBlockers || hasLimits || hasFailureSigs || isDegrading || isUnderReview;
  if (!show) return null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">
        Drift &amp; Blockers
      </p>

      {hasBlockers && (
        <div className="border-l-2 border-l-amber-400/50 pl-3 space-y-1">
          <p className="text-[10px] text-amber-300 font-medium">Temporary blockers</p>
          <ul className="space-y-0.5">
            {readiness.temporary_blockers.map((b, i) => (
              <li key={i} className="text-xs text-primal-gray-mid">
                · {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasLimits && (
        <div className="border-l-2 border-l-primal-red/50 pl-3 space-y-1">
          <p className="text-[10px] text-primal-red font-medium">Structural limits</p>
          <ul className="space-y-0.5">
            {readiness.structural_limits.map((l, i) => (
              <li key={i} className="text-xs text-primal-gray-mid">
                · {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasFailureSigs && (
        <div className="space-y-1">
          <p className="text-[10px] text-primal-muted font-medium">Top failure signatures</p>
          {readiness.top_failure_signatures!.map((sig, i) => (
            <p
              key={i}
              className="text-[11px] font-mono text-primal-gray-mid bg-primal-bg/50 rounded px-2 py-1"
            >
              {sig}
            </p>
          ))}
        </div>
      )}

      {isDegrading && readiness.degradation_explanation && (
        <p className="text-xs text-amber-200/80 leading-relaxed">
          {readiness.degradation_explanation}
        </p>
      )}

      {isUnderReview && workflow.status_reason && (
        <p className="text-xs text-primal-gray-mid leading-relaxed">
          Under review: {workflow.status_reason}
        </p>
      )}
    </div>
  );
}
