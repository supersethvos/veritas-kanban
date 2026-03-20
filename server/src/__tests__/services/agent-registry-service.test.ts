/**
 * Agent Registry Service Unit Tests
 *
 * Focused on the 8-agent registry truth foundation for Workstream A.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../storage/fs-helpers.js', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const {
  getAgentRegistryService,
  disposeAgentRegistryService,
  createTaskSyncToken,
  KNOWN_VOS_AGENT_IDS,
} = await import('../../services/agent-registry-service.js');

describe('AgentRegistryService', () => {
  beforeEach(() => {
    disposeAgentRegistryService();
    vi.useRealTimers();
  });

  afterEach(() => {
    disposeAgentRegistryService();
    vi.useRealTimers();
  });

  it('seeds the canonical 8-agent VOS roster offline with metadata', () => {
    const service = getAgentRegistryService();

    const agents = service.listKnownAgents();
    expect(agents.map((agent) => agent.id)).toEqual([...KNOWN_VOS_AGENT_IDS]);
    expect(agents).toHaveLength(8);

    for (const agent of agents) {
      expect(agent.status).toBe('offline');
      expect(agent.metadata).toMatchObject({
        role: expect.any(String),
        lane: expect.any(String),
        ventureScope: expect.any(String),
        source: expect.any(String),
        registrationMode: expect.any(String),
      });
    }
  });

  it('keeps canonical identity stable when a known agent registers', () => {
    const service = getAgentRegistryService();

    const maya = service.register({
      id: 'MAYA',
      name: 'Definitely Not Maya',
      metadata: { sessionLabel: 'eng-run-1' },
    });

    expect(maya.id).toBe('MAYA');
    expect(maya.name).toBe('MAYA');
    expect(maya.status).toBe('online');
    expect(maya.metadata).toMatchObject({
      role: 'engineering',
      lane: '#eng-*',
      ventureScope: 'vos-core',
      sessionLabel: 'eng-run-1',
    });
  });

  it('allows heartbeat to mark an agent offline and clears ghost task pointers', () => {
    const service = getAgentRegistryService();

    service.register({ id: 'MAYA', name: 'MAYA' });
    service.heartbeat('MAYA', {
      status: 'busy',
      currentTaskId: 'task_live_1',
      currentTaskTitle: 'Ship registry truth',
    });

    const offline = service.heartbeat('MAYA', { status: 'offline' });
    expect(offline).not.toBeNull();
    expect(offline?.status).toBe('offline');
    expect(offline?.currentTaskId).toBeUndefined();
    expect(offline?.currentTaskTitle).toBeUndefined();
  });

  it('lets task sync mark a known offline agent busy on in-progress work', () => {
    const service = getAgentRegistryService();

    const updated = service.syncFromTask(
      {
        agentRef: 'MAYA',
        taskId: 'task_20260316_iE6UXY',
        taskTitle: '8-agent registry integration',
        taskStatus: 'in-progress',
      },
      createTaskSyncToken('task-service')
    );

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('busy');
    expect(updated?.currentTaskId).toBe('task_20260316_iE6UXY');
    expect(updated?.currentTaskTitle).toBe('8-agent registry integration');
  });

  it('does not let idle heartbeats with blank task fields clobber authoritative busy task truth', () => {
    const service = getAgentRegistryService();

    service.syncFromTask(
      {
        agentRef: 'SETH-LEAD',
        taskId: 'task_live_truth',
        taskTitle: 'Live truth repair',
        taskStatus: 'in-progress',
      },
      createTaskSyncToken('task-service')
    );

    const preserved = service.heartbeat('SETH-LEAD', {
      status: 'idle',
      currentTaskId: '',
      currentTaskTitle: '',
      metadata: { source: 'veritas-openclaw-bridge' },
    });

    expect(preserved?.status).toBe('busy');
    expect(preserved?.currentTaskId).toBe('task_live_truth');
    expect(preserved?.currentTaskTitle).toBe('Live truth repair');
  });

  it('clears task pointers immediately when the same task completes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T08:00:00.000Z'));

    const service = getAgentRegistryService();
    service.syncFromTask(
      {
        agentRef: 'MAYA',
        taskId: 'task_registry_foundation',
        taskTitle: 'Registry foundation',
        taskStatus: 'in-progress',
      },
      createTaskSyncToken('task-service')
    );

    const cleared = service.syncFromTask(
      {
        agentRef: 'MAYA',
        taskId: 'task_registry_foundation',
        taskStatus: 'done',
      },
      createTaskSyncToken('task-service')
    );

    expect(cleared?.status).toBe('idle');
    expect(cleared?.currentTaskId).toBeUndefined();
    expect(cleared?.currentTaskTitle).toBeUndefined();
  });

  it('does not clobber a different current task on terminal sync', () => {
    const service = getAgentRegistryService();

    service.syncFromTask(
      {
        agentRef: 'MAYA',
        taskId: 'task_active',
        taskTitle: 'Active task',
        taskStatus: 'in-progress',
      },
      createTaskSyncToken('task-service')
    );

    const unchanged = service.syncFromTask(
      {
        agentRef: 'MAYA',
        taskId: 'task_old',
        taskStatus: 'done',
      },
      createTaskSyncToken('task-service')
    );

    expect(unchanged?.status).toBe('busy');
    expect(unchanged?.currentTaskId).toBe('task_active');
    expect(unchanged?.currentTaskTitle).toBe('Active task');
  });

  it('clears stale busy state when reconciliation no longer sees the task', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T09:00:00.000Z'));

    const service = getAgentRegistryService();
    service.syncFromTask(
      {
        agentRef: 'MAYA',
        taskId: 'task_missing_from_snapshot',
        taskStatus: 'in-progress',
      },
      createTaskSyncToken('task-service')
    );

    vi.setSystemTime(new Date('2026-03-17T09:00:11.000Z'));
    const changed = service.reconcileFromTasks([], createTaskSyncToken('task-reconciler'));

    expect(changed).toBe(1);
    expect(service.get('MAYA')?.status).toBe('idle');
    expect(service.get('MAYA')?.currentTaskId).toBeUndefined();
  });

  it('preserves busy task-linked agents when heartbeat goes stale so task truth remains visible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T10:00:00.000Z'));

    const service = getAgentRegistryService();
    service.register({ id: 'MAYA', name: 'MAYA' });
    service.heartbeat('MAYA', {
      status: 'busy',
      currentTaskId: 'task_stale_1',
      currentTaskTitle: 'Stale task',
    });

    vi.advanceTimersByTime(5 * 60 * 1000 + 61_000);

    const maya = service.get('MAYA');
    expect(maya?.status).toBe('busy');
    expect(maya?.currentTaskId).toBe('task_stale_1');
    expect(maya?.currentTaskTitle).toBe('Stale task');
  });

  it('auto-clears stale busy pointers once the linked task is terminal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T10:00:00.000Z'));

    const service = getAgentRegistryService();
    service.register({ id: 'MAYA', name: 'MAYA' });
    service.heartbeat('MAYA', {
      status: 'busy',
      currentTaskId: 'task_done_1',
      currentTaskTitle: 'Already closed task',
    });

    vi.advanceTimersByTime(5 * 60 * 1000 + 61_000);
    const changed = service.autoNormalizeStaleTerminalPointers([
      {
        id: 'task_done_1',
        title: 'Already closed task',
        status: 'done',
        agent: 'MAYA',
      },
    ]);

    expect(changed).toBe(1);
    expect(service.get('MAYA')).toMatchObject({
      status: 'offline',
    });
    expect(service.get('MAYA')?.currentTaskId).toBeUndefined();
    expect(service.get('MAYA')?.currentTaskTitle).toBeUndefined();
  });

  it('preserves stale busy pointers when the linked task is still in progress', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T10:00:00.000Z'));

    const service = getAgentRegistryService();
    service.register({ id: 'MAYA', name: 'MAYA' });
    service.heartbeat('MAYA', {
      status: 'busy',
      currentTaskId: 'task_live_1',
      currentTaskTitle: 'Still running',
    });

    vi.advanceTimersByTime(5 * 60 * 1000 + 61_000);
    const changed = service.autoNormalizeStaleTerminalPointers([
      {
        id: 'task_live_1',
        title: 'Still running',
        status: 'in-progress',
        agent: 'MAYA',
      },
    ]);

    expect(changed).toBe(0);
    expect(service.get('MAYA')).toMatchObject({
      status: 'busy',
      currentTaskId: 'task_live_1',
      currentTaskTitle: 'Still running',
    });
  });

  it('still marks stale non-task-linked agents offline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T10:30:00.000Z'));

    const service = getAgentRegistryService();
    service.register({ id: 'MAYA', name: 'MAYA' });
    service.heartbeat('MAYA', { status: 'idle' });

    vi.advanceTimersByTime(5 * 60 * 1000 + 61_000);

    const maya = service.get('MAYA');
    expect(maya?.status).toBe('offline');
    expect(maya?.currentTaskId).toBeUndefined();
    expect(maya?.currentTaskTitle).toBeUndefined();
  });

  it('resets canonical agents to offline roster entries on deregister', () => {
    const service = getAgentRegistryService();
    service.register({ id: 'MAYA', name: 'MAYA' });

    const removed = service.deregister('MAYA');

    expect(removed).toBe(true);
    expect(service.get('MAYA')).not.toBeNull();
    expect(service.get('MAYA')?.status).toBe('offline');
    expect(service.listKnownAgents()).toHaveLength(8);
  });

  it('removes noncanonical agents on deregister', () => {
    const service = getAgentRegistryService();
    service.register({ id: 'temp-agent', name: 'Temp Agent' });

    expect(service.deregister('temp-agent')).toBe(true);
    expect(service.get('temp-agent')).toBeNull();
  });

  it('reports complete roster coverage in stats', () => {
    const service = getAgentRegistryService();

    const stats = service.stats();
    expect(stats.knownAgentsTotal).toBe(8);
    expect(stats.knownAgentsPresent).toBe(8);
    expect(stats.missingKnownAgents).toEqual([]);
    expect(stats.rosterComplete).toBe(true);
    expect(stats.total).toBe(8);
    expect(stats.offline).toBe(8);
  });

  it('validates canonical ids and names as acceptable task agent refs', () => {
    const service = getAgentRegistryService();

    expect(service.validateAgentRef('MAYA')).toEqual({ valid: true });
    expect(service.validateAgentRef('Honey Badger')).toEqual({ valid: true });
    expect(service.validateAgentRef('bad/ref')).toEqual({
      valid: false,
      reason: 'Malformed agent ref: bad/ref',
    });
  });
});
