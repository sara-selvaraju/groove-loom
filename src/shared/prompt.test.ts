import { describe, expect, it } from 'vitest';
import { STARTER, sanitizePiece } from './piece.js';
import { buildPrompt, type ChatMessage } from './prompt.js';
import { parsesAsMini } from './test-support.js';
import { INSTR, KEYS, MAX_LAYERS, SCALES } from './vocabulary.js';

const piece = sanitizePiece(STARTER, null, parsesAsMini)!;

describe('buildPrompt', () => {
  it('offers exactly the whitelisted vocabulary', () => {
    const prompt = buildPrompt('add a trumpet', piece, []);
    expect(prompt).toContain(JSON.stringify(KEYS));
    expect(prompt).toContain(JSON.stringify(Object.keys(SCALES)));
    expect(prompt).toContain(`at most ${MAX_LAYERS}`);
    for (const name of Object.keys(INSTR)) expect(prompt).toContain(`${name} (`);
  });

  it('asks for data, never code', () => {
    const prompt = buildPrompt('add a trumpet', piece, []);
    expect(prompt).toContain('You never write code.');
    expect(prompt).toContain('{"reply": string, "words": Word[], "piece": Piece}');
  });

  it('includes the current piece without solo flags', () => {
    const soloed = { ...piece, layers: piece.layers.map((l, i) => ({ ...l, solo: i === 0 })) };
    const prompt = buildPrompt('x', soloed, []);
    const current = JSON.parse(prompt.split('Current piece:\n')[1]!.split('\n\nRecent conversation:')[0]!);
    expect(current.layers).toHaveLength(piece.layers.length);
    expect(current.layers.some((l: Record<string, unknown>) => 'solo' in l)).toBe(false);
    expect(current.layers[0].muted).toBe(false);
  });

  it('sends the last six messages that were not errors', () => {
    const history: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({ who: i % 2 ? 'loom' : 'you', text: `m${i}` }));
    history.push({ who: 'loom', text: 'oops', err: true });
    const prompt = buildPrompt('next', piece, history);
    const recent = prompt.split('Recent conversation:\n')[1]!.split('\n\nPerson')[0]!;
    expect(recent.split('\n')).toEqual(['Person: m4', 'You: m5', 'Person: m6', 'You: m7', 'Person: m8', 'You: m9']);
    expect(prompt).not.toContain('oops');
    expect(prompt.endsWith("Person's new request: next")).toBe(true);
  });

  it('says when there is no conversation yet', () => {
    expect(buildPrompt('hi', piece, [])).toContain('Recent conversation:\n(none)');
  });
});
