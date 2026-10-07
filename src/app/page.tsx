'use client';

/**
 * AI Talking Girl — application shell.
 *
 * This is the only place the conversation and voice loops are joined together:
 *
 *   mic click → useVoice.startListening()
 *     → recognised text → useConversation.sendMessage()
 *     → POST /api/chat → Gemini (server-side)
 *     → useVoice.speak(reply) → TTS + lip-sync
 *     → character state returns to idle
 *
 * The 3D scene is loaded client-side only, because WebGL has no server render.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef } from 'react';

import ChatPanel from '@/components/ChatPanel';
import CharacterStatus from '@/components/CharacterStatus';
import VoiceButton from '@/components/VoiceButton';
import { useConversation } from '@/hooks/useConversation';
import { useVoice } from '@/hooks/useVoice';
import { useAvatarStore, WELCOME_TEXT } from '@/store/avatarStore';

// WebGL must never run during SSR.
const AvatarScene = dynamic(() => import('@/components/AvatarScene'), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

function SceneSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" aria-hidden="true" />
        <p className="text-sm text-white/50">Loading character…</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  // Character state lives in the store so both the 3D rig and the HUD stay in sync.
  const setState = useAvatarStore((s) => s.setState);
  const setExpression = useAvatarStore((s) => s.setExpression);
  const setListening = useAvatarStore((s) => s.setListening);
  const setInterimTranscript = useAvatarStore((s) => s.setInterimTranscript);
  const setFinalTranscript = useAvatarStore((s) => s.setFinalTranscript);
  const setSpeakingText = useAvatarStore((s) => s.setSpeakingText);
  const setError = useAvatarStore((s) => s.setError);
  const source = useAvatarStore((s) => s.source);

  /* ------------------------------------------------------------------ */
  /* Voice layer                                                         */
  /* ------------------------------------------------------------------ */

  // Refs break the voice ↔ conversation circular dependency and avoid
  // stale closures (isThinking/sendMessage captured at mount would be stale).
  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});
  const isThinkingRef = useRef(false);
  // Declared up front (with a no-op default) so the conversation callback
  // below can safely call speak(). The real implementation is assigned
  // immediately after useVoice returns.
  const speakRef = useRef<(text: string) => void>(() => {});
  const handleReplyReady = useCallback((reply: string) => {
    speakRef.current(reply);
  }, []);

  const voice = useVoice({
    onTranscript: (text) => {
      void sendMessageRef.current(text);
    },
    onListeningChange: (listening) => {
      setListening(listening);
      setInterimTranscript('');
      if (listening) {
        setState('listening');
        setExpression('neutral');
      } else if (!isThinkingRef.current) {
        setState('idle');
      }
    },
    onSpeakingChange: (speaking) => {
      if (speaking) {
        setState('speaking');
        return;
      }
      // Speech finished → back to a warm, idle-ready state.
      setState('idle');
      setExpression('happy');
      setSpeakingText('');
    },
  });

  /* ------------------------------------------------------------------ */
  /* Conversation loop                                                   */
  /* ------------------------------------------------------------------ */

  // `voice` must exist before the conversation callback can speak, so the
  // ref is assigned here (after useVoice) rather than above it.
  speakRef.current = voice.speak;

  const { messages, isThinking, sendMessage, clearMessages } =
    useConversation(handleReplyReady);

  // Keep refs in sync so voice callbacks (mounted once) always see fresh state.
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  useEffect(() => {
    isThinkingRef.current = isThinking;
  }, [isThinking]);

  // Keep the store's error field in sync with the voice layer's error.
  useEffect(() => {
    setError(voice.error);
  }, [voice.error, setError]);

  // Expose the live partial transcript to the chat panel.
  useEffect(() => {
    setInterimTranscript(voice.interimTranscript);
  }, [voice.interimTranscript, setInterimTranscript]);

  // Reflect the last recognised sentence in the store.
  useEffect(() => {
    if (voice.finalTranscript) setFinalTranscript(voice.finalTranscript);
  }, [voice.finalTranscript, setFinalTranscript]);

  /* ------------------------------------------------------------------ */
  /* Derived state                                                       */
  /* ------------------------------------------------------------------ */

  // While the AI is thinking, blink thinking dots; once it starts talking,
  // useConversation flips the state to 'speaking'.
  const micBusy = isThinking || voice.isSpeaking;

  // Say hello on first load so the app doesn't feel dead.
  useEffect(() => {
    const timer = setTimeout(() => {
      setExpression('happy');
      void voice.speak(WELCOME_TEXT);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-ink-950">
      {/* ---------------- Background aurora ---------------- */}
      <div className="bg-aurora pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:32px_32px]"
        aria-hidden="true"
      />

      {/* ---------------- Header ---------------- */}
      <header className="relative z-20 flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="text-xl" aria-hidden="true">
            ✨
          </span>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            <span className="text-gradient">AI Talking Girl</span>
          </h1>
        </div>

        {/* Avatar source badge — honest but friendly. Shows detailed status
            only as a tooltip so the stage stays clean and companion-like. */}
        <span
          className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/50 ring-1 ring-white/10"
          title={
            source.kind === 'model'
              ? `girl.glb loaded · Morph targets: ${source.morphTargetNames.length}`
              : 'Preview look — add public/models/girl.glb for the final character. The animated stand-in already blinks, breathes and lip-syncs.'
          }
        >
          {source.kind === 'model' ? '● Aria · Live model' : '● Aria · Preview look'}
        </span>
      </header>

{/* ---------------- Main layout ----------------
          Desktop: 3D character centre stage, chat docked right.
          Mobile:  character on top, chat as a bottom sheet. */}
      <div className="relative z-10 flex flex-1 flex-col gap-4 px-4 pb-6 sm:px-6 lg:flex-row lg:items-stretch lg:gap-6">
        {/* ---- Left: character stage ---- */}
        <div className="flex min-h-[46vh] flex-1 flex-col items-center justify-between gap-4 lg:min-h-0">
          {/* The character herself — centred like a Talking Tom stage.
              A soft spotlight + glow ring frames her so the dark scene reads
              as a companion spotlight, not an empty canvas. */}
          <div className="relative w-full flex-1 overflow-hidden rounded-3xl ring-1 ring-white/10">
            {/* Gentle spotlight behind the character */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[75%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.22)_0%,rgba(244,114,182,0.12)_45%,transparent_70%)]"
              aria-hidden="true"
            />
            <div className="absolute inset-0">
              <AvatarScene />
            </div>

            {/* Name tag — makes her feel like a named companion */}
            <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/35 px-3.5 py-1.5 ring-1 ring-white/15 backdrop-blur-md">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow-pink opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-glow-pink" />
              </span>
              <span className="text-sm font-semibold tracking-wide text-white/95">
                Aria
              </span>
              <span className="text-[11px] text-white/50">your AI companion</span>
            </div>

            {/* Soft vignette to blend the canvas into the page. */}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent"
              aria-hidden="true"
            />
          </div>

          <CharacterStatus />

          <VoiceButton
            onStart={voice.startListening}
            onStop={voice.stopListening}
            isListening={voice.isListening}
            isSupported={voice.isSupported}
            isBusy={micBusy}
            disabled={isThinking}
          />
        </div>

        {/* ---- Right: conversation ---- */}
        <div className="hidden w-full max-w-sm shrink-0 lg:flex lg:flex-col">
          <ChatPanel
            messages={messages}
            isThinking={isThinking}
            onSend={sendMessage}
            onClear={clearMessages}
          />
        </div>
      </div>

      {/* ---- Mobile: chat renders as a bottom sheet ---- */}
      <div className="lg:hidden">
        <ChatPanel
          messages={messages}
          isThinking={isThinking}
          onSend={sendMessage}
          onClear={clearMessages}
        />
      </div>

      {/* Skip link for keyboard/screen-reader users. */}
      <a
        href="#conversation-log"
        className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-ink-950"
      >
        Skip to conversation
      </a>
    </main>
  );
}