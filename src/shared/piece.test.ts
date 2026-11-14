// sanitizePiece is the gate every piece passes through, from the AI or from
// browser storage. These tests feed it hostile and malformed input.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STARTER, droppedLayers, droppedNote, sanitizePiece, type Piece } from './piece.js';
import { parsesAsMini } from './test-support.js';
import { INSTR, MAX_LAYERS } from './vocabulary.js';

const sanitize = (p: unknown, fallback?: Parameters<typeof sanitizePiece>[1]) => sanitizePiece(p, fallback, parsesAsMini);
const layer = (extra: Record<string, unknown>) => ({ id: 'a', instrument: 'piano', notes: '0', ...extra });
const one = (l: Record<string, unknown>) => sanitize({ layers: [l] })!.layers[0];

describe('the parser the tests use', () => {
  it('is the same @strudel/mini version that @strudel/web is built on', () => {
    const web = JSON.parse(readFileSync('node_modules/@strudel/web/package.json', 'utf8'));
    const mini = JSON.parse(readFileSync('node_modules/@strudel/mini/package.json', 'utf8'));
    expect(mini.version).toBe(web.dependencies['@strudel/mini']);
  });
});

describe('sanitizePiece: shape', () => {
  it.each([null, undefined, 'a string', 42, true])('returns null for %j', (input) => {
    expect(sanitize(input)).toBeNull();
  });

  it('fills defaults for an empty object', () => {
    expect(sanitize({})).toEqual({ tempo: 100, key: 'C', scale: 'minor', swing: 0, layers: [] });
  });

  it('keeps the starter groove, adding the defaulted fields', () => {
    const out = sanitize(STARTER)!;
    expect(out.layers.map((l) => l.id)).toEqual(['kick', 'snare', 'hats', 'bass']);
    expect(out.layers.every((l) => l.octave === 0 && l.muted === false && l.solo === false)).toBe(true);
    expect(out.layers[3]).toMatchObject({ notes: '<0 0 5 3>', rhythm: { mode: 'euclid', hits: 3, steps: 8, rotate: 0 } });
  });

  it('is idempotent: a sanitized piece comes back unchanged', () => {
    const once = sanitize(STARTER)!;
    expect(sanitize(once)).toEqual(once);
  });

  it('carries no fields beyond the known ones', () => {
    const out = sanitize({
      tempo: 120,
      code: 'alert(1)',
      onload: 'x',
      layers: [layer({ code: 's("x")', eval: 'boom', extra: { nested: true } })],
    })!;
    expect(Object.keys(out).sort()).toEqual(['key', 'layers', 'scale', 'swing', 'tempo']);
    expect(Object.keys(out.layers[0]!).sort()).toEqual(
      ['about', 'id', 'instrument', 'muted', 'name', 'notes', 'octave', 'rhythm', 'solo', 'space', 'tone', 'volume'].sort(),
    );
  });

  it('does not pollute Object.prototype through __proto__ keys', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "layers": [{"__proto__": {"polluted": true}, "instrument": "kick"}]}');
    const out = sanitize(hostile)!;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((out as unknown as Record<string, unknown>).polluted).toBeUndefined();
    expect((out.layers[0] as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('sanitizePiece: numbers are clamped', () => {
  it.each([
    [9999, 180],
    [-5, 60],
    [119.6, 120],
    ['140', 140],
  ])('tempo %j becomes %j', (tempo, expected) => {
    expect(sanitize({ tempo })!.tempo).toBe(expected);
  });

  it.each([NaN, Infinity, 'fast', '', null, true, {}, [], [1, 2]])('tempo %j falls back', (tempo) => {
    expect(sanitize({ tempo }, { tempo: 90 })!.tempo).toBe(90);
    expect(sanitize({ tempo })!.tempo).toBe(100);
  });

  it('clamps swing and every layer knob to 0..1', () => {
    const out = sanitize({ swing: 5, layers: [layer({ volume: 2, tone: -1, space: 99 })] })!;
    expect(out.swing).toBe(1);
    expect(out.layers[0]).toMatchObject({ volume: 1, tone: 0, space: 1 });
  });

  it('uses the defaults for knobs given as null, not zero', () => {
    expect(one(layer({ volume: null, tone: null, space: null }))).toMatchObject({ volume: 0.8, tone: 0.6, space: 0.1 });
  });

  it('clamps octave shifts to -2..2 and rounds them', () => {
    expect(one(layer({ octave: 9 }))!.octave).toBe(2);
    expect(one(layer({ octave: -9 }))!.octave).toBe(-2);
    expect(one(layer({ octave: 1.4 }))!.octave).toBe(1);
  });
});

describe('sanitizePiece: whitelisted names', () => {
  it.each(['H', 'c', 'Cb', '', 'C#m', 'toString'])('rejects key %j', (key) => {
    expect(sanitize({ key }, { key: 'D' })!.key).toBe('D');
  });

  it.each(['major', 'minor pentatonic', 'lydian'])('accepts scale %j', (scale) => {
    expect(sanitize({ scale })!.scale).toBe(scale);
  });

  it.each(['chromatic', 'MAJOR', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])('rejects scale %j', (scale) => {
    expect(sanitize({ scale }, { scale: 'dorian' })!.scale).toBe('dorian');
  });

  it.each(['theremin', '', 'constructor', '__proto__', 'toString', 42, null])('drops a layer with instrument %j', (instrument) => {
    expect(sanitize({ layers: [{ instrument }] })!.layers).toEqual([]);
  });

  it('maps old instrument names through the aliases', () => {
    expect(one({ instrument: 'brass' })!.instrument).toBe('trumpet');
    expect(one({ instrument: 'pluck' })!.instrument).toBe('guitar');
  });

  it(`keeps at most ${MAX_LAYERS} layers`, () => {
    const layers = Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, instrument: 'kick' }));
    expect(sanitize({ layers })!.layers).toHaveLength(MAX_LAYERS);
  });

  it('skips junk entries in the layer list', () => {
    const out = sanitize({ layers: [null, 'kick', 7, [], { instrument: 'kick' }] })!;
    expect(out.layers.map((l) => l.instrument)).toEqual(['kick']);
  });

  it('treats a non-array layer list as empty', () => {
    expect(sanitize({ layers: { 0: { instrument: 'kick' } } })!.layers).toEqual([]);
  });
});

describe('sanitizePiece: ids and text', () => {
  it('strips unsafe characters from ids and limits their length', () => {
    expect(one({ id: '<img src=x onerror=alert(1)>', instrument: 'kick' })!.id).toBe('imgsrcxonerroralert');
    expect(one({ id: 'a'.repeat(50), instrument: 'kick' })!.id).toHaveLength(24);
  });

  it('falls back to the instrument name for an empty id, and makes ids unique', () => {
    const out = sanitize({ layers: [{ instrument: 'kick' }, { id: 'kick', instrument: 'kick' }, { id: '!!', instrument: 'kick' }] })!;
    expect(out.layers.map((l) => l.id)).toEqual(['kick', 'kick_', 'kick__']);
  });

  it('replaces control characters and limits name and about lengths', () => {
    const out = one({ instrument: 'kick', name: 'Big\u0000\nKick' + 'x'.repeat(40), about: 'y'.repeat(500) })!;
    expect(out.name).toBe('Big  Kick' + 'x'.repeat(19));
    expect(out.name).toHaveLength(28);
    expect(out.about).toHaveLength(180);
  });

  it('uses the instrument label when the name is missing', () => {
    expect(one({ instrument: 'tomhi' })!.name).toBe(INSTR.tomhi!.label);
  });

  it('keeps markup in text as plain text (the UI sets textContent, never HTML)', () => {
    expect(one({ instrument: 'kick', name: '<b>hi</b>' })!.name).toBe('<b>hi</b>');
  });
});

describe('sanitizePiece: rhythms', () => {
  it('clamps even spacing: steps 1..32, hits up to steps, rotate below steps', () => {
    expect(one({ instrument: 'kick', rhythm: { mode: 'euclid', hits: 50, steps: 100, rotate: 99 } })!.rhythm).toEqual({
      mode: 'euclid',
      hits: 32,
      steps: 32,
      rotate: 31,
    });
    expect(one({ instrument: 'kick', rhythm: { mode: 'euclid', hits: -1, steps: 0, rotate: -3 } })!.rhythm).toEqual({
      mode: 'euclid',
      hits: 0,
      steps: 1,
      rotate: 0,
    });
  });

  it('gives a drum with no usable rhythm four on the floor', () => {
    for (const rhythm of [undefined, null, { mode: 'random' }, { mode: 'steps', pattern: 'zz' }]) {
      expect(one({ instrument: 'kick', rhythm })!.rhythm).toEqual({ mode: 'euclid', hits: 4, steps: 16, rotate: 0 });
    }
  });

  it('lets a pitched layer have no rhythm', () => {
    expect(one(layer({ rhythm: { mode: 'steps', pattern: 'bad' } }))!.rhythm).toBeNull();
  });

  it('trims an accepted steps pattern', () => {
    expect(one({ instrument: 'kick', rhythm: { mode: 'steps', pattern: '  ~ x ~ x  ' } })!.rhythm).toEqual({
      mode: 'steps',
      pattern: '~ x ~ x',
    });
  });
});

// The mini-notation whitelist: note and rhythm strings must match a strict
// character set AND parse as Strudel mini-notation.
describe('mini-notation whitelist: rhythm patterns', () => {
  const rhythmOf = (pattern: unknown) => one({ instrument: 'kick', rhythm: { mode: 'steps', pattern } })!.rhythm;

  it.each(['~ x ~ x', '[~ x]*4', 'x(3,8)', 'x(3,8,2)', '<x ~> x', 'x . x x', 'x? x!', 'x@3 x', 'x _ x', '[x|~] x'])(
    'accepts %j',
    (pattern) => {
      expect(rhythmOf(pattern)).toEqual({ mode: 'steps', pattern });
    },
  );

  it.each([
    ['no hit at all', '~ ~ ~ ~'],
    ['letters other than x', 'x y x'],
    ['a sample name', 'bd sd'],
    ['script', '<script>alert(1)</script>'],
    ['JavaScript call', 'x.fast(2)'],
    ['template literal', '${x}'],
    ['quote', 'x "x"'],
    ['semicolon', 'x; x'],
    ['unbalanced brackets', '[x x'],
    ['stray closer', 'x x]'],
    ['too long', 'x '.repeat(81)],
    ['empty', ''],
    ['not a string', 42],
  ])('rejects %s', (_why, pattern) => {
    expect(rhythmOf(pattern)).toEqual({ mode: 'euclid', hits: 4, steps: 16, rotate: 0 });
  });
});

describe('mini-notation whitelist: notes', () => {
  const notesOf = (notes: unknown) => one(layer({ notes }))!.notes;

  it.each(['0', '0 2 4', '<0 0 5 3>', '[0,2,4]', '<[0,2,4] [3,5,7]>', '0 ~ -1 7', '[0 2]*2', '0 . 2 4', '0? 2!'])('accepts %j', (notes) => {
    expect(notesOf(notes)).toBe(notes);
  });

  it.each([
    ['note names', 'c e g'],
    ['sharps', '0#'],
    ['script', '<script>alert(1)</script>'],
    ['JavaScript', 'fetch("//x")'],
    ['template literal', '${0}'],
    ['quote', "0 '2'"],
    ['unbalanced brackets', '[0 2'],
    ['stray closer', '0 2>'],
    ['too long', '0 '.repeat(81)],
    ['empty', ''],
    ['not a string', 7],
  ])('replaces %s with the root note', (_why, notes) => {
    expect(notesOf(notes)).toBe('0');
  });

  it('trims accepted notes', () => {
    expect(notesOf('  0 2  ')).toBe('0 2');
  });

  it('gives drums no notes field', () => {
    expect(one({ instrument: 'kick', notes: '0 2' })!.notes).toBeUndefined();
  });
});

describe('sanitizePiece: muted and solo', () => {
  it('coerces flags to booleans', () => {
    const out = one({ instrument: 'kick', muted: 'yes', solo: 0 })! as Piece['layers'][number];
    expect(out.muted).toBe(true);
    expect(out.solo).toBe(false);
  });
});

describe('droppedLayers and droppedNote', () => {
  const nine = { layers: [...Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, instrument: 'kick', name: `Drum ${i}` })), { id: 'p', instrument: 'piano', name: 'Piano' }] };

  it('names a layer left out because the loom was full', () => {
    const kept = sanitize(nine)!;
    expect(kept.layers).toHaveLength(MAX_LAYERS);
    const d = droppedLayers(nine, kept);
    expect(d).toEqual({ overLimit: ['Piano'], unknownInstrument: [] });
    expect(droppedNote(d)).toBe(`The loom holds at most ${MAX_LAYERS} layers, so Piano wasn't added. Remove a layer, or ask me to swap one out.`);
  });

  it('names layers with instruments the loom does not have', () => {
    const raw = { layers: [{ instrument: 'kick' }, { instrument: 'theremin', name: 'Spooky' }, { instrument: 'banjo' }] };
    const d = droppedLayers(raw, sanitize(raw)!);
    expect(d).toEqual({ overLimit: [], unknownInstrument: ['Spooky', 'banjo'] });
    expect(droppedNote(d)).toBe("Spooky and banjo used an instrument the loom doesn't have, so they were left out.");
  });

  it('counts aliases as known instruments', () => {
    const raw = { layers: [{ instrument: 'brass', name: 'Horns' }] };
    expect(droppedLayers(raw, sanitize(raw)!)).toEqual({ overLimit: [], unknownInstrument: [] });
  });

  it('says nothing when nothing was dropped', () => {
    expect(droppedNote(droppedLayers(STARTER, sanitize(STARTER)!))).toBe('');
  });
});
