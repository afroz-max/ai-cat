/**
 * Lip-sync signal bus.
 *
 * A tiny, framework-free channel between the voice layer (which knows *when*
 * the character is talking) and the render loop (which needs a number every
 * frame).
 *
 * It deliberately lives outside React state: writing to it 60×/second through
 * `useState` would re-render the whole tree. Components read it inside
 * `useFrame` instead, so animation costs zero renders.
 *
 * ---------------------------------------------------------------------------
 * UPGRADING TO REAL AUDIO
 * When you swap SpeechSynthesis for ElevenLabs / a WebSocket stream, replace
 * the contents of `sampleLipSync()` with an AnalyserNode RMS read:
 *
 *   const data = new Uint8Array(analyser.frequencyBinCount);
 *   analyser.getByteTimeDomainData(data);
 *   let sum = 0;
 *   for (const v of data) { const n = (v - 128) / 128; sum += n * n; }
 *   lipSyncSignal.value = Math.min(1, Math.sqrt(sum / data.length) * 4);
 *
 * Nothing else in the app needs to change — the morph/mesh appliers already
 * just read `lipSyncSignal`.
 * ---------------------------------------------------------------------------
 */

export interface LipSyncSignal {
  /** 0 (closed) → 1 (wide open). Clamped by the applier. */
  value: number;
  /** True while the character is producing voice. */
  active: boolean;
  /** Which mouth shape family to bias toward, for expression-aware visemes. */
  shape: Viseme;
}

/** Coarse mouth-shape families, mapped to blend shapes when the GLB has them. */
export type Viseme = 'aa' | 'E' | 'I' | 'O' | 'U' | 'closed';

export const lipSyncSignal: LipSyncSignal = {
  value: 0,
  active: false,
  shape: 'aa',
};

/** True if the runtime has already produced an amplitude for this frame. */
let externalProviderAttached = false;

/** Reset to a neutral closed mouth. */
export function resetLipSync(): void {
  lipSyncSignal.value = 0;
  lipSyncSignal.active = false;
  lipSyncSignal.shape = 'aa';
}

/**
 * Lets a real TTS/analyser implementation take over the amplitude.
 * When attached, the text-envelope generator is bypassed entirely.
 */
export function attachExternalLipSyncProvider(): void {
  externalProviderAttached = true;
}

export function isExternalLipSyncProviderAttached(): boolean {
  return externalProviderAttached;
}
/** One syllable-ish chunk of speech with its own timing and mouth shape. */
interface SpeechChunk {
  /** Offset from the start of the utterance, in seconds. */
  offset: number;
  /** Chunk length, in seconds. */
  duration: number;
  /** 0 → 1 target openness for this chunk. */
  openness: number;
  shape: Viseme;
}

const VOWELS = /[aeiouy]/i;

/**
 * Picks a plausible viseme family from a word's vowel content.
 * Rough, but it produces believable variation instead of a constant "aa".
 */
export function inferViseme(word: string): Viseme {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 'closed';
  if (/u{2,}|oo/.test(w)) return 'U';
  if (/ee|ea|ie|y$/.test(w)) return 'I';
  if (/oo|ou|ew/.test(w)) return 'O';
  if (/e{1,}/.test(w)) return 'E';
  if (/a{1,}/.test(w)) return 'aa';
  return 'aa';
}

/**
 * Builds a timeline of mouth-open chunks from plain text.
 *
 * Browser `speechSynthesis` gives us no audio waveform, so we synthesise a
 * plausible envelope from the text itself: every word becomes one or more
 * chunks sized by its syllable count, and each chunk is modulated by its
 * vowel content. This is why the mouth moves rhythmically and unevenly
 * rather than snapping to a single static open.
 */
export function buildSpeechEnvelope(text: string, totalSeconds: number): SpeechChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || totalSeconds <= 0) return [];

  // Rough speech rate: ~14 characters per second is a natural conversational pace.
  const charCount = Math.max(1, words.join(' ').length);
  const scaledTotal = Math.max(totalSeconds, charCount / 14);

  // Weight each word by its syllable count so long words get more mouth time.
  const weights = words.map((w) => {
    const syllables = (w.toLowerCase().match(new RegExp(VOWELS, 'g')) ?? []).length;
    return Math.max(1, syllables);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const chunks: SpeechChunk[] = [];
  let cursor = 0;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? '';
    const weight = weights[i] ?? 1;
    const duration = (weight / totalWeight) * scaledTotal;

    // Vowel density drives how wide this word's mouth movement gets.
    const vowelCount = (word.toLowerCase().match(new RegExp(VOWELS, 'g')) ?? []).length;
    const density = vowelCount / Math.max(1, word.length);
    // Consonant-heavy words ("strs", "hmm") barely open the mouth.
    const baseOpen = 0.18 + density * 1.05;

    // Split longer words into sub-chunks so movement pulses within the word.
    const syllables = weight;
    const sub = Math.min(3, Math.max(1, syllables));
    const subDuration = duration / sub;

    for (let s = 0; s < sub; s += 1) {
      // Fade in/out at chunk edges for a natural attack/release.
      const peak = Math.min(1, baseOpen * (0.75 + Math.random() * 0.45));
      chunks.push({
        offset: cursor + s * subDuration,
        duration: subDuration,
        openness: s === sub - 1 ? peak * 0.6 : peak, // trailing syllable tapers
        shape: inferViseme(word),
      });
    }

    cursor += duration;
  }

  return chunks;
}

/** Controller that turns a speech envelope into a per-frame amplitude. */
export class SpeechEnvelopePlayer {
  private chunks: SpeechChunk[] = [];
  private startedAt = 0;
  private duration = 0;

  start(text: string, duration: number, startedAt: number = performance.now() / 1000): void {
    this.chunks = buildSpeechEnvelope(text, duration);
    this.duration = duration;
    this.startedAt = startedAt;
  }

  stop(): void {
    this.chunks = [];
    this.duration = 0;
  }

  /** Samples the envelope at `now` (seconds). Returns 0 → 1. */
  sample(now: number): number {
    if (this.chunks.length === 0) return 0;

    const t = now - this.startedAt;
    if (t < 0 || t > this.duration) return 0;

    for (const chunk of this.chunks) {
      if (t < chunk.offset || t > chunk.offset + chunk.duration) continue;

      const local = (t - chunk.offset) / chunk.duration; // 0 → 1 within chunk
      // Raised-sine window: smooth open/close, no hard edges.
      const window = Math.sin(local * Math.PI);

      // Jitter so consecutive syllables differ slightly in intensity.
      const jitter = 0.88 + Math.random() * 0.24;

      lipSyncSignal.value = Math.min(1, chunk.openness * window * jitter);
      lipSyncSignal.shape = chunk.shape;
      return lipSyncSignal.value;
    }

    // Between words: mouth mostly closed, but not clamped — keeps it alive.
    lipSyncSignal.value = 0.06;
    lipSyncSignal.shape = 'closed';
    return lipSyncSignal.value;
  }
}