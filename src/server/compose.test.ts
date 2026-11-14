// /api/compose with a fake Claude: no test calls the real API or spends money.
import Anthropic from '@anthropic-ai/sdk';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { STARTER } from '../shared/piece.js';
import { INSTRUCTIONS } from '../shared/prompt.js';
import { createApp } from './app.js';
import { DEFAULT_MODEL, MAX_OUTPUT_TOKENS, type MessagesApi } from './compose.js';
import { Limiter } from './limiter.js';

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;

const staticRoot = mkdtempSync(join(tmpdir(), 'groove-loom-compose-'));

const GOOD_REPLY = {
  reply: 'I added a trumpet playing 3 notes spread over 8 steps.',
  piece: {
    tempo: 100,
    key: 'A',
    scale: 'minor',
    swing: 0,
    layers: [
      ...STARTER.layers.map((l) => ({ notes: null, octave: 0, muted: false, ...l })),
      {
        id: 'tpt',
        name: 'Trumpet',
        instrument: 'trumpet',
        notes: '0 2 4',
        rhythm: { mode: 'euclid', hits: 3, steps: 8, rotate: 1 },
        volume: 0.7,
        tone: 0.5,
        space: 0.2,
        octave: 0,
        muted: false,
        about: 'Syncopated stabs.',
      },
    ],
  },
};

function message(overrides: Partial<Message> & { text?: string } = {}): Message {
  const { text = JSON.stringify(GOOD_REPLY), ...rest } = overrides;
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: DEFAULT_MODEL,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 120, output_tokens: 300, cache_read_input_tokens: 1500, cache_creation_input_tokens: 0 },
    ...rest,
  } as unknown as Message;
}

function setup(opts: { reply?: Message | Error; inviteCode?: string | null; noKey?: boolean; limiter?: Limiter; model?: string } = {}) {
  const calls: Params[] = [];
  const logs: Record<string, unknown>[] = [];
  const messages: MessagesApi = {
    create: vi.fn(async (params: Params) => {
      calls.push(params);
      if (opts.reply instanceof Error) throw opts.reply;
      return opts.reply ?? message();
    }),
  };
  const app = createApp({
    staticRoot,
    compose: {
      messages: opts.noKey ? null : messages,
      inviteCode: opts.inviteCode === undefined ? 'open-sesame' : opts.inviteCode,
      limiter: opts.limiter,
      model: opts.model,
      log: (e) => logs.push(e),
    },
  });
  const post = (body: unknown, headers: Record<string, string> = { 'x-invite-code': 'open-sesame' }) =>
    app.request('/api/compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { app, post, calls, logs };
}

const ask = { request: 'throw in a syncopated trumpet', piece: STARTER, history: [{ who: 'you', text: 'hello' }] };

describe('GET /api/status', () => {
  it('reports the AI on only when a key and an invite code are configured', async () => {
    expect(await (await setup().app.request('/api/status')).json()).toEqual({ ai: true });
    expect(await (await setup({ noKey: true }).app.request('/api/status')).json()).toEqual({ ai: false });
    expect(await (await setup({ inviteCode: null }).app.request('/api/status')).json()).toEqual({ ai: false });
  });
});

describe('POST /api/compose: success', () => {
  it('returns the reply and a sanitized piece', async () => {
    const { post } = setup();
    const res = await post(ask);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; piece: { layers: { id: string }[] } };
    expect(body.reply).toBe(GOOD_REPLY.reply);
    expect(body.piece.layers.map((l: { id: string }) => l.id)).toEqual(['kick', 'snare', 'hats', 'bass', 'tpt']);
  });

  it('asks Claude with the cached instructions, the schema, an output cap and refusal fallbacks', async () => {
    const { post, calls } = setup();
    await post(ask);
    const p = calls[0]!;
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(p.system).toEqual([{ type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } }]);
    expect(p.output_config?.format?.type).toBe('json_schema');
    expect(p.output_config?.effort).toBe('low');
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.fallbacks).toBe('default');
    const user = p.messages[0]!.content as string;
    expect(user).toContain("Person's new request: throw in a syncopated trumpet");
    expect(user).toContain('Person: hello');
    expect(user).not.toContain('You are the musical brain'); // instructions only in the cached system prompt
  });

  it('leaves out fallbacks for a model that does not support them', async () => {
    const { post, calls } = setup({ model: 'claude-haiku-5-5' });
    await post(ask);
    expect(calls[0]!.model).toBe('claude-haiku-5-5');
    expect(calls[0]!.fallbacks).toBeUndefined();
    expect(calls[0]!.betas).toBeUndefined();
  });

  it('drops anything hostile in the model reply', async () => {
    const hostile = {
      reply: 'ok',
      piece: { tempo: 9999, key: 'H', scale: 'evil', swing: 0, code: 'alert(1)', layers: [{ id: '<x>', instrument: 'theremin' }, { instrument: 'kick', name: 'K', extra: 1 }] },
    };
    const { post } = setup({ reply: message({ text: JSON.stringify(hostile) }) });
    type Out = { piece: { tempo: number; key: string; code?: string; layers: Record<string, unknown>[] } };
    const body = (await (await post(ask)).json()) as Out;
    expect(body.piece.tempo).toBe(180);
    expect(body.piece.key).toBe('A'); // falls back to the current piece
    expect(body.piece.code).toBeUndefined();
    expect(body.piece.layers).toHaveLength(1);
    expect(body.piece.layers[0]!.extra).toBeUndefined();
  });

  it('tells the person when a layer was left out because the loom was full', async () => {
    const layers = [
      ...Array.from({ length: 8 }, (_, i) => ({ ...GOOD_REPLY.piece.layers[0]!, id: `d${i}`, name: `Drum ${i}` })),
      { ...GOOD_REPLY.piece.layers[4]!, id: 'pno', name: 'Piano', instrument: 'piano' },
    ];
    const reply = { reply: 'I added a piano playing broken chords.', piece: { ...GOOD_REPLY.piece, layers } };
    const { post, logs } = setup({ reply: message({ text: JSON.stringify(reply) }) });
    const body = (await (await post(ask)).json()) as { reply: string; piece: { layers: unknown[] } };
    expect(body.piece.layers).toHaveLength(8);
    expect(body.reply).toBe(
      "I added a piano playing broken chords.\n\nThe loom holds at most 8 layers, so Piano wasn't added. Remove a layer, or ask me to swap one out.",
    );
    expect(logs[0]).toMatchObject({ overLimit: 1, unknownInstrument: 0 });
    expect(JSON.stringify(logs)).not.toContain('Piano');
  });

  it('logs usage but never the request, the piece or the reply', async () => {
    const { post, logs } = setup();
    await post(ask);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: 'compose', status: 200, in: 120, out: 300, cacheRead: 1500 });
    const line = JSON.stringify(logs);
    expect(line).not.toContain('trumpet');
    expect(line).not.toContain('hello');
    expect(line).not.toContain('open-sesame');
  });
});

describe('POST /api/compose: access and limits', () => {
  it('is unavailable without a key or an invite code configured', async () => {
    for (const s of [setup({ noKey: true }), setup({ inviteCode: null })]) {
      const res = await s.post(ask);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'unavailable' });
      expect(s.calls).toHaveLength(0);
    }
  });

  it.each([
    ['no code', {}],
    ['a wrong code', { 'x-invite-code': 'open-sesam' }],
    ['a longer code', { 'x-invite-code': 'open-sesame!' }],
  ])('refuses %s', async (_why, headers) => {
    const { post, calls } = setup();
    const res = await post(ask, headers as Record<string, string>);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'forbidden' });
    expect(calls).toHaveLength(0);
  });

  it('rate-limits per visitor and says when to retry', async () => {
    const limiter = new Limiter({ perMinute: 2, perDay: 100, globalPerDay: 1000 });
    const { post, calls } = setup({ limiter });
    expect((await post(ask)).status).toBe(200);
    expect((await post(ask)).status).toBe(200);
    const res = await post(ask);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    expect(calls).toHaveLength(2);
  });

  it('limits by the address the proxy added, not one the visitor sent', async () => {
    const limiter = new Limiter({ perMinute: 1, perDay: 100, globalPerDay: 1000 });
    const { post } = setup({ limiter });
    const as = (spoof: string) => ({ 'x-invite-code': 'open-sesame', 'x-forwarded-for': `${spoof}, 198.51.100.9` });
    expect((await post(ask, as('1.1.1.1'))).status).toBe(200);
    expect((await post(ask, as('2.2.2.2'))).status).toBe(429);
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['no request', { piece: STARTER }],
    ['an empty request', { request: '   ', piece: STARTER }],
    ['no piece', { request: 'hi' }],
    ['a bad history', { request: 'hi', piece: STARTER, history: [{ who: 'admin', text: 'x' }] }],
    ['a history that is not a list', { request: 'hi', piece: STARTER, history: 'x' }],
  ])('rejects a body with %s', async (_why, body) => {
    const { post, calls } = setup();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects an oversized body', async () => {
    const { post } = setup();
    expect((await post({ ...ask, request: 'x'.repeat(40_000) })).status).toBe(400);
  });

  it('trims an over-long request before sending it', async () => {
    const { post, calls } = setup();
    await post({ ...ask, request: 'y'.repeat(2000) });
    expect(calls[0]!.messages[0]!.content as string).toContain('y'.repeat(500) + '');
    expect(calls[0]!.messages[0]!.content as string).not.toContain('y'.repeat(501));
  });
});

describe('POST /api/compose: failures from Claude', () => {
  it.each([
    ['a refusal', message({ stop_reason: 'refusal' }), 422, 'refused'],
    ['running out of tokens', message({ stop_reason: 'max_tokens' }), 502, 'invalid_json'],
    ['text that is not JSON', message({ text: 'Sure! Here is a trumpet.' }), 502, 'invalid_json'],
    ['JSON without a piece', message({ text: '{"reply":"hi"}' }), 502, 'invalid_json'],
    ['no text block', message({ content: [] }), 502, 'invalid_json'],
  ])('maps %s to %s', async (_why, reply, status, error) => {
    const { post } = setup({ reply });
    const res = await post(ask);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it.each([
    ['a rate limit', new Anthropic.RateLimitError(429, {}, 'slow down', new Headers()), 429, 'rate_limited'],
    ['an overload', Anthropic.APIError.generate(529, { error: { type: 'overloaded_error' } }, 'busy', new Headers()), 503, 'busy'],
    ['a connection failure', new Anthropic.APIConnectionError({ message: 'down' }), 503, 'busy'],
    ['a bad request', new Anthropic.BadRequestError(400, {}, 'bad', new Headers()), 502, 'failed'],
    ['anything else', new Error('boom'), 502, 'failed'],
  ])('maps %s to %s', async (_why, error, status, code) => {
    const { post } = setup({ reply: error });
    const res = await post(ask);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code });
  });
});
