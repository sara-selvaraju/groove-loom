// Play and stop.
import { audioContext, effectsReady, ready, withSounds } from './audio.js';
import { drawCloth } from './cloth.js';
import { $, state } from './state.js';

const PLAY_ICON = '<path d="M7 4.5v15l13-7.5z"/>';
const STOP_ICON = '<rect x="6" y="6" width="12" height="12" rx="1.5"/>';

export async function setPlaying(on: boolean): Promise<void> {
  if (on) {
    state.repl = await ready;
    try {
      await audioContext().resume();
    } catch {
      // resumed by the tap instead
    }
    await Promise.all([withSounds(state.piece), effectsReady()]);
    const compiled = state.compiled!;
    state.repl.setCps(compiled.cps);
    await state.repl.setPattern(compiled.pattern, true);
  } else if (state.repl) {
    state.repl.stop();
  }
  state.curRow = null;
  state.curCycle = -1;
  state.playing = on;
  drawCloth();
  for (const [button, icon] of [
    ['play', 'playIcon'],
    ['loomPlay', 'loomPlayIcon'],
  ]) {
    $(button!).setAttribute('aria-label', on ? 'Stop' : 'Play');
    $(icon!).innerHTML = on ? STOP_ICON : PLAY_ICON;
  }
}
