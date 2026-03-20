/**
 * Agent Registry Route Integration Tests
 *
 * Focused on the 8-agent registry truth foundation for Workstream A.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../middleware/error-handler.js';

vi.mock('../../storage/fs-helpers.js', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const { disposeAgentRegistryService } = await import('../../services/agent-registry-service.js');
const { agentRegistryRoutes } = await import('../../routes/agent-registry.js');

describe('Agent Registry Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    disposeAgentRegistryService();

    app = express();
    app.use(express.json());
    app.use('/api/agents/register', agentRegistryRoutes);
    app.use(errorHandler);
  });

  afterEach(() => {
    disposeAgentRegistryService();
  });

  it('returns the canonical 8-agent VOS roster', async () => {
    const res = await request(app).get('/api/agents/register/known');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.map((agent: { id: string }) => agent.id)).toEqual([
      'SETH-LEAD',
      'MAYA',
      'TAMMI',
      'HONEY-BADGER',
      'FINN',
      'VEGA',
      'ATLAS',
      'ROUX',
    ]);
    expect(res.body[0].status).toBe('offline');
    expect(res.body[1].metadata).toMatchObject({
      role: 'engineering',
      lane: '#eng-*',
      ventureScope: 'vos-core',
      source: expect.any(String),
      registrationMode: expect.any(String),
    });
  });

  it('lists all known agents by default without faking online status', async () => {
    const res = await request(app).get('/api/agents/register');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.every((agent: { status: string }) => agent.status === 'offline')).toBe(true);
  });

  it('registers a known agent while preserving canonical identity', async () => {
    const res = await request(app)
      .post('/api/agents/register')
      .send({
        id: 'MAYA',
        name: 'Spoofed Name',
        metadata: { sessionLabel: 'eng-thread' },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('MAYA');
    expect(res.body.name).toBe('MAYA');
    expect(res.body.status).toBe('online');
    expect(res.body.metadata).toMatchObject({
      role: 'engineering',
      lane: '#eng-*',
      sessionLabel: 'eng-thread',
    });
  });

  it('supports offline heartbeat updates and clears ghost task pointers', async () => {
    await request(app).post('/api/agents/register').send({ id: 'MAYA', name: 'MAYA' });

    await request(app).post('/api/agents/register/MAYA/heartbeat').send({
      status: 'busy',
      currentTaskId: 'task_live_1',
      currentTaskTitle: 'Doing the thing',
    });

    const res = await request(app)
      .post('/api/agents/register/MAYA/heartbeat')
      .send({ status: 'offline' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('offline');
    expect(res.body.currentTaskId).toBeUndefined();
    expect(res.body.currentTaskTitle).toBeUndefined();
  });

  it('filters offline known agents by status', async () => {
    const res = await request(app).get('/api/agents/register').query({ status: 'offline' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body[0].id).toBe('SETH-LEAD');
  });

  it('finds live agents by capability without returning offline-only seeds', async () => {
    await request(app).post('/api/agents/register').send({ id: 'MAYA', name: 'MAYA' });

    const res = await request(app).get('/api/agents/register/capabilities/automation');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('MAYA');
  });

  it('returns enriched stats with full roster coverage', async () => {
    const res = await request(app).get('/api/agents/register/stats');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 8,
      offline: 8,
      knownAgentsTotal: 8,
      knownAgentsPresent: 8,
      rosterComplete: true,
      missingKnownAgents: [],
    });
  });

  it('keeps known agents visible after delete by resetting them offline', async () => {
    await request(app).post('/api/agents/register').send({ id: 'MAYA', name: 'MAYA' });

    const del = await request(app).delete('/api/agents/register/MAYA');
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ removed: true, retainedAsKnownAgent: true });

    const get = await request(app).get('/api/agents/register/MAYA');
    expect(get.status).toBe(200);
    expect(get.body.status).toBe('offline');
    expect(get.body.currentTaskId).toBeUndefined();
  });

  it('removes noncanonical agents on delete', async () => {
    await request(app).post('/api/agents/register').send({ id: 'temp-agent', name: 'Temp Agent' });

    const del = await request(app).delete('/api/agents/register/temp-agent');
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ removed: true, retainedAsKnownAgent: false });

    const get = await request(app).get('/api/agents/register/temp-agent');
    expect(get.status).toBe(404);
  });

  it('returns 404 for unknown agent lookups', async () => {
    const res = await request(app).get('/api/agents/register/not-a-real-agent');
    expect(res.status).toBe(404);
  });
});
