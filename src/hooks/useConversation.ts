'use client';

/**
 * useConversation — owns the dialogue loop.
 *
 * Wires together: speech input → /api/chat → character state → TTS output,
 * and keeps the rolling message history in React state.
 *
 * Memory note: history lives in component state for now (nothing persisted, no
 * personal data stored). To add persistent memory later, hydrate `messages`
 * from a store/database inside the initial state and re-persist on change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAvatarStore } from '@/store/avatarStore';
import type { ChatMessage, ChatResponseBody } from '@/types/avatar';

const MAX_MESSAGES = 60;
/** How long to show the "thinking" state before assuming something hung.
 * Gemini fallback walks 4 models at ~20s each during overload, so allow 90s.
 */
const REQUEST_TIMEOUT_MS = 90_000;

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseConversationResult {
  messages: ChatMessage[];
  isThinking: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

/**
 * Picks a facial expression from the reply's tone.
 * Cheap heuristic — swap for real emotion detection later.
 */
function inferExpression(reply: string): 'happy' | 'surprised' | 'neutral' {
  if (/[!]{1,}|\b(wow|amazing|incredible|omg|seriously)\b/i.test(reply)) {
    return 'surprised';
  }
  if (/[😊😄😁❤♥]|:-\)|\bhappy\b|\bglad\b|\byay\b|\bawesome\b|\blove\b/i.test(reply)) {
    return 'happy';
  }
  return 'happy'; // A companion is friendlier when it looks pleased.
}

export function useConversation(onReplyReady?: (reply: string) => void): UseConversationResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const setState = useAvatarStore((s) => s.setState);
  const setExpression = useAvatarStore((s) => s.setExpression);
  const setError = useAvatarStore((s) => s.setError);
  const setSpeakingText = useAvatarStore((s) => s.setSpeakingText);
  const setFinalTranscript = useAvatarStore((s) => s.setFinalTranscript);

  const onReplyReadyRef = useRef(onReplyReady);
  useEffect(() => {
    onReplyReadyRef.current = onReplyReady;
  }, [onReplyReady]);

  // Guards against a stale response landing after a new turn began.
  const requestIdRef = useRef(0);

  const clearMessages = useCallback(() => {
    requestIdRef.current += 1; // invalidate anything in flight
    setMessages([]);
    setIsThinking(false);
    setSpeakingText('');
    setError(null);
  }, [setError, setSpeakingText]);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isThinking) return;

      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        text,
        timestamp: Date.now(),
      };

      // Snapshot history *before* adding the new turn, so we send the past.
      const history = messages
        .slice(-20)
        .map(({ role, text: t }) => ({ role, text: t }));

      setMessages((prev) => [...prev, userMessage].slice(-MAX_MESSAGES));
      setFinalTranscript(text);

      setIsThinking(true);
      setState('thinking');
      setExpression('thinking');
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history }),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => ({}))) as ChatResponseBody;

        if (!response.ok) {
          throw new Error(data.error ?? 'AI is temporarily unavailable. Please try again.');
        }

        if (requestId !== requestIdRef.current) return; // superseded

        const reply = data.reply?.trim();
        if (!reply) {
          throw new Error('AI is temporarily unavailable. Please try again.');
        }

        const assistantMessage: ChatMessage = {
          id: createId(),
          role: 'assistant',
          text: reply,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage].slice(-MAX_MESSAGES));

        setExpression(inferExpression(reply));
        setSpeakingText(reply);
        setState('speaking');

        onReplyReadyRef.current?.(reply);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;

        const friendly =
          error instanceof Error && error.message
            ? error.message
            : 'AI is temporarily unavailable. Please try again.';

        setError(friendly);
        setExpression('sad');
        setState('sad');
      } finally {
        clearTimeout(timeout);
        if (requestId === requestIdRef.current) {
          setIsThinking(false);
        }
      }
    },
    [isThinking, messages, setError, setExpression, setFinalTranscript, setSpeakingText, setState],
  );

  return { messages, isThinking, sendMessage, clearMessages };
}