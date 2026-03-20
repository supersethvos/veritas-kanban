/**
 * Cockpit API Routes
 *
 * GET /api/cockpit — Founder's single-pane-of-glass view
 *
 * Returns: decisionsNeeded, signalFeed, systemHealth, boardSnapshot
 */
import { Router, type Router as RouterType } from 'express';
import { getCockpitService } from '../services/cockpit-service.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router: RouterType = Router();

// GET /api/cockpit - Full cockpit view
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const cockpit = getCockpitService();
    const data = await cockpit.getCockpit();
    res.set('X-Veritas-Compatibility-Mode', data.compatibility.routeMode);
    res.json(data);
  })
);

export { router as cockpitRoutes };
