import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { getCockpitService } from '../services/cockpit-service.js';
import { getFounderSurfaceReadModelService } from '../services/founder-surface-service.js';
import { operatorInterventionService } from '../services/operator-intervention-service.js';
import { summarizeOperatorInterventionsForAtlas } from '../services/atlas-judgment-service.js';
import { computeGhostTimeMetrics } from '../services/ghost-time-metrics-service.js';

const router: RouterType = Router();

function getStringParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

router.get(
  '/review-surface',
  asyncHandler(async (_req, res) => {
    const founderSurface = getFounderSurfaceReadModelService();
    const cockpit = getCockpitService();
    const [overview, cockpitData, receipts] = await Promise.all([
      founderSurface.getExecutiveOverview(),
      cockpit.getCockpit(),
      operatorInterventionService.listReceipts(),
    ]);

    // Only count agents as degraded if they have expected activity but aren't responsive.
    // Idle/standby agents that are offline are normal — not degraded.
    const degradedAgentCount = cockpitData.systemHealth.agents.filter(
      (agent) =>
        (agent.activityState === 'active' || agent.activityState === 'done_unnormalized') &&
        agent.healthState !== 'fresh'
    ).length;

    const operatorLeverage = summarizeOperatorInterventionsForAtlas(receipts);

    res.json({
      overview,
      compatibility: cockpitData.compatibility,
      control_plane: {
        overall: cockpitData.systemHealth.overall,
        active_signal_count: cockpitData.systemHealth.activeSignalCount,
        active_agent_count: cockpitData.systemHealth.activeAgentCount,
        fresh_agent_count: cockpitData.systemHealth.freshAgentCount,
        total_agent_count: cockpitData.systemHealth.agents.length,
        degraded_agent_count: degradedAgentCount,
        latest_sweep: cockpitData.systemHealth.latestSweep ?? null,
      },
      operator_leverage: operatorLeverage,
      updated_at: overview.updated_at,
    });
  })
);

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const founderSurface = getFounderSurfaceReadModelService();
    res.json(await founderSurface.getExecutiveOverview());
  })
);

router.get(
  '/ventures',
  asyncHandler(async (_req, res) => {
    const founderSurface = getFounderSurfaceReadModelService();
    res.json(await founderSurface.getVentureCoverageView());
  })
);

router.get(
  '/pipeline',
  asyncHandler(async (_req, res) => {
    const founderSurface = getFounderSurfaceReadModelService();
    res.json(await founderSurface.getCertificationPipeline());
  })
);

router.get(
  '/agent-certification',
  asyncHandler(async (_req, res) => {
    const founderSurface = getFounderSurfaceReadModelService();
    res.json(await founderSurface.getAgentCertificationView());
  })
);

router.get(
  '/workflows/:workflowId',
  asyncHandler(async (req, res) => {
    const workflowId = getStringParam(req.params.workflowId);
    const founderSurface = getFounderSurfaceReadModelService();
    const detail = await founderSurface.getWorkflowDetail(workflowId);

    if (!detail) {
      throw new NotFoundError(`Founder workflow ${workflowId} not found`);
    }

    res.json(detail);
  })
);

// --- Domain Certification View ---

/**
 * Domain mapping derived from ROLE_CHARTERS_v1.md
 *
 * Each agent was created to fill a specific business function gap.
 * The domain names reflect how a founder thinks about their business,
 * not internal system terminology.
 *
 * SETH = Integrator / Chief of Staff → Strategy & Architecture
 * MAYA = Engineering Director → Engineering
 * TAMMI = Operations Controller → Operations
 * HONEY BADGER = Security Lead → Security
 * FINN = Finance / Capital Ops → Finance
 * VEGA = Growth / Revenue Ops → Growth
 * ATLAS = Data / Intelligence → Intelligence
 * ROUX = Creative Director → Creative
 */
const AGENT_TO_DOMAIN: Record<string, string> = {
  'SETH-LEAD': 'Strategy',
  MAYA: 'Engineering',
  TAMMI: 'Operations',
  'HONEY-BADGER': 'Security',
  FINN: 'Finance',
  VEGA: 'Growth',
  ATLAS: 'Intelligence',
  ROUX: 'Creative',
};

const EMPTY_STATE_DIST = {
  human_native: 0,
  assisted: 0,
  governed_copilot: 0,
  certifying: 0,
  certified_autonomous: 0,
  under_review: 0,
};

router.get(
  '/domains',
  asyncHandler(async (_req, res) => {
    const founderSurface = getFounderSurfaceReadModelService();
    const overview = await founderSurface.getExecutiveOverview();

    // Build domain aggregation from workflow data
    const domainMap = new Map<
      string,
      {
        domain: string;
        workflow_count: number;
        state_distribution: Record<string, number>;
      }
    >();

    // Initialize all 8 domains
    for (const domain of Object.values(AGENT_TO_DOMAIN)) {
      domainMap.set(domain, {
        domain,
        workflow_count: 0,
        state_distribution: { ...EMPTY_STATE_DIST },
      });
    }

    // Aggregate from venture rates (which contain per-workflow state data)
    // Use task-level data for agent → domain mapping
    const taskService = (await import('../services/task-service.js')).getTaskService();
    const tasks = await taskService.listTasks();

    for (const task of tasks) {
      const agent = task.agent || '';
      const domain = AGENT_TO_DOMAIN[agent] ?? AGENT_TO_DOMAIN[agent.toUpperCase()] ?? null;
      if (!domain) continue;

      const entry = domainMap.get(domain)!;
      entry.workflow_count += 1;

      // Map task status to workflow state approximation
      if (task.status === 'done') {
        // Check if review-approved → certified, otherwise governed_copilot
        const hasReview = task.review?.decision === 'approved';
        const hasDeliverable = (task.deliverables?.length ?? 0) > 0;
        if (hasReview && hasDeliverable) {
          entry.state_distribution.certified_autonomous += 1;
        } else {
          entry.state_distribution.governed_copilot += 1;
        }
      } else if (task.status === 'in-progress') {
        entry.state_distribution.governed_copilot += 1;
      } else if (task.status === 'blocked') {
        entry.state_distribution.under_review += 1;
      } else {
        entry.state_distribution.human_native += 1;
      }
    }

    // Show ALL 8 domains — zeros are information, not absence
    const domains = Array.from(domainMap.values())
      .map((d) => ({
        ...d,
        certified_rate:
          d.workflow_count > 0 ? d.state_distribution.certified_autonomous / d.workflow_count : 0,
      }))
      .sort((a, b) => b.certified_rate - a.certified_rate || b.workflow_count - a.workflow_count);

    res.json({
      domains,
      total_domains: domains.length,
      updated_at: overview.updated_at,
    });
  })
);

// --- Operator Intervention Receipts API ---

router.get(
  '/operator-interventions',
  asyncHandler(async (req, res) => {
    const agentId = getStringParam(req.query.agent_id as string) || undefined;
    const kind = getStringParam(req.query.kind as string) || undefined;
    const receipts = await operatorInterventionService.listReceipts({
      agent_id: agentId,
      kind: kind as any,
    });
    res.json({ receipts, total: receipts.length });
  })
);

router.get(
  '/operator-interventions/rollup',
  asyncHandler(async (req, res) => {
    const agentId = getStringParam(req.query.agent_id as string) || undefined;
    const receipts = await operatorInterventionService.listReceipts({ agent_id: agentId });
    const rollup = summarizeOperatorInterventionsForAtlas(receipts);
    res.json(rollup);
  })
);

router.get(
  '/ghost-time-metrics',
  asyncHandler(async (req, res) => {
    const since =
      getStringParam(req.query.since as string) ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const until = getStringParam(req.query.until as string) || undefined;
    const metrics = await computeGhostTimeMetrics(since, until);
    res.json(metrics);
  })
);

export { router as founderSurfaceRoutes };
