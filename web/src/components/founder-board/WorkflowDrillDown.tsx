import { useFounderSurfaceWorkflowDetail } from '@/hooks/useFounderSurface';
import ActionFooter from './ActionFooter';
import type { FounderSurfaceAttentionCategory } from '@veritas-kanban/shared';

interface Props {
  workflowId: string;
  category: Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>;
}

const truthToneClass = {
  verified: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  at_risk: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  pending: 'border-primal-rule-light/70 bg-primal-bg/40 text-primal-gray-light',
} as const;

function sentenceCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function founderRouteMeta(category: Exclude<FounderSurfaceAttentionCategory, 'newly_complete'>) {
  switch (category) {
    case 'awaiting_decision':
      return { value: 'Founder decision', tone: 'at_risk' as const };
    case 'blocked':
      return { value: 'Dependency gate', tone: 'at_risk' as const };
    case 'overdue':
      return { value: 'Founder checkpoint', tone: 'pending' as const };
  }
}

function DetailPill({
  label,
  value,
  description,
  tone = 'pending',
}: {
  label: string;
  value: string;
  description: string;
  tone?: keyof typeof truthToneClass;
}) {
  return (
    <div className="rounded-xl border border-primal-rule-light/50 bg-primal-bg/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">{label}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${truthToneClass[tone]}`}>
          {value}
        </span>
      </div>
      <p className="mt-2 text-xs text-primal-gray-mid leading-relaxed">{description}</p>
    </div>
  );
}

export default function WorkflowDrillDown({ workflowId, category }: Props) {
  const { data, isLoading, isError } = useFounderSurfaceWorkflowDetail(workflowId);

  if (isLoading) {
    return (
      <div className="space-y-2 py-3">
        <div className="h-16 rounded-xl bg-primal-rule-light/20 animate-pulse" />
        <div className="h-16 rounded-xl bg-primal-rule-light/20 animate-pulse" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-primal-red/20 bg-primal-red/5 px-4 py-3 text-xs text-primal-gray-mid">
        Unable to load workflow detail.
      </div>
    );
  }

  const missingSurfaces = data.completion_truth.missing_surfaces.length
    ? ` Missing: ${data.completion_truth.missing_surfaces.join(', ')}.`
    : '';

  const founderRoute = founderRouteMeta(category);
  const founderAttention =
    data.founder_attention.find((item) => item.requires_founder_action) ??
    data.founder_attention[0];
  const driftSummary =
    data.readiness.degradation_explanation ??
    (data.workflow.state === 'under_review'
      ? data.workflow.status_reason
      : 'No material trust drift is active.');

  const executionSummary = data.readiness.blockers_explanation ?? data.readiness.readiness_summary;
  const founderRouteSummary =
    founderAttention?.recommended_action ??
    data.readiness.recommended_next_action ??
    'Inspect the workflow and take the next legal move.';

  return (
    <div className="space-y-3 pt-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <DetailPill
          label="Founder route"
          value={founderRoute.value}
          description={founderRouteSummary}
          tone={founderRoute.tone}
        />
        <DetailPill
          label="Execution state"
          value={sentenceCase(data.readiness.readiness_label)}
          description={executionSummary}
          tone={data.readiness.readiness_label === 'blocked' ? 'at_risk' : 'pending'}
        />
        <DetailPill
          label="Truth state"
          value={sentenceCase(data.completion_truth.state)}
          description={`${data.completion_truth.summary}${missingSurfaces} ${driftSummary}`.trim()}
          tone={
            data.completion_truth.state === 'at_risk' || data.workflow.state === 'under_review'
              ? 'at_risk'
              : data.completion_truth.state
          }
        />
      </div>

      {data.readiness.recommended_next_action && (
        <div className="rounded-xl border border-primal-rule-light/50 bg-primal-bg/30 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">Next action</p>
          <p className="mt-2 text-sm text-primal-gray-light">
            {data.readiness.recommended_next_action}
          </p>
        </div>
      )}

      {/* Action controls */}
      <ActionFooter
        category={category}
        targetAgent={data.workflow.owner_agent}
        taskId={data.workflow.current_task_id ?? data.founder_attention[0]?.task_id}
        workflowName={data.workflow.name}
      />
    </div>
  );
}
