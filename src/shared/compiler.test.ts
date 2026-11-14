// The compiler: piece in, Strudel call list and code listing out. The
// snapshots record exactly what each example produces, so a change to what
// plays or to the code panel shows up as a reviewable diff.
import { describe, expect, it } from 'vitest';
import { audible, codeFor, layerCalls, patternText, rhythmMini, swingArgs, toneHz } from './compiler.js';
import { STARTER, sanitizePiece, type Piece } from './piece.js';
import { parsesAsMini } from './test-support.js';

const piece = (p: unknown): Piece => sanitizePiece(p, null, parsesAsMini)!;

const EXAMPLES: Record<string, Piece> = {
  starter: piece(STARTER),
  empty: piece({ tempo: 90, key: 'C', scale: 'major', layers: [] }),
  // swing, synths, octave shift, tone extremes, reverb, a muted layer and an alias
  synths: piece({
    tempo: 128,
    key: 'F#',
    scale: 'dorian',
    swing: 0.6,
    layers: [
      { id: 'k', name: 'Kick', instrument: 'synthkick', rhythm: { mode: 'euclid', hits: 4, steps: 16, rotate: 0 }, volume: 1, tone: 1 },
      { id: 'h', name: 'Hats', instrument: 'synthhat', rhythm: { mode: 'steps', pattern: '[~ x]*4' }, volume: 0.5, tone: 0.9, muted: true },
      { id: 'b', name: 'Bass', instrument: 'synthbass', notes: '0 ~ 0 3', octave: -1, volume: 0.7, tone: 0.2 },
      { id: 'p', name: 'Pad', instrument: 'pad', notes: '<[0,2,4] [3,5,7]>', volume: 0.4, tone: 0.5, space: 0.8 },
      { id: 'br', name: 'Brass', instrument: 'brass', notes: '4 ~ 2 ~', rhythm: { mode: 'euclid', hits: 3, steps: 8, rotate: 2 } },
    ],
  }),
  // solo silences every other layer in the listing
  solo: piece({
    layers: [
      { id: 'a', instrument: 'kick', solo: true },
      { id: 'b', instrument: 'snare' },
      { id: 'c', instrument: 'piano', notes: '0 2 4', muted: true, solo: true },
    ],
  }),
};

describe('layerCalls and codeFor snapshots', () => {
  for (const [name, p] of Object.entries(EXAMPLES)) {
    it(`${name}: call lists`, () => {
      expect(p.layers.map((L) => ({ id: L.id, ...layerCalls(L, p) }))).toMatchSnapshot();
    });
    it(`${name}: code listing`, () => {
      expect(codeFor(p)).toMatchSnapshot();
    });
  }
});

describe('one call list drives the sound and the listing', () => {
  it('lists every call layerCalls produces, in order, for each layer', () => {
    const p = EXAMPLES.synths!;
    const code = codeFor(p);
    for (const L of p.layers) {
      const { head, calls } = layerCalls(L, p);
      const methods = [head[0], ...calls.map((c) => c[0])];
      const line = code.split('\n').find((l) => l.includes(`${head[0]}(${JSON.stringify(head[1][0])})`) && l.includes(`gain(`));
      expect(line, `listing line for ${L.id}`).toBeDefined();
      const found = [...line!.replace(/"[^"]*"/g, '""').matchAll(/([a-zA-Z]+)\(/g)].map((m) => m[1]);
      expect(found).toEqual(methods);
    }
  });
});

describe('tone', () => {
  it('maps the knob to a low-pass cutoff that rises steadily', () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map(toneHz);
    expect(values).toEqual([300, 1342, 6000, 10954, 20000]);
  });

  it('leaves the filter off when the tone is fully open', () => {
    const p = piece({ layers: [{ instrument: 'kick', tone: 1 }] });
    expect(layerCalls(p.layers[0]!, p).calls.map((c) => c[0])).not.toContain('lpf');
  });

  it('adds reverb only above a small threshold', () => {
    const quiet = piece({ layers: [{ instrument: 'kick', space: 0.02 }] });
    const wet = piece({ layers: [{ instrument: 'kick', space: 0.5 }] });
    expect(layerCalls(quiet.layers[0]!, quiet).calls.map((c) => c[0])).not.toContain('room');
    expect(layerCalls(wet.layers[0]!, wet).calls).toContainEqual(['room', [0.45]]);
  });
});

describe('rhythmMini', () => {
  it.each([
    [{ mode: 'euclid', hits: 3, steps: 8, rotate: 0 }, 'x(3,8)'],
    [{ mode: 'euclid', hits: 3, steps: 8, rotate: 2 }, 'x(3,8,2)'],
    [{ mode: 'euclid', hits: 0, steps: 8, rotate: 0 }, '~'],
    [{ mode: 'steps', pattern: '~ x ~ x' }, '~ x ~ x'],
    [null, null],
  ] as const)('%j gives %j', (r, expected) => {
    expect(rhythmMini(r)).toBe(expected);
  });

  it('produces mini-notation that parses', () => {
    for (const hits of [0, 1, 5, 16]) for (const rotate of [0, 3]) expect(parsesAsMini(rhythmMini({ mode: 'euclid', hits, steps: 16, rotate })!)).toBe(true);
  });
});

describe('audible', () => {
  it('silences muted layers', () => {
    expect(audible(piece({ layers: [{ instrument: 'kick', muted: true }, { instrument: 'snare' }] }))).toEqual([false, true]);
  });

  it('plays only soloed layers when any are soloed', () => {
    expect(audible(EXAMPLES.solo!)).toEqual([true, false, false]);
  });

  it('ignores a solo on a muted layer', () => {
    expect(audible(piece({ layers: [{ instrument: 'kick', muted: true, solo: true }, { instrument: 'snare' }] }))).toEqual([false, true]);
  });
});

describe('swing', () => {
  it('is off when nearly straight, and a third of the knob otherwise', () => {
    expect(swingArgs(piece({ swing: 0.01 }))).toBeNull();
    expect(swingArgs(piece({ swing: 0.6 }))).toEqual([0.2, 8]);
  });
});

describe('patternText', () => {
  it('describes notes, rhythm, and even spacing in words', () => {
    const p = EXAMPLES.starter!;
    expect(p.layers.map(patternText)).toEqual([
      'rhythm x(4,16)   (4 hits over 16 steps)',
      'rhythm ~ x ~ x',
      'rhythm [~ x]*4',
      'notes <0 0 5 3>   rhythm x(3,8)   (3 hits over 8 steps)',
    ]);
  });
});
