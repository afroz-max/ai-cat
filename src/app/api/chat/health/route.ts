/**
 * GET /api/chat/health — safe configuration diagnostics.
 *
 * Reports whether the AI is configured and which models will be attempted.
 * It NEVER returns the API key, only a boolean plus a length fingerprint.
 * Safe to hit from the browser while debugging.
 */

import { NextResponse } from 'next/server';

import { DEFAULT_MODELS, hasUsableApiKey, resolveModelCandidatesPublic } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const configured = hasUsableApiKey();

  return NextResponse.json({
    configured,
    // Length only — never any part of the key itself.
    keyLength: configured ? process.env.GEMINI_API_KEY?.trim().length : 0,
    modelsToTry: resolveModelCandidatesPublic(),
    defaults: DEFAULT_MODELS,
    reason: configured
      ? 'GEMINI_API_KEY is set.'
      : 'GEMINI_API_KEY is missing, empty, or still the template placeholder "your_api_key_here".',
  });
}