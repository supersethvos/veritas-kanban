export interface SummaryStripProps {
  activeInitiatives: number;
  activeAgents: number;
  atRisk: number;
  blocked: number;
  overdue: number;
  awaitingDecision: number;
  newlyComplete: number;
}

export default function SummaryStrip({
  activeInitiatives,
  activeAgents,
  atRisk,
  blocked,
  overdue,
  awaitingDecision,
  newlyComplete,
}: SummaryStripProps) {
  const items = [
    { label: 'Active', value: activeInitiatives },
    { label: 'Agents', value: activeAgents },
    { label: 'At risk', value: atRisk },
    { label: 'Waiting on dependency', value: blocked },
    { label: 'Needs founder checkpoint', value: overdue },
    { label: 'Founder decision', value: awaitingDecision },
    { label: 'Newly complete', value: newlyComplete },
  ];

  return (
    <section
      aria-label="Founder summary strip"
      className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-primal-rule-light/70 bg-primal-bg/30 px-3 py-3"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">{item.label}</p>
          <p className="mt-2 text-xl font-semibold text-primal-gray-light">{item.value}</p>
        </div>
      ))}
    </section>
  );
}
