interface Props {
  percentage: number;
  healthOverall: 'GREEN' | 'YELLOW' | 'RED';
  visible: boolean;
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export default function StickyHeader({ percentage, healthOverall, visible }: Props) {
  const healthDot =
    healthOverall === 'RED' ? 'bg-primal-red' : healthOverall === 'YELLOW' ? 'bg-amber-400' : null;

  return (
    <div
      className={`fixed top-14 inset-x-0 z-40 h-12 flex items-center justify-center gap-3 bg-primal-bg/80 backdrop-blur-sm border-b border-primal-rule-light/30 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <span className="text-sm font-semibold text-primal-gold animate-glow">
        {formatPercentage(percentage)}%
      </span>
      <span className="text-xs text-primal-muted">Certified Autonomy</span>
      {healthDot && <span className={`h-2 w-2 rounded-full ${healthDot}`} />}
    </div>
  );
}
