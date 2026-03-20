import type { FounderSurfaceReviewSurface } from '@/hooks/useFounderSurface';

/**
 * System Health Card — Founder Board
 *
 * Contract (per SETH 2026-03-19):
 * - Founder question: "Is the system healthy enough to trust right now?"
 * - Shows: posture (Healthy/Attention/Degraded), last checked, reason (only when not healthy)
 * - Forbids: raw connectivity/transport/registry stats — those belong in cockpit
 * - Rule: connectivity metrics are evidence for health, not the health UI itself
 */

type HealthPosture = 'Healthy' | 'Attention' | 'Degraded';

function derivePosture(
  overall: FounderSurfaceReviewSurface['control_plane']['overall'],
  degradedCount: number
): HealthPosture {
  if (overall === 'GREEN' && degradedCount === 0) return 'Healthy';
  if (overall === 'RED' || degradedCount > 0) return 'Degraded';
  return 'Attention';
}

function postureTone(posture: HealthPosture) {
  if (posture === 'Healthy') return 'text-emerald-200 border-emerald-400/30 bg-emerald-400/10';
  if (posture === 'Attention') return 'text-amber-200 border-amber-300/30 bg-amber-300/10';
  return 'text-primal-red border-primal-red/30 bg-primal-red/10';
}

function deriveReason(
  posture: HealthPosture,
  sweep: FounderSurfaceReviewSurface['control_plane']['latest_sweep'],
  degradedCount: number
): string | null {
  if (posture === 'Healthy') return null;
  if (degradedCount > 0) {
    return `${degradedCount} agent${degradedCount !== 1 ? 's' : ''} expected to be working but not responding.`;
  }
  if (sweep?.summary) return sweep.summary;
  return 'System check found issues that may affect reliability.';
}

function formatAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const IMPROVEMENT_LABELS: Record<string, string> = {
  truth_quality: 'Accuracy',
  routing_quality: 'Routing',
  policy_quality: 'Governance',
  coordination_leverage: 'Coordination',
};

const IMPROVEMENT_COLORS: Record<string, string> = {
  truth_quality: 'bg-emerald-400',
  routing_quality: 'bg-sky-400',
  policy_quality: 'bg-amber-400',
  coordination_leverage: 'bg-violet-400',
};

function ImprovementBar({ byClass, total }: { byClass: Record<string, number>; total: number }) {
  if (total === 0) return null;
  const entries = Object.entries(byClass)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-primal-bg/40">
      {entries.map(([cls, count]) => (
        <div
          key={cls}
          className={`${IMPROVEMENT_COLORS[cls] ?? 'bg-zinc-400'} transition-all`}
          style={{ width: `${(count / total) * 100}%` }}
          title={`${IMPROVEMENT_LABELS[cls] ?? cls}: ${count}`}
        />
      ))}
    </div>
  );
}

export default function ControlPlaneCard({
  compatibility: _compatibility,
  controlPlane,
  operatorLeverage,
}: {
  compatibility: FounderSurfaceReviewSurface['compatibility'];
  controlPlane: FounderSurfaceReviewSurface['control_plane'];
  operatorLeverage?: FounderSurfaceReviewSurface['operator_leverage'];
}) {
  const posture = derivePosture(controlPlane.overall, controlPlane.degraded_agent_count);
  const reason = deriveReason(
    posture,
    controlPlane.latest_sweep,
    controlPlane.degraded_agent_count
  );
  const lastChecked = controlPlane.latest_sweep?.timestamp;

  return (
    <section className="rounded-2xl border border-primal-rule-light/70 bg-primal-bg/25 px-4 py-4">
      {/* Posture + badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-primal-gray-light">System health</p>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.18em] ${postureTone(posture)}`}
          >
            {posture}
          </span>
        </div>
        {lastChecked && (
          <p className="text-[11px] text-primal-muted">Checked {formatAge(lastChecked)}</p>
        )}
      </div>

      {/* Reason — only when not healthy */}
      {reason && <p className="mt-2 text-xs text-primal-gray-mid">{reason}</p>}

      {/* Verified improvements bar */}
      {operatorLeverage && operatorLeverage.total_receipts > 0 && (
        <div className="mt-4 border-t border-primal-rule-light/40 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primal-muted">
              Verified improvements
            </p>
            <p className="text-xs text-primal-gray-mid">
              {operatorLeverage.credited_receipt_count} this period
            </p>
          </div>

          <div className="mt-2">
            <ImprovementBar
              byClass={operatorLeverage.by_leverage_class}
              total={operatorLeverage.credited_receipt_count}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-3">
            {Object.entries(operatorLeverage.by_leverage_class)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([cls, count]) => (
                <span
                  key={cls}
                  className="flex items-center gap-1.5 text-[11px] text-primal-gray-mid"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${IMPROVEMENT_COLORS[cls] ?? 'bg-zinc-400'}`}
                  />
                  {IMPROVEMENT_LABELS[cls] ?? cls} · {count}
                </span>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
