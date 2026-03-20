import { useState } from 'react';
import { Radio, Filter, Heart, CheckCircle2, ShieldAlert, Zap, Send, Inbox } from 'lucide-react';
import { useView } from '@/contexts/ViewContext';
import type { CockpitSignal } from '@/hooks/useCockpit';

interface Props {
  signals: CockpitSignal[];
}

const severityColors: Record<string, string> = {
  critical: 'text-primal-red bg-primal-red/10',
  action_required: 'text-amber-400 bg-amber-500/10',
  attention: 'text-primal-gold bg-primal-gold/10',
  info: 'text-primal-gray-mid bg-primal-gray-mid/10',
};

const typeIcons: Record<string, typeof Heart> = {
  'signal.health': Heart,
  'signal.completion': CheckCircle2,
  'signal.dispatch_blocked': ShieldAlert,
  'signal.generic': Zap,
  'signal.directive_receipt': Inbox,
};

function formatTime(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function SignalRow({ signal }: { signal: CockpitSignal }) {
  const { navigateToTask } = useView();
  const isFounderAction = signal.agent === 'cockpit';
  const isReceipt = signal.type === 'signal.directive_receipt';
  const Icon = isFounderAction ? Send : typeIcons[signal.type] || Zap;
  const sevClass = isFounderAction
    ? 'text-primal-gold bg-primal-gold/10'
    : isReceipt
      ? 'text-emerald-400 bg-emerald-500/10'
      : severityColors[signal.severity] || severityColors.info;

  const handleClick = () => {
    if (signal.taskId) {
      navigateToTask(signal.taskId);
    }
  };

  return (
    <div
      className={`flex items-start gap-2.5 py-2 px-2 rounded-md hover:bg-primal-rule-light/50 transition-colors ${signal.taskId ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
    >
      <div className={`rounded p-1 mt-0.5 ${sevClass}`}>
        <Icon className="h-3 w-3" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-medium truncate ${isFounderAction ? 'text-primal-gold' : 'text-primal-gray-light/80'}`}
          >
            {isFounderAction ? 'You' : isReceipt ? `↩ ${signal.agent}` : signal.agent}
          </span>
          {signal.healthClass && (
            <span
              className={`text-[10px] px-1 rounded ${
                signal.healthClass === 'GREEN'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : signal.healthClass === 'YELLOW'
                    ? 'bg-amber-500/20 text-amber-300'
                    : signal.healthClass === 'RED'
                      ? 'bg-primal-red/20 text-primal-red/70'
                      : 'bg-primal-gray-mid/20 text-primal-gray-mid'
              }`}
            >
              {signal.healthClass}
            </span>
          )}
          {signal.classification && (
            <span
              className={`text-[10px] px-1 rounded ${
                signal.classification === 'PASS'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : signal.classification === 'AT_RISK'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-primal-red/20 text-primal-red/70'
              }`}
            >
              {signal.classification}
            </span>
          )}
        </div>
        <p className="text-xs text-primal-gray-mid mt-0.5 line-clamp-1">{signal.summary}</p>
      </div>

      <span className="text-[10px] text-primal-muted whitespace-nowrap mt-1">
        {formatTime(signal.timestamp)}
      </span>
    </div>
  );
}

type SeverityFilter = 'all' | 'critical' | 'action_required' | 'attention' | 'info';

export default function SignalFeed({ signals }: Props) {
  const [filter, setFilter] = useState<SeverityFilter>('all');

  const filtered = filter === 'all' ? signals : signals.filter((s) => s.severity === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-primal-gray-light/80 flex items-center gap-2">
          <Radio className="h-4 w-4 text-primal-gold" />
          Signal Feed
          <span className="text-xs font-normal text-primal-gray-mid">{signals.length} signals</span>
        </h3>

        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-primal-muted" />
          {(['all', 'critical', 'action_required', 'attention'] as SeverityFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                filter === f
                  ? 'bg-primal-rule text-primal-gray-light'
                  : 'text-primal-gray-mid hover:text-primal-gray-mid'
              }`}
            >
              {f === 'all'
                ? 'All'
                : f === 'action_required'
                  ? 'Action'
                  : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-primal-muted text-xs">
          {filter === 'all' ? 'No signals yet' : `No ${filter} signals`}
        </div>
      ) : (
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto divide-y divide-primal-rule-light/50">
          {filtered.map((signal, i) => (
            <SignalRow key={`${signal.timestamp}-${i}`} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
