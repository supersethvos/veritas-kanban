/**
 * Cockpit Service
 *
 * Aggregates data from tasks, telemetry, and agent registry into a single
 * founder-facing view. Replaces Discord #cockpit and #mission-control.
 */

import { getTaskService } from './task-service.js';
import { getTelemetryService } from './telemetry-service.js';
import { getAgentRegistryService } from './agent-registry-service.js';
import { deriveCompletionTruthOverlay } from './founder-surface-service.js';
import type { CompletionTruthOverlay, Task, TelemetryQueryOptions } from '@veritas-kanban/shared';

// ── Response Types ──────────────────────────────────────────────────

export type CockpitBlockerClass = 'hard' | 'soft' | 'unknown';
export type CockpitMissingHandoffField = 'ackAt' | 'plan' | 'eta' | 'runId';

export interface CockpitDecision {
  source: 'task' | 'signal';
  id: string;
  title: string;
  agent: string;
  severity: string;
  summary: string;
  waitingSince: string;
  taskId?: string;
  venture?: string;
  blockedSince?: string;
  blockedMinutes?: number;
  blockerClass?: CockpitBlockerClass;
}

export interface CockpitSignal {
  type: string;
  agent: string;
  severity: string;
  summary: string;
  timestamp: string;
  taskId?: string;
  venture?: string;
  healthClass?: string;
  classification?: string;
}

export type CockpitAgentActivityState = 'active' | 'done_unnormalized' | 'idle' | 'unknown';
export type CockpitAgentHealthState = 'fresh' | 'stale' | 'offline';

export interface CockpitAgentStatus {
  id: string;
  name: string;
  status: string;
  activityState: CockpitAgentActivityState;
  activityReason: string;
  healthState: CockpitAgentHealthState;
  lastHeartbeat: string;
  lastActivityAt: string;
  stale: boolean;
  currentTaskId?: string;
  currentTaskTitle?: string;
  hasAck: boolean;
  hasPlan: boolean;
  hasEta: boolean;
  hasRunId: boolean;
  missingFields: CockpitMissingHandoffField[];
  handoffOverdue: boolean;
  blockedSince?: string;
  blockedMinutes?: number;
  blockerClass?: CockpitBlockerClass;
  lane?: string;
}

export interface CockpitSystemHealth {
  overall: 'GREEN' | 'YELLOW' | 'RED';
  agents: CockpitAgentStatus[];
  latestSweep?: {
    healthClass: string;
    summary: string;
    timestamp: string;
  };
  blockedCount: number;
  activeSignalCount: number;
  activeAgentCount: number;
  freshAgentCount: number;
}

export interface CockpitCompletionTruthSummary {
  verified: number;
  atRisk: number;
  pending: number;
  doneVerified: number;
  doneAtRisk: number;
  donePending: number;
}

export interface CockpitCompletedTaskTruth {
  taskId: string;
  title: string;
  status: string;
  updatedAt: string;
  completionTruth: CompletionTruthOverlay;
}

export interface CockpitBoardSnapshot {
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
  review: number;
  total: number;
  completionTruth: CockpitCompletionTruthSummary;
  completedTasks: CockpitCompletedTaskTruth[];
}

export interface CockpitCompatibility {
  routeMode: 'control-plane-preserved';
  founderActionRoute: '/api/signals/dispatch';
  cockpitRoute: '/api/cockpit';
  founderSurfaceMigration: 'coexistence';
  signalFeedOrdering: 'newest-first';
}

export interface CockpitResponse {
  decisionsNeeded: CockpitDecision[];
  signalFeed: CockpitSignal[];
  systemHealth: CockpitSystemHealth;
  boardSnapshot: CockpitBoardSnapshot;
  compatibility: CockpitCompatibility;
  generatedAt: string;
}

function normalizeAgentRef(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function toEpoch(value: string | undefined | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function latestIso(values: Array<string | undefined | null>, fallback: string): string {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (filtered.length === 0) return fallback;
  return filtered.reduce((latest, value) => (toEpoch(value) > toEpoch(latest) ? value : latest));
}

function isRecentIso(value: string | undefined | null, windowMs: number): boolean {
  if (!value) return false;
  const ts = toEpoch(value);
  return ts > 0 && Date.now() - ts <= windowMs;
}

function minutesSince(value: string | undefined | null): number | undefined {
  const ts = toEpoch(value);
  if (ts <= 0) return undefined;
  return Math.max(0, Math.floor((Date.now() - ts) / 60_000));
}

function isTerminalTaskStatus(status: string | undefined): boolean {
  return status === 'done' || status === 'cancelled';
}

function buildTaskIndex(tasks: Task[]): Map<string, Task> {
  const byId = new Map<string, Task>();
  for (const task of tasks) {
    byId.set(task.id, task);
  }
  return byId;
}

function isResolvedSignalEvent(event: any, taskById: Map<string, Task>): boolean {
  if (!event?.taskId) return false;
  const task = taskById.get(event.taskId);
  if (!task) return false;
  if ((task as any).archived) return true;
  if (!isTerminalTaskStatus(task.status)) return false;
  const taskUpdatedAt = task.updated ?? task.created;
  return toEpoch(taskUpdatedAt) >= toEpoch(event.timestamp);
}

function isSignalFreshEnough(event: any, windowMs: number): boolean {
  const timestamp = toEpoch(event?.timestamp);
  return timestamp > 0 && Date.now() - timestamp <= windowMs;
}

function filterCockpitSignals(
  events: any[],
  taskById: Map<string, Task>,
  mode: 'feed' | 'decision' | 'count'
): any[] {
  const deduped: any[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (!event?.timestamp) continue;

    const key = [event.type, event.taskId ?? '', event.agent ?? '', event.summary ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    if (isResolvedSignalEvent(event, taskById) && event.type !== 'signal.completion') {
      continue;
    }

    if (!event.taskId) {
      const feedWindowMs = 12 * 60 * 60 * 1000;
      const decisionWindowMs = 6 * 60 * 60 * 1000;
      const countWindowMs = 6 * 60 * 60 * 1000;
      const windowMs =
        mode === 'feed' ? feedWindowMs : mode === 'decision' ? decisionWindowMs : countWindowMs;
      if (!isSignalFreshEnough(event, windowMs)) {
        continue;
      }
    }

    deduped.push(event);
  }

  return deduped;
}

function classifyBlocker(task: Pick<Task, 'blockedReason'> | undefined): CockpitBlockerClass {
  const category =
    task?.blockedReason && typeof task.blockedReason === 'object'
      ? task.blockedReason.category
      : undefined;

  switch (category) {
    case 'waiting-on-feedback':
    case 'technical-snag':
      return 'soft';
    case 'prerequisite':
      return 'hard';
    default:
      return 'unknown';
  }
}

function getBlockedSince(
  task: Pick<Task, 'status' | 'updated' | 'created'> | undefined
): string | undefined {
  if (!task || task.status !== 'blocked') return undefined;
  return task.updated || task.created;
}

function buildHandoffTruth(
  task:
    | Pick<Task, 'status' | 'plan' | 'agent' | 'attempt' | 'automation' | 'updated' | 'created'>
    | undefined
): Pick<
  CockpitAgentStatus,
  'hasAck' | 'hasPlan' | 'hasEta' | 'hasRunId' | 'missingFields' | 'handoffOverdue'
> {
  const hasAck = Boolean(task?.automation?.ackAt?.trim());
  const hasPlan = Boolean(task?.plan?.trim());
  const hasEta = Boolean(task?.automation?.eta?.trim());
  const hasRunId = Boolean(task?.automation?.sessionKey?.trim());

  const missingFields: CockpitMissingHandoffField[] = [];
  if (!hasAck) missingFields.push('ackAt');
  if (!hasPlan) missingFields.push('plan');
  if (!hasEta) missingFields.push('eta');
  if (!hasRunId) missingFields.push('runId');

  const handoffAnchor = task?.automation?.spawnedAt ?? task?.updated ?? task?.created;
  const isDelegated = Boolean(
    task?.agent || task?.attempt || task?.automation?.spawnedAt || task?.automation?.sessionKey
  );
  const handoffOverdue = Boolean(
    task &&
    task.status === 'in-progress' &&
    isDelegated &&
    missingFields.length > 0 &&
    toEpoch(handoffAnchor) > 0 &&
    Date.now() - toEpoch(handoffAnchor) >= 5 * 60_000
  );

  return {
    hasAck,
    hasPlan,
    hasEta,
    hasRunId,
    missingFields,
    handoffOverdue,
  };
}

// ── Service ─────────────────────────────────────────────────────────

class CockpitService {
  /**
   * Generate the full cockpit view — single call, composites everything.
   */
  async getCockpit(): Promise<CockpitResponse> {
    const [decisions, signalFeed, systemHealth, boardSnapshot] = await Promise.all([
      this.getDecisionsNeeded(),
      this.getSignalFeed(),
      this.getSystemHealth(),
      this.getBoardSnapshot(),
    ]);

    return {
      decisionsNeeded: decisions,
      signalFeed,
      systemHealth,
      boardSnapshot,
      compatibility: {
        routeMode: 'control-plane-preserved',
        founderActionRoute: '/api/signals/dispatch',
        cockpitRoute: '/api/cockpit',
        founderSurfaceMigration: 'coexistence',
        signalFeedOrdering: 'newest-first',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Items that need founder attention:
   * - Blocked tasks
   * - Critical/action_required signals with requiresDecision
   */
  private async getDecisionsNeeded(): Promise<CockpitDecision[]> {
    const decisions: CockpitDecision[] = [];

    // 1. Blocked tasks
    const taskService = getTaskService();
    const allTasks = await taskService.listTasks();
    const taskById = buildTaskIndex(allTasks);
    const blockedTasks = allTasks.filter((t: any) => t.status === 'blocked' && !t.archived);

    for (const task of blockedTasks) {
      const reason = task.blockedReason;
      const blockedSince = getBlockedSince(task);
      const reasonText = reason
        ? typeof reason === 'string'
          ? reason
          : `${reason.category || 'blocked'}: ${reason.note || ''}`
        : 'Task is blocked — needs attention';

      decisions.push({
        source: 'task',
        id: task.id,
        title: task.title,
        agent: task.agent || 'unassigned',
        severity: 'action_required',
        summary: reasonText,
        waitingSince: blockedSince ?? task.updated ?? task.created,
        taskId: task.id,
        blockedSince,
        blockedMinutes: minutesSince(blockedSince),
        blockerClass: classifyBlocker(task),
      });
    }

    // 2. Critical signals from last 24h
    const telemetry = getTelemetryService();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const options: TelemetryQueryOptions = {
      type: [
        'signal.health',
        'signal.completion',
        'signal.dispatch_blocked',
        'signal.generic',
        'signal.directive_receipt',
      ],
      since,
      limit: 100,
    };

    try {
      const events = await telemetry.getEvents(options);
      const criticalEvents = filterCockpitSignals(events, taskById, 'decision').filter(
        (e: any) => e.severity === 'critical' || e.severity === 'action_required'
      );

      for (const event of criticalEvents) {
        const evt = event as any;
        decisions.push({
          source: 'signal',
          id: evt.id,
          title: evt.summary || `Signal: ${evt.type}`,
          agent: evt.agent || 'unknown',
          severity: evt.severity,
          summary: evt.summary || '',
          waitingSince: evt.timestamp,
          taskId: evt.taskId,
          venture: evt.venture,
        });
      }
    } catch {
      // Telemetry may not have signal events yet — graceful
    }

    // Sort by severity (critical first), then by age (oldest first)
    const sevOrder: Record<string, number> = {
      critical: 0,
      action_required: 1,
      attention: 2,
      info: 3,
    };
    decisions.sort((a, b) => {
      const sa = sevOrder[a.severity] ?? 9;
      const sb = sevOrder[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
    });

    return decisions;
  }

  /**
   * Recent signal feed — reverse-chronological, all severities.
   */
  private async getSignalFeed(): Promise<CockpitSignal[]> {
    const telemetry = getTelemetryService();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const [events, allTasks] = await Promise.all([
        telemetry.getEvents({
          type: [
            'signal.health',
            'signal.completion',
            'signal.dispatch_blocked',
            'signal.generic',
            'signal.directive_receipt',
          ],
          since,
          limit: 50,
        }),
        getTaskService().listTasks(),
      ]);

      const taskById = buildTaskIndex(allTasks);

      return filterCockpitSignals(events, taskById, 'feed').map((e: any) => ({
        type: e.type,
        agent: e.agent || 'unknown',
        severity: e.severity || 'info',
        summary: e.summary || '',
        timestamp: e.timestamp,
        taskId: e.taskId,
        venture: e.venture,
        healthClass: e.healthClass,
        classification: e.classification,
      }));
    } catch {
      return [];
    }
  }

  /**
   * System health: activity truth separated from freshness/transport health.
   */
  private async getSystemHealth(): Promise<CockpitSystemHealth> {
    const registry = getAgentRegistryService();
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const RECENT_ACTIVITY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    const taskService = getTaskService();
    const allTasks = await taskService.listTasks();
    registry.autoNormalizeStaleTerminalPointers(
      allTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        agent: task.agent,
      }))
    );
    const allAgents = registry.list();
    const activeTasks = allTasks.filter((t: any) => !t.archived);
    const blockedCount = activeTasks.filter((t: any) => t.status === 'blocked').length;

    const currentTaskByAgent = new Map<string, Task>();
    for (const task of activeTasks) {
      if (!task.agent || (task.status !== 'in-progress' && task.status !== 'blocked')) continue;
      const key = normalizeAgentRef(task.agent);
      const existing = currentTaskByAgent.get(key);
      if (
        !existing ||
        toEpoch(task.updated || task.created) > toEpoch(existing.updated || existing.created)
      ) {
        currentTaskByAgent.set(key, task);
      }
    }

    // Skip dormant agents — they exist in registry but have never booted.
    // Including them in cockpit aggregation would inflate offline/stale counts.
    const activeRosterAgents = allAgents.filter((a: any) => a.status !== 'dormant');

    const agents: CockpitAgentStatus[] = activeRosterAgents.map((a: any) => {
      const rawStatus = a.status || 'unknown';
      const lastHeartbeat = a.lastHeartbeat || a.registeredAt;
      const stale = a.lastHeartbeat
        ? now - new Date(a.lastHeartbeat).getTime() > STALE_THRESHOLD_MS
        : true;
      const taskTruth =
        currentTaskByAgent.get(normalizeAgentRef(a.id)) ??
        currentTaskByAgent.get(normalizeAgentRef(a.name));
      const bridgeLastWakeAt =
        typeof a.metadata?.bridgeLastWakeAt === 'string' ? a.metadata.bridgeLastWakeAt : undefined;
      const bridgeLastWebhookAt =
        typeof a.metadata?.bridgeLastWebhookAt === 'string'
          ? a.metadata.bridgeLastWebhookAt
          : undefined;
      const hasTaskPointer = Boolean(a.currentTaskId || a.currentTaskTitle || taskTruth?.id);
      const hasRecentWake = isRecentIso(bridgeLastWakeAt, RECENT_ACTIVITY_WINDOW_MS);
      const hasRecentWebhook = isRecentIso(bridgeLastWebhookAt, RECENT_ACTIVITY_WINDOW_MS);

      let activityState: CockpitAgentStatus['activityState'] = 'unknown';
      let activityReason = 'no recent activity truth';

      const taskIsTerminal = taskTruth?.status === 'done' || taskTruth?.status === 'cancelled';

      if (taskTruth?.status === 'in-progress') {
        activityState = 'active';
        activityReason = 'in-progress task truth';
      } else if (taskTruth?.status === 'blocked') {
        activityState = 'idle';
        activityReason = 'blocked task truth';
      } else if (hasTaskPointer && taskIsTerminal) {
        activityState = 'done_unnormalized';
        activityReason = `task ${taskTruth!.status} but registry pointer not yet cleared`;
      } else if (hasTaskPointer) {
        activityState = 'active';
        activityReason = 'current task pointer';
      } else if (rawStatus === 'busy') {
        activityState = 'active';
        activityReason = 'registry busy state';
      } else if (hasRecentWake) {
        activityState = 'active';
        activityReason = 'recent bridge wake';
      } else if (hasRecentWebhook) {
        activityState = 'active';
        activityReason = 'recent bridge webhook';
      } else if (
        rawStatus === 'online' ||
        rawStatus === 'idle' ||
        rawStatus === 'offline' ||
        !stale
      ) {
        activityState = 'idle';
        activityReason =
          rawStatus === 'offline'
            ? 'no active work but transport is offline'
            : 'no active work detected';
      }

      const healthState: CockpitAgentStatus['healthState'] =
        rawStatus === 'offline' ? 'offline' : stale ? 'stale' : 'fresh';

      const currentTaskId = taskTruth?.id ?? a.currentTaskId;
      const currentTaskTitle = taskTruth?.title ?? a.currentTaskTitle;
      const lastActivityAt = latestIso(
        [
          taskTruth?.updated,
          taskTruth?.created,
          bridgeLastWakeAt,
          bridgeLastWebhookAt,
          activityState === 'active' ? lastHeartbeat : undefined,
        ],
        lastHeartbeat
      );
      const handoffTruth = buildHandoffTruth(taskTruth);
      const blockedSince = getBlockedSince(taskTruth);

      return {
        id: a.id,
        name: a.name,
        status: rawStatus,
        activityState,
        activityReason,
        healthState,
        lastHeartbeat,
        lastActivityAt,
        stale,
        currentTaskId,
        currentTaskTitle,
        ...handoffTruth,
        blockedSince,
        blockedMinutes: minutesSince(blockedSince),
        blockerClass: blockedSince ? classifyBlocker(taskTruth) : undefined,
        lane: a.metadata?.lane,
      };
    });

    // Latest health sweep
    let latestSweep: CockpitSystemHealth['latestSweep'] | undefined;
    try {
      const telemetry = getTelemetryService();
      const healthEvents = await telemetry.getEvents({
        type: 'signal.health',
        limit: 1,
      });
      if (healthEvents.length > 0) {
        const latest = healthEvents[healthEvents.length - 1] as any;
        latestSweep = {
          healthClass: latest.healthClass || 'UNKNOWN',
          summary: latest.summary || '',
          timestamp: latest.timestamp,
        };
      }
    } catch {
      // No health events yet
    }

    // Count active signals (action_required/critical in last 24h)
    let activeSignalCount = 0;
    try {
      const telemetry = getTelemetryService();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [signals, allTasksForSignals] = await Promise.all([
        telemetry.getEvents({
          type: [
            'signal.health',
            'signal.completion',
            'signal.dispatch_blocked',
            'signal.generic',
            'signal.directive_receipt',
          ],
          since,
          limit: 200,
        }),
        taskService.listTasks(),
      ]);
      const taskById = buildTaskIndex(allTasksForSignals);
      activeSignalCount = filterCockpitSignals(signals, taskById, 'count').filter(
        (e: any) => e.severity === 'critical' || e.severity === 'action_required'
      ).length;
    } catch {
      // OK
    }

    const staleCount = agents.filter((a) => a.healthState === 'stale').length;
    const offlineCount = agents.filter((a) => a.healthState === 'offline').length;
    const activeAgentCount = agents.filter((a) => a.activityState === 'active').length;
    const freshAgentCount = agents.filter((a) => a.healthState === 'fresh').length;

    // Truly degraded = agent should be running (has active/done_unnormalized work) but isn't responding.
    // Idle agents that are offline are just on standby — not degraded.
    const trulyDegradedCount = agents.filter(
      (a) =>
        (a.activityState === 'active' || a.activityState === 'done_unnormalized') &&
        a.healthState !== 'fresh'
    ).length;

    // Determine overall health for FOUNDER view.
    // Per SWEEP_FINDING_ROUTING_CONTRACT_v1: sweep findings are operator-level.
    // Founder health only degrades on founder-actionable conditions:
    // - Truly degraded agents (expected to be running, not responding)
    // - High blocked count (work stuck waiting on something)
    // - Active critical signals that require founder action
    // Sweep healthClass is EXCLUDED — that's operator context, not founder trust posture.
    let overall: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
    if (blockedCount >= 3 || trulyDegradedCount >= 2) {
      overall = 'RED';
    } else if (blockedCount >= 1 || trulyDegradedCount >= 1 || activeSignalCount >= 3) {
      overall = 'YELLOW';
    }

    return {
      overall,
      agents,
      latestSweep,
      blockedCount,
      activeSignalCount,
      activeAgentCount,
      freshAgentCount,
    };
  }

  /**
   * Quick board snapshot — task counts by status, plus completion truth for finished work.
   */
  private async getBoardSnapshot(): Promise<CockpitBoardSnapshot> {
    const taskService = getTaskService();
    const allTasks = await taskService.listTasks();
    const active = allTasks.filter((t: any) => !t.archived);

    let completionSignals: any[] = [];
    try {
      const telemetry = getTelemetryService();
      completionSignals = await telemetry.getEvents({
        type: 'signal.completion',
        limit: 500,
      });
    } catch {
      completionSignals = [];
    }

    const completionSignalsByTask = new Map<string, any[]>();
    for (const event of completionSignals) {
      if (!event?.taskId) continue;
      const group = completionSignalsByTask.get(event.taskId) ?? [];
      group.push(event);
      completionSignalsByTask.set(event.taskId, group);
    }

    const completedTasks = active
      .filter((task: any) => task.status === 'done')
      .map((task: any) => ({
        taskId: task.id,
        title: task.title,
        status: task.status,
        updatedAt: task.updated ?? task.created,
        completionTruth: deriveCompletionTruthOverlay({
          task,
          relatedSignals: completionSignalsByTask.get(task.id) ?? [],
          asOf: new Date().toISOString(),
        }),
      }))
      .sort((a, b) => toEpoch(b.updatedAt) - toEpoch(a.updatedAt));

    const completionTruth = active.reduce<CockpitCompletionTruthSummary>(
      (summary, task: any) => {
        const overlay = deriveCompletionTruthOverlay({
          task,
          relatedSignals: completionSignalsByTask.get(task.id) ?? [],
          asOf: new Date().toISOString(),
        });

        if (overlay.state === 'verified') summary.verified += 1;
        if (overlay.state === 'at_risk') summary.atRisk += 1;
        if (overlay.state === 'pending') summary.pending += 1;

        if (task.status === 'done') {
          if (overlay.state === 'verified') summary.doneVerified += 1;
          if (overlay.state === 'at_risk') summary.doneAtRisk += 1;
          if (overlay.state === 'pending') summary.donePending += 1;
        }

        return summary;
      },
      {
        verified: 0,
        atRisk: 0,
        pending: 0,
        doneVerified: 0,
        doneAtRisk: 0,
        donePending: 0,
      }
    );

    return {
      todo: active.filter((t: any) => t.status === 'todo').length,
      inProgress: active.filter((t: any) => t.status === 'in-progress').length,
      blocked: active.filter((t: any) => t.status === 'blocked').length,
      done: active.filter((t: any) => t.status === 'done').length,
      review: active.filter((t: any) => t.status === 'review').length,
      total: active.length,
      completionTruth,
      completedTasks,
    };
  }
}

// Singleton
let instance: CockpitService | null = null;

export function getCockpitService(): CockpitService {
  if (!instance) {
    instance = new CockpitService();
  }
  return instance;
}
