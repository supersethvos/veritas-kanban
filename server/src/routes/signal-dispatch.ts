/**
 * Signal Dispatch API Routes
 *
 * POST /api/signals/dispatch — Send a founder decision back to VOS agents
 *
 * 1. Updates the task state (unblock, add comment) so the board reflects the decision
 * 2. Forwards to the bridge at port 3211 so the agent gets the directive
 * 3. Logs as telemetry event for the cockpit signal feed
 */
import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError } from '../middleware/error-handler.js';
import { getTelemetryService } from '../services/telemetry-service.js';
import { getTaskService } from '../services/task-service.js';

const router: RouterType = Router();

const DispatchSchema = z.object({
  targetAgent: z.string().min(1, 'targetAgent is required'),
  action: z.enum(['approve', 'reject', 'nudge', 'escalate', 'reassign', 'acknowledge']),
  taskId: z.string().optional(),
  message: z.string().optional(),
});

const BRIDGE_URL = 'http://127.0.0.1:3211/veritas/signals';
const BRIDGE_TIMEOUT_MS = Math.max(Number(process.env.VERITAS_BRIDGE_TIMEOUT_MS ?? '1500'), 1);

type BridgeStatus = 'accepted' | 'rejected' | 'timeout' | 'unreachable';

function isBridgeTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError';
}

async function forwardDispatchToBridge(payload: z.infer<typeof DispatchSchema>): Promise<{
  bridgeAccepted: boolean;
  bridgeStatus: BridgeStatus;
}> {
  try {
    const bridgeResp = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });

    let bridgeResult: Record<string, unknown> | null = null;
    try {
      bridgeResult = (await bridgeResp.json()) as Record<string, unknown>;
    } catch {
      bridgeResult = null;
    }

    const bridgeAccepted =
      bridgeResp.ok && (bridgeResult?.ok === true || bridgeResult?.accepted === true);

    return {
      bridgeAccepted,
      bridgeStatus: bridgeAccepted ? 'accepted' : 'rejected',
    };
  } catch (err) {
    if (isBridgeTimeout(err)) {
      console.error('[SignalDispatch] Bridge timed out:', err);
      return { bridgeAccepted: false, bridgeStatus: 'timeout' };
    }

    console.error('[SignalDispatch] Bridge unreachable:', err);
    return { bridgeAccepted: false, bridgeStatus: 'unreachable' };
  }
}

/**
 * Apply the founder's decision to the task itself.
 * This is what makes the card disappear from the cockpit decision queue.
 *
 * Comments are added via updateTask({ comments: [...existing, newComment] })
 * since there's no separate addComment method on taskService.
 */
async function applyTaskAction(
  taskId: string,
  action: string,
  targetAgent: string,
  message?: string
): Promise<{ taskUpdated: boolean; error?: string }> {
  const taskService = getTaskService();

  try {
    const task = await taskService.getTask(taskId);
    if (!task) {
      return { taskUpdated: false, error: 'Task not found' };
    }

    const newComment = {
      id: `comment_dispatch_${Date.now()}`,
      author: 'founder',
      text: message || `Founder decision: ${action} (via cockpit)`,
      timestamp: new Date().toISOString(),
    };
    const comments = [...(task.comments || []), newComment];

    switch (action) {
      case 'approve': {
        // Unblock → move to in-progress (or todo if no agent)
        const nextStatus = task.agent ? 'in-progress' : 'todo';
        await taskService.updateTask(taskId, {
          status: nextStatus,
          blockedReason: null,
          comments,
        } as any);
        break;
      }

      case 'reject': {
        // Unblock → move to todo and preserve the comment trail
        await taskService.updateTask(taskId, {
          status: 'todo',
          blockedReason: null,
          comments,
        } as any);
        break;
      }

      case 'nudge': {
        // Keep status, just add comment so agent sees the nudge
        await taskService.updateTask(taskId, { comments } as any);
        break;
      }

      case 'escalate': {
        // Keep blocked but add escalation comment
        const escalationComment = {
          id: `comment_dispatch_${Date.now()}`,
          author: 'founder',
          text: message || 'ESCALATED by founder — requires immediate attention',
          timestamp: new Date().toISOString(),
        };
        const escalationComments = [...(task.comments || []), escalationComment];
        await taskService.updateTask(taskId, { comments: escalationComments } as any);
        break;
      }

      case 'reassign': {
        // Unblock → move to todo for reassignment
        await taskService.updateTask(taskId, {
          status: 'todo',
          blockedReason: null,
          agent: '',
          comments,
        } as any);
        break;
      }

      case 'acknowledge': {
        // Record founder acknowledgment without changing task status
        const ackComment = {
          id: `comment_dispatch_${Date.now()}`,
          author: 'founder',
          text: message || 'Acknowledged by founder',
          timestamp: new Date().toISOString(),
        };
        const ackComments = [...(task.comments || []), ackComment];
        await taskService.updateTask(taskId, { comments: ackComments } as any);
        break;
      }

      default:
        return { taskUpdated: false, error: `Unknown action: ${action}` };
    }

    console.log(`[SignalDispatch] Task ${taskId} updated: ${action} by founder for ${targetAgent}`);
    return { taskUpdated: true };
  } catch (err) {
    console.error(`[SignalDispatch] Failed to update task ${taskId}:`, err);
    return { taskUpdated: false, error: String(err) };
  }
}

// POST /api/signals/dispatch
router.post(
  '/dispatch',
  asyncHandler(async (req, res) => {
    let body;
    try {
      body = DispatchSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Validation failed', error.issues);
      }
      throw error;
    }

    // 1. Update the task so the board/cockpit reflect the decision immediately
    let taskUpdated = false;
    let taskError: string | undefined;
    if (body.taskId) {
      const result = await applyTaskAction(
        body.taskId,
        body.action,
        body.targetAgent,
        body.message
      );
      taskUpdated = result.taskUpdated;
      taskError = result.error;
    }

    // 2. Forward to bridge (so VOS agents get the directive) without blocking task truth
    const bridge = await forwardDispatchToBridge(body);

    // 3. Log as telemetry event
    try {
      const telemetry = getTelemetryService();
      await telemetry.emit({
        type: 'signal.generic',
        agent: 'cockpit',
        severity: 'info',
        summary: `You ${body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : body.action === 'nudge' ? 'nudged' : body.action === 'escalate' ? 'escalated' : body.action === 'acknowledge' ? 'acknowledged' : 'reassigned'} ${body.targetAgent}'s task${body.message ? `: ${body.message}` : ''}`,
        vosEventType: `cockpit.${body.action}`,
        taskId: body.taskId,
        payload: {
          bridgeStatus: bridge.bridgeStatus,
          bridgeAccepted: bridge.bridgeAccepted,
        },
      } as any);
    } catch {
      // Non-blocking
    }

    res.json({
      dispatched: true,
      taskUpdated,
      taskError,
      bridgeAccepted: bridge.bridgeAccepted,
      bridgeStatus: bridge.bridgeStatus,
      bridgeAttempted: true,
      action: body.action,
      targetAgent: body.targetAgent,
    });
  })
);

export { router as signalDispatchRoutes };
