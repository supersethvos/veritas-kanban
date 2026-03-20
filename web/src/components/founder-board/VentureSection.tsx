import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WorkflowState } from '@veritas-kanban/shared';
import type { VentureCoverageEntry } from '@/hooks/useFounderBoard';

// ── Venture display names (canon: stable codes own paths, display names live here) ──

const VENTURE_DISPLAY_NAMES: Record<string, string> = {
  'nxt-holdco-ops': 'NXTCOMM Ventures',
  'nxt-klaviyo-retention': 'YEP',
  'nxt-lod-logistics': 'LōD',
  'lab-vos-system': 'Primal',
  'eng-dev-factory': 'Primal', // MAYA's build lane rolls into Primal
};

/** Ventures that should not appear in the founder view */
const HIDDEN_VENTURES = new Set(['unassigned-venture']);

/** Ventures that should be merged (key = source, value = target) */
const MERGE_VENTURES: Record<string, string> = {
  'eng-dev-factory': 'lab-vos-system', // dev factory rolls into Primal
};

function getVentureDisplayName(ventureId: string): string {
  return VENTURE_DISPLAY_NAMES[ventureId] ?? ventureId;
}

// ── State bar config ─────────────────────────────────────────────

const STATE_ORDER: WorkflowState[] = [
  'human_native',
  'assisted',
  'governed_copilot',
  'certifying',
  'certified_autonomous',
  'under_review',
];

const STATE_COLORS: Record<WorkflowState, string> = {
  human_native: 'bg-zinc-700',
  assisted: 'bg-zinc-500',
  governed_copilot: 'bg-amber-700/50',
  certifying: 'bg-amber-400/60',
  certified_autonomous: 'bg-emerald-400',
  under_review: 'bg-red-400/50',
};

const STATE_LABELS: Record<WorkflowState, string> = {
  human_native: 'human native',
  assisted: 'assisted',
  governed_copilot: 'governed copilot',
  certifying: 'certifying',
  certified_autonomous: 'certified',
  under_review: 'under review',
};

// ── StateBar component ───────────────────────────────────────────

function StateBar({
  distribution,
  total,
}: {
  distribution: Record<WorkflowState, number>;
  total: number;
}) {
  if (total === 0) {
    return <div className="h-2 rounded-full bg-zinc-800" />;
  }

  return (
    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden flex">
      {STATE_ORDER.map((state) => {
        const count = distribution[state] ?? 0;
        if (count === 0) return null;

        const pct = Math.round((count / total) * 100);
        const widthPct = Math.max((count / total) * 100, 1.5); // min visible width

        return (
          <div
            key={state}
            className={`h-full ${STATE_COLORS[state]} transition-all duration-300`}
            style={{ width: `${widthPct}%` }}
            title={`${STATE_LABELS[state]} ${pct}% (${count})`}
          />
        );
      })}
    </div>
  );
}

// ── Expanded detail grid ─────────────────────────────────────────

function VentureDetail({ entry }: { entry: VentureCoverageEntry }) {
  const pressureParts: string[] = [];
  if (entry.blockedCount > 0) pressureParts.push(`${entry.blockedCount} blocked`);
  if (entry.awaitingDecisionCount > 0)
    pressureParts.push(`${entry.awaitingDecisionCount} decision`);

  return (
    <div className="px-4 pb-3 pt-1">
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
        {STATE_ORDER.map((state) => {
          const count = entry.stateDistribution[state] ?? 0;
          const pct = entry.workflowCount > 0 ? Math.round((count / entry.workflowCount) * 100) : 0;
          return (
            <div key={state} className="flex items-center justify-between">
              <span className="text-primal-muted">{STATE_LABELS[state]}</span>
              <span className="text-primal-gray-mid tabular-nums">
                {count}
                <span className="text-primal-muted ml-1">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-primal-muted">
        <span>
          critical path: {Math.round(entry.criticalPathRate * 100)}% of {entry.criticalPathCount}
        </span>
        {pressureParts.length > 0 && <span>pressure: {pressureParts.join(' · ')}</span>}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

interface Props {
  coverage: VentureCoverageEntry[];
}

export default function VentureSection({ coverage }: Props) {
  const [expandedVenture, setExpandedVenture] = useState<string | null>(null);

  // Filter hidden ventures, merge duplicates, apply display names
  const mergedMap = new Map<string, VentureCoverageEntry>();
  for (const entry of coverage) {
    if (HIDDEN_VENTURES.has(entry.ventureId)) continue;

    const targetId = MERGE_VENTURES[entry.ventureId] ?? entry.ventureId;
    const existing = mergedMap.get(targetId);

    if (existing) {
      // Merge into existing entry
      existing.workflowCount += entry.workflowCount;
      existing.criticalPathCount += entry.criticalPathCount;
      existing.blockedCount += entry.blockedCount;
      existing.awaitingDecisionCount += entry.awaitingDecisionCount;
      for (const state of Object.keys(entry.stateDistribution) as Array<
        keyof typeof entry.stateDistribution
      >) {
        existing.stateDistribution[state] =
          (existing.stateDistribution[state] ?? 0) + (entry.stateDistribution[state] ?? 0);
      }
      // Recompute rates
      existing.certifiedRate =
        existing.workflowCount > 0
          ? (existing.stateDistribution.certified_autonomous ?? 0) / existing.workflowCount
          : 0;
      existing.criticalPathRate =
        existing.criticalPathCount > 0
          ? (existing.stateDistribution.certified_autonomous ?? 0) / existing.criticalPathCount
          : 0;
    } else {
      mergedMap.set(targetId, { ...entry, ventureId: targetId });
    }
  }

  const displayCoverage = Array.from(mergedMap.values());

  if (displayCoverage.length === 0) return null;

  return (
    <section className="rounded-2xl border border-primal-rule-light/70 bg-primal-bg/25">
      <div className="px-4 py-3">
        <span className="text-sm font-semibold text-primal-gray-light">
          Ventures
          <span className="ml-2 text-xs text-primal-muted font-normal">
            {displayCoverage.length}
          </span>
        </span>
      </div>

      <div className="px-4 pb-3 space-y-1">
        {displayCoverage.map((entry) => {
          const isExpanded = expandedVenture === entry.ventureId;

          return (
            <div key={entry.ventureId}>
              {/* Venture row */}
              <button
                onClick={() => setExpandedVenture(isExpanded ? null : entry.ventureId)}
                className="w-full grid grid-cols-[1fr_minmax(80px,140px)_auto_auto_16px] items-center gap-3 py-2 border-t border-primal-rule-light/30 first:border-t-0 cursor-pointer text-left"
              >
                <span className="text-sm text-primal-gray-mid truncate">
                  {getVentureDisplayName(entry.ventureId)}
                </span>
                <StateBar distribution={entry.stateDistribution} total={entry.workflowCount} />
                <span className="text-sm font-medium text-primal-gold tabular-nums w-10 text-right">
                  {Math.round(entry.certifiedRate * 100)}%
                </span>
                <span className="text-xs text-primal-muted tabular-nums w-8 text-right">
                  {entry.workflowCount}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-primal-muted transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Expandable detail — CSS grid height animation */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  {isExpanded && <VentureDetail entry={entry} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
