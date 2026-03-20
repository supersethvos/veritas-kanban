/**
 * Realtime Voice API client
 *
 * Manages ephemeral token creation and status checks for the
 * OpenAI Realtime API (WebRTC voice steering).
 */
import { API_BASE, handleResponse } from './helpers';

export interface RealtimeStatus {
  available: boolean;
  model?: string;
}

export interface RealtimeSession {
  /** The ephemeral session object from OpenAI */
  id: string;
  object: string;
  model: string;
  voice: string;
  expires_at: number;
  modalities: string[];
  instructions: string;
  client_secret: {
    value: string;
    expires_at: number;
  };
  /** Turn detection config */
  turn_detection: Record<string, unknown> | null;
  /** Input audio transcription config */
  input_audio_transcription: { model: string } | null;
}

/**
 * Check if the Realtime API is configured and available.
 * Returns { available: false } if no API key is set — the UI hides the mic button.
 */
export async function checkStatus(): Promise<RealtimeStatus> {
  const response = await fetch(`${API_BASE}/realtime/status`, {
    credentials: 'include',
  });
  return handleResponse<RealtimeStatus>(response);
}

/**
 * Create an ephemeral Realtime API session.
 * The returned client_secret.value is used as the bearer token for WebRTC SDP exchange.
 */
export async function fetchSession(): Promise<RealtimeSession> {
  const response = await fetch(`${API_BASE}/realtime/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<RealtimeSession>(response);
}

export const realtimeApi = {
  checkStatus,
  fetchSession,
};
