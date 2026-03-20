import { useState } from 'react';
import type { FounderSurfaceOverviewAttentionItem } from '@veritas-kanban/shared';
import { Button } from '@/components/ui/button';
import {
  FOUNDER_ATTENTION_LABELS,
  useFounderSurfaceWorkflowDetail,
} from '@/hooks/useFounderSurface';

interface Props {
  items: FounderSurfaceOverviewAttentionItem[];
}

const severityAccentClass: Record<FounderSurfaceOverviewAttentionItem['severity'], string> = {
  info: 'border-l-primal-rule',
  attention: 'border-l-primal-gold',
  action_required: 'border-l-amber-400',
  critical: 'border-l-primal-red',
};

const categoryBadgeClass: Record<FounderSurfaceOverviewAttentionItem['category'], string> = {
  blocked: 'bg-primal-red/10 text-primal-red border-primal-red/30',
  overdue: 'bg-amber-400/10 text-amber-300 border-amber-300/30',
  awaiting_decision: 'bg-primal-gold/10 text-primal-gold border-primal-gold/30',
};

const truthToneClass = {
  verified: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  at_risk: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  pending: 'border-primal-rule-light/70 bg-primal-bg/40 text-primal-gray-light',
} as const;

function formatWaitingSince(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown age';

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m waiting`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h waiting`;
  return `${Math.floor(minutes / (24 * 60))}d waiting`;
}

function sentenceCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function humanizeEfficiencyDiagnosis(value: string | null | undefined): string {
  if (!value || value === 'unknown') return 'Stable';
  if (value === 'platform_bound') return 'Platform-bound';
  if (value === 'agent_bound') return 'Agent-bound';
  return 'Mixed';
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
    <div className="rounded-xl border border-primal-rule-light/70 bg-primal-bg/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">{label}</p>
        <span className={`rounded-full border px-2 py-1 text-[11px] ${truthToneClass[tone]}`}>
          {value}
        </span>
      </div>
      <p className="mt-2 text-xs text-primal-gray-mid">{description}</p>
    </div>
  );
}

function AttentionDrilldown({ item }: { item: FounderSurfaceOverviewAttentionItem }) {
  const { data, isLoading, isError } = useFounderSurfaceWorkflowDetail(item.workflow_id);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-primal-rule-light/70 bg-primal-bg/20 px-4 py-3 text-xs text-primal-muted">
        Loading integrated truth…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-primal-red/20 bg-primal-red/5 px-4 py-3 text-xs text-primal-gray-mid">
        Unable to load inline founder review details.
      </div>
    );
  }

  const driftSummary =
    data.readiness.degradation_explanation ??
    (data.workflow.state === 'under_review'
      ? data.workflow.status_reason
      : 'No material drift signal is currently earning interruption.');
  const operationsSummary = data.readiness.blockers_explanation ?? data.readiness.readiness_summary;
  const missingSurfaces = data.completion_truth.missing_surfaces.length
    ? ` Missing: ${data.completion_truth.missing_surfaces.join(', ')}.`
    : '';

  return (
    <div className="space-y-3 rounded-xl border border-primal-rule-light/70 bg-primal-bg/20 p-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <DetailPill
          label="Completion truth"
          value={sentenceCase(data.completion_truth.state)}
          description={`${data.completion_truth.summary}${missingSurfaces}`}
          tone={data.completion_truth.state}
        />
        <DetailPill
          label="Handoff / blocker truth"
          value={sentenceCase(data.readiness.readiness_label)}
          description={operationsSummary}
          tone={data.readiness.readiness_label === 'blocked' ? 'at_risk' : 'pending'}
        />
        <DetailPill
          label="Drift / self-heal"
          value={humanizeEfficiencyDiagnosis(data.efficiency_diagnosis)}
          description={driftSummary}
          tone={data.workflow.state === 'under_review' ? 'at_risk' : 'pending'}
        />
      </div>

      <div className="rounded-xl border border-primal-rule-light/70 bg-primal-bg/30 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">
          Next legal action
        </p>
        <p className="mt-2 text-sm text-primal-gray-light">{item.recommended_action}</p>
      </div>
    </div>
  );
}

function AttentionItemCard({ item }: { item: FounderSurfaceOverviewAttentionItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={`rounded-xl border border-primal-rule-light/70 border-l-2 ${severityAccentClass[item.severity]} bg-primal-bg/40 px-4 py-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-primal-muted">
          <span className={`rounded-full border px-2 py-1 ${categoryBadgeClass[item.category]}`}>
            {FOUNDER_ATTENTION_LABELS[item.category]}
          </span>
          <span>{item.venture_id}</span>
          <span>{formatWaitingSince(item.waiting_since)}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
          className="h-7 px-2.5 text-[11px]"
        >
          {expanded ? 'Hide' : item.action}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[auto,1fr] md:gap-x-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primal-muted">
          What
        </span>
        <p className="text-sm font-semibold text-primal-gray-light">{item.what}</p>

        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primal-muted">
          Why
        </span>
        <p className="text-sm text-primal-gray-mid">{item.why}</p>

        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primal-muted">
          Action
        </span>
        <p className="text-sm text-primal-gray-light">{item.recommended_action}</p>
      </div>

      {expanded ? (
        <div className="mt-4">
          <AttentionDrilldown item={item} />
        </div>
      ) : null}
    </article>
  );
}

export default function AttentionQueue({ items }: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-label="Founder attention queue">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primal-gray-light">Founder attention</p>
          <p className="text-xs text-primal-muted">
            Only earned interruptions. What / why / action. Inspect expands in place.
          </p>
        </div>
        <p className="text-xs text-primal-muted">{items.length} live</p>
      </div>

      {items.map((item) => (
        <AttentionItemCard key={item.attention_id} item={item} />
      ))}
    </section>
  );
}
