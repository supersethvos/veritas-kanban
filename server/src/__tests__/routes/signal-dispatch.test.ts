import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/error-handler.js';

process.env.VERITAS_BRIDGE_TIMEOUT_MS = '20';

const getTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const emitMock = vi.fn();

vi.mock('../../services/task-service.js', () => ({
  getTaskService: () => ({
    getTask: getTaskMock,
    updateTask: updateTaskMock,
  }),
}));

vi.mock('../../services/telemetry-service.js', () => ({
  getTelemetryService: () => ({
    emit: emitMock,
  }),
}));

const { signalDispatchRoutes } = await import('../../routes/signal-dispatch.js');

describe('signal-dispatch route compatibility', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/signals', signalDispatchRoutes);
    app.use(errorHandler);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates task truth before returning a successful bridge dispatch', async () => {
    getTaskMock.mockResolvedValue({
      id: 'task_approve_1',
      status: 'blocked',
      agent: 'MAYA',
      comments: [],
    });
    updateTaskMock.mockResolvedValue({ id: 'task_approve_1' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, accepted: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).post('/api/signals/dispatch').send({
      targetAgent: 'MAYA',
      action: 'approve',
      taskId: 'task_approve_1',
      message: 'Ship it',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      dispatched: true,
      taskUpdated: true,
      bridgeAccepted: true,
      bridgeStatus: 'accepted',
      bridgeAttempted: true,
      action: 'approve',
      targetAgent: 'MAYA',
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      'task_approve_1',
      expect.objectContaining({
        status: 'in-progress',
        blockedReason: null,
        comments: [
          expect.objectContaining({
            author: 'founder',
            text: 'Ship it',
          }),
        ],
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3211/veritas/signals',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'signal.generic',
        taskId: 'task_approve_1',
        vosEventType: 'cockpit.approve',
        payload: expect.objectContaining({
          bridgeStatus: 'accepted',
          bridgeAccepted: true,
        }),
      })
    );
  });

  it('keeps founder task truth updates non-blocking when the bridge is unreachable', async () => {
    getTaskMock.mockResolvedValue({
      id: 'task_nudge_1',
      status: 'blocked',
      agent: 'MAYA',
      comments: [],
    });
    updateTaskMock.mockResolvedValue({ id: 'task_nudge_1' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const response = await request(app).post('/api/signals/dispatch').send({
      targetAgent: 'MAYA',
      action: 'nudge',
      taskId: 'task_nudge_1',
      message: 'Need an update',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      dispatched: true,
      taskUpdated: true,
      bridgeAccepted: false,
      bridgeStatus: 'unreachable',
      bridgeAttempted: true,
    });
    expect(updateTaskMock).toHaveBeenCalledWith(
      'task_nudge_1',
      expect.objectContaining({
        comments: [
          expect.objectContaining({
            author: 'founder',
            text: 'Need an update',
          }),
        ],
      })
    );
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vosEventType: 'cockpit.nudge',
        payload: expect.objectContaining({
          bridgeStatus: 'unreachable',
          bridgeAccepted: false,
        }),
      })
    );
  });

  it('times out bridge forwarding without blocking the task update path', async () => {
    getTaskMock.mockResolvedValue({
      id: 'task_timeout_1',
      status: 'blocked',
      agent: 'MAYA',
      comments: [],
    });
    updateTaskMock.mockResolvedValue({ id: 'task_timeout_1' });
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const timeoutError = new Error('bridge timed out');
            timeoutError.name = 'AbortError';
            reject(timeoutError);
          });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).post('/api/signals/dispatch').send({
      targetAgent: 'MAYA',
      action: 'approve',
      taskId: 'task_timeout_1',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      dispatched: true,
      taskUpdated: true,
      bridgeAccepted: false,
      bridgeStatus: 'timeout',
      bridgeAttempted: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateTaskMock).toHaveBeenCalledWith(
      'task_timeout_1',
      expect.objectContaining({
        status: 'in-progress',
      })
    );
  });

  it('reassign clears the current agent while still forwarding the directive', async () => {
    getTaskMock.mockResolvedValue({
      id: 'task_reassign_1',
      status: 'blocked',
      agent: 'MAYA',
      comments: [],
    });
    updateTaskMock.mockResolvedValue({ id: 'task_reassign_1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    );

    const response = await request(app).post('/api/signals/dispatch').send({
      targetAgent: 'MAYA',
      action: 'reassign',
      taskId: 'task_reassign_1',
      message: 'Route this elsewhere',
    });

    expect(response.status).toBe(200);
    expect(updateTaskMock).toHaveBeenCalledWith(
      'task_reassign_1',
      expect.objectContaining({
        status: 'todo',
        blockedReason: null,
        agent: '',
      })
    );
    expect(response.body.bridgeAccepted).toBe(true);
  });

  it('rejects invalid dispatch payloads', async () => {
    const response = await request(app).post('/api/signals/dispatch').send({
      action: 'approve',
    });

    expect(response.status).toBe(400);
    expect(updateTaskMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });
});
