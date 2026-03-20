import { useCockpit } from '@/hooks/useCockpit';
import SystemHealthBar from './SystemHealthBar';
import DecisionQueue from './DecisionQueue';
import SignalFeed from './SignalFeed';
import BoardSnapshot from './BoardSnapshot';
import { Gauge, RefreshCw } from 'lucide-react';

export default function CockpitView() {
  const { data, isLoading, isError, refetch, isFetching } = useCockpit();

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-16 bg-primal-rule-light/50 rounded-lg" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-64 bg-primal-rule-light/50 rounded-lg" />
            <div className="h-64 bg-primal-rule-light/50 rounded-lg" />
          </div>
          <div className="h-16 bg-primal-rule-light/50 rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center">
          <Gauge className="h-12 w-12 text-primal-muted mx-auto mb-3" />
          <p className="text-primal-gray-mid text-sm">Unable to load cockpit data</p>
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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primal-gray-light flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primal-gold" />
            Cockpit
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-primal-muted">
              {new Date(data.generatedAt).toLocaleTimeString()}
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

        {/* System health banner */}
        <SystemHealthBar health={data.systemHealth} />

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: Decision Queue (40%) */}
          <div className="lg:col-span-2">
            <DecisionQueue decisions={data.decisionsNeeded} />
          </div>

          {/* Right: Signal Feed (60%) */}
          <div className="lg:col-span-3">
            <SignalFeed signals={data.signalFeed} />
          </div>
        </div>

        {/* Board snapshot */}
        <BoardSnapshot snapshot={data.boardSnapshot} />
      </div>
    </div>
  );
}
