'use client';

/**
 * VoiceButton — the primary microphone control.
 *
 * Supports three input modes so it works everywhere:
 *  - Click / tap  (toggle)
 *  - Press & hold (push-to-talk, stops on release)
 *  - Keyboard     (Space or Enter)
 *
 * Accessibility: a real <button> whose aria-label changes with state, plus a
 * polite live region announcing listening status.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceButtonProps {
  /** Starts the recogniser. Should already handle permission errors. */
  onStart: () => void | Promise<void>;
  /** Stops the recogniser early (used by press-and-hold release). */
  onStop?: () => void;
  isListening: boolean;
  /** False when the browser lacks speech recognition. */
  isSupported: boolean;
  /** True while the AI is thinking or speaking. */
  isBusy?: boolean;
  disabled?: boolean;
}

/** A press longer than this becomes "push to talk". */
const HOLD_THRESHOLD_MS = 220;

export default function VoiceButton({
  onStart,
  onStop,
  isListening,
  isSupported,
  isBusy = false,
  disabled = false,
}: VoiceButtonProps) {
  const [pressed, setPressed] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHold = useRef(false);
  const isPointerDown = useRef(false);

  const clearTimer = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  // Never leave a dangling timer on unmount.
  useEffect(() => clearTimer, [clearTimer]);

  const start = useCallback(() => {
    void onStart();
  }, [onStart]);

  /* ---------------- Pointer: tap-to-toggle + press-to-talk ---------------- */
  const handlePointerDown = useCallback(() => {
    if (disabled || !isSupported) return;
    isPointerDown.current = true;
    didHold.current = false;
    setPressed(true);

    // A long press becomes push-to-talk.
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      start();
    }, HOLD_THRESHOLD_MS);
  }, [disabled, isSupported, start]);

  const handlePointerUp = useCallback(() => {
    if (!isPointerDown.current) return;
    isPointerDown.current = false;
    setPressed(false);
    clearTimer();

    if (didHold.current) {
      // Push-to-talk completed → stop listening on release.
      didHold.current = false;
      onStop?.();
      return;
    }

    // Short tap → toggle.
    if (isListening) onStop?.();
    else start();
  }, [clearTimer, isListening, onStop, start]);

/* ---------------- Keyboard ---------------- */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      // Stop Space from scrolling the page.
      if (event.key === ' ') event.preventDefault();
      if (event.repeat) return;
      if (disabled || !isSupported) return;
      setPressed(true);
    },
    [disabled, isSupported],
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (disabled || !isSupported) return;
      setPressed(false);
      if (isListening) onStop?.();
      else start();
    },
    [disabled, isListening, isSupported, onStop, start],
  );

  const active = isListening || pressed;

  const label = !isSupported
    ? 'Speech recognition is not supported in this browser'
    : isListening
      ? 'Stop listening'
      : 'Tap to talk. You can also press and hold.';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* Pulse rings — only animate while actively listening. */}
        {isListening && (
          <>
            <span
              className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-glow-cyan/70"
              aria-hidden="true"
            />
            <span
              className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-glow-cyan/50"
              style={{ animationDelay: '0.8s' }}
              aria-hidden="true"
            />
          </>
        )}

        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onContextMenu={(event) => event.preventDefault()}
          disabled={disabled || !isSupported}
          aria-label={label}
          aria-pressed={isListening}
          aria-describedby="voice-button-hint"
          className={[
            'focus-ring relative flex h-24 w-24 touch-none select-none items-center justify-center rounded-full',
            'text-4xl transition-all duration-300 ease-out',
            active
              ? 'scale-95 bg-gradient-to-br from-glow-cyan to-glow-violet text-ink-950 shadow-2xl shadow-glow-cyan/40'
              : 'bg-white/10 text-white/80 backdrop-blur-md hover:bg-white/15',
            disabled || !isSupported
              ? 'cursor-not-allowed opacity-40'
              : 'cursor-pointer',
            isBusy && !isListening ? 'opacity-60' : '',
          ].join(' ')}
        >
          <span aria-hidden="true">{isListening ? '⏹️' : '🎙️'}</span>
        </button>
      </div>

      {/* Visible label + keyboard hint */}
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-white/80">
          {isListening ? 'Listening… tap to stop' : 'Hold / Click to Talk'}
        </p>
        <p id="voice-button-hint" className="text-xs text-white/40">
          {isSupported
            ? 'Keyboard: focus the mic and press Space or Enter'
            : 'Try Chrome or Edge for voice input'}
        </p>
      </div>

      {/* Listening announcements for assistive tech */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isListening ? 'Microphone is on. Speak now.' : ''}
      </p>
    </div>
  );
}