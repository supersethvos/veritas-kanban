import { RefreshCw, ShieldCheck } from 'lucide-react';
import { hasFounderInterruptions, useFounderSurfaceReviewSurface } from '@/hooks/useFounderSurface';
import AutonomyNumber from './AutonomyNumber';
import AttentionQueue from './AttentionQueue';
import VentureStrip from './VentureStrip';
import SummaryStrip from './SummaryStrip';
import ControlPlaneCard from './ControlPlaneCard';
import NewlyCompleteList from './NewlyCompleteList';
import TrustMotionSection from './TrustMotionSection';

function QuietState({
  workflowCount,
  completionCount,
}: {
  workflowCount: number;
  completionCount: number;
}) {
  if (workflowCount === 0) {
    return <p className="text-center text-sm text-primal-muted">No workflows registered yet.</p>;
  }

  return (
    <div className="space-y-1 text-center text-sm text-primal-muted">
      <p>Everything certified is running clean.</p>
      <p>Quiet founder mode is intact.</p>
      <p>
        {completionCount > 0
          ? `${completionCount} fresh completion${completionCount === 1 ? '' : 's'} below.`
          : 'No decisions needed.'}
      </p>
    </div>
  );
}

export default function FounderSurfaceView() {
  const { data, isLoading, isError, isFetching, refetch } = useFounderSurfaceReviewSurface();

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 md:px-6">
          <div className="animate-pulse space-y-6">
            <div className="flex justify-end gap-2">
              <div className="h-3 w-20 rounded bg-primal-rule-light/50" />
              <div className="h-6 w-6 rounded bg-primal-rule-light/50" />
            </div>
            <div className="space-y-3 text-center">
              <div className="mx-auto h-24 w-56 rounded bg-primal-rule-light/50" />
              <div className="mx-auto h-4 w-48 rounded bg-primal-rule-light/50" />
              <div className="mx-auto h-3 w-32 rounded bg-primal-rule-light/50" />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-16 rounded bg-primal-rule-light/50" />
              ))}
            </div>
            <div className="space-y-2">
              <div className="h-10 rounded bg-primal-rule-light/50" />
              <div className="h-10 rounded bg-primal-rule-light/50" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="h-12 w-12 text-primal-muted mx-auto mb-3" />
          <p className="text-primal-gray-mid text-sm">Unable to load founder autonomy</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-xs text-primal-gold hover:text-primal-gold/70"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const overview = data.overview;
  const showAttention = hasFounderInterruptions(overview);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-8 md:px-6">
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-primal-gray-light/80 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primal-gold" />
              Founder attention surface
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-primal-muted">
                {new Date(data.updated_at).toLocaleTimeString()}
              </span>
              <button
                onClick={() => refetch()}
                className="p-1 rounded hover:bg-primal-rule-light transition-colors"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-primal-gray-mid ${isFetching ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          <AutonomyNumber overview={overview} />

          <SummaryStrip
            activeInitiatives={overview.summary_strip.active_initiative_count}
            activeAgents={overview.summary_strip.active_agent_count}
            atRisk={overview.summary_strip.at_risk_count}
            blocked={overview.attention_summary.blocked_count}
            overdue={overview.attention_summary.overdue_count}
            awaitingDecision={overview.attention_summary.awaiting_decision_count}
            newlyComplete={overview.attention_summary.newly_complete_count}
          />

          <VentureStrip rates={overview.venture_rates} />

          <ControlPlaneCard
            compatibility={data.compatibility}
            controlPlane={data.control_plane}
            operatorLeverage={data.operator_leverage}
          />

          {showAttention ? (
            <AttentionQueue items={overview.attention_items} />
          ) : (
            <QuietState
              workflowCount={overview.primary_number.workflow_count}
              completionCount={overview.newly_complete_items.length}
            />
          )}

          <NewlyCompleteList items={overview.newly_complete_items} />

          <TrustMotionSection
            gains={overview.trust_gains}
            degradations={overview.trust_degradations}
          />
        </div>
      </div>
    </div>
  );
}
