// POST /api/compose: asks Claude for a new piece. The server holds the API
// key; the browser never sees it. Claude's reply must match COMPOSE_SCHEMA
// (structured outputs) and then passes through sanitizePiece, so only
// whitelisted, clamped data goes back to the page.
import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { COMPOSE_SCHEMA } from '../shared/compose-schema.js';
import { cleanText, droppedLayers, droppedNote, sanitizePiece, type Piece } from '../shared/piece.js';
import { INSTRUCTIONS, buildRequest, type ChatMessage } from '../shared/prompt.js';
import { Limiter } from './limiter.js';
import { parsesAsMini } from './mini.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Caps the cost of one request. Thinking counts towards it, so leave room beyond the reply itself. */
export const MAX_OUTPUT_TOKENS = 8000;

/** Models that accept server-side refusal fallbacks (fallbacks: "default"). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-fable-5-1']);

const MAX_REQUEST_CHARS = 500;
const MAX_HISTORY = 20;

/** The one Claude call the handler makes. A fake stands in for it in tests. */
export interface MessagesApi {
  create(
    params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Beta.Messages.BetaMessage>;
}

export interface ComposeOptions {
  /** Null when no API key is configured: the AI is off. */
  messages: MessagesApi | null;
  /** Null when no invite code is configured: the AI is off. */
  inviteCode: string | null;
  model?: string;
  limiter?: Limiter;
  log?: (entry: Record<string, unknown>) => void;
}

export type ComposeErrorCode = 'unavailable' | 'forbidden' | 'bad_request' | 'rate_limited' | 'busy' | 'refused' | 'invalid_json' | 'failed';

const fail = (c: Context, status: 400 | 401 | 422 | 429 | 502 | 503, error: ComposeErrorCode) => c.json({ error }, status);

function sameCode(given: string, expected: string): boolean {
  const a = Buffer.from(given),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The visitor's address. Railway's proxy appends it to X-Forwarded-For, so the
 * last entry is the one to trust: earlier entries can be set by the visitor.
 */
export function clientKey(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',').pop()?.trim() || 'local';
}

function readHistory(raw: unknown): ChatMessage[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY)) {
    if (!m || typeof m !== 'object') return null;
    const { who, text, err } = m as Record<string, unknown>;
    if ((who !== 'you' && who !== 'loom') || typeof text !== 'string') return null;
    out.push({ who, text: cleanText(text, MAX_REQUEST_CHARS), err: err === true });
  }
  return out;
}

export function mountCompose(app: Hono, options: ComposeOptions): void {
  const model = options.model || DEFAULT_MODEL;
  const limiter = options.limiter ?? new Limiter();
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const enabled = !!options.messages && !!options.inviteCode;

  app.get('/api/status', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ ai: enabled });
  });

  app.post('/api/compose', bodyLimit({ maxSize: 32 * 1024, onError: (c) => fail(c, 400, 'bad_request') }), async (c) => {
    const started = Date.now();
    const done = (status: number, extra: Record<string, unknown> = {}) =>
      // Never log what people typed, their pieces or any key.
      log({ event: 'compose', status, ms: Date.now() - started, model, ...extra });

    if (!enabled || !options.messages || !options.inviteCode) {
      done(503, { reason: 'not_configured' });
      return fail(c, 503, 'unavailable');
    }
    const code = c.req.header('x-invite-code') ?? '';
    if (!code || !sameCode(code, options.inviteCode)) {
      done(401);
      return fail(c, 401, 'forbidden');
    }

    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      done(400);
      return fail(c, 400, 'bad_request');
    }
    const request = typeof body?.request === 'string' ? cleanText(body.request, MAX_REQUEST_CHARS).trim() : '';
    const piece = sanitizePiece(body?.piece, null, parsesAsMini);
    const history = readHistory(body?.history);
    if (!request || !piece || !history) {
      done(400);
      return fail(c, 400, 'bad_request');
    }

    const limit = limiter.take(clientKey(c));
    if (!limit.ok) {
      c.header('Retry-After', String(limit.retryAfterSeconds));
      done(429, { scope: limit.scope });
      return fail(c, 429, 'rate_limited');
    }

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await options.messages.create(
        {
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          // The fixed instructions are cached between requests; only the piece and request vary.
          system: [{ type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: buildRequest(request, piece, history) }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: COMPOSE_SCHEMA } },
          ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal: c.req.raw.signal },
      );
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) {
        done(429, { upstream: 'rate_limit' });
        return fail(c, 429, 'rate_limited');
      }
      if (e instanceof Anthropic.APIConnectionError) {
        done(503, { upstream: 'connection' });
        return fail(c, 503, 'busy');
      }
      if (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503 || e.type === 'overloaded_error')) {
        done(503, { upstream: 'overloaded' });
        return fail(c, 503, 'busy');
      }
      if (e instanceof Anthropic.APIError) {
        done(502, { upstream: e.status ?? 'error', type: e.type ?? null });
        return fail(c, 502, 'failed');
      }
      done(502, { upstream: 'unknown' });
      return fail(c, 502, 'failed');
    }

    const usage = {
      stop: message.stop_reason,
      in: message.usage.input_tokens,
      out: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      servedBy: message.model,
    };
    if (message.stop_reason === 'refusal') {
      done(422, usage);
      return fail(c, 422, 'refused');
    }
    if (message.stop_reason !== 'end_turn') {
      done(502, usage);
      return fail(c, 502, 'invalid_json');
    }
    const text = message.content.find((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')?.text;
    let parsed: { reply?: unknown; piece?: unknown };
    try {
      parsed = JSON.parse(text ?? '');
    } catch {
      done(502, { ...usage, reason: 'unparseable' });
      return fail(c, 502, 'invalid_json');
    }
    const next: Piece | null = sanitizePiece(parsed?.piece, piece, parsesAsMini);
    if (!next) {
      done(502, { ...usage, reason: 'invalid_piece' });
      return fail(c, 502, 'invalid_json');
    }
    // If the checks left anything out, say so: the reply may describe layers that never made it in.
    const dropped = droppedLayers(parsed.piece, next);
    const note = droppedNote(dropped);
    done(200, { ...usage, overLimit: dropped.overLimit.length, unknownInstrument: dropped.unknownInstrument.length });
    const reply = cleanText(parsed.reply, 500) || 'Done.';
    return c.json({ reply: note ? `${reply}\n\n${note}` : reply, piece: next });
  });
}
