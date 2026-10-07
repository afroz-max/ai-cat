/**
 * POST /api/chat — the AI brain.
 *
 * The browser posts the user's message plus recent history; Gemini is called
 * from this server route only, so GEMINI_API_KEY never reaches the client.
 */

import { NextResponse } from 'next/server';

import {
  GeminiError,
  generateReply,
  toHttpStatus,
  toUserFacingMessage,
} from '@/lib/gemini';
import type { ChatRequestBody } from '@/types/avatar';

// Always execute dynamically — this route must never be statically cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY = 30;

function isValidTurn(value: unknown): value is { role: 'user' | 'assistant'; text: string } {
  if (typeof value !== 'object' || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (
    (turn.role === 'user' || turn.role === 'assistant') &&
    typeof turn.text === 'string'
  );
}

export async function POST(request: Request) {
  let payload: Partial<ChatRequestBody>;

  try {
    payload = (await request.json()) as Partial<ChatRequestBody>;
  } catch {
    return NextResponse.json(
      { error: 'That message could not be read.' },
      { status: 400 },
    );
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';

  if (!message) {
    return NextResponse.json(
      { error: "I didn't catch that. Please say something." },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: 'That message is a little too long.' },
      { status: 400 },
    );
  }

  const rawHistory = Array.isArray(payload.history) ? payload.history : [];
  const history = rawHistory.filter(isValidTurn).slice(-MAX_HISTORY);

  try {
    const reply = await generateReply({
      message,
      history,
      persona: typeof payload.persona === 'string' ? payload.persona : undefined,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    // Log the diagnostic detail server-side only. `logDiagnostic` inside
    // lib/gemini has already redacted the API key; the code/status/model below
    // are non-sensitive and make the terminal output immediately actionable.
    const code = error instanceof GeminiError ? error.code : 'unknown';
    const upstreamStatus = error instanceof GeminiError ? error.httpStatus : undefined;
    const model = error instanceof GeminiError ? error.model : undefined;

    console.error('[api/chat] Gemini request failed', {
      code,
      upstreamStatus,
      model,
      message: error instanceof Error ? error.message : String(error),
    });

    // The browser only ever receives the safe, human-facing string.
    return NextResponse.json(
      { error: toUserFacingMessage(error) },
      { status: toHttpStatus(error) },
    );
  }
}