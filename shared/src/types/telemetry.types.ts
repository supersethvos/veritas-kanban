// Telemetry Types

import type { TaskStatus, AgentType } from './task.types.js';

export type TelemetryEventType =
  | 'task.created'
  | 'task.status_changed'
  | 'task.archived'
  | 'task.restored'
  | 'run.started'
  | 'run.completed'
  | 'run.error'
  | 'run.tokens'
  | 'signal.health'
  | 'signal.completion'
  | 'signal.dispatch_blocked'
  | 'signal.generic'
  | 'signal.directive_receipt'
  | 'control_plane.normalization';

/** Base telemetry event - all events extend this */
export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestamp: string;
  taskId?: string;
  project?: string;
}

/** Task lifecycle events */
export interface TaskTelemetryEvent extends TelemetryEvent {
  type: 'task.created' | 'task.status_changed' | 'task.archived' | 'task.restored';
  taskId: string;
  status?: TaskStatus;
  previousStatus?: TaskStatus;
}

/** Agent run started event */
export interface RunStartedEvent extends TelemetryEvent {
  type: 'run.started';
  taskId: string;
  agent: string;
  model?: string;
  sessionKey?: string;
  attemptId?: string;
}

/** Agent run completed event */
export interface RunCompletedEvent extends TelemetryEvent {
  type: 'run.completed';
  taskId: string;
  agent: string;
  success: boolean;
  durationMs?: number;
  error?: string;
  exitCode?: number;
  attemptId?: string;
}

/** Agent run error event */
export interface RunErrorEvent extends TelemetryEvent {
  type: 'run.error';
  taskId: string;
  agent: string;
  error: string;
  stackTrace?: string;
  attemptId?: string;
}

/** Legacy combined run event (for backward compatibility) */
export interface RunTelemetryEvent extends TelemetryEvent {
  type: 'run.started' | 'run.completed' | 'run.error';
  taskId: string;
  attemptId?: string;
  agent: string;
  durationMs?: number;
  exitCode?: number;
  success?: boolean;
  error?: string;
  model?: string;
  sessionKey?: string;
  stackTrace?: string;
}

/** Token usage events */
export interface TokenTelemetryEvent extends TelemetryEvent {
  type: 'run.tokens';
  taskId: string;
  agent: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;
  totalTokens?: number;
  cost?: number;
  model?: string;
  attemptId?: string;
}

/** VOS signal: health sweep result */
export interface SignalHealthEvent extends TelemetryEvent {
  type: 'signal.health';
  agent: string;
  severity: string;
  summary: string;
  healthClass: string;
  venture?: string;
  payload?: Record<string, unknown>;
}

/** VOS signal: completion verification result */
export interface SignalCompletionEvent extends TelemetryEvent {
  type: 'signal.completion';
  agent: string;
  severity: string;
  summary: string;
  classification: string;
  missingSurfaces?: string[];
  venture?: string;
  payload?: Record<string, unknown>;
}

/** VOS signal: dispatch quality gate block */
export interface SignalDispatchBlockedEvent extends TelemetryEvent {
  type: 'signal.dispatch_blocked';
  agent: string;
  severity: string;
  summary: string;
  antiPatterns?: string[];
  venture?: string;
  payload?: Record<string, unknown>;
}

/** VOS signal: generic catch-all for unmapped event types */
export interface SignalGenericEvent extends TelemetryEvent {
  type: 'signal.generic';
  agent: string;
  severity: string;
  summary: string;
  vosEventType: string;
  venture?: string;
  payload?: Record<string, unknown>;
}

/** Control-plane normalization event — emitted when ghost state is cleared */
export interface ControlPlaneNormalizationEvent extends TelemetryEvent {
  type: 'control_plane.normalization';
  /** Agent whose pointer was normalized */
  agent: string;
  /** Task that was pointed to */
  taskId: string;
  /** How the normalization happened */
  trigger: 'atomic_completion' | 'stale_autoclear' | 'manual';
  /** Task status at time of normalization */
  taskStatus: string;
  /** Minutes the agent appeared busy after the task was actually done */
  ghostBusyMinutes: number;
  /** Minutes between task completion and registry pointer clear */
  closureLagMinutes: number;
  /** ISO timestamp when the task actually completed */
  taskCompletedAt: string;
  /** ISO timestamp when the registry pointer was cleared */
  pointerClearedAt: string;
}

/** Union type for all telemetry events */
export type AnyTelemetryEvent =
  | TaskTelemetryEvent
  | RunTelemetryEvent
  | RunStartedEvent
  | RunCompletedEvent
  | RunErrorEvent
  | TokenTelemetryEvent
  | SignalHealthEvent
  | SignalCompletionEvent
  | SignalDispatchBlockedEvent
  | SignalGenericEvent
  | ControlPlaneNormalizationEvent;

/** Telemetry configuration */
export interface TelemetryConfig {
  enabled: boolean;
  retention: number; // Days to retain events
  traces?: boolean; // Optional trace collection (future)
}

/** Query options for fetching events */
export interface TelemetryQueryOptions {
  type?: TelemetryEventType | TelemetryEventType[];
  since?: string; // ISO timestamp
  until?: string; // ISO timestamp
  taskId?: string;
  project?: string;
  limit?: number;
}
