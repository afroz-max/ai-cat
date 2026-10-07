'use client';

/**
 * useVoice — the complete voice I/O layer.
 *
 * Responsibilities
 *  1. Speech-to-text via the Web Speech Recognition API (Chromium browsers).
 *  2. Text-to-speech via the Web Speech Synthesis API.
 *  3. Drives the lip-sync envelope while speaking.
 *  4. Translates browser quirks into friendly error messages.
 *
 * SWAPPING IN A REAL TTS (ElevenLabs / Cartesia / OpenAI …)
 * Replace the body of `speak()` with your provider call, then feed the audio
 * into an AnalyserNode and push RMS values through `attachExternalLipSyncProvider()`.
 * Every consumer reads from `lipSyncSignal`, so nothing else has to change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SpeechEnvelopePlayer,
  isExternalLipSyncProviderAttached,
  lipSyncSignal,
  resetLipSync,
} from '@/lib/lipSync';
import { VOICE_ERROR_MESSAGES, type VoiceErrorCode } from '@/types/avatar';

export { VOICE_ERROR_MESSAGES };
export type { VoiceErrorCode };

/**
 * Maps the browser's error codes onto our friendly, user-readable set.
 * Kept distinct per requirement: not-allowed vs service-not-allowed must not
 * share a message — Brave's Shields produce service-not-allowed even when the
 * mic permission itself is granted.
 */
const RECOGNITION_ERROR_MAP: Record<string, VoiceErrorCode> = {
  'not-allowed': 'permission-denied',
  'service-not-allowed': 'service-blocked',
  'permission-denied': 'permission-denied',
  'no-speech': 'no-speech',
  'audio-capture': 'audio-capture',
  network: 'network',
  aborted: 'aborted',
  'language-not-supported': 'unsupported-browser',
};



export interface UseVoiceOptions {
  /** Fired with the final recognised sentence. */
  onTranscript?: (text: string) => void;
  /** Fired when listening starts/stops, so the character state can follow. */
  onListeningChange?: (listening: boolean) => void;
  /** Fired once TTS playback starts / finishes. */
  onSpeakingChange?: (speaking: boolean) => void;
  lang?: string;
  rate?: number;
  pitch?: number;
}

export interface UseVoiceResult {
  isSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  clearError: () => void;
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string | null;
  setSelectedVoiceURI: (uri: string) => void;
}

const DEFAULT_RATE = 1.02;
const DEFAULT_PITCH = 1.15; // Slightly higher reads as a warmer, friendlier voice.

export function useVoice({
  onTranscript,
  onListeningChange,
  onSpeakingChange,
  lang = 'en-US',
  rate = DEFAULT_RATE,
  pitch = DEFAULT_PITCH,
}: UseVoiceOptions = {}): UseVoiceResult {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);

  // Server rendering has no `window`, so this must start false and flip to true
  // after mount. Reading it during the first render would cause a hydration
  // mismatch (SSR renders "unsupported", the client renders "supported").
  const [isSupported, setIsSupported] = useState(false);

  // Keep callbacks in refs so changing them never restarts recognition.
  const onTranscriptRef = useRef(onTranscript);
  const onListeningChangeRef = useRef(onListeningChange);
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onListeningChangeRef.current = onListeningChange;
    onSpeakingChangeRef.current = onSpeakingChange;
  }, [onTranscript, onListeningChange, onSpeakingChange]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const envelopeRef = useRef(new SpeechEnvelopePlayer());
  const rafRef = useRef<number | null>(null);
  const wantToListenRef = useRef(false);

  const isSupportedRef = useRef(false);

  useEffect(() => {
    const supported = Boolean(
      typeof window !== 'undefined' &&
        (window.SpeechRecognition ?? window.webkitSpeechRecognition),
    );
    isSupportedRef.current = supported;
    setIsSupported(supported);
  }, []);

  const fail = useCallback((code: VoiceErrorCode) => {
    setError(VOICE_ERROR_MESSAGES[code]);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Speech synthesis                                                    */
  /* ------------------------------------------------------------------ */

  // The voice list loads asynchronously in Chrome.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const load = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      // Auto-pick a pleasant English female voice on first load.
      if (available.length > 0) {
        setSelectedVoiceURI((current) => {
          if (current && available.some((v) => v.voiceURI === current)) return current;
          const preferred =
            available.find(
              (v) => /female|samantha|zira|serena|moira|karen/i.test(v.name) && v.lang.startsWith('en'),
            ) ??
            available.find((v) => v.lang.startsWith('en') && v.localService) ??
            available.find((v) => v.lang.startsWith('en'));
          return preferred?.voiceURI ?? available[0]?.voiceURI ?? null;
        });
      }
    };

    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    envelopeRef.current.stop();
    resetLipSync();
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    onSpeakingChangeRef.current?.(false);
  }, []);

const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined') return;
      const trimmed = text.trim();
      // Empty TTS input is a no-op (e.g. interrupted greeting) — never surface
      // it as a microphone error. Voice errors come only from recognition.
      if (!trimmed) return;

      if (!window.speechSynthesis) {
        // No TTS support: the text still appears in chat, just not spoken.
        setError('Text-to-speech is not supported in this browser.');
        return;
      }

      // Chrome queues utterances; cancel first so rapid replies don't stack.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = pitch;

      const chosen = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (chosen) utterance.voice = chosen;

      const startedAt = performance.now() / 1000;
      const estimatedDuration = Math.max(1.2, trimmed.length / 13);

      const driveEnvelope = (duration: number) => {
        envelopeRef.current.start(trimmed, duration, startedAt);
        const tick = () => {
          if (!lipSyncSignal.active) return;
          envelopeRef.current.sample(performance.now() / 1000);
          rafRef.current = requestAnimationFrame(tick);
        };
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };

      utterance.onstart = () => {
        lipSyncSignal.active = true;
        setIsSpeaking(true);
        onSpeakingChangeRef.current?.(true);
        if (!isExternalLipSyncProviderAttached()) driveEnvelope(estimatedDuration);
      };

      utterance.onboundary = () => {
        // Keep the mouth busy even if the duration estimate runs long.
        driveEnvelope(estimatedDuration);
      };

      const settle = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        envelopeRef.current.stop();
        resetLipSync();
        setIsSpeaking(false);
        onSpeakingChangeRef.current?.(false);
      };

      utterance.onend = settle;
      // Interruption/cancel is normal; never surface it as an error.
      utterance.onerror = settle;

      window.speechSynthesis.speak(utterance);
    },
    [lang, pitch, rate, selectedVoiceURI, voices],
  );

  /* ------------------------------------------------------------------ */
  /* Speech recognition                                                  */
  /* ------------------------------------------------------------------ */

  const stopListening = useCallback(() => {
    wantToListenRef.current = false;
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Already stopped — nothing to do.
      }
    }
    setIsListening(false);
    setInterimTranscript('');
    onListeningChangeRef.current?.(false);
  }, []);

  const startListening = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // Check the ref, not the state: this can fire before the mount effect runs.
    if (!isSupportedRef.current) {
      fail('unsupported-browser');
      return;
    }

    setError(null);

    // Ask for the mic up front so a denial surfaces as a friendly message
    // rather than the browser's native prompt failing silently later.
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        if (status.state === 'denied') {
          fail('permission-denied');
          return;
        }
      } catch {
        // Permissions API may not know 'microphone' — ignore and continue.
      }
    }

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      fail('unsupported-browser');
      return;
    }

    // Don't listen while the character is talking (barge-in comes later).
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
      lipSyncSignal.active = false;
      resetLipSync();
    }

    wantToListenRef.current = true;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalText = '';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      onListeningChangeRef.current?.(true);
    };

recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const alternative = result[0];
        if (!alternative) continue;

        if (result.isFinal) {
          finalText += `${alternative.transcript} `;
        } else {
          interim += alternative.transcript;
        }
      }

      setInterimTranscript(interim);

      if (finalText.trim()) {
        const text = finalText.trim();
        setFinalTranscript(text);
        // Guard against a double-fire from onresult + onend.
        if (!onTranscriptRef.current) return;
        wantToListenRef.current = false;
        onTranscriptRef.current(text);
      }
    };

    recognition.onerror = (event) => {
      const code = RECOGNITION_ERROR_MAP[event.error] ?? 'unknown';
      if (code !== 'aborted') fail(code);
      setIsListening(false);
      onListeningChangeRef.current?.(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      onListeningChangeRef.current?.(false);
      // Ended without producing any final result.
      if (wantToListenRef.current && !finalText.trim()) {
        fail('no-speech');
      }
      wantToListenRef.current = false;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // Chrome throws if start() is called while already running.
      setIsListening(false);
    }
    // Note: no dependency on `isSupported` — the ref is read instead.
  }, [fail, lang]);

  // Hard-stop everything when the component unmounts.
  useEffect(() => {
    // Capture the instances now; refs may have moved by cleanup time.
    const recognition = recognitionRef.current;
    const envelope = envelopeRef.current;

    return () => {
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // Already gone.
        }
        recognitionRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      envelope.stop();
      resetLipSync();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    isSupported,
    isListening,
    isSpeaking,
    interimTranscript,
    finalTranscript,
    error,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    clearError,
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
  };
}