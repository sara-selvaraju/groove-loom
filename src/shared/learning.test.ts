import { describe, expect, it } from 'vitest';
import { MAX_CHANGES, describeChanges, sanitizeChanges, sanitizeWords } from './learning.js';
import { STARTER, sanitizePiece, type Piece } from './piece.js';
import { parsesAsMini } from './test-support.js';

const base = (): Piece => sanitizePiece(STARTER, null, parsesAsMini)!;

describe('sanitizeWords', () => {
  it('keeps well-formed entries as plain text', () => {
    const w = { said: 'groovier', term: 'swing', meaning: 'every second note lands a little late' };
    expect(sanitizeWords([w])).toEqual([w]);
  });

  it('treats anything but a list as no words', () => {
    for (const raw of [undefined, null, 'swing', { said: 'x' }, 3]) expect(sanitizeWords(raw)).toEqual([]);
  });

  it('drops entries without a term or meaning, and junk entries', () => {
    expect(sanitizeWords([null, 'x', { said: 'a', term: '', meaning: 'm' }, { said: 'a', term: 't' }])).toEqual([]);
  });

  it('keeps an entry with no said word', () => {
    expect(sanitizeWords([{ term: 'tempo', meaning: 'how fast the beat is' }])).toEqual([{ said: '', term: 'tempo', meaning: 'how fast the beat is' }]);
  });

  it('keeps at most three, caps lengths and strips control characters', () => {
    const many = Array.from({ length: 6 }, () => ({ said: 's'.repeat(99), term: 't\u0007'.repeat(40), meaning: 'm'.repeat(400) }));
    const out = sanitizeWords(many);
    expect(out).toHaveLength(3);
    expect(out[0]!.said).toHaveLength(40);
    expect(out[0]!.term.length).toBeLessThanOrEqual(32);
    expect(out[0]!.term).not.toContain('\u0007');
    expect(out[0]!.meaning).toHaveLength(140);
  });

  it('keeps markup as plain text (the page sets textContent)', () => {
    expect(sanitizeWords([{ said: '<img src=x onerror=alert(1)>', term: 'swing', meaning: 'm' }])[0]!.said).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('sanitizeChanges', () => {
  it('keeps strings only, capped in number and length', () => {
    expect(sanitizeChanges(['a', 3, null, 'b'])).toEqual(['a', 'b']);
    expect(sanitizeChanges('x')).toEqual([]);
    expect(sanitizeChanges(Array(30).fill('x'.repeat(200)))).toHaveLength(MAX_CHANGES + 1);
    expect(sanitizeChanges(['x'.repeat(200)])[0]).toHaveLength(80);
  });
});

describe('describeChanges', () => {
  it('says nothing when nothing changed', () => {
    expect(describeChanges(base(), base())).toEqual([]);
  });

  it('describes tempo, key, scale and feel in plain words', () => {
    const a = base();
    const b = { ...base(), tempo: a.tempo + 20, key: 'D' as const, scale: 'major' as const, swing: 0.6 };
    expect(describeChanges({ ...a, swing: 0 }, b)).toEqual([
      `Tempo ${a.tempo} → ${a.tempo + 20} beats a minute, faster`,
      `Home note (key) ${a.key} → D`,
      'Scale Minor (moody) → Major (bright)',
      'Feel straight → swung',
    ]);
  });

  it('names layers added and removed', () => {
    const a = base();
    const b = base();
    const [gone] = b.layers.splice(0, 1);
    b.layers.push({ ...a.layers[1]!, id: 'tpt', name: 'Trumpet', instrument: 'trumpet', notes: '0 2 4' });
    b.layers.push({ ...a.layers[1]!, id: 'stabs', name: 'Stabs', instrument: 'trumpet', notes: '0' });
    expect(describeChanges(a, b)).toEqual([`− ${gone!.name}`, '+ Trumpet', '+ Stabs (Trumpet)']);
  });

  it('gathers each layer’s changes on one line, ignoring tiny knob moves', () => {
    const a = base();
    const b = base();
    const L = b.layers[0]!;
    L.volume = Math.min(1, L.volume + 0.2);
    L.echo = 0.5;
    L.grit = a.layers[0]!.grit + 0.05;
    L.muted = true;
    L.rhythm = { mode: 'euclid', hits: 3, steps: 8, rotate: 0 };
    expect(describeChanges(a, b)).toEqual([`${L.name}: silenced, rhythm now 3 hits over 8 steps, louder, more echo`]);
  });

  it(`keeps the list to ${MAX_CHANGES} lines`, () => {
    const a = { ...base(), layers: [] };
    const b = { ...base(), tempo: 150, layers: base().layers.concat(base().layers.map((L) => ({ ...L, id: `${L.id}2` }))) };
    const out = describeChanges(a, b);
    expect(out).toHaveLength(MAX_CHANGES);
    expect(out.at(-1)).toMatch(/^and \d+ more changes$/);
  });
});
