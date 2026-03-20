import type {
  WorkflowEvidenceBundle,
  CompletionTruthOverlay,
  CompletionTruthSurface,
} from '@veritas-kanban/shared';
import type { ClaimTone } from './claim';

function rateTone(rate: number, good: number, warn: number): ClaimTone {
  if (rate >= good) return 'verified';
  if (rate >= warn) return 'pending';
  return 'at_risk';
}

const toneClass: Record<ClaimTone, string> = {
  verified: 'text-emerald-300',
  at_risk: 'text-amber-300',
  pending: 'text-primal-gray-light',
};

const dotClass: Record<ClaimTone, string> = {
  verified: 'bg-emerald-400',
  at_risk: 'bg-amber-400',
  pending: 'bg-primal-rule-light',
};

function TruthStatement({ label, tone }: { label: string; tone: ClaimTone }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass[tone]}`} />
      <span className={`text-xs ${toneClass[tone]}`}>{label}</span>
    </div>
  );
}

const SURFACE_LABELS: Record<CompletionTruthSurface, string> = {
  artifact: 'Artifact',
  board: 'Board',
  channel: 'Channel',
  evidence: 'Evidence',
};

const surfaceToneClass: Record<string, string> = {
  verified: 'border-emerald-400/30 text-emerald-300',
  at_risk: 'border-amber-300/30 text-amber-300',
  pending: 'border-primal-rule-light/50 text-primal-muted',
};

interface Props {
  evidence: WorkflowEvidenceBundle;
  completionTruth: CompletionTruthOverlay;
}

export default function EvidenceSummary({ evidence, completionTruth }: Props) {
  const totalRuns = evidence.run_count;
  const successRuns = evidence.successful_run_count;
  const successRate = totalRuns > 0 ? successRuns / totalRuns : 0;

  const policyTotal = evidence.policy_pass_count + evidence.policy_fail_count;
  const policyRate = policyTotal > 0 ? evidence.policy_pass_count / policyTotal : 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">Evidence</p>

      {/* Interpreted statements */}
      <div className="space-y-1.5">
        {totalRuns > 0 && (
          <TruthStatement
            label={`${successRuns} of ${totalRuns} runs succeeded`}
            tone={rateTone(successRate, 0.9, 0.7)}
          />
        )}

        {policyTotal > 0 && (
          <TruthStatement
            label={`Policy: ${Math.round(policyRate * 100)}% compliant (${evidence.policy_pass_count} pass, ${evidence.policy_fail_count} fail)`}
            tone={rateTone(policyRate, 0.95, 0.8)}
          />
        )}

        {evidence.quality_score != null && (
          <TruthStatement
            label={`Quality score: ${evidence.quality_score.toFixed(2)}`}
            tone={rateTone(evidence.quality_score, 0.8, 0.6)}
          />
        )}

        {(evidence.avg_cost != null || evidence.avg_duration_ms != null) && (
          <TruthStatement
            label={[
              evidence.avg_cost != null ? `Avg $${evidence.avg_cost.toFixed(2)}` : null,
              evidence.avg_duration_ms != null
                ? `${(evidence.avg_duration_ms / 1000).toFixed(1)}s`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            tone="pending"
          />
        )}

        {evidence.linked_artifacts && evidence.linked_artifacts.length > 0 && (
          <TruthStatement
            label={`${evidence.linked_artifacts.length} linked artifact${evidence.linked_artifacts.length === 1 ? '' : 's'}`}
            tone="pending"
          />
        )}
      </div>

      {/* Completion truth per surface */}
      <div className="grid grid-cols-2 gap-2">
        {(['artifact', 'board', 'channel', 'evidence'] as const).map((surface) => {
          const s = completionTruth[surface];
          return (
            <div
              key={surface}
              className={`rounded-lg border px-2.5 py-1.5 ${surfaceToneClass[s.state] ?? surfaceToneClass.pending}`}
            >
              <p className="text-[10px] font-medium">{SURFACE_LABELS[surface]}</p>
              <p className="text-[10px] text-primal-muted mt-0.5 line-clamp-1">
                {s.summary || '—'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
