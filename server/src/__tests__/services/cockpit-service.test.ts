import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTasksMock = vi.fn();
const telemetryGetEventsMock = vi.fn();
const registryListMock = vi.fn();
const registryNormalizeStaleTerminalPointersMock = vi.fn();

vi.mock('../../services/task-service.js', () => ({
  getTaskService: () => ({
    listTasks: listTasksMock,
  }),
}));

vi.mock('../../services/telemetry-service.js', () => ({
  getTelemetryService: () => ({
    getEvents: telemetryGetEventsMock,
  }),
}));

vi.mock('../../services/agent-registry-service.js', () => ({
  getAgentRegistryService: () => ({
    list: registryListMock,
    autoNormalizeStaleTerminalPointers: registryNormalizeStaleTerminalPointersMock,
  }),
}));

const { getCockpitService } = await import('../../services/cockpit-service.js');

describe('cockpit-service control-plane compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns explicit compatibility metadata for the preserved cockpit route', async () => {
    listTasksMock.mockResolvedValue([]);
    registryListMock.mockReturnValue([]);
    telemetryGetEventsMock.mockResolvedValue([]);

    const data = await getCockpitService().getCockpit();

    expect(data.compatibility).toEqual({
      routeMode: 'control-plane-preserved',
      founderActionRoute: '/api/signals/dispatch',
      cockpitRoute: '/api/cockpit',
      founderSurfaceMigration: 'coexistence',
      signalFeedOrdering: 'newest-first',
    });
  });

  it('keeps the signal feed newest-first and preserves directive receipts in the feed', async () => {
    const receiptTs = new Date().toISOString();
    const healthTs = new Date(Date.now() - 60_000).toISOString();

    listTasksMock.mockResolvedValue([]);
    registryListMock.mockReturnValue([]);
    telemetryGetEventsMock.mockImplementation(async (options?: { limit?: number }) => {
      if (options?.limit === 50) {
        return [
          {
            id: 'evt_receipt_new',
            type: 'signal.directive_receipt',
            timestamp: receiptTs,
            agent: 'MAYA',
            severity: 'info',
            summary: 'Directive acknowledged.',
          } as any,
          {
            id: 'evt_health_old',
            type: 'signal.health',
            timestamp: healthTs,
            agent: 'SETH',
            severity: 'info',
            summary: 'Health sweep green.',
            healthClass: 'GREEN',
          } as any,
        ];
      }
      return [];
    });

    const data = await getCockpitService().getCockpit();

    expect(data.signalFeed).toHaveLength(2);
    expect(data.signalFeed[0]).toMatchObject({
      type: 'signal.directive_receipt',
      agent: 'MAYA',
      summary: 'Directive acknowledged.',
      timestamp: receiptTs,
    });
    expect(data.signalFeed[1]).toMatchObject({
      type: 'signal.health',
      timestamp: healthTs,
    });
  });

  it('surfaces blocked tasks and critical signals as founder decisions in priority order', async () => {
    listTasksMock.mockResolvedValue([
      {
        id: 'task_blocked_1',
        title: 'Bridge policy review',
        status: 'blocked',
        agent: 'MAYA',
        archived: false,
        created: '2026-03-17T04:00:00.000Z',
        updated: '2026-03-17T05:00:00.000Z',
        blockedReason: { category: 'policy', note: 'Needs founder override' },
      },
    ]);
    registryListMock.mockReturnValue([]);
    telemetryGetEventsMock.mockImplementation(async (options?: { limit?: number }) => {
      if (options?.limit === 100) {
        return [
          {
            id: 'evt_critical_1',
            type: 'signal.dispatch_blocked',
            timestamp: '2026-03-17T05:30:00.000Z',
            agent: 'MAYA',
            severity: 'critical',
            summary: 'Dispatch blocked by policy gate.',
            taskId: 'task_blocked_1',
          } as any,
        ];
      }
      return [];
    });

    const data = await getCockpitService().getCockpit();

    expect(data.decisionsNeeded).toHaveLength(2);
    expect(data.decisionsNeeded[0]).toMatchObject({
      source: 'signal',
      severity: 'critical',
      summary: 'Dispatch blocked by policy gate.',
    });
    expect(data.decisionsNeeded[1]).toMatchObject({
      source: 'task',
      severity: 'action_required',
      taskId: 'task_blocked_1',
      summary: 'policy: Needs founder override',
    });
  });

  it('returns a red control-plane health classification when live conditions degrade', async () => {
    const criticalSignalTs = new Date().toISOString();

    listTasksMock.mockResolvedValue([
      {
        id: 'task_a',
        title: 'A',
        status: 'blocked',
        archived: false,
        created: '2026-03-17T04:00:00.000Z',
        updated: '2026-03-17T04:10:00.000Z',
      },
      {
        id: 'task_b',
        title: 'B',
        status: 'blocked',
        archived: false,
        created: '2026-03-17T04:20:00.000Z',
        updated: '2026-03-17T04:30:00.000Z',
      },
      {
        id: 'task_c',
        title: 'C',
        status: 'blocked',
        archived: false,
        created: '2026-03-17T04:40:00.000Z',
        updated: '2026-03-17T04:50:00.000Z',
      },
    ]);
    registryListMock.mockReturnValue([
      {
        id: 'MAYA',
        name: 'MAYA',
        status: 'offline',
        registeredAt: '2026-03-17T04:00:00.000Z',
        lastHeartbeat: '2026-03-17T04:00:00.000Z',
        metadata: { lane: '#eng-dev-factory' },
      },
      {
        id: 'ATLAS',
        name: 'ATLAS',
        status: 'offline',
        registeredAt: '2026-03-17T04:00:00.000Z',
        lastHeartbeat: '2026-03-17T04:00:00.000Z',
        metadata: { lane: '#intel-atlas' },
      },
    ]);
    telemetryGetEventsMock.mockImplementation(
      async (options?: { type?: string | string[]; limit?: number }) => {
        if (options?.limit === 1) {
          return [
            {
              id: 'evt_health_red',
              type: 'signal.health',
              timestamp: '2026-03-17T05:55:00.000Z',
              agent: 'TAMMI',
              severity: 'action_required',
              summary: 'Health sweep degraded.',
              healthClass: 'RED',
            } as any,
          ];
        }
        if (options?.limit === 200) {
          return [
            {
              id: 'evt_critical_signal',
              type: 'signal.dispatch_blocked',
              timestamp: criticalSignalTs,
              agent: 'MAYA',
              severity: 'critical',
              summary: 'Dispatch blocked.',
            } as any,
          ];
        }
        return [];
      }
    );

    const data = await getCockpitService().getCockpit();

    expect(data.systemHealth).toMatchObject({
      overall: 'RED',
      blockedCount: 3,
      activeSignalCount: 1,
      latestSweep: {
        healthClass: 'RED',
      },
    });
    expect(data.systemHealth.agents).toHaveLength(2);
    expect(data.systemHealth.agents.every((agent) => agent.status === 'offline')).toBe(true);
  });

  it('degrades honestly when telemetry is unavailable but still returns board truth', async () => {
    listTasksMock.mockResolvedValue([
      {
        id: 'task_todo_1',
        title: 'Keep the board visible',
        status: 'todo',
        archived: false,
        created: '2026-03-17T04:00:00.000Z',
        updated: '2026-03-17T04:00:00.000Z',
      },
      {
        id: 'task_done_1',
        title: 'Already closed',
        status: 'done',
        archived: false,
        created: '2026-03-17T04:10:00.000Z',
        updated: '2026-03-17T04:20:00.000Z',
      },
      {
        id: 'task_archived_1',
        title: 'Old archived work',
        status: 'done',
        archived: true,
        created: '2026-03-16T04:10:00.000Z',
        updated: '2026-03-16T04:20:00.000Z',
      },
    ]);
    registryListMock.mockReturnValue([]);
    telemetryGetEventsMock.mockRejectedValue(new Error('telemetry unavailable'));

    const data = await getCockpitService().getCockpit();

    expect(data.signalFeed).toEqual([]);
    expect(data.decisionsNeeded).toEqual([]);
    expect(data.boardSnapshot).toEqual({
      todo: 1,
      inProgress: 0,
      blocked: 0,
      done: 1,
      review: 0,
      total: 2,
      completionTruth: {
        verified: 0,
        atRisk: 1,
        pending: 1,
        doneVerified: 0,
        doneAtRisk: 1,
        donePending: 0,
      },
      completedTasks: [
        expect.objectContaining({
          taskId: 'task_done_1',
          completionTruth: expect.objectContaining({
            state: 'at_risk',
            channel: expect.objectContaining({ state: 'at_risk' }),
          }),
        }),
      ],
    });
    expect(data.systemHealth.blockedCount).toBe(0);
    expect(data.generatedAt).toBeTypeOf('string');
  });

  it('exposes completion truth so done work is visibly verified vs at-risk', async () => {
    listTasksMock.mockResolvedValue([
      {
        id: 'task_done_verified',
        title: 'Verified completion overlay',
        status: 'done',
        archived: false,
        created: '2026-03-17T04:00:00.000Z',
        updated: '2026-03-17T04:20:00.000Z',
        verificationSteps: [{ id: 'verify_1', description: 'checked', checked: true }],
        deliverables: [
          {
            id: 'deliverable_verified',
            title: 'Verification note',
            type: 'document',
            status: 'accepted',
            created: '2026-03-17T04:15:00.000Z',
            path: '/tmp/verification-note.md',
          },
        ],
      },
      {
        id: 'task_done_at_risk',
        title: 'Done without channel truth',
        status: 'done',
        archived: false,
        created: '2026-03-17T04:30:00.000Z',
        updated: '2026-03-17T04:40:00.000Z',
        verificationSteps: [{ id: 'verify_2', description: 'checked', checked: true }],
        deliverables: [
          {
            id: 'deliverable_risky',
            title: 'Risk note',
            type: 'document',
            status: 'accepted',
            created: '2026-03-17T04:35:00.000Z',
            path: '/tmp/risk-note.md',
          },
        ],
      },
    ]);
    registryListMock.mockReturnValue([]);
    telemetryGetEventsMock.mockImplementation(
      async (options?: { limit?: number; type?: string | string[] }) => {
        if (options?.limit === 500 && options?.type === 'signal.completion') {
          return [
            {
              id: 'evt_completion_verified',
              type: 'signal.completion',
              timestamp: '2026-03-17T04:21:00.000Z',
              taskId: 'task_done_verified',
              agent: 'MAYA',
              severity: 'info',
              summary: 'Completion truth reconciled.',
              classification: 'PASS',
              missingSurfaces: [],
            } as any,
          ];
        }
        return [];
      }
    );

    const data = await getCockpitService().getCockpit();

    expect(data.boardSnapshot.completionTruth).toEqual({
      verified: 1,
      atRisk: 1,
      pending: 0,
      doneVerified: 1,
      doneAtRisk: 1,
      donePending: 0,
    });
    expect(data.boardSnapshot.completedTasks).toEqual([
      expect.objectContaining({
        taskId: 'task_done_at_risk',
        completionTruth: expect.objectContaining({
          state: 'at_risk',
          channel: expect.objectContaining({ state: 'at_risk' }),
        }),
      }),
      expect.objectContaining({
        taskId: 'task_done_verified',
        completionTruth: expect.objectContaining({
          state: 'verified',
          channel: expect.objectContaining({ state: 'verified' }),
        }),
      }),
    ]);
  });

  it('separates active work truth from stale/offline transport health', async () => {
    listTasksMock.mockResolvedValue([
      {
        id: 'task_live_founder_api',
        title: 'Founder API slice in flight',
        status: 'in-progress',
        agent: 'MAYA',
        plan: '1. Wire route\n2. Run typecheck\n3. Verify tests',
        automation: {
          sessionKey: 'agent:maya:subagent:abc123',
          spawnedAt: '2026-03-17T05:50:00.000Z',
        },
        archived: false,
        created: '2026-03-17T05:50:00.000Z',
        updated: '2026-03-17T05:58:00.000Z',
      },
    ]);
    registryListMock.mockReturnValue([
      {
        id: 'MAYA',
        name: 'MAYA',
        status: 'offline',
        registeredAt: '2026-03-17T04:00:00.000Z',
        lastHeartbeat: '2026-03-17T04:00:00.000Z',
        currentTaskId: 'task_live_founder_api',
        currentTaskTitle: 'Founder API slice in flight',
        metadata: { lane: '#eng-dev-factory' },
      },
    ]);
    telemetryGetEventsMock.mockResolvedValue([]);

    const data = await getCockpitService().getCockpit();
    const maya = data.systemHealth.agents[0];

    expect(maya).toMatchObject({
      id: 'MAYA',
      status: 'offline',
      activityState: 'active',
      activityReason: 'in-progress task truth',
      healthState: 'offline',
      stale: true,
      currentTaskId: 'task_live_founder_api',
      currentTaskTitle: 'Founder API slice in flight',
      hasAck: false,
      hasPlan: true,
      hasEta: false,
      hasRunId: true,
      handoffOverdue: true,
    });
    expect(maya.missingFields).toEqual(['ackAt', 'eta']);
    expect(data.systemHealth.activeAgentCount).toBe(1);
    expect(data.systemHealth.freshAgentCount).toBe(0);
  });

  it('auto-normalizes stale terminal task pointers before surfacing cockpit activity truth', async () => {
    const registryAgents = [
      {
        id: 'MAYA',
        name: 'MAYA',
        status: 'busy',
        registeredAt: '2026-03-17T04:00:00.000Z',
        lastHeartbeat: '2026-03-17T04:00:00.000Z',
        currentTaskId: 'task_done_ghost',
        currentTaskTitle: 'Closed work that should not stay live',
        metadata: { lane: '#eng-dev-factory' },
      },
    ];

    listTasksMock.mockResolvedValue([
      {
        id: 'task_done_ghost',
        title: 'Closed work that should not stay live',
        status: 'done',
        agent: 'MAYA',
        archived: false,
        created: '2026-03-17T05:00:00.000Z',
        updated: '2026-03-17T05:10:00.000Z',
      },
    ]);
    registryListMock.mockImplementation(() => registryAgents as any);
    registryNormalizeStaleTerminalPointersMock.mockImplementation(() => {
      registryAgents[0] = {
        ...registryAgents[0],
        status: 'offline',
        currentTaskId: undefined,
        currentTaskTitle: undefined,
      } as any;
      return 1;
    });
    telemetryGetEventsMock.mockResolvedValue([]);

    const data = await getCockpitService().getCockpit();
    const maya = data.systemHealth.agents[0];

    expect(registryNormalizeStaleTerminalPointersMock).toHaveBeenCalledWith([
      {
        id: 'task_done_ghost',
        title: 'Closed work that should not stay live',
        status: 'done',
        agent: 'MAYA',
      },
    ]);
    expect(maya).toMatchObject({
      id: 'MAYA',
      status: 'offline',
      activityState: 'idle',
      activityReason: 'no active work but transport is offline',
      healthState: 'offline',
      currentTaskId: undefined,
      currentTaskTitle: undefined,
    });
  });

  it('surfaces blocked work timing and blocker class in preserved cockpit truth', async () => {
    listTasksMock.mockResolvedValue([
      {
        id: 'task_blocked_feedback',
        title: 'Waiting on founder feedback',
        status: 'blocked',
        agent: 'MAYA',
        archived: false,
        created: '2026-03-17T05:00:00.000Z',
        updated: '2026-03-17T05:15:00.000Z',
        blockedReason: {
          category: 'waiting-on-feedback',
          note: 'Need founder answer on policy edge',
        },
      },
    ]);
    registryListMock.mockReturnValue([
      {
        id: 'MAYA',
        name: 'MAYA',
        status: 'online',
        registeredAt: '2026-03-17T04:00:00.000Z',
        lastHeartbeat: new Date().toISOString(),
        metadata: { lane: '#eng-dev-factory' },
      },
    ]);
    telemetryGetEventsMock.mockResolvedValue([]);

    const data = await getCockpitService().getCockpit();
    const blockedDecision = data.decisionsNeeded.find(
      (decision) => decision.taskId === 'task_blocked_feedback'
    );
    const maya = data.systemHealth.agents[0];

    expect(blockedDecision).toMatchObject({
      source: 'task',
      blockerClass: 'soft',
      blockedSince: '2026-03-17T05:15:00.000Z',
    });
    expect(blockedDecision?.blockedMinutes).toBeGreaterThanOrEqual(0);
    expect(maya).toMatchObject({
      currentTaskId: 'task_blocked_feedback',
      blockedSince: '2026-03-17T05:15:00.000Z',
      blockerClass: 'soft',
      activityState: 'idle',
      activityReason: 'blocked task truth',
    });
    expect(maya.blockedMinutes).toBeGreaterThanOrEqual(0);
  });

  it('treats recent bridge webhook activity as active even without a bound task', async () => {
    const webhookAt = new Date().toISOString();

    listTasksMock.mockResolvedValue([]);
    registryListMock.mockReturnValue([
      {
        id: 'SETH-LEAD',
        name: 'SETH Lead',
        status: 'idle',
        registeredAt: '2026-03-17T04:00:00.000Z',
        lastHeartbeat: '2026-03-17T05:59:00.000Z',
        metadata: {
          lane: 'global',
          bridgeLastWebhookAt: webhookAt,
        },
      },
    ]);
    telemetryGetEventsMock.mockResolvedValue([]);

    const data = await getCockpitService().getCockpit();
    const seth = data.systemHealth.agents[0];

    expect(seth).toMatchObject({
      id: 'SETH-LEAD',
      activityState: 'active',
      activityReason: 'recent bridge webhook',
      healthState: 'stale',
      lastActivityAt: webhookAt,
    });
  });

  it('filters stale or already-resolved signal noise out of decisions and feed', async () => {
    listTasksMock.mockResolvedValue([
      {
        id: 'task_done_1',
        title: 'Already closed cleanly',
        status: 'done',
        archived: false,
        created: '2026-03-17T04:00:00.000Z',
        updated: '2026-03-17T06:00:00.000Z',
      },
    ]);
    registryListMock.mockReturnValue([]);
    telemetryGetEventsMock.mockImplementation(
      async (options?: { limit?: number; type?: string | string[] }) => {
        if (options?.limit === 50) {
          return [
            {
              id: 'evt_resolved_block',
              type: 'signal.dispatch_blocked',
              timestamp: '2026-03-17T05:30:00.000Z',
              agent: 'MAYA',
              severity: 'action_required',
              summary: 'Dispatch blocked earlier.',
              taskId: 'task_done_1',
            } as any,
            {
              id: 'evt_recent_info',
              type: 'signal.generic',
              timestamp: new Date().toISOString(),
              agent: 'cockpit',
              severity: 'info',
              summary: 'Recent founder note.',
            } as any,
            {
              id: 'evt_recent_info_dup',
              type: 'signal.generic',
              timestamp: new Date().toISOString(),
              agent: 'cockpit',
              severity: 'info',
              summary: 'Recent founder note.',
            } as any,
          ];
        }
        if (options?.limit === 100) {
          return [
            {
              id: 'evt_old_unlinked_block',
              type: 'signal.dispatch_blocked',
              timestamp: '2026-03-16T20:16:18.786Z',
              agent: 'dispatch-quality-gate',
              severity: 'action_required',
              summary: 'Old dispatch block',
            } as any,
            {
              id: 'evt_resolved_decision',
              type: 'signal.dispatch_blocked',
              timestamp: '2026-03-17T05:30:00.000Z',
              agent: 'MAYA',
              severity: 'critical',
              summary: 'Dispatch blocked earlier.',
              taskId: 'task_done_1',
            } as any,
          ];
        }
        if (options?.limit === 200) {
          return [
            {
              id: 'evt_old_unlinked_block',
              type: 'signal.dispatch_blocked',
              timestamp: '2026-03-16T20:16:18.786Z',
              agent: 'dispatch-quality-gate',
              severity: 'action_required',
              summary: 'Old dispatch block',
            } as any,
            {
              id: 'evt_resolved_decision',
              type: 'signal.dispatch_blocked',
              timestamp: '2026-03-17T05:30:00.000Z',
              agent: 'MAYA',
              severity: 'critical',
              summary: 'Dispatch blocked earlier.',
              taskId: 'task_done_1',
            } as any,
          ];
        }
        return [];
      }
    );

    const data = await getCockpitService().getCockpit();

    expect(data.decisionsNeeded).toEqual([]);
    expect(data.signalFeed).toHaveLength(1);
    expect(data.signalFeed[0]).toMatchObject({
      type: 'signal.generic',
      summary: 'Recent founder note.',
    });
    expect(data.systemHealth.activeSignalCount).toBe(0);
  });
});
