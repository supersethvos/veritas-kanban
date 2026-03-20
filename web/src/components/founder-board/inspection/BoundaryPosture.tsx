import type { WorkflowCertification, Workflow } from '@veritas-kanban/shared';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

interface Props {
  workflow: Workflow;
  certification: WorkflowCertification;
}

export default function BoundaryPosture({ workflow, certification }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">
        Boundary &amp; Posture
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-primal-rule-light/50 px-3 py-2">
          <p className="text-[10px] text-primal-muted">Risk class</p>
          <p className="text-xs text-primal-gray-light mt-0.5 capitalize">{workflow.risk_class}</p>
        </div>
        <div className="rounded-lg border border-primal-rule-light/50 px-3 py-2">
          <p className="text-[10px] text-primal-muted">Data class</p>
          <p className="text-xs text-primal-gray-light mt-0.5 capitalize">{workflow.data_class}</p>
        </div>
      </div>

      <div className="rounded-lg border border-primal-rule-light/50 px-3 py-2 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-primal-muted">Certification</p>
          <p className="text-[10px] text-primal-muted">
            {formatDate(certification.last_evaluated_at)}
          </p>
        </div>
        <p className="text-xs text-primal-gray-mid leading-relaxed">
          {certification.certification_reason}
        </p>
        {certification.review_required && (
          <p className="text-[10px] text-primal-gold font-medium">Review required</p>
        )}
      </div>
    </div>
  );
}
