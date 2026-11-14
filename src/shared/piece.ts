// The piece: a structured description of a looping one-bar groove. The AI
// returns one of these (never code), and so does browser storage. Both pass
// through sanitizePiece before use.
import { INSTR, INSTR_ALIASES, KEYS, MAX_LAYERS, SCALES, type Key, type Scale } from './vocabulary.js';

export type Rhythm =
  | { mode: 'euclid'; hits: number; steps: number; rotate: number }
  | { mode: 'steps'; pattern: string };

export interface Layer {
  id: string;
  instrument: string;
  name: string;
  about: string;
  volume: number;
  tone: number;
  space: number;
  octave: number;
  muted: boolean;
  solo: boolean;
  rhythm: Rhythm | null;
  /** Scale degrees in mini-notation; pitched instruments only. */
  notes?: string;
}

export interface Piece {
  tempo: number;
  key: Key;
  scale: Scale;
  swing: number;
  layers: Layer[];
}

/** Example shown at first load, so the page is never empty. */
export const STARTER = {
  tempo: 100,
  key: 'A',
  scale: 'minor',
  swing: 0,
  layers: [
    {
      id: 'kick',
      name: 'Kick',
      instrument: 'kick',
      rhythm: { mode: 'euclid', hits: 4, steps: 16, rotate: 0 },
      volume: 0.85,
      tone: 0.5,
      space: 0,
      about: 'Four even hits in a bar of 16 steps: the classic four on the floor.',
    },
    {
      id: 'snare',
      name: 'Snare',
      instrument: 'snare',
      rhythm: { mode: 'steps', pattern: '~ x ~ x' },
      volume: 0.75,
      tone: 0.5,
      space: 0.15,
      about: 'Lands on beats 2 and 4, the backbeat.',
    },
    {
      id: 'hats',
      name: 'Hi-hats',
      instrument: 'hihat',
      rhythm: { mode: 'steps', pattern: '[~ x]*4' },
      volume: 0.7,
      tone: 0.5,
      space: 0,
      about: 'Off-beat eighths, filling the gaps between the kicks.',
    },
    {
      id: 'bass',
      name: 'Bass',
      instrument: 'bass',
      notes: '<0 0 5 3>',
      rhythm: { mode: 'euclid', hits: 3, steps: 8, rotate: 0 },
      volume: 0.8,
      tone: 0.45,
      space: 0,
      about: '3 hits spread over 8 steps (the tresillo). The note changes each bar.',
    },
  ],
} as const;

export const BLANK: Piece = { tempo: 100, key: 'C', scale: 'minor', swing: 0, layers: [] };

const NOTES_RE = /^[0-9\s~[\]<>,.*!@/_\-:?|()]{1,160}$/;
const STEPS_RE = /^[x~\s[\]<>*!@/_.,()0-9?|]{1,160}$/;

/** A number within lo..hi. Anything that is not a number or a numeric string gives the default d. */
export const clamp = (v: unknown, lo: number, hi: number, d: number): number => {
  // Number(null), Number('') and Number(true) are 0 or 1, which would silently become real values.
  if (typeof v !== 'number' && (typeof v !== 'string' || v.trim() === '')) return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

// eslint-disable-next-line no-control-regex
export const cleanText = (v: unknown, n: number): string => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

/** Checks a string parses as Strudel mini-notation. Injected so this module stays free of Strudel. */
export type MiniCheck = (source: string) => boolean;

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => !!v && typeof v === 'object';

/**
 * Every field from the AI or from storage passes through here: numbers are
 * clamped, names whitelisted, text trimmed, and note and rhythm strings must
 * match a strict character set and parse as mini-notation.
 */
export function sanitizePiece(
  p: unknown,
  fallback: Partial<Pick<Piece, 'tempo' | 'key' | 'scale'>> | null | undefined,
  parsesAsMini: MiniCheck,
): Piece | null {
  if (!isObject(p)) return null;
  const out: Piece = {
    tempo: Math.round(clamp(p.tempo, 60, 180, fallback?.tempo ?? 100)),
    key: (KEYS as readonly unknown[]).includes(p.key) ? (p.key as Key) : (fallback?.key ?? 'C'),
    scale: typeof p.scale === 'string' && Object.hasOwn(SCALES, p.scale) ? (p.scale as Scale) : (fallback?.scale ?? 'minor'),
    swing: clamp(p.swing, 0, 1, 0),
    layers: [],
  };
  const ids = new Set<string>();
  for (let raw of Array.isArray(p.layers) ? (p.layers as unknown[]) : []) {
    if (out.layers.length >= MAX_LAYERS) break;
    if (isObject(raw) && typeof raw.instrument === 'string' && Object.hasOwn(INSTR_ALIASES, raw.instrument)) {
      raw = { ...raw, instrument: INSTR_ALIASES[raw.instrument] };
    }
    if (!isObject(raw) || typeof raw.instrument !== 'string' || !Object.hasOwn(INSTR, raw.instrument)) continue;
    const inst = INSTR[raw.instrument]!;
    let id = cleanText(raw.id, 24).replace(/[^a-z0-9_-]/gi, '') || raw.instrument;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const L: Layer = {
      id,
      instrument: raw.instrument,
      name: cleanText(raw.name, 28) || inst.label,
      about: cleanText(raw.about, 180),
      volume: clamp(raw.volume, 0, 1, 0.8),
      tone: clamp(raw.tone, 0, 1, 0.6),
      space: clamp(raw.space, 0, 1, 0.1),
      octave: Math.round(clamp(raw.octave, -2, 2, 0)),
      muted: !!raw.muted,
      solo: !!raw.solo,
      rhythm: null,
    };
    const r = raw.rhythm;
    if (isObject(r) && r.mode === 'euclid') {
      const steps = Math.round(clamp(r.steps, 1, 32, 8));
      L.rhythm = {
        mode: 'euclid',
        steps,
        hits: Math.round(clamp(r.hits, 0, steps, Math.min(3, steps))),
        rotate: Math.round(clamp(r.rotate, 0, steps - 1, 0)),
      };
    } else if (
      isObject(r) &&
      r.mode === 'steps' &&
      typeof r.pattern === 'string' &&
      STEPS_RE.test(r.pattern) &&
      r.pattern.includes('x') &&
      parsesAsMini(r.pattern)
    ) {
      L.rhythm = { mode: 'steps', pattern: r.pattern.trim() };
    } else L.rhythm = null;
    if (inst.kind === 'tone') {
      const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
      L.notes = NOTES_RE.test(notes) && parsesAsMini(notes) ? notes : '0';
    } else if (!L.rhythm) {
      L.rhythm = { mode: 'euclid', hits: 4, steps: 16, rotate: 0 };
    }
    out.layers.push(L);
  }
  return out;
}
