import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { errorHandler } from '../../middleware/error-handler.js';

let app: express.Express;
let testRoot: string;

let taskRoutes: typeof import('../../routes/tasks.js').taskRoutes;
let telemetryRouter: typeof import('../../routes/telemetry.js').default;
let disposeTaskService: typeof import('../../services/task-service.js').disposeTaskService;
let getTaskService: typeof import('../../services/task-service.js').getTaskService;
let disposeAgentRegistryService: typeof import('../../services/agent-registry-service.js').disposeAgentRegistryService;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function unwrap<T>(body: any): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

describe('Truthful progress event ingestion via POST /api/telemetry/events', () => {
  beforeAll(async () => {
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    testRoot = path.join(os.tmpdir(), `veritas-telemetry-progress-${uniqueSuffix}`);
    await fs.mkdir(testRoot, { recursive: true });

    // Isolate all storage for this test file.
    process.env.VERITAS_DATA_DIR = testRoot;
    process.env.DATA_DIR = testRoot;

    ({ taskRoutes } = await import('../../routes/tasks.js'));
    ({ default: telemetryRouter } = await import('../../routes/telemetry.js'));
    ({ disposeTaskService, getTaskService } = await import('../../services/task-service.js'));
    ({ disposeAgentRegistryService } = await import('../../services/agent-registry-service.js'));

    app = express();
    app.use(express.json());
    app.use('/api/tasks', taskRoutes);
    app.use('/api/telemetry', telemetryRouter);
    app.use(errorHandler);
  });

  afterAll(async () => {
    disposeTaskService();
    disposeAgentRegistryService();
    await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('run.started transitions a todo task to in-progress and records agent observation', async () => {
    // 1) Create a task in todo status
    const created = await request(app).post('/api/tasks').send({
      title: 'Telemetry progress test — run.started',
      type: 'code',
      priority: 'high',
    });
    expect(created.status).toBe(201);
    const task = unwrap<{ id: string; status: string }>(created.body);
    expect(task.status).toBe('todo');

    // 2) POST a run.started telemetry event for this task
    const telemetryRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.started',
      taskId: task.id,
      agent: 'claude-code',
      model: 'claude-opus-4',
      sessionKey: 'test-session-001',
    });
    expect(telemetryRes.status).toBe(201);

    // Allow async side-effect to settle
    await wait(300);

    // 3) Verify task is now in-progress with observation
    const taskService = getTaskService();
    const updated = await taskService.getTask(task.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('in-progress');
    expect(updated!.observations).toBeDefined();
    expect(updated!.observations!.length).toBeGreaterThanOrEqual(1);

    const obs = updated!.observations!.find((o) => o.content.includes('Run started'));
    expect(obs).toBeDefined();
    expect(obs!.content).toContain('claude-code');
    expect(obs!.content).toContain('claude-opus-4');
    expect(obs!.content).toContain('test-session-001');
    expect(obs!.agent).toBe('claude-code');
    expect(obs!.type).toBe('context');
  });

  it('run.started does not transition already in-progress task', async () => {
    const created = await request(app).post('/api/tasks').send({
      title: 'Telemetry progress test — already in-progress',
      type: 'code',
      priority: 'medium',
    });
    const task = unwrap<{ id: string }>(created.body);

    // Move to in-progress first
    await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'in-progress' });

    // Send run.started — should NOT error, just add observation
    const telemetryRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.started',
      taskId: task.id,
      agent: 'gemini',
    });
    expect(telemetryRes.status).toBe(201);

    await wait(300);

    const taskService = getTaskService();
    const updated = await taskService.getTask(task.id);
    expect(updated!.status).toBe('in-progress');
    // Observation should still be recorded
    const obs = updated!.observations!.find((o) => o.content.includes('gemini'));
    expect(obs).toBeDefined();
  });

  it('run.completed with success records insight observation', async () => {
    // Create task and move to in-progress
    const created = await request(app).post('/api/tasks').send({
      title: 'Telemetry progress test — run.completed success',
      type: 'code',
      priority: 'medium',
    });
    const task = unwrap<{ id: string }>(created.body);

    await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'in-progress' });

    // POST run.completed
    const telemetryRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.completed',
      taskId: task.id,
      agent: 'claude-code',
      success: true,
      durationMs: 45000,
    });
    expect(telemetryRes.status).toBe(201);

    await wait(300);

    const taskService = getTaskService();
    const updated = await taskService.getTask(task.id);
    const obs = updated!.observations!.find((o) => o.content.includes('Run completed'));
    expect(obs).toBeDefined();
    expect(obs!.type).toBe('insight');
    expect(obs!.content).toContain('successfully');
    expect(obs!.content).toContain('45s');
    expect(obs!.agent).toBe('claude-code');
  });

  it('run.completed with failure records blocker observation', async () => {
    const created = await request(app).post('/api/tasks').send({
      title: 'Telemetry progress test — run.completed failure',
      type: 'code',
      priority: 'medium',
    });
    const task = unwrap<{ id: string }>(created.body);

    await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'in-progress' });

    const telemetryRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.completed',
      taskId: task.id,
      agent: 'claude-code',
      success: false,
      error: 'Build failed: missing dependency',
    });
    expect(telemetryRes.status).toBe(201);

    await wait(300);

    const taskService = getTaskService();
    const updated = await taskService.getTask(task.id);
    const obs = updated!.observations!.find((o) => o.content.includes('with failure'));
    expect(obs).toBeDefined();
    expect(obs!.type).toBe('blocker');
    expect(obs!.content).toContain('Build failed: missing dependency');
    expect(obs!.agent).toBe('claude-code');
  });

  it('run.error records blocker observation with error detail', async () => {
    const created = await request(app).post('/api/tasks').send({
      title: 'Telemetry progress test — run.error',
      type: 'code',
      priority: 'high',
    });
    const task = unwrap<{ id: string }>(created.body);

    await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'in-progress' });

    const telemetryRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.error',
      taskId: task.id,
      agent: 'veritas',
      error: 'OOM: container exceeded 4GB memory limit',
    });
    expect(telemetryRes.status).toBe(201);

    await wait(300);

    const taskService = getTaskService();
    const updated = await taskService.getTask(task.id);
    const obs = updated!.observations!.find((o) => o.content.includes('Run error'));
    expect(obs).toBeDefined();
    expect(obs!.type).toBe('blocker');
    expect(obs!.content).toContain('OOM: container exceeded 4GB memory limit');
    expect(obs!.content).toContain('veritas');
    expect(obs!.score).toBe(8);
  });

  it('progress event for non-existent task returns 201 (event stored) but no task side-effect', async () => {
    const telemetryRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.started',
      taskId: 'task_99991231_ZZZZZZ',
      agent: 'claude-code',
    });
    // Event is still stored in telemetry — 201
    expect(telemetryRes.status).toBe(201);
  });

  it('auditable linkage chain: event → observation → agent is preserved end-to-end', async () => {
    // Create task, send run.started, then run.completed, verify full chain
    const created = await request(app).post('/api/tasks').send({
      title: 'Telemetry progress test — full linkage chain',
      type: 'feature',
      priority: 'high',
    });
    expect(created.status).toBe(201);
    const task = unwrap<{ id: string }>(created.body);

    // run.started
    const startRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.started',
      taskId: task.id,
      agent: 'claude-code',
      model: 'claude-opus-4',
    });
    expect(startRes.status).toBe(201);

    await wait(400);

    // run.completed
    const completeRes = await request(app).post('/api/telemetry/events').send({
      type: 'run.completed',
      taskId: task.id,
      agent: 'claude-code',
      success: true,
      durationMs: 120000,
    });
    expect(completeRes.status).toBe(201);

    await wait(400);

    // Verify task has both observations in order
    const taskService = getTaskService();
    const updated = await taskService.getTask(task.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('in-progress');
    expect(updated!.observations).toBeDefined();
    expect(updated!.observations!.length).toBeGreaterThanOrEqual(2);

    const startObs = updated!.observations!.find((o) => o.content.includes('Run started'));
    const completeObs = updated!.observations!.find((o) => o.content.includes('Run completed'));

    expect(startObs).toBeDefined();
    expect(completeObs).toBeDefined();

    // Both link back to same agent
    expect(startObs!.agent).toBe('claude-code');
    expect(completeObs!.agent).toBe('claude-code');

    // Telemetry events also exist for this task
    const telemetryRes = await request(app).get(
      `/api/telemetry/events?taskId=${task.id}&type=run.started,run.completed`
    );
    expect(telemetryRes.status).toBe(200);
    const events = telemetryRes.body;
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});
