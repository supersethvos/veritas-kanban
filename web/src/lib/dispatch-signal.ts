/**
 * Shared signal dispatch utility.
 *
 * Extracted from cockpit DecisionQueue so both the cockpit and founder-board
 * action surfaces use the same dispatch path.
 */
import { apiFetch, API_BASE } from './api/helpers';

export type DispatchAction =
  | 'approve'
  | 'reject'
  | 'nudge'
  | 'escalate'
  | 'reassign'
  | 'acknowledge';

export interface DispatchPayload {
  targetAgent: string;
  action: DispatchAction;
  taskId?: string;
  workflowId?: string;
  message?: string;
}

export interface DispatchResult {
  dispatched: boolean;
  taskUpdated: boolean;
  taskError?: string;
  bridgeAccepted: boolean;
  bridgeStatus: string;
  action: string;
  targetAgent: string;
}

export const ACTION_LABELS: Record<DispatchAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  nudge: 'Nudged',
  escalate: 'Escalated',
  reassign: 'Reassigned',
  acknowledge: 'Acknowledged',
};

export async function dispatchSignal(payload: DispatchPayload): Promise<DispatchResult> {
  return apiFetch(`${API_BASE}/signals/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
