import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  Send,
  ChevronDown,
  ChevronRight,
  Loader2,
  Bot,
  User,
  Trash2,
  Download,
  Mic,
  MicOff,
  X,
  Volume2,
} from 'lucide-react';
import {
  useChatSession,
  useSendChatMessage,
  useDeleteChatSession,
  useChatStream,
  useChatSessions,
} from '@/hooks/useChat';
import { useTask } from '@/hooks/useTasks';
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice';
import { realtimeApi } from '@/lib/api/realtime';
import { chatApi } from '@/lib/api/chat';
import type { ChatMessage } from '@veritas-kanban/shared';
import { DispatchCard, type DispatchIntent } from './DispatchCard';

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string;
}

export function ChatPanel({ open, onOpenChange, taskId }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'ask' | 'build'>('ask');
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const { data: task } = useTask(taskId || '');
  const { data: sessions = [] } = useChatSessions();
  const { data: session } = useChatSession(currentSessionId);
  const { mutate: sendChatMessage, isPending } = useSendChatMessage();
  const { mutate: deleteChatSession } = useDeleteChatSession();
  const { streamingMessage, isThinking } = useChatStream(currentSessionId);

  // Realtime voice steering
  const { data: realtimeStatus } = useQuery({
    queryKey: ['realtime', 'status'],
    queryFn: realtimeApi.checkStatus,
    staleTime: 60_000,
  });

  const queryClient = useQueryClient();

  const handleVoiceExchange = useCallback(
    (exchange: { userText: string; agentText: string }) => {
      // Persist both user + agent voice transcripts without triggering gateway
      if (exchange.userText && exchange.agentText) {
        chatApi
          .saveVoiceTranscript({
            sessionId: currentSessionId,
            taskId,
            userText: exchange.userText,
            agentText: exchange.agentText,
          })
          .then((result) => {
            // Update session ID if new session was created
            if (result.sessionId && result.sessionId !== currentSessionId) {
              setCurrentSessionId(result.sessionId);
            }
            // Refetch session to show new messages
            queryClient.invalidateQueries({ queryKey: ['chat', 'sessions', result.sessionId] });
          });
      }
    },
    [currentSessionId, taskId, queryClient]
  );

  const handleAskSeth = useCallback(
    (question: string) => {
      // Route deep questions to SETH via existing chat pipeline — medium thinking for voice latency
      sendChatMessage(
        {
          sessionId: currentSessionId,
          taskId,
          message: question,
          mode: 'ask',
          thinkingLevel: 'medium',
        },
        {
          onSuccess: (response) => {
            setCurrentSessionId(response.sessionId);
          },
        }
      );
    },
    [currentSessionId, taskId, sendChatMessage]
  );

  const voice = useRealtimeVoice({
    onExchange: handleVoiceExchange,
    onAskSeth: handleAskSeth,
  });

  // When SETH responds to a deep-path question, speak it back
  useEffect(() => {
    if (voice.state === 'connected' && streamingMessage === null && session?.messages) {
      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        // Check if this is a fresh SETH response (within last 5 seconds)
        const msgTime = new Date(lastMsg.timestamp).getTime();
        const now = Date.now();
        if (now - msgTime < 5000) {
          voice.speakSethResponse(lastMsg.content);
        }
      }
    }
  }, [session?.messages, voice.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session?.messages, streamingMessage, isThinking, shouldAutoScroll]);

  // Detect manual scroll-up to pause auto-scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 50;
    setShouldAutoScroll(isAtBottom);
  };

  // Filter sessions by taskId if scoped
  const filteredSessions = useMemo(() => {
    if (!taskId) {
      return sessions.filter((s) => !s.taskId);
    }
    return sessions.filter((s) => s.taskId === taskId);
  }, [sessions, taskId]);

  // Handle sending a message
  const handleSend = () => {
    if (!message.trim() || isPending) return;

    sendChatMessage(
      {
        sessionId: currentSessionId,
        taskId,
        message: message.trim(),
        mode,
      },
      {
        onSuccess: (response) => {
          setCurrentSessionId(response.sessionId);
          setMessage('');
          setShouldAutoScroll(true);
          // Re-focus the input so user can keep typing
          requestAnimationFrame(() => inputRef.current?.focus());
        },
      }
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Load session on mount — task-scoped sessions use a deterministic ID
  useEffect(() => {
    if (taskId && !currentSessionId) {
      setCurrentSessionId(`task_${taskId}`);
    } else if (!taskId && !currentSessionId && filteredSessions.length > 0) {
      setCurrentSessionId(filteredSessions[0].id);
    }
  }, [filteredSessions, currentSessionId, taskId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[500px] sm:max-w-[500px] overflow-hidden flex flex-col p-0"
        side="right"
      >
        {/* Header action buttons — positioned next to Sheet's built-in X */}
        {currentSessionId && session?.messages && session.messages.length > 0 && (
          <button
            onClick={() => {
              if (!session?.messages?.length) return;
              const title = taskId && task ? task.title : 'Board Chat';
              const date = new Date().toLocaleString();
              const lines = [`# Chat Export — ${title}`, `*Exported: ${date}*`, ''];
              for (const msg of session.messages) {
                const role =
                  msg.role === 'user'
                    ? '👤 User'
                    : msg.role === 'assistant'
                      ? '🤖 Assistant'
                      : '⚙️ System';
                const time = new Date(msg.timestamp).toLocaleString();
                lines.push('---', '', `### ${role}`, `*${time}*`, '', msg.content, '');
              }
              const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `chat-${taskId || 'board'}-${new Date().toISOString().slice(0, 10)}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="absolute right-20 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Export chat</span>
          </button>
        )}
        {currentSessionId && session?.messages && session.messages.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="absolute right-12 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Clear chat</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all messages in this chat. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (currentSessionId) {
                      deleteChatSession(currentSessionId, {
                        onSuccess: () => {
                          setCurrentSessionId(undefined);
                          if (taskId) {
                            setTimeout(() => setCurrentSessionId(`task_${taskId}`), 100);
                          }
                        },
                      });
                    }
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear History
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <SheetHeader className="border-b border-border px-4 py-3 pr-10 flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {taskId ? 'Task Chat' : 'Board Chat'}
          </SheetTitle>
          {taskId && task && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 pt-2 border-t border-border/50 mt-2">
              <MessageSquare className="h-3 w-3" />
              Task: {task.title}
            </div>
          )}
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4" onScrollCapture={handleScroll} ref={scrollAreaRef}>
          <div className="py-4 space-y-4">
            {session?.messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {streamingMessage && (
              <ChatMessageBubble
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: streamingMessage.content || '',
                  timestamp: new Date().toISOString(),
                }}
                isStreaming
              />
            )}
            {isThinking && !streamingMessage && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            {(!session || session.messages.length === 0) && !streamingMessage && !isThinking && (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {taskId ? 'Start a conversation about this task' : 'Start a new chat session'}
                </p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-4 flex-shrink-0 space-y-3">
          {voice.state === 'connected' ? (
            /* ── Voice Active Panel ─────────────────────────── */
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-400">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500" />
                  </span>
                  SETH — Live
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={voice.toggleMute}
                  >
                    {voice.isMuted ? (
                      <MicOff className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Mic className="h-3.5 w-3.5 text-orange-400" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={voice.stop}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Live transcripts */}
              <div className="space-y-2 text-sm">
                {voice.isUserSpeaking && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="italic">Listening...</span>
                  </div>
                )}
                {voice.userTranscript && (
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground">{voice.userTranscript}</span>
                  </div>
                )}
                {voice.agentTranscript && (
                  <div className="flex items-start gap-2">
                    <Volume2 className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                    <span className="text-foreground">{voice.agentTranscript}</span>
                  </div>
                )}
                {!voice.isUserSpeaking && !voice.userTranscript && !voice.agentTranscript && (
                  <div className="text-muted-foreground text-xs text-center py-2">
                    Speak a command or ask a question...
                  </div>
                )}
              </div>

              {/* Dispatch card from voice response */}
              {voice.agentTranscript &&
                (() => {
                  const intent = extractDispatchIntent(voice.agentTranscript);
                  return intent ? <DispatchCard intent={intent} /> : null;
                })()}
            </div>
          ) : (
            /* ── Normal Text Input ──────────────────────────── */
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                disabled={isPending}
                className="flex-1"
                autoFocus
              />
              {/* Mic button — only visible if Realtime API is configured */}
              {realtimeStatus?.available && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={voice.start}
                  disabled={voice.state === 'connecting'}
                  className="shrink-0"
                  title="Start voice steering"
                >
                  {voice.state === 'connecting' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                  ) : (
                    <Mic className="h-4 w-4 text-muted-foreground hover:text-orange-400 transition-colors" />
                  )}
                </Button>
              )}
              <Button onClick={handleSend} disabled={!message.trim() || isPending} size="icon">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {/* Mode Toggle — hidden during voice mode */}
          {voice.state !== 'connected' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Mode:</span>
              <Button
                variant={mode === 'ask' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('ask')}
                className="h-7 text-xs"
              >
                Ask
              </Button>
              <Button
                variant={mode === 'build' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('build')}
                className="h-7 text-xs"
              >
                Build
              </Button>
              <span className="text-muted-foreground ml-1">
                {mode === 'ask' ? '· Read-only queries' : '· Changes, files, commands'}
              </span>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface ChatMessageBubbleProps {
  message: ChatMessage | { id: string; role: string; content: string; timestamp: string };
  isStreaming?: boolean;
}

const DISPATCH_MARKER_RE = /\[DISPATCH:\s*(\w+)(?:\s+([^\]]+))?\]/i;

/**
 * Detect dispatch intent in an assistant message.
 * Only triggers on structured [DISPATCH: verb target] markers
 * explicitly emitted by agents — no keyword guessing.
 */
function extractDispatchIntent(content: string): DispatchIntent | null {
  const match = content.match(DISPATCH_MARKER_RE);
  if (!match) return null;

  const verb = match[1].toLowerCase();
  const target = match[2]?.trim();

  return {
    verb: verb as DispatchIntent['verb'],
    targetAgent: target || 'SETH-LEAD',
    label: match[0],
    message: target ? `${verb} ${target}` : verb,
  };
}

function ChatMessageBubble({ message, isStreaming }: ChatMessageBubbleProps) {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const toggleTool = (index: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (isSystem) {
    return (
      <div className="text-center text-sm text-muted-foreground italic py-2">{message.content}</div>
    );
  }

  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={`max-w-[80%] space-y-2`}>
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
          }`}
        >
          <MarkdownContent content={message.content} />
          {isStreaming && <span className="inline-block w-1 h-4 bg-current animate-pulse ml-1" />}
        </div>

        {/* Inline dispatch card — detected action intents in assistant messages */}
        {!isUser &&
          !isStreaming &&
          (() => {
            const intent = extractDispatchIntent(message.content);
            return intent ? <DispatchCard intent={intent} /> : null;
          })()}

        {/* Tool calls */}
        {'toolCalls' in message && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1">
            {message.toolCalls.map((tool, idx) => (
              <div
                key={idx}
                className="border border-border rounded bg-primal-card overflow-hidden"
              >
                <button
                  onClick={() => toggleTool(idx)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-primal-card transition-colors"
                >
                  {expandedTools.has(idx) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <code className="text-emerald-400">{tool.name}</code>
                </button>
                {expandedTools.has(idx) && (
                  <div className="px-3 pb-2 space-y-2 text-xs font-mono">
                    <div>
                      <div className="text-muted-foreground mb-1">Input:</div>
                      <pre className="text-primal-gray-light/80 whitespace-pre-wrap break-all">
                        {tool.input}
                      </pre>
                    </div>
                    {tool.output && (
                      <div>
                        <div className="text-muted-foreground mb-1">Output:</div>
                        <pre className="text-primal-gray-light/80 whitespace-pre-wrap break-all">
                          {tool.output}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Timestamp + voice badge */}
        <div className="text-xs text-muted-foreground px-1 flex items-center gap-1">
          {message.content.startsWith('[voice]') && <Mic className="h-3 w-3 text-orange-400" />}
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
      {isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}

/**
 * Simple markdown renderer
 * Handles code blocks and basic formatting
 */
function MarkdownContent({ content }: { content: string }) {
  // Split content by code blocks
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, idx) => {
        // Multi-line code block
        if (part.startsWith('```')) {
          const lines = part.split('\n');
          const language = lines[0].replace('```', '').trim();
          const code = lines.slice(1, -1).join('\n');

          return (
            <pre key={idx} className="bg-primal-card rounded p-2 overflow-x-auto text-xs">
              {language && <div className="text-muted-foreground mb-1">{language}</div>}
              <code className="text-primal-gray-light/80">{code}</code>
            </pre>
          );
        }

        // Inline code
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={idx} className="bg-primal-rule-light px-1 py-0.5 rounded text-xs">
              {part.slice(1, -1)}
            </code>
          );
        }

        // Regular text
        return (
          <span key={idx} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </div>
  );
}
