/**
 * useRealtimeVoice — WebRTC voice steering hook
 *
 * Manages a bidirectional audio connection to the OpenAI Realtime API
 * for founder voice steering. Handles:
 *   - Ephemeral token fetch + WebRTC SDP exchange
 *   - Microphone capture + remote audio playback
 *   - Data channel event routing (transcriptions, dispatch markers)
 *   - Hybrid path: fast governance actions vs deep SETH queries
 */
import { useState, useRef, useCallback } from 'react';
import { realtimeApi } from '@/lib/api/realtime';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'disconnecting';

/** Emitted when a voice exchange completes and should be persisted to chat */
export interface VoiceExchange {
  userText: string;
  agentText: string;
  dispatchMarker?: string; // e.g., "[DISPATCH: approve LOD]"
  askSethQuery?: string; // e.g., the question to route to SETH
}

export interface UseRealtimeVoiceOptions {
  /** Called when a complete voice exchange is ready to persist */
  onExchange?: (exchange: VoiceExchange) => void;
  /** Called when the agent wants to route a question to SETH */
  onAskSeth?: (question: string) => void;
  /** Called on unrecoverable error */
  onError?: (error: string) => void;
}

export interface UseRealtimeVoiceReturn {
  state: VoiceState;
  start: () => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  userTranscript: string | null;
  agentTranscript: string | null;
  isUserSpeaking: boolean;
  isAgentSpeaking: boolean;
  /** Inject SETH's response into the voice session for TTS playback */
  speakSethResponse: (text: string) => void;
}

// ---------------------------------------------------------------------------
// Regex for structured markers
// ---------------------------------------------------------------------------

const DISPATCH_RE = /\[DISPATCH:\s*([^\]]+)\]/i;
const ASK_SETH_RE = /\[ASK_SETH:\s*([^\]]+)\]/i;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRealtimeVoice(options: UseRealtimeVoiceOptions = {}): UseRealtimeVoiceReturn {
  const { onExchange, onAskSeth, onError } = options;

  // State
  const [state, setState] = useState<VoiceState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [userTranscript, setUserTranscript] = useState<string | null>(null);
  const [agentTranscript, setAgentTranscript] = useState<string | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  // Refs for WebRTC objects (not reactive)
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modelRef = useRef<string>('gpt-realtime');

  // Accumulator for agent transcript deltas
  const agentTextRef = useRef('');
  // Last user transcript for exchange persistence
  const userTextRef = useRef('');
  // Idle auto-disconnect timer
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_TIMEOUT_MS = 60_000; // 60 seconds of silence → auto-disconnect

  // --------------------------------------------------
  // Idle timer helpers
  // --------------------------------------------------
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  // stopRef lets the idle callback call stop() without a circular dep
  const stopRef = useRef<() => void>(() => {});

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      // Auto-disconnect after idle timeout
      stopRef.current();
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimer]);

  // --------------------------------------------------
  // Cleanup helper
  // --------------------------------------------------
  const cleanup = useCallback(() => {
    // Clear idle timer
    clearIdleTimer();
    // Close data channel
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch {
        /* ignore */
      }
      dcRef.current = null;
    }
    // Stop mic tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Close peer connection
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    // Remove audio element
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    // Reset state
    setIsMuted(false);
    setUserTranscript(null);
    setAgentTranscript(null);
    setIsUserSpeaking(false);
    setIsAgentSpeaking(false);
    agentTextRef.current = '';
    userTextRef.current = '';
  }, []);

  // --------------------------------------------------
  // Data channel message handler
  // --------------------------------------------------
  const handleDataChannelMessage = useCallback(
    (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      const type = msg.type as string;

      switch (type) {
        case 'session.created':
          // Connection established — session is ready
          break;

        case 'input_audio_buffer.speech_started':
          setIsUserSpeaking(true);
          setUserTranscript(null);
          resetIdleTimer();
          break;

        case 'input_audio_buffer.speech_stopped':
          setIsUserSpeaking(false);
          break;

        case 'conversation.item.input_audio_transcription.completed': {
          // Final user transcription
          const transcript = (msg.transcript as string) || '';
          setUserTranscript(transcript);
          userTextRef.current = transcript;
          break;
        }

        case 'response.audio_transcript.delta': {
          // Streaming agent text
          const delta = (msg.delta as string) || '';
          agentTextRef.current += delta;
          setAgentTranscript(agentTextRef.current);
          setIsAgentSpeaking(true);
          resetIdleTimer();
          break;
        }

        case 'response.audio_transcript.done': {
          // Agent finished speaking — full text available
          const fullText = (msg.transcript as string) || agentTextRef.current;
          setAgentTranscript(fullText);
          setIsAgentSpeaking(false);
          agentTextRef.current = fullText;
          break;
        }

        case 'response.done': {
          // Full response complete — check for markers and persist
          const finalAgentText = agentTextRef.current;
          const finalUserText = userTextRef.current;

          if (finalUserText && finalAgentText) {
            const dispatchMatch = finalAgentText.match(DISPATCH_RE);
            const askSethMatch = finalAgentText.match(ASK_SETH_RE);

            // Emit exchange for persistence
            onExchange?.({
              userText: finalUserText,
              agentText: finalAgentText,
              dispatchMarker: dispatchMatch?.[0],
              askSethQuery: askSethMatch?.[1],
            });

            // Route to SETH if needed
            if (askSethMatch?.[1]) {
              onAskSeth?.(askSethMatch[1]);
            }
          }

          // Reset accumulators for next turn
          agentTextRef.current = '';
          userTextRef.current = '';
          // Keep transcripts visible briefly, then clear
          setTimeout(() => {
            setUserTranscript(null);
            setAgentTranscript(null);
          }, 2000);
          break;
        }

        case 'error': {
          const errorMsg =
            ((msg.error as Record<string, unknown>)?.message as string) || 'Realtime API error';
          onError?.(errorMsg);
          break;
        }
      }
    },
    [onExchange, onAskSeth, onError, resetIdleTimer]
  );

  // --------------------------------------------------
  // Start voice session
  // --------------------------------------------------
  const start = useCallback(async () => {
    if (state !== 'idle') return;
    setState('connecting');

    try {
      // 1. Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2. Fetch ephemeral token
      const session = await realtimeApi.fetchSession();
      const ephemeralToken = session.client_secret.value;
      modelRef.current = session.model;

      // 3. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 4. Create data channel BEFORE creating offer
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.addEventListener('open', () => {
        // Data channel ready — session.update will arrive via session.created event
      });
      dc.addEventListener('message', handleDataChannelMessage);

      // 5. Add microphone tracks
      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // 6. Set up remote audio playback
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 7. Handle connection state changes
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          onError?.('WebRTC connection lost');
          cleanup();
          setState('idle');
        }
      };

      // 8. SDP exchange
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ephemeralToken}`,
            'Content-Type': 'application/sdp',
          },
          body: pc.localDescription!.sdp,
        }
      );

      if (!sdpResponse.ok) {
        throw new Error(`SDP exchange failed: ${sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setState('connected');
      // Start idle auto-disconnect timer
      resetIdleTimer();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice session';
      onError?.(message);
      cleanup();
      setState('idle');
    }
  }, [state, cleanup, handleDataChannelMessage, onError]);

  // --------------------------------------------------
  // Stop voice session
  // --------------------------------------------------
  const stop = useCallback(() => {
    setState('disconnecting');
    cleanup();
    setState('idle');
  }, [cleanup]);

  // Keep stopRef in sync so the idle timer callback can call stop()
  stopRef.current = stop;

  // --------------------------------------------------
  // Toggle mute
  // --------------------------------------------------
  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const tracks = streamRef.current.getAudioTracks();
    const newMuted = !isMuted;
    tracks.forEach((t) => {
      t.enabled = !newMuted;
    });
    setIsMuted(newMuted);
  }, [isMuted]);

  // --------------------------------------------------
  // Inject SETH's response for TTS playback
  // --------------------------------------------------
  const speakSethResponse = useCallback((text: string) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;

    // Create a conversation item with SETH's text
    dc.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'input_text', text }],
        },
      })
    );

    // Ask the Realtime API to speak it
    dc.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
        },
      })
    );
  }, []);

  return {
    state,
    start,
    stop,
    toggleMute,
    isMuted,
    userTranscript,
    agentTranscript,
    isUserSpeaking,
    isAgentSpeaking,
    speakSethResponse,
  };
}
