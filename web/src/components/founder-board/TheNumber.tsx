import type { FounderBoardData } from '@/hooks/useFounderBoard';
import type { WorkflowState } from '@veritas-kanban/shared';

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

const COHORT_LABELS: Record<WorkflowState, string> = {
  human_native: 'discovered',
  assisted: 'assisted',
  governed_copilot: 'governed',
  certifying: 'certifying',
  certified_autonomous: 'certified',
  under_review: 'under review',
};

function trendMeta(data: FounderBoardData): {
  char: string;
  className: string;
  label: string;
  detail: string;
} {
  const g = data.trustGainCount;
  const d = data.trustDegradationCount;
  const parts: string[] = [];
  if (g > 0) parts.push(`${g} gain${g === 1 ? '' : 's'}`);
  if (d > 0) parts.push(`${d} drift${d === 1 ? '' : 's'}`);
  const detail = parts.join(' · ');

  switch (data.momentum) {
    case 'advancing':
      return { char: '↑', className: 'text-emerald-400/80', label: 'advancing', detail };
    case 'drifting':
      return { char: '↓', className: 'text-red-400/60', label: 'drifting', detail };
    case 'steady':
      return { char: '→', className: 'text-primal-muted/60', label: 'steady', detail };
  }
}

interface Props {
  data: FounderBoardData;
}

export default function TheNumber({ data }: Props) {
  const isQuiet = data.mode === 'quiet';
  const healthDotColor =
    data.healthOverall === 'RED'
      ? 'bg-primal-red'
      : data.healthOverall === 'YELLOW'
        ? 'bg-amber-400'
        : null;

  const trend = trendMeta(data);
  const cohort = data.pipelineCohort;

  return (
    <div className="relative flex flex-col items-center justify-center text-center">
      {/* The Number + health dot */}
      <div
        className={`text-[clamp(5rem,22vw,20rem)] font-bold tracking-tighter text-primal-gold leading-none ${isQuiet ? 'animate-glow-quiet' : 'animate-glow'}`}
        aria-label={`${formatPercentage(data.percentage)} percent certified autonomy rate`}
      >
        {formatPercentage(data.percentage)}%
        {healthDotColor && (
          <span
            className={`inline-block h-2.5 w-2.5 md:h-5 md:w-5 rounded-full ${healthDotColor} align-super ml-1 md:ml-2`}
            aria-label={`System health: ${data.healthOverall}`}
          />
        )}
      </div>

      {/* Label */}
      <p className="mt-2 md:mt-4 text-[0.65rem] md:text-lg uppercase tracking-[0.28em] text-primal-muted">
        {data.label}
      </p>

      {/* Subtitle — pipeline position + momentum in one line */}
      <p
        className="mt-1 md:mt-2 text-xs md:text-[1.3125rem] text-primal-gray-mid flex items-center justify-center gap-1 md:gap-2 flex-wrap"
        title={trend.detail ? `${trend.label} · ${trend.detail}` : trend.label}
      >
        <span>
          {data.certifiedCount} of {data.workflowCount} workflows
        </span>
        {cohort && (
          <>
            <span className="text-primal-muted">·</span>
            <span className="text-primal-muted">
              {cohort.count} {COHORT_LABELS[cohort.state]}
            </span>
          </>
        )}
        <span className="text-primal-muted">·</span>
        <span
          className={`${trend.className} text-xs md:text-lg`}
          aria-label={`Momentum: ${trend.label}`}
        >
          {trend.char}
        </span>
      </p>
    </div>
  );
}
