import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/error-handler.js';

const serviceMock = {
  getExecutiveOverview: vi.fn(),
  getVentureCoverageView: vi.fn(),
  getCertificationPipeline: vi.fn(),
  getWorkflowDetail: vi.fn(),
};

vi.mock('../../services/founder-surface-service.js', () => ({
  getFounderSurfaceReadModelService: () => serviceMock,
}));

const { founderSurfaceRoutes } = await import('../../routes/founder-surface.js');

describe('founder-surface routes', () => {
  const overviewPayload = {
    primary_number: {
      label: 'Certified Autonomy Rate',
      rate: 0.5,
      percentage: 50,
      certified_workflow_count: 2,
      workflow_count: 4,
      updated_at: '2026-03-17T06:00:00.000Z',
    },
    venture_rates: [
      {
        venture_id: 'lab-vos-system',
        certified_autonomy_rate: 0.5,
        percentage: 50,
        certified_workflow_count: 1,
        workflow_count: 2,
        critical_path_certified_rate: 0.5,
        updated_at: '2026-03-17T06:00:00.000Z',
      },
    ],
    surface_state: {
      mode: 'attention_required',
      summary: '1 workflow has earned interruption.',
      earned_interruption: true,
      interruption_count: 1,
    },
    attention_items: [
      {
        attention_id: 'blocked_workflow:wf_1',
        kind: 'blocked_workflow',
        severity: 'attention',
        venture_id: 'lab-vos-system',
        workflow_id: 'wf_1',
        what: 'Founder workflow API',
        why: 'Policy gate is blocking promotion.',
        action: 'Inspect',
        recommended_action: 'Resolve the gate failure.',
        waiting_since: '2026-03-17T05:30:00.000Z',
        updated_at: '2026-03-17T06:00:00.000Z',
      },
    ],
    trust_gains: [],
    trust_degradations: [],
    human_review_burden: {
      none: 1,
      low: 1,
      moderate: 1,
      high: 1,
    },
    updated_at: '2026-03-17T06:00:00.000Z',
  };

  const venturePayload = {
    ventures: [
      {
        coverage: {
          venture_id: 'lab-vos-system',
          workflow_count: 2,
          critical_path_workflow_count: 1,
          certified_autonomous_count: 1,
          governed_copilot_count: 0,
          certifying_count: 1,
          human_native_count: 0,
          assisted_count: 0,
          under_review_count: 0,
          certified_autonomy_rate: 0.5,
          critical_path_certified_rate: 1,
          updated_at: '2026-03-17T06:00:00.000Z',
        },
        state_distribution: {
          human_native: 0,
          assisted: 0,
          governed_copilot: 0,
          certifying: 1,
          certified_autonomous: 1,
          under_review: 0,
        },
        critical_path: {
          workflow_count: 1,
          certified_rate: 1,
        },
        top_blockers: ['Resolve the policy gate'],
        top_degrading_workflows: [],
        recent_promotions: [],
        recent_decertifications: [],
      },
    ],
    updated_at: '2026-03-17T06:00:00.000Z',
  };

  const pipelinePayload = {
    certifying: [],
    ready_for_review: [],
    recently_certified: [],
    under_review: [],
    recently_decertified: [],
    updated_at: '2026-03-17T06:00:00.000Z',
  };

  const workflowDetailPayload = {
    workflow: {
      workflow_id: 'wf_1',
      name: 'Founder workflow API',
      venture_id: 'lab-vos-system',
      workflow_family: 'implementation',
      description: 'Expose founder-surface routes.',
      owner_agent: 'MAYA',
      critical_path: true,
      risk_class: 'high',
      data_class: 'B',
      state: 'certifying',
      status_reason: 'Strong evidence is ready for review.',
      success_criteria: ['Add routes', 'Ship tests'],
      created_at: '2026-03-17T01:00:00.000Z',
      updated_at: '2026-03-17T06:00:00.000Z',
    },
    evidence_bundle: {
      workflow_id: 'wf_1',
      window_start: '2026-03-17T01:00:00.000Z',
      window_end: '2026-03-17T06:00:00.000Z',
      run_count: 3,
      successful_run_count: 3,
      failed_run_count: 0,
      policy_pass_count: 3,
      policy_fail_count: 0,
      halt_pass_count: 3,
      halt_fail_count: 0,
      hidden_cleanup_incidents: 0,
      evidence_complete: true,
      updated_at: '2026-03-17T06:00:00.000Z',
    },
    certification: {
      workflow_id: 'wf_1',
      certification_status: 'ready_for_review',
      certification_reason: 'Evidence bundle is populated and ready for review.',
      review_required: true,
      last_evaluated_at: '2026-03-17T06:00:00.000Z',
    },
    readiness: {
      workflow_id: 'wf_1',
      readiness_label: 'near_ready',
      readiness_summary: 'Workflow is ready for human certification review.',
      temporary_blockers: ['Schedule review'],
      structural_limits: [],
      top_failure_signatures: [],
      human_review_burden: 'low',
      updated_at: '2026-03-17T06:00:00.000Z',
      recommended_next_action: 'Review the evidence bundle.',
    },
    recent_runs: [],
    founder_attention: [],
    updated_at: '2026-03-17T06:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/founder-surface', founderSurfaceRoutes);
    app.use(errorHandler);
    return app;
  }

  it('returns the executive overview payload', async () => {
    serviceMock.getExecutiveOverview.mockResolvedValue(overviewPayload);

    const response = await request(createApp()).get('/api/founder-surface/overview');

    expect(response.status).toBe(200);
    expect(serviceMock.getExecutiveOverview).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      primary_number: {
        label: 'Certified Autonomy Rate',
        percentage: 50,
      },
      surface_state: {
        mode: 'attention_required',
      },
      attention_items: [
        expect.objectContaining({
          what: 'Founder workflow API',
          why: 'Policy gate is blocking promotion.',
          action: 'Inspect',
        }),
      ],
    });
  });

  it('returns venture coverage payloads', async () => {
    serviceMock.getVentureCoverageView.mockResolvedValue(venturePayload);

    const response = await request(createApp()).get('/api/founder-surface/ventures');

    expect(response.status).toBe(200);
    expect(serviceMock.getVentureCoverageView).toHaveBeenCalledTimes(1);
    expect(response.body.ventures[0]).toMatchObject({
      coverage: {
        venture_id: 'lab-vos-system',
        certified_autonomy_rate: 0.5,
      },
      critical_path: {
        certified_rate: 1,
      },
    });
  });

  it('returns certification pipeline payloads', async () => {
    serviceMock.getCertificationPipeline.mockResolvedValue(pipelinePayload);

    const response = await request(createApp()).get('/api/founder-surface/pipeline');

    expect(response.status).toBe(200);
    expect(serviceMock.getCertificationPipeline).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({
      certifying: [],
      ready_for_review: [],
      recently_certified: [],
      under_review: [],
      recently_decertified: [],
    });
  });

  it('returns workflow detail payloads', async () => {
    serviceMock.getWorkflowDetail.mockResolvedValue(workflowDetailPayload);

    const response = await request(createApp()).get('/api/founder-surface/workflows/wf_1');

    expect(response.status).toBe(200);
    expect(serviceMock.getWorkflowDetail).toHaveBeenCalledWith('wf_1');
    expect(response.body).toMatchObject({
      workflow: {
        workflow_id: 'wf_1',
        name: 'Founder workflow API',
      },
      certification: {
        certification_status: 'ready_for_review',
      },
      readiness: {
        readiness_label: 'near_ready',
      },
    });
  });

  it('returns 404 when the workflow detail does not exist', async () => {
    serviceMock.getWorkflowDetail.mockResolvedValue(null);

    const response = await request(createApp()).get(
      '/api/founder-surface/workflows/missing-workflow'
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Founder workflow missing-workflow not found',
    });
  });
});
