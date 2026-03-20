import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WorkflowState } from '@veritas-kanban/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/api/helpers';

// ── State bar (shared visual with VentureSection) ───────────────

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

interface DomainEntry {
  domain: string;
  workflow_count: number;
  state_distribution: Record<string, number>;
  certified_rate: number;
}

interface DomainsResponse {
  domains: DomainEntry[];
  total_domains: number;
  updated_at: string;
}

function StateBar({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  if (total === 0) return <div className="h-2 rounded-full bg-zinc-800" />;

  return (
    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden flex">
      {STATE_ORDER.map((state) => {
        const count = distribution[state] ?? 0;
        if (count === 0) return null;
        const widthPct = Math.max((count / total) * 100, 1.5);
        const pct = Math.round((count / total) * 100);

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

function DomainDetail({ entry }: { entry: DomainEntry }) {
  return (
    <div className="px-4 pb-3 pt-1">
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
        {STATE_ORDER.map((state) => {
          const count = entry.state_distribution[state] ?? 0;
          const pct =
            entry.workflow_count > 0 ? Math.round((count / entry.workflow_count) * 100) : 0;
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
    </div>
  );
}

async function fetchDomains(): Promise<DomainsResponse> {
  return apiFetch<DomainsResponse>(`${API_BASE}/v1/founder-surface/domains`);
}

export default function DomainSection() {
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['founder-surface', 'domains'],
    queryFn: fetchDomains,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!data || data.domains.length === 0) return null;

  return (
    <section className="rounded-2xl border border-primal-rule-light/70 bg-primal-bg/25">
      <div className="px-4 py-3">
        <span className="text-sm font-semibold text-primal-gray-light">
          Domains
          <span className="ml-2 text-xs text-primal-muted font-normal">{data.domains.length}</span>
        </span>
      </div>

      <div className="px-4 pb-3 space-y-1">
        {data.domains.map((entry) => {
          const isExpanded = expandedDomain === entry.domain;

          return (
            <div key={entry.domain}>
              <button
                onClick={() => setExpandedDomain(isExpanded ? null : entry.domain)}
                className="w-full grid grid-cols-[1fr_minmax(80px,140px)_auto_auto_16px] items-center gap-3 py-2 border-t border-primal-rule-light/30 first:border-t-0 cursor-pointer text-left"
              >
                <span className="text-sm text-primal-gray-mid truncate">{entry.domain}</span>
                <StateBar distribution={entry.state_distribution} total={entry.workflow_count} />
                <span className="text-sm font-medium text-primal-gold tabular-nums w-10 text-right">
                  {Math.round(entry.certified_rate * 100)}%
                </span>
                <span className="text-xs text-primal-muted tabular-nums w-8 text-right">
                  {entry.workflow_count}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-primal-muted transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  {isExpanded && <DomainDetail entry={entry} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
