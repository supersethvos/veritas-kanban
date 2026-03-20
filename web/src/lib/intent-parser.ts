import type { DispatchAction } from './dispatch-signal';

export interface FounderAction {
  verb: DispatchAction;
  taskId?: string;
  targetAgent?: string;
  workflowId?: string;
  message?: string;
}

/**
 * Rule-based intent parser.
 *
 * Recognizes the legal action vocabulary and maps freeform text
 * to structured FounderActions. Returns undefined if the input
 * doesn't match a known pattern.
 */

interface ParseContext {
  /** Known agent names for resolution */
  agentNames: string[];
  /** Known workflow names for resolution (not used in v1, placeholder) */
  workflowNames?: string[];
}

const VERB_MAP: Record<string, DispatchAction> = {
  approve: 'approve',
  accept: 'approve',
  unblock: 'approve',
  reject: 'reject',
  deny: 'reject',
  nudge: 'nudge',
  ping: 'nudge',
  poke: 'nudge',
  escalate: 'escalate',
  redirect: 'reassign',
  reassign: 'reassign',
  acknowledge: 'acknowledge',
  ack: 'acknowledge',
};

export function parseIntent(rawInput: string, context: ParseContext): FounderAction | undefined {
  const normalized = rawInput.trim().toLowerCase();
  if (!normalized) return undefined;

  // High-confidence: slash-command syntax ("/approve MAYA")
  const slashMatch = normalized.match(/^\/(\w+)\s*(.*)/);
  if (slashMatch) {
    const verb = VERB_MAP[slashMatch[1]];
    if (verb) {
      const rest = slashMatch[2].trim();
      const matchedAgent = context.agentNames.find((name) => rest.includes(name.toLowerCase()));
      return { verb, targetAgent: matchedAgent, message: rest || undefined };
    }
  }

  // Standard: verb must be the very first token with nothing before it
  const words = normalized.split(/\s+/);
  const firstWord = words[0];
  const verb = VERB_MAP[firstWord];
  if (!verb) return undefined;

  // Reject if the input looks like a sentence rather than a command
  // (e.g. "approve sounds good" vs "approve MAYA task-123")
  if (
    words.length > 1 &&
    !context.agentNames.some((name) => normalized.includes(name.toLowerCase()))
  ) {
    return undefined;
  }

  const rest = words.slice(1).join(' ');
  const matchedAgent = context.agentNames.find((name) => rest.includes(name.toLowerCase()));

  return {
    verb,
    targetAgent: matchedAgent,
    message: rest || undefined,
  };
}

export const LEGAL_VERBS = Object.keys(VERB_MAP);
