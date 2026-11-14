// Turns the compiler's call list into a playable Strudel pattern. The same
// list produces the code listing (codeFor), so what plays and what is shown
// cannot drift apart.
import * as S from '@strudel/web';
import { audible, layerCalls, swingArgs, type LayerCalls } from '../shared/compiler.js';
import type { Piece } from '../shared/piece.js';

export interface Compiled {
  pattern: S.Pattern;
  perLayer: (S.Pattern | null)[];
  cps: number;
}

export function parsesAsMini(source: string): boolean {
  try {
    S.mini(source);
    return true;
  } catch {
    return false;
  }
}

type Method = (...args: unknown[]) => S.Pattern;

function applyCalls({ head, calls }: LayerCalls, swing: [number, number] | null): S.Pattern {
  const start = (S as unknown as Record<string, Method>)[head[0]]!;
  let pat = start(...head[1]);
  for (const [m, args] of calls) {
    const fn = pat[m];
    if (typeof fn === 'function') pat = (fn as Method).apply(pat, args);
  }
  if (swing) pat = pat.swingBy(...swing);
  return pat;
}

export function compile(p: Piece): Compiled {
  const sw = swingArgs(p),
    on = audible(p);
  const perLayer = p.layers.map((L, i) => {
    try {
      return applyCalls(layerCalls(L, p, i), sw);
    } catch (e) {
      console.warn('layer failed', L.id, e);
      return null;
    }
  });
  const live = perLayer.filter((pat, i): pat is S.Pattern => !!pat && !!on[i]);
  const pattern = live.length ? S.stack(...live) : S.silence;
  return { pattern, perLayer, cps: p.tempo / 240 };
}

/** MIDI note number of a played event, for shading higher notes paler. */
export function midiOf(v: unknown): number | null {
  const x = v && typeof v === 'object' ? ((v as { note?: unknown; n?: unknown }).note ?? (v as { n?: unknown }).n) : undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    try {
      return S.noteToMidi(x);
    } catch {
      // not a note name
    }
  }
  return null;
}
