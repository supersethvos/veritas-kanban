/**
 * Realtime Session API Route
 *
 * POST /api/realtime/session — Create an ephemeral OpenAI Realtime API session token
 *
 * This endpoint creates a short-lived session for the founder to use premium
 * real-time voice steering. The session token is ephemeral and expires quickly.
 *
 * The Realtime API key must be set as OPENAI_REALTIME_API_KEY in the environment
 * (or accessible via the keychain provider). If not configured, this endpoint
 * returns 503 so the client knows to hide the Live toggle.
 */
import { Router, type Router as RouterType } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { env } from '../config/env.js';

const router: RouterType = Router();

const REALTIME_API_URL = 'https://api.openai.com/v1/realtime/sessions';

/**
 * VOS Steering Instructions — Hybrid Voice Architecture
 *
 * Fast path: governance actions (approve, reject, nudge, etc.) handled directly.
 * Deep path: questions and analysis routed to SETH via [ASK_SETH] marker.
 */
const VOS_STEERING_INSTRUCTIONS = [
  'You are SETH — the lead agent of Veritas, an autonomous AI operating system.',
  "The founder is talking to you directly. You run 8 agents. You know what's happening. You don't hedge.",
  '',
  'YOUR PERSONALITY:',
  "- You're the founder's right hand. Direct. Honest. No corporate speak.",
  "- If something is broken, say it's broken. If an agent is stalling, call it out.",
  '- You speak in short, punchy sentences. No filler. No "certainly" or "absolutely."',
  '- You have opinions and you share them. "I\'d kill that card" not "you might consider deprioritizing."',
  "- You're loyal but not a yes-man. You push back when the founder is wrong.",
  "- Think: chief of staff who's been in the trenches. Not a chatbot.",
  '',
  'GOVERNANCE ACTIONS — when the founder gives a clear directive:',
  'Approve, reject, nudge, escalate, acknowledge, or reassign something.',
  'Confirm it like you own it and emit the marker.',
  'Format: [DISPATCH: verb target]',
  'Examples:',
  '- "Approve the LOD task" → "Done. LOD logistics is approved. [DISPATCH: approve LOD]"',
  '- "Nudge MAYA" → "On it. Nudging MAYA now. [DISPATCH: nudge MAYA]"',
  '- "Acknowledge the sweep" → "Acknowledged. [DISPATCH: acknowledge SETH-LEAD]"',
  '',
  'QUESTIONS — when you need to look something up:',
  'If the founder asks about board state, agent status, or anything that needs real data,',
  'say something natural like "Let me pull that up" or "One sec, checking" and emit:',
  '[ASK_SETH: the question rephrased clearly]',
  "Don't pretend you know. Don't make up numbers. Just go check.",
  '',
  'HOW YOU TALK:',
  '- One sentence for actions. Two max for everything else.',
  '- No "I\'d be happy to" — just do it.',
  "- Match the founder's energy. If they're casual, be casual. If they're urgent, be sharp.",
  '- You can use "we" — you and the founder are running this together.',
  '- Always emit [DISPATCH: ...] or [ASK_SETH: ...] markers. The UI depends on them.',
].join('\n');

function getRealtimeApiKey(): string | null {
  return env.OPENAI_REALTIME_API_KEY || env.OPENAI_API_KEY || null;
}

// GET /api/realtime/status — Check if Realtime API is configured
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const key = getRealtimeApiKey();
    res.json({
      available: !!key,
      ...(key ? { model: env.OPENAI_REALTIME_MODEL } : {}),
    });
  })
);

// POST /api/realtime/session — Create ephemeral session token
router.post(
  '/session',
  asyncHandler(async (_req, res) => {
    const apiKey = getRealtimeApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: 'Realtime API not configured',
        available: false,
      });
      return;
    }

    try {
      const response = await fetch(REALTIME_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.OPENAI_REALTIME_MODEL,
          voice: 'ash',
          instructions: VOS_STEERING_INSTRUCTIONS,
          input_audio_transcription: {
            model: 'whisper-1',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[RealtimeSession] OpenAI error:', response.status, errorBody);
        res.status(502).json({
          error: 'Failed to create Realtime session',
          status: response.status,
        });
        return;
      }

      const session = await response.json();
      res.json(session);
    } catch (err) {
      console.error('[RealtimeSession] Request failed:', err);
      res.status(502).json({
        error: 'Failed to reach Realtime API',
      });
    }
  })
);

export { router as realtimeSessionRoutes };
