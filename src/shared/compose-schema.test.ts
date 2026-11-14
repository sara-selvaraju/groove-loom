import { describe, expect, it } from 'vitest';
import { COMPOSE_SCHEMA } from './compose-schema.js';
import { STARTER, sanitizePiece } from './piece.js';
import { INSTRUCTIONS, buildPrompt, buildRequest } from './prompt.js';
import { parsesAsMini } from './test-support.js';
import { INSTR, KEYS, SCALES } from './vocabulary.js';

type Node = Record<string, unknown>;
function* objects(node: unknown): Generator<Node> {
  if (!node || typeof node !== 'object') return;
  const n = node as Node;
  if (n.type === 'object') yield n;
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) for (const x of v) yield* objects(x);
    else yield* objects(v);
  }
}

describe('COMPOSE_SCHEMA', () => {
  it('follows the structured-output rules: every object closed, every property required', () => {
    const all = [...objects(COMPOSE_SCHEMA)];
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const o of all) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as Node).sort());
    }
  });

  it('uses no constraints the API does not support', () => {
    const text = JSON.stringify(COMPOSE_SCHEMA);
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf', 'minItems', 'maxItems']) expect(text).not.toContain(`"${k}"`);
  });

  it('offers exactly the whitelisted keys, scales and instruments', () => {
    const piece = COMPOSE_SCHEMA.properties.piece.properties;
    expect(piece.key.enum).toEqual([...KEYS]);
    expect(piece.scale.enum).toEqual(Object.keys(SCALES));
    expect(piece.layers.items.properties.instrument.enum).toEqual(Object.keys(INSTR));
  });
});

describe('prompt split for caching', () => {
  const piece = sanitizePiece(STARTER, null, parsesAsMini)!;

  it('keeps everything that varies out of the cached instructions', () => {
    expect(INSTRUCTIONS).not.toContain('Current piece');
    expect(INSTRUCTIONS).not.toContain('Recent conversation');
    expect(INSTRUCTIONS).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no dates
  });

  it('puts the piece, conversation and request in the per-request part', () => {
    const req = buildRequest('add a flute', piece, [{ who: 'you', text: 'hi' }]);
    expect(req.startsWith('Current piece:')).toBe(true);
    expect(req).toContain('Person: hi');
    expect(req.endsWith("Person's new request: add a flute")).toBe(true);
  });

  it('joins back into the whole prompt', () => {
    expect(buildPrompt('x', piece, [])).toBe(`${INSTRUCTIONS}\n\n${buildRequest('x', piece, [])}`);
  });
});
