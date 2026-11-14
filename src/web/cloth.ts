// The cloth view: picks the 3D tapestry when it works, the flat cloth
// otherwise, and weaves a new bar each cycle while playing.
import { drawFlat, fitCanvas, initFlatCloth } from './flat-cloth.js';
import { $, state } from './state.js';
import { createTapestry, type Tapestry } from './tapestry.js';
import { makeRow } from './weave.js';

let tap: Tapestry | null = null;

export function initCloth(): void {
  const flat = $<HTMLCanvasElement>('cloth');
  const host = $<HTMLCanvasElement>('tapestry');
  initFlatCloth(flat, () => drawCloth());
  tap = createTapestry(host, $('tapTags'), () => {
    flat.hidden = false;
    fitCanvas();
    drawCloth();
  });
  if (tap) {
    host.hidden = false;
    flat.hidden = true;
  }
  const retheme = () => {
    tap?.theme();
    drawCloth();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  requestAnimationFrame(frame);
}

/** Redraw the cloth. ph = how far through the live bar, 0..1. */
export function drawCloth(ph?: number): void {
  if (tap && tap.ok) tap.draw(ph);
  else drawFlat(ph);
  updateClothStatus();
}

function updateClothStatus(): void {
  const { playing, piece, rows } = state;
  const hint = $('clothHint');
  hint.hidden = playing;
  hint.textContent = !piece.layers.length
    ? 'Ask for a layer to start the cloth.'
    : rows.length
      ? 'Paused. The faint band at the weaving edge is the next bar.'
      : 'Preview. Press play to start weaving.';
  $('clothStat').textContent = `${rows.length} ${rows.length === 1 ? 'bar' : 'bars'} woven`;
}

/** Each animation frame while playing: start a new bar when the cycle turns, and draw. */
function frame(): void {
  if (state.playing && state.repl) {
    let now = 0;
    try {
      now = state.repl.scheduler.now();
    } catch {
      // scheduler not ready
    }
    if (now >= 0) {
      const cyc = Math.floor(now),
        ph = now - cyc;
      if (cyc !== state.curCycle) {
        if (state.curRow && state.curCycle >= 0) {
          state.rows.unshift(state.curRow);
          if (state.rows.length > 200) state.rows.pop();
        }
        state.curCycle = cyc;
        state.curRow = makeRow(cyc, state.rows[0]?.sig);
      }
      drawCloth(ph);
    }
  }
  requestAnimationFrame(frame);
}
