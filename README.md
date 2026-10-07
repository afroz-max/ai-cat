# ✨ AI Talking Girl

An interactive 3D AI character that **listens, thinks, speaks and visibly reacts**.

Built with Next.js 15, React 19, TypeScript, Tailwind CSS, Three.js /
React Three Fiber, and Gemini as the server-side brain.

---

## ⚡ Current status — read this first

| Feature | Status |
| --- | --- |
| 3D character, blinking, breathing, head motion | ✅ Working |
| Microphone button (click / press-and-hold / keyboard) | ✅ Working |
| Speech → text (Web Speech Recognition) | ✅ Working (Chromium browsers) |
| Gemini AI replies via `/api/chat` | ✅ Working — **needs your API key** |
| Text → speech + lip-sync | ✅ Working (browser SpeechSynthesis) |
| Character states + expressions | ✅ Working |
| Chat panel (minimise / maximise, mobile sheet) | ✅ Working |
| **`girl.glb` 3D model** | ❌ **Not present — using placeholder avatar** |

Two things to do before the AI will actually reply:

1. **Add your Gemini API key** → `.env.local`
2. **Optional:** drop your model at `public/models/girl.glb`

The app runs fine without a model — see **Placeholders** below.

---

## 🔎 Verifying your Gemini setup

```bash
curl http://localhost:3000/api/chat/health
```

```json
{
  "configured": false,
  "keyLength": 0,
  "modelsToTry": ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"],
  "reason": "GEMINI_API_KEY is missing, empty, or still the template placeholder \"your_api_key_here\"."
}
```

`configured: true` means the key is present. The endpoint reports only a key
**length**, never the key itself.

### Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| `AI is not configured yet.` (503) | Key still `your_api_key_here` | Paste your real key into `.env.local`, restart the server |
| `AI is temporarily unavailable.` (502) with `model_unavailable` in the log | Configured model was shut down | Unset `GEMINI_MODEL` to use the auto fallback chain |
| Same, with `invalid_api_key` | Key rejected by Google | Re-copy the key; confirm the Generative Language API is enabled |

Every failure logs a redacted diagnostic to the terminal, e.g.

```
[gemini] http_error { model: 'gemini-3.8-flash', status: 400, upstreamStatus: 'INVALID_ARGUMENT', upstreamMessage: 'API key not valid…' }
```

> ⚠️ **Model note:** `gemini-2.0-flash` was **shut down** by Google and now
> returns 404. It has been removed from this project. The app walks a fallback
> chain (`gemini-flash-latest` → `3.8` → `3.7` → `3.6`) so a future model
> retirement degrades gracefully instead of hard-failing.

---

## 🚀 Setup

```bash
npm install
```

### 1. Add your Gemini API key

Get a key at https://aistudio.google.com/apikey, then edit `.env.local`:

```env
GEMINI_API_KEY=your_api_key_here
```

> 🔒 The key is **never** sent to the browser. All Gemini calls happen inside
> `src/app/api/chat/route.ts`, and `src/lib/gemini.ts` is marked `server-only`
> so importing it from a client component fails the build. Verified: no key
> material appears in `.next/static/**`.

Optional overrides (also in `.env.local`):

```env
GEMINI_MODEL=gemini-2.0-flash
GEMINI_TEMPERATURE=0.85
GEMINI_MAX_TOKENS=220
```

### 2. Run

```bash
npm run dev      # http://localhost:3000
```

---

## 🎤 How to test

> **Use Chrome or Edge.** Firefox and Safari do not implement the Web Speech
> Recognition API, so the mic is intentionally disabled there and the app says
> so instead of failing silently. `localhost` is a secure context, so the mic
> works without HTTPS.

### A. Microphone + AI conversation (full voice loop)

1. Open `http://localhost:3000` in **Chrome or Edge**.
2. Wait ~1s. She greets you out loud — you should **see her mouth move**.
3. Click the 🎙️ button (or press-and-hold).
4. **Allow microphone access** when the browser prompt appears.
5. Status pill changes to **🎙️ I'm listening...**
6. Speak normally, e.g. *"Hi, what can you do?"*
7. Stop speaking → recognition ends automatically.
8. Status → **🤔 Give me a second...** (Gemini generating).
9. Status → **🔊 Speaking...** — she answers out loud with **lip-sync**.
10. Status → **✨ Ready to talk**. Repeat as many times as you like.

### B. Test without a microphone

Type into the **"Or type a message..."** box and press Enter. Everything except
speech-to-text works identically — this is also the accessibility path.

### C. Test error handling

| To trigger | Do this |
| --- | --- |
| `No microphone permission.` | Block the mic in address-bar site settings |
| `Speech recognition is not supported...` | Open the page in Firefox or Safari |
| `I didn't catch that.` | Click the mic and say nothing |
| `AI is temporarily unavailable.` | Leave `GEMINI_API_KEY=your_api_key_here` |

### D. Keyboard only

`Tab` to the mic button, then press **Space** or **Enter**. A "Skip to
conversation" link is the first focusable element. State changes are announced
through `aria-live` regions.

---

## 🚧 Placeholders — what is real and what isn't

**Being explicit so nothing here is mistaken for working.**

### 1. The 3D model is a placeholder

`public/models/girl.glb` does not exist. Rather than showing an empty scene,
`PlaceholderAvatar.tsx` builds a stylised character from Three.js primitives.

It is **genuinely animated** — blinking, breathing, head sway, eye tracking,
blush, state reactions and working lip-sync. But it is **not** a realistic
human model.

The header badge always tells you which is live:

* `Placeholder avatar` → no `girl.glb` found
* `Model loaded` → your model is mounted

**To upgrade:** drop a file at `public/models/girl.glb` and refresh. That's it —
`AIGirl` probes for the file at startup and switches automatically. See
[`public/models/README.md`](./public/models/README.md) for the morph-target
names that unlock full facial expressions.

### 2. Lip-sync is amplitude-based, not audio-driven

Browser `speechSynthesis` exposes **no audio waveform**, so there is nothing to
analyse. Instead, `src/lib/lipSync.ts` builds an envelope from the reply text:
each word becomes one or more chunks sized by its syllable count, modulated by
vowel content, with a raised-sine window and per-syllable jitter.

**Result:** varied, rhythmic mouth movement with correct-looking timing — *not*
a static open mouth. It is not phonetically perfect, because it cannot be.

**To upgrade:** swap in ElevenLabs (or similar) and feed the audio through an
`AnalyserNode`. `src/lib/lipSync.ts` documents the exact RMS snippet and the
`attachExternalLipSyncProvider()` hook. No other file needs to change.

### 3. Voice is the browser's built-in TTS

Voice quality is limited by the OS voice list. `useVoice` auto-picks an English
female voice and exposes a selector-ready `voices` array, so replacing the
provider later is a single-function change.

### 4. Memory is in-memory only

Conversation history lives in React state and is **not persisted**. Nothing is
written to disk and no personal data is stored. To add persistence, hydrate
`messages` in `useConversation` from a store.

---

## 🗂️ Project structure

```
src/
├── app/
│   ├── layout.tsx              Root layout, metadata, viewport
│   ├── page.tsx                Shell — wires voice ↔ conversation ↔ 3D
│   ├── globals.css             Tailwind layers, glass utilities, a11y
│   └── api/chat/route.ts       🔒 Server-only Gemini endpoint
├── components/
│   ├── AvatarScene.tsx         Canvas, lighting, camera, loading state
│   ├── AIGirl.tsx              GLB-or-placeholder selection + morph discovery
│   ├── PlaceholderAvatar.tsx   Procedural stand-in character
│   ├── VoiceButton.tsx         Mic: click / hold / keyboard, pulse rings
│   ├── ChatPanel.tsx           Log, timestamps, state badge, minimise
│   ├── CharacterStatus.tsx     State pill + aria-live announcements
│   ├── LipSync.tsx             Morph-target or geometry mouth driver
│   └── ExpressionController.tsx Morph weights + fallback pose animation
├── hooks/
│   ├── useVoice.ts             SpeechRecognition + SpeechSynthesis + errors
│   └── useConversation.ts      Message state, API calls, state machine
├── lib/
│   ├── gemini.ts               🔒 Server-only Gemini client + persona
│   ├── lipSync.ts              Non-React amplitude bus + envelope generator
│   └── morphTargets.ts         Blend-shape alias resolution
├── store/
│   └── avatarStore.ts          Zustand store (state, expression, source)
└── types/
    ├── avatar.ts               Domain types + user-facing error messages
    └── speech.d.ts             Web Speech Recognition ambient declarations

public/models/
├── girl.glb                    ⬜ YOU ADD THIS
└── README.md                   Where to get a model + morph-target names
```

### Why a non-React lip-sync bus?

`lipSyncSignal` lives in `src/lib/lipSync.ts`, **outside** React state. Writing
mouth openness through `useState` at 60fps would re-render the entire tree every
frame. Instead the render loop reads a plain mutable object inside `useFrame`,
so animation costs **zero** React renders.

---

## 🎭 Character states & expressions

**States** (drive the UI and the rig): `idle`, `listening`, `thinking`,
`speaking`, `happy`, `surprised`, `sad`

**Expressions** (drive the face): `neutral`, `happy`, `sad`, `surprised`,
`thinking`, `excited`

Expressions use morph targets when the model has them, and fall back to head
tilt, eye scale, brow tilt and mouth curvature when it doesn't.

---

## ♿ Accessibility

* Semantic `<button>` elements with state-aware `aria-label` and `aria-pressed`
* Mic usable with **Space** / **Enter**
* `role="status"` live regions announce listening and every state change
* `role="log"` on the conversation, `role="alert"` on errors
* Visible focus rings via the `.focus-ring` utility
* Skip-to-conversation link
* Full `prefers-reduced-motion` support

---

## ⚡ Performance

* `dpr={[1, 2]}` — caps retina rendering at 2× to protect the GPU
* Morph-target lookups resolved **once** per model, never per frame
* Frame-rate-independent damping (`delta`-scaled) on all smoothing
* Zustand selectors subscribe to single slices to limit re-renders
* `Suspense` boundaries with a visible loading state
* drei's CDN `<Environment preset>` deliberately **not** used — lighting is
  local, so the app works fully offline

---

## 🗺️ Roadmap-friendly architecture

The seams for future work are already in place:

| Future feature | Where it plugs in |
| --- | --- |
| Real-time WebSocket voice | Replace `sendMessage`'s `fetch` |
| ElevenLabs / better TTS | Swap `speak()`; attach an `AnalyserNode` |
| Real-time audio lip-sync | `attachExternalLipSyncProvider()` |
| Emotion detection | Replace `inferExpression()` in `useConversation` |
| Hindi / Telugu / English | `lang` prop on `useVoice` + a persona selector |
| Persistent memory | Hydrate `messages` in `useConversation` |
| Multiple characters | `persona` already flows through the API route |
| Voice interruption (barge-in) | Cancel TTS in `VoiceButton` on a new press |
| Hand/body animation | Add nodes to `AIGirl`'s rig |

---

## 📜 Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

---

## 🧱 Tech stack

Next.js 15 · React 19 · TypeScript 5.9 · Tailwind CSS 3 · Three.js 0.180 ·
React Three Fiber 9 · drei 10 · Zustand 5 · Gemini API# ai-cat
