'use client';

/**
 * ChatPanel — the conversation log.
 *
 * Sits beside the character on desktop and docks as a bottom sheet on mobile,
 * so it never covers her face. Collapsible so the 3D view can go full-screen.
 *
 * The text input is a first-class fallback: it makes the app fully usable when
 * speech recognition is unavailable or the microphone is blocked.
 */

import { useEffect, useRef, useState } from 'react';

import { useAvatarStore } from '@/store/avatarStore';
import type { ChatMessage } from '@/types/avatar';

export interface ChatPanelProps {
  messages: ChatMessage[];
  /** True while a reply is in flight. */
  isThinking: boolean;
  onSend: (text: string) => void | Promise<void>;
  onClear: () => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatPanel({
  messages,
  isThinking,
  onSend,
  onClear,
}: ChatPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [draft, setDraft] = useState('');

  const state = useAvatarStore((s) => s.state);
  const expression = useAvatarStore((s) => s.expression);
  const error = useAvatarStore((s) => s.error);
  const interimTranscript = useAvatarStore((s) => s.interimTranscript);
  const clearError = useAvatarStore((s) => s.setError);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isThinking]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || isThinking) return;
    setDraft('');
    await onSend(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

if (isMinimized) {
    return (
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          aria-expanded="false"
          aria-controls="conversation-log"
          className="focus-ring glass flex items-center gap-2.5 px-5 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10"
        >
          <span aria-hidden="true">💬</span>
          Conversation
          <span className="rounded-full bg-glow-violet/25 px-2 py-0.5 text-xs text-glow-violet">
            {messages.length}
          </span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Conversation"
      className={[
        'pointer-events-auto flex flex-col overflow-hidden transition-all duration-500 ease-out',
        'glass',
        // Desktop: side panel. Mobile: bottom sheet docked above the mic.
        'fixed inset-x-3 bottom-3 z-30 max-h-[52vh] sm:static sm:inset-auto sm:max-h-[560px] sm:w-full',
        isExpanded ? 'sm:max-h-[80vh]' : '',
      ].join(' ')}
    >
      {/* ---------------- Header ---------------- */}
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold tracking-wide text-white/90">
            Conversation
          </h2>
          <span
            className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70"
            title={`Character state: ${state} · Expression: ${expression}`}
          >
            {state}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="focus-ring rounded-lg px-2 py-1 text-xs text-white/50 transition hover:bg-white/10 hover:text-white/80"
              aria-label="Clear conversation history"
            >
              Clear
            </button>
          )}
          {/* Maximise only makes sense once the panel is docked on desktop. */}
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="focus-ring hidden rounded-lg px-2 py-1 text-xs text-white/50 transition hover:bg-white/10 hover:text-white/80 sm:block"
            aria-expanded={isExpanded}
            aria-controls="conversation-log"
            aria-label={isExpanded ? 'Collapse conversation panel' : 'Expand conversation panel'}
          >
            {isExpanded ? '−' : '+'}
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="focus-ring rounded-lg px-2 py-1 text-xs text-white/50 transition hover:bg-white/10 hover:text-white/80"
            aria-label="Minimize conversation panel"
          >
            ▾
          </button>
        </div>
      </header>

{/* ---------------- Messages ---------------- */}
      <div
        id="conversation-log"
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Conversation messages"
        className="scrollbar-slim flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-white/40">
            Say hi to get started. Your conversation stays in this browser tab
            and isn&apos;t stored.
          </p>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <article
              key={message.id}
              className={`flex animate-fade-in-up flex-col gap-1 ${
                isUser ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  isUser
                    ? 'bg-gradient-to-br from-glow-violet/85 to-glow-pink/70 text-white'
                    : 'bg-white/[0.08] text-white/90 ring-1 ring-white/10',
                ].join(' ')}
              >
                <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                  {isUser ? 'You' : 'Aria'}
                </span>
                {message.text}
              </div>
              <time
                dateTime={new Date(message.timestamp).toISOString()}
                className="px-1 text-[10px] text-white/35"
              >
                {formatTime(message.timestamp)}
              </time>
            </article>
          );
        })}

        {/* Live partial speech, shown as it is recognised */}
        {interimTranscript && (
          <div className="flex items-end gap-2">
            <div className="rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm italic text-white/55 ring-1 ring-white/10">
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-60">
                You
              </span>
              {interimTranscript}
              <span className="ml-0.5 inline-block animate-pulse">▌</span>
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex items-center gap-1.5 px-1" aria-label="Aria is thinking">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-2 w-2 animate-bounce rounded-full bg-glow-violet/70"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}

        {/* Errors are user-friendly; raw server details never reach here. */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-2xl bg-red-500/15 px-3.5 py-2.5 text-sm text-red-200 ring-1 ring-red-400/30"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => clearError(null)}
              className="focus-ring shrink-0 rounded px-1 text-red-200/70 hover:text-red-100"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}
      </div>

{/* ---------------- Text input fallback ---------------- */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2 border-t border-white/10 px-3 py-3"
      >
        <label htmlFor="chat-input" className="sr-only">
          Type a message to Aria
        </label>
        <input
          id="chat-input"
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Or type a message..."
          maxLength={2000}
          autoComplete="off"
          className="focus-ring flex-1 rounded-xl bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/35 ring-1 ring-white/10 focus:bg-white/10"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isThinking}
          className="focus-ring rounded-xl bg-gradient-to-br from-glow-violet to-glow-pink px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          Send
        </button>
      </form>
    </section>
  );
}