// The weave model shared by both cloth renderers. Each bar weaves one band
// (a Row); each layer is a thread that rises to the surface while it sounds.
import { audible } from '../shared/compiler.js';
import type { Piece } from '../shared/piece.js';
import { INSTR } from '../shared/vocabulary.js';
import { midiOf } from './pattern.js';
import { state } from './state.js';

/** Warp threads per bar: divides evenly by 16ths and by triplets. */
export const COLS = 96;
export const LAYER_VARS = ['--l0', '--l1', '--l2', '--l3', '--l4', '--l5', '--l6', '--l7'];

export interface Segment {
  c0: number;
  c1: number;
  m: number | null;
  /** 0..1: higher notes are woven paler. */
  lift: number;
}
export interface RowPick {
  ci: number;
  segs: Segment[];
  muted: boolean;
}
export interface Signature {
  g: string;
  l: Record<string, { name: string; s: string }>;
}
export interface Row {
  cycle: number;
  picks: RowPick[];
  sig: Signature;
  tags: string[];
  seed?: number;
  /** Flat cloth cache. */
  _c?: HTMLCanvasElement;
  _k?: string;
}
export type Pick = { g: true } | { g?: false; k: number };

export interface Tokens {
  warp: string;
  warp2: string;
  weft: string;
  gap: string;
  shuttle: string;
  ink: string;
  surface: string;
  muted: string;
  layers: string[];
  key: string;
}

export function tokens(): Tokens {
  const cs = getComputedStyle(document.documentElement),
    g = (n: string) => cs.getPropertyValue(n).trim();
  const t = {
    warp: g('--warp'),
    warp2: g('--warp2'),
    weft: g('--weft'),
    gap: g('--gap'),
    shuttle: g('--shuttle'),
    ink: g('--ink'),
    surface: g('--surface'),
    muted: g('--muted'),
    layers: LAYER_VARS.map(g),
    key: '',
  };
  t.key = t.warp + t.weft + t.layers.join('');
  return t;
}

function hexRgb(h: string): number[] {
  h = h.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(h1: string, h2: string, t: number): string {
  const a = hexRgb(h1),
    b = hexRgb(h2);
  return '#' + a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, '0')).join('');
}
export function shade(hex: string, f: number): string {
  return mix(hex, f > 0 ? '#ffffff' : '#000000', Math.abs(f));
}
/** Repeatable noise for small dye variation. */
export function rnd(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function sigOf(p: Piece): Signature {
  return {
    g: `${p.tempo}|${p.key}|${p.scale}|${Math.round(p.swing * 20)}`,
    l: Object.fromEntries(
      p.layers.map((L) => [L.id, { name: L.name, s: JSON.stringify([L.instrument, L.notes, L.rhythm, L.accent, L.muted, L.solo, L.octave]) }]),
    ),
  };
}

/** Labels such as "+ Trumpet" for the bar where something changed. */
function diffTags(prev: Signature | null | undefined, cur: Signature): string[] {
  if (!prev) return ['first bar'];
  const tags: string[] = [];
  for (const id in cur.l) {
    if (!prev.l[id]) tags.push('+ ' + cur.l[id]!.name);
    else if (prev.l[id].s !== cur.l[id]!.s) tags.push('~ ' + cur.l[id]!.name);
  }
  for (const id in prev.l) if (!cur.l[id]) tags.push('− ' + prev.l[id]!.name);
  if (prev.g !== cur.g) {
    const [t0, k0, s0] = prev.g.split('|'),
      [t1, k1, s1] = cur.g.split('|');
    if (k0 !== k1 || s0 !== s1) tags.push(`${k1} ${s1}`);
    else if (t0 !== t1) tags.push(`${t1} bpm`);
    else tags.push('swing');
  }
  return tags.slice(0, 3);
}

export function makeRow(cycle: number, prevSig: Signature | null | undefined): Row {
  const piece = state.piece,
    compiled = state.compiled;
  const on = audible(piece),
    sig = sigOf(piece);
  const picks = piece.layers.map((L, i): RowPick => {
    const pat = compiled?.perLayer[i];
    const segs: Segment[] = [];
    const drum = INSTR[L.instrument]!.kind === 'drum';
    if (pat && on[i]) {
      try {
        for (const h of pat.queryArc(cycle, cycle + 1)) {
          const b = h.part.begin.valueOf() - cycle,
            e = h.part.end.valueOf() - cycle;
          const c0 = Math.max(0, Math.floor(b * COLS + 1e-6));
          let c1 = Math.min(COLS, Math.max(c0 + 1, Math.round(e * COLS)));
          if (drum) c1 = Math.min(c1, c0 + 4); // drum hits are short: a short float
          segs.push({ c0, c1, m: midiOf(h.value), lift: 0 });
        }
      } catch {
        // a pattern that cannot be queried weaves as silence
      }
      // higher notes are woven in a paler shade of the thread, on one scale for every bar
      for (const s of segs) s.lift = s.m == null ? 0.1 : Math.min(1, Math.max(0, (s.m - 28) / 60));
    }
    return { ci: i % 8, segs, muted: !on[i] };
  });
  return { cycle, picks, sig, tags: diffTags(prevSig, sig) };
}

// Geometry of one bar: ground picks (plain cloth) alternate with one pattern pick per layer, like brocade.
export function pickList(row: Row): Pick[] {
  const out: Pick[] = [{ g: true }];
  row.picks.forEach((_pk, k) => {
    out.push({ k });
    out.push({ g: true });
  });
  if (!row.picks.length) out.push({ g: true });
  return out;
}
export function pickH(colW: number, g: boolean | undefined): number {
  return g ? colW * 0.8 : colW * 1.5;
}
export function bandH(row: Row, colW: number): number {
  return pickList(row).reduce((h, p) => h + pickH(colW, p.g), 0);
}

let rowSeq = 0;
/** Give a row a stable seed for its dye variation. */
export function seedRow(row: Row): number {
  if (row.seed == null) row.seed = ++rowSeq;
  return row.seed;
}
