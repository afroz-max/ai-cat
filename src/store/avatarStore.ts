'use client';

/**
 * Global avatar store.
 *
 * Uses Zustand so that the 3D scene can subscribe to individual slices
 * (e.g. just `state`) without re-rendering on every chat message.
 */

import { create } from 'zustand';

import type {
  AvatarSourceInfo,
  CharacterState,
  Expression,
} from '@/types/avatar';

const WELCOME_MESSAGE =
  "Hi! I'm Aria. Tap the microphone and let's talk. 😊";

export interface AvatarStore {
  /** High-level lifecycle state shown in the status pill. */
  state: CharacterState;
  /** Current facial expression preset. */
  expression: Expression;
  /** Whether the mic is currently capturing speech. */
  isListening: boolean;
  /** Live (partial) transcript while speaking. */
  interimTranscript: string;
  /** Final transcript of the last recognised utterance. */
  finalTranscript: string;
  /** Text the character is currently speaking aloud. */
  speakingText: string;
  /** Non-null user-facing error. */
  error: string | null;
  /** Which avatar geometry is mounted (GLB vs procedural placeholder). */
  source: AvatarSourceInfo;

  setState: (state: CharacterState) => void;
  setExpression: (expression: Expression) => void;
  setListening: (isListening: boolean) => void;
  setInterimTranscript: (text: string) => void;
  setFinalTranscript: (text: string) => void;
  setSpeakingText: (text: string) => void;
  setError: (error: string | null) => void;
  setSource: (source: AvatarSourceInfo) => void;
  reset: () => void;
}

export const WELCOME_TEXT = WELCOME_MESSAGE;

export const useAvatarStore = create<AvatarStore>((set) => ({
  state: 'idle',
  expression: 'neutral',
  isListening: false,
  interimTranscript: '',
  finalTranscript: '',
  speakingText: '',
  error: null,
  source: {
    kind: 'placeholder',
    label: 'Aria · Preview look',
    hasMorphTargets: false,
    hasMouthMorph: false,
    morphTargetNames: [],
  },

  setState: (state) => set({ state }),
  setExpression: (expression) => set({ expression }),
  setListening: (isListening) => set({ isListening }),
  setInterimTranscript: (interimTranscript) => set({ interimTranscript }),
  setFinalTranscript: (finalTranscript) =>
    set({ finalTranscript, interimTranscript: '' }),
  setSpeakingText: (speakingText) => set({ speakingText }),
  setError: (error) => set({ error }),
  setSource: (source) => set({ source }),
  reset: () =>
    set({
      state: 'idle',
      expression: 'neutral',
      isListening: false,
      interimTranscript: '',
      finalTranscript: '',
      speakingText: '',
      error: null,
    }),
}));

/** Non-reactive selector — safe to read inside useFrame loops. */
export const selectState = (s: AvatarStore): CharacterState => s.state;
export const selectExpression = (s: AvatarStore): Expression => s.expression;