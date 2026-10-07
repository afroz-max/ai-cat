/**
 * Central domain types for the AI Talking Girl application.
 * Kept dependency-free so they can be imported from client, server and R3F code.
 */

/** High level lifecycle of the character, drives UI + animation. */
export type CharacterState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'surprised'
  | 'sad';

/** Facial expression presets. Maps onto morph targets when available. */
export type Expression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'thinking'
  | 'excited';

/** A single turn in the conversation. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Epoch milliseconds, used for the timestamp shown in the chat panel. */
  timestamp: number;
}

/** Wire format sent to and returned from `/api/chat`. */
export interface ChatRequestBody {
  message: string;
  history: Array<Pick<ChatMessage, 'role' | 'text'>>;
  /** Optional personality override so multiple characters are possible later. */
  persona?: string;
}

export interface ChatResponseBody {
  reply: string;
  error?: string;
}

/** Everything the 3D rig needs to know about what the character is doing. */
export interface AvatarRigState {
  state: CharacterState;
  expression: Expression;
  /** 0 → 1 mouth aperture for the current frame. */
  mouthOpen: number;
  /** 0 → 1, how "alive" the character feels; scales idle motion amplitude. */
  energy: number;
}

/** Metadata describing whichever avatar geometry is currently mounted. */
export interface AvatarSourceInfo {
  kind: 'model' | 'placeholder';
  /** Human readable label surfaced in the UI so placeholders are never faked. */
  label: string;
  /** True when the GLB exposes blend shapes we can drive for expressions. */
  hasMorphTargets: boolean;
  /** True when a mouth/jaw blend shape was found and is being used for lip-sync. */
  hasMouthMorph: boolean;
  morphTargetNames: string[];
}

/** Tunables for the procedural placeholder avatar. */
export interface PlaceholderAvatarOptions {
  scale?: number;
  /** Rendered when no GLB is present, so the scene is never empty. */
  showPlaceholderNote?: boolean;
}

/** User facing error surface — never contains raw server or API internals. */
export type VoiceErrorCode =
  | 'permission-denied'
  | 'service-blocked'
  | 'unsupported-browser'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'unknown';

export const VOICE_ERROR_MESSAGES: Record<VoiceErrorCode, string> = {
  'permission-denied':
    'Microphone is blocked. Click the lock icon in the address bar → allow microphone, then tap the mic again. You can also type below.',
  'service-blocked':
    'Browser blocked the speech service. In Brave, turn Shields down for this site (or allow Google speech), then retry. In Chrome, check internet access. You can also type below.',
  'unsupported-browser':
    'Voice input requires Chrome or Edge. You can still type below.',
  'no-speech':
    "I didn't hear anything. Speak a little louder and closer to the mic, then tap to try again — or type your message below.",
  'audio-capture':
    'No microphone found. Plug in a mic or use the text box below to chat.',
  network:
    'Speech service lost connection (it needs internet). Check connection and retry, or type your message below.',
  aborted: 'Listening stopped. Tap the mic to start again, or type below.',
  unknown:
    'Something interrupted listening. Tap the mic to retry — text chat below always works.',
};