/**
 * Ghost-Time Metrics Service
 *
 * Computes control-plane trust-tax metrics from telemetry events
 * and task/registry state. Phase 2 of the control-plane truth
 * remediation stack.
 *
 * Metrics tracked:
 * - ghost_busy_minutes: time agents appeared busy after task completion
 * - closure_lag_minutes: time between task done and registry pointer clear
 * - stale_tail_minutes: time between last artifact evidence and board normalization
 * - normalization_count: number of auto-normalizations triggered
 */

import type { AnyTelemetryEvent, ControlPlaneNormalizationEvent } from '@veritas-kanban/shared';
import { getTelemetryService } from './telemetry-service.js';

export interface GhostTimeMetrics {
  /** Total ghost busy minutes across all normalization events in window */
  total_ghost_busy_minutes: number;
  /** Total closure lag minutes across all normalization events in window */
  total_closure_lag_minutes: number;
  /** Number of normalization events in window */
  normalization_count: number;
  /** Breakdown by trigger type */
  by_trigger: {
    atomic_completion: number;
    stale_autoclear: number;
    manual: number;
  };
  /** Breakdown by agent */
  by_agent: Record<
    string,
    {
      ghost_busy_minutes: number;
      closure_lag_minutes: number;
      normalization_count: number;
    }
  >;
  /** Worst single ghost-busy incident in minutes */
  worst_ghost_busy_minutes: number;
  /** Average closure lag in minutes */
  avg_closure_lag_minutes: number;
  /** Window start (ISO) */
  window_start: string;
  /** Window end (ISO) */
  window_end: string;
}

function isNormalizationEvent(event: AnyTelemetryEvent): event is ControlPlaneNormalizationEvent {
  return event.type === 'control_plane.normalization';
}

export async function computeGhostTimeMetrics(
  windowStart: string,
  windowEnd?: string
): Promise<GhostTimeMetrics> {
  const telemetry = getTelemetryService();
  const end = windowEnd ?? new Date().toISOString();

  const events = await telemetry.getEvents({
    type: 'control_plane.normalization',
    since: windowStart,
    until: end,
  });

  const normEvents = events.filter(isNormalizationEvent);

  const byAgent: Record<
    string,
    {
      ghost_busy_minutes: number;
      closure_lag_minutes: number;
      normalization_count: number;
    }
  > = {};

  const byTrigger = { atomic_completion: 0, stale_autoclear: 0, manual: 0 };
  let totalGhostBusy = 0;
  let totalClosureLag = 0;
  let worstGhostBusy = 0;

  for (const event of normEvents) {
    totalGhostBusy += event.ghostBusyMinutes;
    totalClosureLag += event.closureLagMinutes;
    worstGhostBusy = Math.max(worstGhostBusy, event.ghostBusyMinutes);

    if (event.trigger in byTrigger) {
      byTrigger[event.trigger as keyof typeof byTrigger] += 1;
    }

    if (!byAgent[event.agent]) {
      byAgent[event.agent] = {
        ghost_busy_minutes: 0,
        closure_lag_minutes: 0,
        normalization_count: 0,
      };
    }
    byAgent[event.agent].ghost_busy_minutes += event.ghostBusyMinutes;
    byAgent[event.agent].closure_lag_minutes += event.closureLagMinutes;
    byAgent[event.agent].normalization_count += 1;
  }

  return {
    total_ghost_busy_minutes: Math.round(totalGhostBusy * 100) / 100,
    total_closure_lag_minutes: Math.round(totalClosureLag * 100) / 100,
    normalization_count: normEvents.length,
    by_trigger: byTrigger,
    by_agent: byAgent,
    worst_ghost_busy_minutes: Math.round(worstGhostBusy * 100) / 100,
    avg_closure_lag_minutes:
      normEvents.length > 0 ? Math.round((totalClosureLag / normEvents.length) * 100) / 100 : 0,
    window_start: windowStart,
    window_end: end,
  };
}
