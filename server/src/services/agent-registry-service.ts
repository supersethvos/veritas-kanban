/**
 * Agent Registry Service
 *
 * Manages agent registration, heartbeat tracking, and capability discovery.
 * Agents register themselves with name, model, capabilities, and metadata.
 * The registry tracks liveness via heartbeats and exposes discovery APIs.
 *
 * Storage: File-based JSON in .veritas-kanban/agent-registry.json
 */

import path from 'path';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from '../storage/fs-helpers.js';
import { createLogger } from '../lib/logger.js';
import { getRuntimeDir } from '../utils/paths.js';
import type { ControlPlaneNormalizationEvent } from '@veritas-kanban/shared';

const log = createLogger('agent-registry');

// ─── Types ───────────────────────────────────────────────────────

export interface AgentCapability {
  /** Capability name (e.g., "code", "research", "deploy", "review") */
  name: string;
  /** Optional description */
  description?: string;
}

export interface RegisteredAgent {
  /** Unique agent identifier (e.g., "veritas", "codex-1", "sonnet-research") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Model identifier (e.g., "claude-opus-4-6", "gpt-5.2-codex") */
  model?: string;
  /** Provider (e.g., "anthropic", "openai-codex") */
  provider?: string;
  /** Agent capabilities */
  capabilities: AgentCapability[];
  /** Agent version or build info */
  version?: string;
  /** Freeform metadata */
  metadata?: Record<string, unknown>;
  /** Current status */
  status: 'online' | 'busy' | 'idle' | 'offline' | 'dormant';
  /** ISO timestamp of registration */
  registeredAt: string;
  /** ISO timestamp of last heartbeat */
  lastHeartbeat: string;
  /** Current task ID (if working on something) */
  currentTaskId?: string;
  /** Current task title */
  currentTaskTitle?: string;
  /** Session key (for OpenClaw/orchestrator integration) */
  sessionKey?: string;
}

export interface AgentRegistration {
  id: string;
  name: string;
  model?: string;
  provider?: string;
  capabilities?: AgentCapability[];
  version?: string;
  metadata?: Record<string, unknown>;
  sessionKey?: string;
}

export interface AgentHeartbeat {
  status?: 'online' | 'busy' | 'idle' | 'offline' | 'dormant';
  currentTaskId?: string;
  currentTaskTitle?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRegistryData {
  agents: Record<string, RegisteredAgent>;
  lastUpdated: string;
}

export interface TaskSyncUpdate {
  agentRef: string;
  taskId: string;
  taskTitle?: string;
  taskStatus: 'todo' | 'in-progress' | 'blocked' | 'done' | 'cancelled';
}

export interface TaskSyncContext {
  source: 'task-service' | 'task-reconciler';
  /** Unforgeable capability token — must be obtained via createTaskSyncToken() */
  readonly __capabilityToken?: symbol;
}

/**
 * Module-scoped unforgeable capability symbol.
 * Only code that imports createTaskSyncToken from this module can produce valid tokens.
 */
const SYNC_CAPABILITY_KEY = Symbol('agent-registry-sync-capability');

/**
 * Create an unforgeable TaskSyncContext. Only this module exports this factory,
 * so external/untrusted code cannot construct a valid context.
 */
export function createTaskSyncToken(source: 'task-service' | 'task-reconciler'): TaskSyncContext {
  return Object.freeze({ source, __capabilityToken: SYNC_CAPABILITY_KEY });
}

/**
 * Validate that a context carries the unforgeable capability token.
 */
export function isValidSyncToken(context: TaskSyncContext): boolean {
  return context.__capabilityToken === SYNC_CAPABILITY_KEY;
}

export interface TaskSyncSnapshot {
  id: string;
  title?: string;
  status: 'todo' | 'in-progress' | 'blocked' | 'done' | 'cancelled';
  agent?: string;
}

export interface AgentRegistryStats {
  total: number;
  online: number;
  busy: number;
  idle: number;
  offline: number;
  capabilities: string[];
  knownAgentsTotal: number;
  knownAgentsPresent: number;
  missingKnownAgents: string[];
  rosterComplete: boolean;
}

// ─── Configuration ───────────────────────────────────────────────

/** How long before an agent is considered offline (no heartbeat) */
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** How often to check for stale agents */
const STALE_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

/** Prevent rapid busy<->idle oscillation on quick status churn */
const DEFAULT_TASK_SYNC_FLAP_GUARD_MS = 10 * 1000; // 10 seconds

function getTaskSyncFlapGuardMs(): number {
  const raw = process.env.VERITAS_TASK_SYNC_FLAP_GUARD_MS;
  if (!raw) return DEFAULT_TASK_SYNC_FLAP_GUARD_MS;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    log.warn(
      { value: raw, env: 'VERITAS_TASK_SYNC_FLAP_GUARD_MS' },
      'Invalid flap guard override; using default'
    );
    return DEFAULT_TASK_SYNC_FLAP_GUARD_MS;
  }

  return parsed;
}

/** Defensive cap to avoid pathological reconciliation payload sizes */
const MAX_RECONCILE_BATCH = 10_000;

/** Basic ref validation for task-agent sync paths */
const AGENT_REF_REGEX = /^[a-zA-Z0-9._: -]{1,100}$/;

export const KNOWN_VOS_AGENT_IDS = [
  'SETH-LEAD',
  'MAYA',
  'TAMMI',
  'HONEY-BADGER',
  'FINN',
  'VEGA',
  'ATLAS',
  'ROUX',
] as const;

type KnownVosAgentId = (typeof KNOWN_VOS_AGENT_IDS)[number];

type KnownVosAgentProfile = Required<
  Pick<AgentRegistration, 'id' | 'name' | 'model' | 'provider' | 'version'>
> & {
  capabilities: AgentCapability[];
  metadata: Record<string, unknown>;
};

const KNOWN_VOS_AGENT_PROFILES: Record<KnownVosAgentId, KnownVosAgentProfile> = {
  'SETH-LEAD': {
    id: 'SETH-LEAD',
    name: 'SETH Lead',
    model: 'openai-codex/gpt-5.4',
    provider: 'openai-codex',
    version: '1.0.0',
    capabilities: [
      { name: 'orchestration' },
      { name: 'execution' },
      { name: 'integration' },
      { name: 'veritas-control-plane' },
    ],
    metadata: {
      role: 'lead',
      lane: '#lab-vos-system',
      ventureScope: 'vos-core',
      source: 'veritas-openclaw-bridge',
      registrationMode: 'bridge-driven',
    },
  },
  MAYA: {
    id: 'MAYA',
    name: 'MAYA',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    version: '1.0.0',
    capabilities: [{ name: 'engineering' }, { name: 'scaffolding' }, { name: 'automation' }],
    metadata: {
      role: 'engineering',
      lane: '#eng-*',
      ventureScope: 'vos-core',
      source: 'canonical-vos-registry',
      registrationMode: 'seeded-known-agent',
    },
  },
  TAMMI: {
    id: 'TAMMI',
    name: 'TAMMI',
    model: 'openai-codex/gpt-5.4',
    provider: 'openai-codex',
    version: '1.0.0',
    capabilities: [{ name: 'ops' }, { name: 'reliability' }, { name: 'validation' }],
    metadata: {
      role: 'operations-controller',
      lane: '#ops-tammi',
      ventureScope: 'vos-core',
      source: 'canonical-vos-registry',
      registrationMode: 'seeded-known-agent',
    },
  },
  'HONEY-BADGER': {
    id: 'HONEY-BADGER',
    name: 'Honey Badger',
    model: 'claude-code/opus-4',
    provider: 'anthropic',
    version: '1.0.0',
    capabilities: [{ name: 'security' }, { name: 'compliance' }, { name: 'audit' }],
    metadata: {
      role: 'security',
      lane: '#sec-honeybadger',
      ventureScope: 'multi-venture',
      source: 'canonical-vos-registry',
      registrationMode: 'seeded-known-agent',
    },
  },
  FINN: {
    id: 'FINN',
    name: 'Finn',
    model: 'claude-code/opus-4',
    provider: 'anthropic',
    version: '1.0.0',
    capabilities: [{ name: 'finance' }, { name: 'treasury' }, { name: 'cost-analysis' }],
    metadata: {
      role: 'capital-ops',
      lane: '#fin-finn',
      ventureScope: 'multi-venture',
      source: 'canonical-vos-registry',
      registrationMode: 'seeded-known-agent',
    },
  },
  VEGA: {
    id: 'VEGA',
    name: 'Vega',
    model: 'claude-code/opus-4',
    provider: 'anthropic',
    version: '1.0.0',
    capabilities: [{ name: 'growth' }, { name: 'marketing' }, { name: 'analytics' }],
    metadata: {
      role: 'growth',
      lane: '#growth-vega',
      ventureScope: 'multi-venture',
      source: 'canonical-vos-registry',
      registrationMode: 'seeded-known-agent',
    },
  },
  ATLAS: {
    id: 'ATLAS',
    name: 'Atlas',
    model: 'claude-code/opus-4',
    provider: 'anthropic',
    version: '1.0.0',
    capabilities: [{ name: 'research' }, { name: 'intelligence' }, { name: 'data' }],
    metadata: {
      role: 'intelligence',
      lane: '#intel-atlas',
      ventureScope: 'multi-venture',
      source: 'canonical-vos-registry',
      registrationMode: 'seeded-known-agent',
    },
  },
  ROUX: {
    id: 'ROUX',
    name: 'Roux',
    model: 'claude-code/opus-4',
    provider: 'anthropic',
    version: '1.0.0',
    capabilities: [{ name: 'creative' }, { name: 'content' }, { name: 'copy' }],
    metadata: {
      role: 'creative',
      lane: '#creative-roux',
      ventureScope: 'klaviyo_ops',
      source: 'canonical-vos-registry',
      registrationMode: 'seeded-known-agent',
    },
  },
};

// ─── Service ─────────────────────────────────────────────────────

class AgentRegistryService {
  private agents: Map<string, RegisteredAgent> = new Map();
  private dataDir: string;
  private filePath: string;
  private legacyFilePath: string;
  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastBusyAtByAgent: Map<string, number> = new Map();
  private taskSyncFlapGuardMs: number;

  constructor() {
    this.dataDir = getRuntimeDir();
    this.filePath = path.join(this.dataDir, 'agent-registry.json');
    this.legacyFilePath = path.join(
      process.env.VERITAS_DATA_DIR || path.join(process.cwd(), '..', '.veritas-kanban'),
      'agent-registry.json'
    );
    this.taskSyncFlapGuardMs = getTaskSyncFlapGuardMs();
    this.migrateLegacyRegistry();
    this.load();
    this.startStaleCheck();
  }

  /**
   * Register or update an agent in the registry.
   */
  register(registration: AgentRegistration): RegisteredAgent {
    const existing = this.agents.get(registration.id);
    const canonical = this.isKnownAgent(registration.id)
      ? KNOWN_VOS_AGENT_PROFILES[registration.id]
      : null;
    const now = new Date().toISOString();

    const agent = this.sanitizeAgentState({
      id: registration.id,
      name: canonical?.name ?? registration.name,
      model: registration.model ?? existing?.model ?? canonical?.model,
      provider: registration.provider ?? existing?.provider ?? canonical?.provider,
      capabilities:
        registration.capabilities ??
        existing?.capabilities ??
        canonical?.capabilities.map((capability) => ({ ...capability })) ??
        [],
      version: registration.version ?? existing?.version ?? canonical?.version,
      metadata: canonical
        ? {
            ...canonical.metadata,
            ...existing?.metadata,
            ...registration.metadata,
          }
        : (registration.metadata ?? existing?.metadata),
      sessionKey: registration.sessionKey ?? existing?.sessionKey,
      status: existing?.status === 'busy' && existing.currentTaskId ? 'busy' : 'online',
      registeredAt: existing?.registeredAt ?? now,
      lastHeartbeat: now,
      currentTaskId: existing?.currentTaskId,
      currentTaskTitle: existing?.currentTaskTitle,
    });

    this.agents.set(registration.id, agent);
    this.persist();

    log.info(
      { agentId: agent.id, model: agent.model, capabilities: agent.capabilities.length },
      `Agent registered: ${agent.name}`
    );

    return agent;
  }

  /**
   * Process a heartbeat from an agent.
   */
  heartbeat(agentId: string, update?: AgentHeartbeat): RegisteredAgent | null {
    const current = this.agents.get(agentId);
    if (!current) {
      return null;
    }

    const next: RegisteredAgent = {
      ...current,
      lastHeartbeat: new Date().toISOString(),
      status: update?.status ?? current.status,
      metadata: update?.metadata ? { ...current.metadata, ...update.metadata } : current.metadata,
      currentTaskId: current.currentTaskId,
      currentTaskTitle: current.currentTaskTitle,
    };

    const requestedTaskId = update?.currentTaskId?.trim() || undefined;
    const requestedTaskTitle = update?.currentTaskTitle?.trim() || undefined;
    const wantsToClearTask = update?.currentTaskId !== undefined && !requestedTaskId;
    const wantsToClearTitle = update?.currentTaskTitle !== undefined && !requestedTaskTitle;
    const wantsIdleLikeStatus =
      next.status === 'idle' || next.status === 'offline' || next.status === 'dormant';
    // Protect task-sync truth against idle/dormant heartbeat noise (e.g. bridge
    // sending empty string task fields), but allow explicit 'offline' heartbeats
    // to clear state intentionally.
    const preserveAuthoritativeTaskTruth =
      (next.status === 'idle' || next.status === 'dormant') &&
      current.status === 'busy' &&
      Boolean(current.currentTaskId) &&
      (update?.currentTaskId === undefined || wantsToClearTask) &&
      (update?.currentTaskTitle === undefined || wantsToClearTitle);

    if (requestedTaskId !== undefined) {
      next.currentTaskId = requestedTaskId;
    }
    if (requestedTaskTitle !== undefined) {
      next.currentTaskTitle = requestedTaskTitle;
    }

    if (preserveAuthoritativeTaskTruth) {
      next.status = 'busy';
      next.currentTaskId = current.currentTaskId;
      next.currentTaskTitle = current.currentTaskTitle;
    } else {
      if (wantsIdleLikeStatus && update?.currentTaskId === undefined) {
        next.currentTaskId = undefined;
      }
      if (wantsIdleLikeStatus && update?.currentTaskTitle === undefined) {
        next.currentTaskTitle = undefined;
      }
      if (wantsIdleLikeStatus && wantsToClearTask) {
        next.currentTaskId = undefined;
      }
      if (wantsIdleLikeStatus && wantsToClearTitle) {
        next.currentTaskTitle = undefined;
      }
    }

    const agent = this.sanitizeAgentState(next);
    this.agents.set(agentId, agent);
    this.persist();

    return agent;
  }

  /**
   * Apply task lifecycle state to agent registry state.
   *
   * Precedence contract:
   * - Task transition to in-progress is authoritative for busy + currentTask assignment.
   * - Terminal transitions (todo/blocked/done/cancelled) clear ghost task pointers,
   *   but only when the agent is still attached to the same task (prevents clobbering
   *   if agent moved on to a different task).
   */
  syncFromTask(update: TaskSyncUpdate, context: TaskSyncContext): RegisteredAgent | null {
    if (!this.isAuthorizedSyncContext(context)) {
      throw new Error('Unauthorized task sync context');
    }

    if (!this.isValidAgentRef(update.agentRef)) {
      log.warn({ agentRef: update.agentRef }, 'Rejected malformed agentRef in syncFromTask');
      return null;
    }

    const current = this.findByRef(update.agentRef);
    if (!current) return null;

    const agent: RegisteredAgent = { ...current };
    const previousState = JSON.stringify({
      status: agent.status,
      currentTaskId: agent.currentTaskId,
      currentTaskTitle: agent.currentTaskTitle,
    });

    if (update.taskStatus === 'in-progress') {
      agent.status = 'busy';
      agent.currentTaskId = update.taskId;
      agent.currentTaskTitle = update.taskTitle;
      this.lastBusyAtByAgent.set(agent.id, Date.now());
    } else {
      if (agent.currentTaskId && agent.currentTaskId !== update.taskId) {
        return agent;
      }

      const immediateTerminalClear =
        (update.taskStatus === 'done' || update.taskStatus === 'cancelled') &&
        agent.currentTaskId === update.taskId;

      const lastBusyAt = this.lastBusyAtByAgent.get(agent.id);
      if (
        !immediateTerminalClear &&
        lastBusyAt &&
        Date.now() - lastBusyAt < this.taskSyncFlapGuardMs
      ) {
        return agent;
      }

      // Emit ghost-time telemetry for atomic completion clear
      if (immediateTerminalClear && lastBusyAt) {
        const now = Date.now();
        const ghostMinutes = (now - lastBusyAt) / 60000;
        this.emitNormalizationEvent(
          agent.id,
          update.taskId,
          update.taskStatus,
          'atomic_completion',
          ghostMinutes
        );
      }

      agent.currentTaskId = undefined;
      agent.currentTaskTitle = undefined;
      this.lastBusyAtByAgent.delete(agent.id);
      if (agent.status !== 'offline') {
        agent.status = 'idle';
      }
    }

    const sanitized = this.sanitizeAgentState(agent);
    const nextState = JSON.stringify({
      status: sanitized.status,
      currentTaskId: sanitized.currentTaskId,
      currentTaskTitle: sanitized.currentTaskTitle,
    });

    if (previousState !== nextState) {
      this.agents.set(agent.id, sanitized);
      this.persist();
    }

    return sanitized;
  }

  /**
   * Reconcile registry status from the current task snapshot.
   *
   * Drift correction:
   * - If an agent has an in-progress task assigned, force busy + task linkage.
   * - If an agent is busy on a task that is now terminal or absent from the authoritative
   *   snapshot, clear it (subject to flap guard).
   */
  reconcileFromTasks(tasks: TaskSyncSnapshot[], context: TaskSyncContext): number {
    if (!this.isAuthorizedSyncContext(context)) {
      throw new Error('Unauthorized task reconcile context');
    }

    if (tasks.length > MAX_RECONCILE_BATCH) {
      throw new Error(`Reconciliation batch too large: ${tasks.length} > ${MAX_RECONCILE_BATCH}`);
    }

    const byAgentRef = new Map<string, TaskSyncSnapshot>();

    for (const task of tasks) {
      if (!task.agent) continue;
      if (!this.isValidAgentRef(task.agent)) {
        log.warn(
          { agentRef: task.agent, taskId: task.id },
          'Skipping malformed agentRef in reconcileFromTasks'
        );
        continue;
      }

      const key = task.agent.trim().toLowerCase();
      const existing = byAgentRef.get(key);
      if (!existing || task.status === 'in-progress') {
        byAgentRef.set(key, task);
      }
    }

    let changed = 0;

    for (const agent of this.agents.values()) {
      const mapped =
        byAgentRef.get(agent.id.trim().toLowerCase()) ??
        byAgentRef.get(agent.name.trim().toLowerCase());

      if (mapped?.status === 'in-progress') {
        const before = JSON.stringify({ status: agent.status, currentTaskId: agent.currentTaskId });
        const updated = this.syncFromTask(
          {
            agentRef: agent.id,
            taskId: mapped.id,
            taskTitle: mapped.title,
            taskStatus: 'in-progress',
          },
          context
        );
        const after = JSON.stringify({
          status: updated?.status,
          currentTaskId: updated?.currentTaskId,
        });
        if (updated && before !== after) changed++;
        continue;
      }

      if (agent.currentTaskId) {
        const task = tasks.find((candidate) => candidate.id === agent.currentTaskId);
        if (!task || task.status !== 'in-progress') {
          const before = JSON.stringify({
            status: agent.status,
            currentTaskId: agent.currentTaskId,
          });
          const updated = this.syncFromTask(
            {
              agentRef: agent.id,
              taskId: agent.currentTaskId,
              taskStatus: task?.status ?? 'done',
            },
            context
          );
          const after = JSON.stringify({
            status: updated?.status,
            currentTaskId: updated?.currentTaskId,
          });
          if (updated && before !== after) changed++;
        }
      }
    }

    return changed;
  }

  /**
   * Safety net for ghost busy state:
   * if an agent heartbeat is stale beyond threshold and the linked task is already terminal,
   * clear the task pointer and normalize the agent to offline transport truth.
   */
  autoNormalizeStaleTerminalPointers(tasks: TaskSyncSnapshot[]): number {
    const now = Date.now();
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    let changed = 0;

    for (const current of this.agents.values()) {
      if (current.status !== 'busy' || !current.currentTaskId) continue;

      const lastBeat = new Date(current.lastHeartbeat).getTime();
      if (Number.isNaN(lastBeat) || now - lastBeat <= HEARTBEAT_TIMEOUT_MS) {
        continue;
      }

      const pointedTask = taskById.get(current.currentTaskId);
      if (pointedTask?.status !== 'done' && pointedTask?.status !== 'cancelled') {
        continue;
      }

      const normalized = this.sanitizeAgentState({
        ...current,
        status: 'offline',
        currentTaskId: undefined,
        currentTaskTitle: undefined,
      });

      this.agents.set(current.id, normalized);
      this.lastBusyAtByAgent.delete(current.id);
      changed += 1;

      // Emit ghost-time telemetry for stale autoclear
      const ghostMinutes = (now - lastBeat) / 60000;
      this.emitNormalizationEvent(
        current.id,
        pointedTask.id,
        pointedTask.status,
        'stale_autoclear',
        ghostMinutes
      );

      log.info(
        {
          agentId: current.id,
          taskId: pointedTask.id,
          taskStatus: pointedTask.status,
          lastHeartbeat: current.lastHeartbeat,
        },
        'Auto-cleared stale terminal task pointer from agent registry'
      );
    }

    if (changed > 0) {
      this.persist();
    }

    return changed;
  }

  /**
   * Deregister an agent.
   * Known VOS agents remain in the registry as offline roster entries.
   */
  /**
   * Emit a control_plane.normalization telemetry event for ghost-time tracking.
   * Fire-and-forget — telemetry failures must not block registry operations.
   */
  private emitNormalizationEvent(
    agentId: string,
    taskId: string,
    taskStatus: string,
    trigger: 'atomic_completion' | 'stale_autoclear' | 'manual',
    ghostBusyMinutes: number
  ): void {
    const now = new Date().toISOString();
    const event: ControlPlaneNormalizationEvent = {
      id: `cpn_${randomUUID()}`,
      type: 'control_plane.normalization',
      timestamp: now,
      agent: agentId,
      taskId,
      trigger,
      taskStatus,
      ghostBusyMinutes: Math.round(ghostBusyMinutes * 100) / 100,
      closureLagMinutes: Math.round(ghostBusyMinutes * 100) / 100,
      taskCompletedAt: now, // best available — real completion time would require task lookup
      pointerClearedAt: now,
    };

    // Lazy import to avoid circular dependency
    import('./telemetry-service.js')
      .then(({ getTelemetryService }) => {
        const telemetry = getTelemetryService();
        return telemetry.emit(event);
      })
      .catch((err) => {
        log.warn(
          { err, agentId, taskId, trigger },
          'Failed to emit normalization telemetry — non-fatal'
        );
      });
  }

  deregister(agentId: string): boolean {
    const existing = this.agents.get(agentId);
    if (!existing && !this.isKnownAgent(agentId)) {
      return false;
    }

    this.lastBusyAtByAgent.delete(agentId);

    if (this.isKnownAgent(agentId)) {
      const reset = this.hydrateKnownAgent(agentId, {
        ...existing,
        status: 'offline',
        currentTaskId: undefined,
        currentTaskTitle: undefined,
        sessionKey: undefined,
      });
      this.agents.set(agentId, reset);
      this.persist();
      log.info({ agentId }, 'Known agent reset to offline roster entry');
      return true;
    }

    const existed = this.agents.delete(agentId);
    if (existed) {
      this.persist();
      log.info({ agentId }, `Agent deregistered: ${agentId}`);
    }
    return existed;
  }

  /**
   * Get a specific agent by ID.
   */
  get(agentId: string): RegisteredAgent | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * List all registered agents, optionally filtered.
   */
  list(filters?: { status?: string; capability?: string }): RegisteredAgent[] {
    let agents = Array.from(this.agents.values());

    if (filters?.status) {
      agents = agents.filter((agent) => agent.status === filters.status);
    }

    if (filters?.capability) {
      const capability = filters.capability.toLowerCase();
      agents = agents.filter((agent) =>
        agent.capabilities.some((candidate) => candidate.name.toLowerCase() === capability)
      );
    }

    return this.sortAgents(agents);
  }

  /**
   * List the canonical VOS roster in stable order.
   */
  listKnownAgents(): RegisteredAgent[] {
    return KNOWN_VOS_AGENT_IDS.map((id) => this.agents.get(id)).filter(
      (agent): agent is RegisteredAgent => Boolean(agent)
    );
  }

  /**
   * Find agents that have a specific capability.
   */
  findByCapability(capability: string): RegisteredAgent[] {
    const normalizedCapability = capability.toLowerCase();
    return this.sortAgents(
      Array.from(this.agents.values()).filter(
        (agent) =>
          agent.status !== 'offline' &&
          agent.capabilities.some(
            (candidate) => candidate.name.toLowerCase() === normalizedCapability
          )
      )
    );
  }

  /**
   * Get registry statistics.
   */
  stats(): AgentRegistryStats {
    const agents = Array.from(this.agents.values());
    const allCapabilities = new Set<string>();

    for (const agent of agents) {
      for (const capability of agent.capabilities) {
        allCapabilities.add(capability.name);
      }
    }

    const missingKnownAgents = KNOWN_VOS_AGENT_IDS.filter((id) => !this.agents.has(id));

    return {
      total: agents.length,
      online: agents.filter((agent) => agent.status === 'online').length,
      busy: agents.filter((agent) => agent.status === 'busy').length,
      idle: agents.filter((agent) => agent.status === 'idle').length,
      offline: agents.filter((agent) => agent.status === 'offline').length,
      capabilities: Array.from(allCapabilities).sort(),
      knownAgentsTotal: KNOWN_VOS_AGENT_IDS.length,
      knownAgentsPresent: KNOWN_VOS_AGENT_IDS.length - missingKnownAgents.length,
      missingKnownAgents,
      rosterComplete: missingKnownAgents.length === 0,
    };
  }

  /**
   * Public helper for route behavior/tests.
   */
  isKnownAgent(agentId: string): agentId is KnownVosAgentId {
    return Object.prototype.hasOwnProperty.call(KNOWN_VOS_AGENT_PROFILES, agentId);
  }

  private isAuthorizedSyncContext(context: TaskSyncContext): boolean {
    if (isValidSyncToken(context)) return true;
    return false;
  }

  private isValidAgentRef(agentRef: string): boolean {
    const normalized = agentRef.trim();
    return AGENT_REF_REGEX.test(normalized);
  }

  /**
   * Validate that an agent ref exists in the registry.
   * Used by task-service to reject invalid agent assignments on create/update.
   * Returns true if the ref matches a registered agent (by id or name).
   */
  validateAgentRef(agentRef: string): { valid: boolean; reason?: string } {
    if (!agentRef) return { valid: true };

    if (!this.isValidAgentRef(agentRef)) {
      return { valid: false, reason: `Malformed agent ref: ${agentRef}` };
    }

    const agent = this.findByRef(agentRef);
    if (!agent) {
      return { valid: false, reason: `Unknown agent ref: ${agentRef} — not found in registry` };
    }

    return { valid: true };
  }

  /**
   * Resolve an agent by id first, then by case-insensitive name.
   */
  private findByRef(agentRef: string): RegisteredAgent | null {
    const byId = this.agents.get(agentRef);
    if (byId) return byId;

    const normalized = agentRef.trim().toLowerCase();
    for (const agent of this.agents.values()) {
      if (agent.name.trim().toLowerCase() === normalized) {
        return agent;
      }
    }

    return null;
  }

  /**
   * Mark stale agents as offline and clear ghost task pointers.
   *
   * Exception: if authoritative task-sync has the agent marked busy on a linked
   * current task, preserve the busy/task truth here and let freshness be surfaced
   * separately at the cockpit/health layer. Reconciliation remains responsible
   * for clearing stale busy/task linkage when task truth no longer supports it.
   */
  private checkStaleAgents(): void {
    const now = Date.now();
    let changed = false;

    for (const current of this.agents.values()) {
      if (current.status === 'offline') continue;

      const lastBeat = new Date(current.lastHeartbeat).getTime();
      if (now - lastBeat > HEARTBEAT_TIMEOUT_MS) {
        if (current.status === 'busy' && current.currentTaskId) {
          log.debug(
            {
              agentId: current.id,
              lastHeartbeat: current.lastHeartbeat,
              currentTaskId: current.currentTaskId,
            },
            'Preserving busy task-linked agent despite stale heartbeat; freshness is surfaced separately'
          );
          continue;
        }

        const agent = this.sanitizeAgentState({
          ...current,
          status: 'offline',
          currentTaskId: undefined,
          currentTaskTitle: undefined,
        });
        this.agents.set(agent.id, agent);
        changed = true;
        log.info(
          { agentId: agent.id, lastHeartbeat: agent.lastHeartbeat },
          `Agent marked offline (heartbeat timeout): ${agent.id}`
        );
      }
    }

    if (changed) {
      this.persist();
    }
  }

  private startStaleCheck(): void {
    this.staleCheckInterval = setInterval(() => this.checkStaleAgents(), STALE_CHECK_INTERVAL_MS);
  }

  private migrateLegacyRegistry(): void {
    if (this.legacyFilePath === this.filePath) return;

    if (existsSync(this.legacyFilePath) && !existsSync(this.filePath)) {
      try {
        const dir = path.dirname(this.filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const data = readFileSync(this.legacyFilePath, 'utf-8');
        writeFileSync(this.filePath, data, 'utf-8');
        log.info(
          { from: this.legacyFilePath, to: this.filePath },
          'Migrated agent registry data to the runtime directory'
        );
      } catch (err) {
        log.warn({ err }, 'Failed to migrate legacy agent registry data');
      }
    }
  }

  /**
   * Load registry from disk and ensure the canonical VOS roster always exists.
   */
  private load(): void {
    let loadedData: AgentRegistryData | null = null;

    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        loadedData = JSON.parse(raw) as AgentRegistryData;
      }
    } catch (err) {
      log.warn({ err }, 'Could not load agent registry, rebuilding from canonical roster');
    }

    const nextAgents = new Map<string, RegisteredAgent>();

    for (const [id, rawAgent] of Object.entries(loadedData?.agents ?? {})) {
      nextAgents.set(id, this.hydrateAgent(rawAgent));
    }

    for (const knownAgentId of KNOWN_VOS_AGENT_IDS) {
      nextAgents.set(
        knownAgentId,
        this.hydrateKnownAgent(knownAgentId, nextAgents.get(knownAgentId))
      );
    }

    this.agents = nextAgents;
    this.persist();
    log.info({ count: this.agents.size }, 'Agent registry loaded with canonical roster');
  }

  private hydrateAgent(agent: RegisteredAgent): RegisteredAgent {
    if (this.isKnownAgent(agent.id)) {
      return this.hydrateKnownAgent(agent.id, agent);
    }
    return this.sanitizeAgentState({
      ...agent,
      capabilities: agent.capabilities ?? [],
      metadata: agent.metadata ? { ...agent.metadata } : undefined,
    });
  }

  private hydrateKnownAgent(
    agentId: KnownVosAgentId,
    existing?: Partial<RegisteredAgent>
  ): RegisteredAgent {
    const profile = KNOWN_VOS_AGENT_PROFILES[agentId];
    const now = new Date().toISOString();

    return this.sanitizeAgentState({
      id: profile.id,
      name: profile.name,
      model: existing?.model ?? profile.model,
      provider: existing?.provider ?? profile.provider,
      capabilities:
        existing?.capabilities && existing.capabilities.length > 0
          ? existing.capabilities
          : profile.capabilities.map((capability) => ({ ...capability })),
      version: existing?.version ?? profile.version,
      metadata: {
        ...profile.metadata,
        ...existing?.metadata,
      },
      status: existing?.status ?? 'offline',
      registeredAt: existing?.registeredAt ?? now,
      lastHeartbeat: existing?.lastHeartbeat ?? existing?.registeredAt ?? now,
      currentTaskId: existing?.currentTaskId,
      currentTaskTitle: existing?.currentTaskTitle,
      sessionKey: existing?.sessionKey,
    });
  }

  private sanitizeAgentState(agent: RegisteredAgent): RegisteredAgent {
    const sanitized: RegisteredAgent = {
      ...agent,
      capabilities: agent.capabilities ?? [],
      metadata: agent.metadata ? { ...agent.metadata } : undefined,
    };

    if (sanitized.status !== 'busy') {
      sanitized.currentTaskId = undefined;
      sanitized.currentTaskTitle = undefined;
    }

    if (!sanitized.currentTaskId) {
      sanitized.currentTaskTitle = undefined;
    }

    return sanitized;
  }

  private sortAgents(agents: RegisteredAgent[]): RegisteredAgent[] {
    const rank = new Map<string, number>(KNOWN_VOS_AGENT_IDS.map((id, index) => [id, index]));
    return [...agents].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.name.localeCompare(right.name);
    });
  }

  /**
   * Persist registry to disk.
   */
  private persist(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data: AgentRegistryData = {
        agents: Object.fromEntries(this.agents),
        lastUpdated: new Date().toISOString(),
      };

      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      log.warn({ err }, 'Failed to persist agent registry');
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
  }
}

// Singleton
let instance: AgentRegistryService | null = null;

export function getAgentRegistryService(): AgentRegistryService {
  if (!instance) {
    instance = new AgentRegistryService();
  }
  return instance;
}

export function disposeAgentRegistryService(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
