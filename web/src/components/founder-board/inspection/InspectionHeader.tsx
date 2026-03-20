import type {
  Workflow,
  WorkflowCertification,
  WorkflowReadiness,
  CompletionTruthOverlay,
} from '@veritas-kanban/shared';
import { buildSystemClaim, type ClaimTone } from './claim';

const toneBorder: Record<ClaimTone, string> = {
  verified: 'border-l-emerald-400/60',
  at_risk: 'border-l-amber-300/60',
  pending: 'border-l-primal-rule-light/70',
};

const certBadge: Record<string, string> = {
  certified: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
  ready_for_review: 'bg-primal-gold/10 text-primal-gold border-primal-gold/30',
  candidate: 'bg-primal-rule-light/40 text-primal-gray-light border-primal-rule-light/70',
  not_ready: 'bg-primal-rule-light/20 text-primal-muted border-primal-rule-light/50',
  decertified: 'bg-primal-red/10 text-primal-red border-primal-red/30',
};

const readinessBadge: Record<string, string> = {
  certified: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
  near_ready: 'bg-primal-gold/10 text-primal-gold border-primal-gold/30',
  advancing: 'bg-sky-400/10 text-sky-300 border-sky-400/30',
  emerging: 'bg-primal-rule-light/40 text-primal-gray-light border-primal-rule-light/70',
  blocked: 'bg-primal-red/10 text-primal-red border-primal-red/30',
  degrading: 'bg-amber-400/10 text-amber-300 border-amber-300/30',
};

function sentenceCase(value: string): string {
  return value
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

interface Props {
  workflow: Workflow;
  certification: WorkflowCertification;
  readiness: WorkflowReadiness;
  completionTruth: CompletionTruthOverlay;
}

export default function InspectionHeader({
  workflow,
  certification,
  readiness,
  completionTruth,
}: Props) {
  const { claim, tone } = buildSystemClaim(
    workflow,
    certification,
    readiness,
    completionTruth.state
  );

  return (
    <div className="space-y-3">
      {/* System claim */}
      <div className={`border-l-2 ${toneBorder[tone]} pl-4`}>
        <p className="text-sm text-primal-gray-light leading-relaxed">{claim}</p>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] ${certBadge[certification.certification_status] ?? certBadge.not_ready}`}
        >
          {sentenceCase(certification.certification_status)}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] ${readinessBadge[readiness.readiness_label] ?? readinessBadge.emerging}`}
        >
          {sentenceCase(readiness.readiness_label)}
        </span>
        <span className="text-[10px] text-primal-muted">
          {workflow.venture_id} · {workflow.workflow_family}
        </span>
      </div>
    </div>
  );
}
