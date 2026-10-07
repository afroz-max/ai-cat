'use client';

/**
 * CharacterStatus — the state pill under the 3D character.
 *
 * Doubles as an accessible live region so screen readers announce each state
 * change ("I'm listening", "Thinking", …) without stealing focus.
 */

import { useAvatarStore } from '@/store/avatarStore';
import type { CharacterState } from '@/types/avatar';

interface StateMeta {
  emoji: string;
  label: string;
  /** Tailwind classes for the pill's glow. */
  ring: string;
  dot: string;
}

const STATE_META: Record<CharacterState, StateMeta> = {
  idle: {
    emoji: '✨',
    label: 'Ready to talk',
    ring: 'ring-white/15',
    dot: 'bg-glow-cyan',
  },
  listening: {
    emoji: '🎙️',
    label: "I'm listening...",
    ring: 'ring-glow-cyan/60',
    dot: 'bg-glow-cyan animate-pulse',
  },
  thinking: {
    emoji: '🤔',
    label: 'Give me a second...',
    ring: 'ring-glow-amber/50',
    dot: 'bg-glow-amber animate-pulse',
  },
  speaking: {
    emoji: '🔊',
    label: 'Speaking...',
    ring: 'ring-glow-pink/60',
    dot: 'bg-glow-pink animate-pulse',
  },
  happy: {
    emoji: '😊',
    label: "That's great to hear!",
    ring: 'ring-glow-pink/40',
    dot: 'bg-glow-pink',
  },
  surprised: {
    emoji: '😮',
    label: 'Oh! Really?',
    ring: 'ring-glow-amber/40',
    dot: 'bg-glow-amber',
  },
  sad: {
    emoji: '😔',
    label: "Something went wrong",
    ring: 'ring-red-400/40',
    dot: 'bg-red-400',
  },
};

export default function CharacterStatus() {
  const state = useAvatarStore((s) => s.state);
  const meta = STATE_META[state];

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      <div
        key={state}
        className={`glass animate-fade-in-up flex items-center gap-2.5 px-5 py-2.5 ring-1 transition-colors duration-500 ${meta.ring}`}
      >
        <span className="text-lg leading-none" aria-hidden="true">
          {meta.emoji}
        </span>
        <span className="text-sm font-medium tracking-wide text-white/90 sm:text-base">
          {meta.label}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${meta.dot}`}
          aria-hidden="true"
        />
      </div>

      {/* Screen-reader announcements for every state transition. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {`Status: ${meta.label}`}
      </p>
    </div>
  );
}