// Compiler: piece -> Strudel calls. layerCalls() produces one call list that
// drives both the audio (src/web/pattern.ts) and the code listing (codeFor),
// so the code panel can never drift from what plays.
import type { Layer, Piece, Rhythm } from './piece.js';
import { INSTR, type Call } from './vocabulary.js';

export const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Tone knob to low-pass cutoff. 0.5 is natural; below darkens, above opens fully. */
export const toneHz = (t: number): number =>
  Math.round(t >= 0.5 ? 6000 * Math.pow(20000 / 6000, (t - 0.5) / 0.5) : 300 * Math.pow(20, t / 0.5));

export function rhythmMini(r: Rhythm | null | undefined): string | null {
  if (!r) return null;
  if (r.mode === 'euclid') return r.hits === 0 ? '~' : r.rotate ? `x(${r.hits},${r.steps},${r.rotate})` : `x(${r.hits},${r.steps})`;
  return r.pattern;
}

export interface LayerCalls {
  head: Call;
  calls: Call[];
}

export function layerCalls(L: Layer, p: Piece): LayerCalls {
  const inst = INSTR[L.instrument]!;
  const rhythm = rhythmMini(L.rhythm);
  const calls: Call[] = [];
  let head: Call;
  if (inst.kind === 'drum') {
    head = ['s', [inst.sound]];
    if (rhythm) calls.push(['struct', [rhythm]]);
  } else {
    head = ['n', [L.notes ?? '0']];
    if (rhythm) calls.push(['struct', [rhythm]]);
    calls.push(['scale', [`${p.key}${(inst.octave ?? 0) + (L.octave || 0)}:${p.scale}`]]);
    calls.push(['s', [inst.sound]]);
  }
  for (const c of inst.params) calls.push([c[0], [c[1]]]);
  if (toneHz(L.tone) < 19000) calls.push(['lpf', [toneHz(L.tone)]]);
  if (L.space > 0.02) calls.push(['room', [r3(L.space * 0.9)]]);
  calls.push(['gain', [r3(L.volume * inst.gain)]]);
  return { head, calls };
}

export function swingArgs(p: Piece): [number, number] | null {
  return p.swing > 0.01 ? [r3(p.swing / 3), 8] : null;
}

/** Which layers sound, after mute and solo. */
export function audible(p: Piece): boolean[] {
  const solo = p.layers.some((l) => l.solo && !l.muted);
  return p.layers.map((l) => !l.muted && (!solo || l.solo));
}

const fmtArg = (a: string | number): string => (typeof a === 'string' ? JSON.stringify(a) : String(a));

export function codeFor(p: Piece): string {
  const sw = swingArgs(p),
    on = audible(p);
  const lines = [`// ${p.tempo} bpm in ${p.key} ${p.scale}. One cycle = one bar of 4 beats.`];
  const recorded = p.layers.map((L) => INSTR[L.instrument]).find((i) => i?.rec);
  if (recorded)
    lines.push(`// Recorded sounds such as s("${recorded.sound}") are loaded with samples() from files published with this page.`);
  lines.push(`setcpm(${r3(p.tempo / 4)})`, ``, `stack(`);
  p.layers.forEach((L, i) => {
    const { head, calls } = layerCalls(L, p);
    const s = `${head[0]}(${head[1].map(fmtArg).join(', ')})` + calls.map(([m, a]) => `.${m}(${a.map(fmtArg).join(', ')})`).join('');
    lines.push(`  // ${L.name}${on[i] ? '' : ' (muted)'}`);
    lines.push(`  ${on[i] ? '' : '// '}${s},`);
  });
  lines.push(sw ? `).swingBy(${sw[0]}, ${sw[1]})` : `)`);
  return lines.join('\n');
}

/** The one-line readout on a layer card: its notes, rhythm and, for even spacing, the hits and steps. */
export function patternText(L: Layer): string {
  const inst = INSTR[L.instrument]!;
  const rm = rhythmMini(L.rhythm);
  return [
    inst.kind === 'tone' ? `notes ${L.notes}` : null,
    rm ? `rhythm ${rm}` : null,
    L.rhythm?.mode === 'euclid' ? `(${L.rhythm.hits} hits over ${L.rhythm.steps} steps)` : null,
  ]
    .filter(Boolean)
    .join('   ');
}
