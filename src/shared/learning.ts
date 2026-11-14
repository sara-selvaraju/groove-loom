// What each AI reply teaches, beside its explanation. Two parts:
// - words: the AI links words the person used to the music idea behind them
//   ("groovier" → swing: every second note lands a little late). Checked here
//   like every other field from the AI.
// - changes: worked out by the app by comparing the piece before and after,
//   so the list is always accurate, whatever the reply says.
import type { Layer, Piece } from './piece.js';
import { cleanText } from './piece.js';
import { INSTR, SCALES } from './vocabulary.js';

export interface Word {
  /** The person's word or phrase, e.g. "groovier". */
  said: string;
  /** The music idea it became, e.g. "swing". */
  term: string;
  /** What that means, in plain words. */
  meaning: string;
}

export const MAX_WORDS = 3;
export const MAX_CHANGES = 8;

/** Keeps up to three well-formed entries, as plain text with lengths capped. Anything else becomes an empty list. */
export function sanitizeWords(raw: unknown): Word[] {
  if (!Array.isArray(raw)) return [];
  const out: Word[] = [];
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue;
    const r = w as Record<string, unknown>;
    const said = cleanText(r.said, 40).trim();
    const term = cleanText(r.term, 32).trim();
    const meaning = cleanText(r.meaning, 140).trim();
    if (term && meaning) out.push({ said, term, meaning });
    if (out.length === MAX_WORDS) break;
  }
  return out;
}

/** A list of short strings, for change lists read back from storage. */
export function sanitizeChanges(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === 'string')
    .slice(0, MAX_CHANGES + 1)
    .map((s) => cleanText(s, 80));
}

const swingLabel = (s: number) => (s < 0.02 ? 'straight' : s > 0.8 ? 'heavy shuffle' : s < 0.35 ? 'a light swing' : 'swung');
const instLabel = (L: Layer) => INSTR[L.instrument]?.label ?? L.instrument;

/** One knob's change in words, or null when it barely moved. */
function knob(before: number, after: number, up: string, down: string): string | null {
  if (Math.abs(after - before) < 0.1) return null;
  return after > before ? up : down;
}

function rhythmWords(L: Layer): string {
  const r = L.rhythm;
  if (!r) return 'new timing';
  return r.mode === 'euclid' ? `rhythm now ${r.hits} hits over ${r.steps} steps` : 'new rhythm';
}

function layerChanges(a: Layer, b: Layer): string[] {
  const out: string[] = [];
  if (a.instrument !== b.instrument) out.push(`now ${instLabel(b)}`);
  if (a.muted !== b.muted) out.push(b.muted ? 'silenced' : 'back on');
  if (JSON.stringify(a.rhythm) !== JSON.stringify(b.rhythm)) out.push(rhythmWords(b));
  if ((a.notes ?? '') !== (b.notes ?? '')) out.push('new notes');
  if (a.octave !== b.octave) out.push(b.octave > a.octave ? 'higher' : 'lower');
  if (a.accent !== b.accent) out.push(b.accent ? 'some hits louder than others' : 'even hits');
  for (const s of [
    knob(a.volume, b.volume, 'louder', 'quieter'),
    knob(a.tone, b.tone, 'brighter', 'darker'),
    knob(a.space, b.space, 'more space (reverb)', 'less space (reverb)'),
    knob(a.echo, b.echo, 'more echo', 'less echo'),
    knob(a.grit, b.grit, 'grittier', 'cleaner'),
  ])
    if (s) out.push(s);
  return out;
}

/** What changed between two pieces, in plain words, at most eight lines. */
export function describeChanges(before: Piece, after: Piece): string[] {
  const out: string[] = [];
  if (Math.round(after.tempo) !== Math.round(before.tempo)) {
    out.push(`Tempo ${Math.round(before.tempo)} → ${Math.round(after.tempo)} beats a minute, ${after.tempo > before.tempo ? 'faster' : 'slower'}`);
  }
  if (after.key !== before.key) out.push(`Home note (key) ${before.key} → ${after.key}`);
  if (after.scale !== before.scale) out.push(`Scale ${SCALES[before.scale]} → ${SCALES[after.scale]}`);
  if (Math.abs(after.swing - before.swing) >= 0.05 && swingLabel(after.swing) !== swingLabel(before.swing)) {
    out.push(`Feel ${swingLabel(before.swing)} → ${swingLabel(after.swing)}`);
  } else if (Math.abs(after.swing - before.swing) >= 0.1) {
    out.push(after.swing > before.swing ? 'More swing' : 'Less swing');
  }
  const was = new Map(before.layers.map((L) => [L.id, L]));
  const now = new Set(after.layers.map((L) => L.id));
  for (const L of before.layers) if (!now.has(L.id)) out.push(`− ${L.name}`);
  for (const L of after.layers) {
    const old = was.get(L.id);
    if (!old) {
      out.push(L.name.toLowerCase() === instLabel(L).toLowerCase() ? `+ ${L.name}` : `+ ${L.name} (${instLabel(L)})`);
      continue;
    }
    const c = layerChanges(old, L);
    if (c.length) out.push(`${L.name}: ${c.join(', ')}`);
  }
  if (out.length > MAX_CHANGES) {
    const extra = out.length - (MAX_CHANGES - 1);
    return [...out.slice(0, MAX_CHANGES - 1), `and ${extra} more changes`];
  }
  return out;
}

/* ---------- Your words: the glossary a person builds up across sessions ---------- */

/** One music word in a person's collection. Kept on their device only. */
export interface Learnt {
  term: string;
  meaning: string;
  /** Their own words that led to it, newest last. */
  said: string[];
  /** Times they have used the term themselves in a request since learning it. */
  used: number;
}

export const MAX_LEARNT = 60;
/** Terms sent with a request so the AI knows what the person has learnt. */
export const MAX_LEARNT_SENT = 40;

const keyOf = (term: string) => term.trim().toLowerCase();

/** A collection read back from storage: anything malformed is dropped. */
export function sanitizeCollection(raw: unknown): Learnt[] {
  if (!Array.isArray(raw)) return [];
  const out: Learnt[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    const term = cleanText(r.term, 32).trim();
    const meaning = cleanText(r.meaning, 140).trim();
    if (!term || !meaning || seen.has(keyOf(term))) continue;
    seen.add(keyOf(term));
    const said = Array.isArray(r.said) ? r.said.map((s) => cleanText(s, 40).trim()).filter(Boolean).slice(-5) : [];
    const used = typeof r.used === 'number' && Number.isFinite(r.used) ? Math.max(0, Math.min(9999, Math.floor(r.used))) : 0;
    out.push({ term, meaning, said, used });
  }
  return out.slice(-MAX_LEARNT);
}

/** Adds a reply's words to the collection. A known term gains the new phrasing; its meaning stays as first learnt. */
export function addWords(collection: Learnt[], words: Word[]): Learnt[] {
  const out = collection.map((e) => ({ ...e, said: [...e.said] }));
  for (const w of words) {
    const known = out.find((e) => keyOf(e.term) === keyOf(w.term));
    if (known) {
      if (w.said && !known.said.some((s) => s.toLowerCase() === w.said.toLowerCase())) known.said = [...known.said, w.said].slice(-5);
    } else {
      out.push({ term: w.term, meaning: w.meaning, said: w.said ? [w.said] : [], used: 0 });
    }
  }
  return out.slice(-MAX_LEARNT);
}

const spaced = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim()} `;

/**
 * The known terms a person used in their own request. Case, hyphens and a
 * plural "s" are ignored, so "off-beat", "offbeat" and "off beats" all count.
 */
export function usedTerms(request: string, terms: string[]): string[] {
  const text = spaced(request);
  const compact = text.replace(/ /g, '');
  return terms.filter((t) => {
    const s = spaced(t).trim();
    if (!s) return false;
    if (text.includes(` ${s} `) || text.includes(` ${s}s `) || text.includes(` ${s}es `)) return true;
    // a multi-word term written as one word ("offbeat" for "off beat")
    return s.includes(' ') && compact.includes(s.replace(/ /g, ''));
  });
}

/** Terms from a request body, checked: at most forty short strings. */
export function sanitizeLearntTerms(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((t): t is string => typeof t === 'string')
    .map((t) => cleanText(t, 32).trim())
    .filter(Boolean)
    .slice(-MAX_LEARNT_SENT);
}
