// Audio engine: Strudel start-up, recorded sounds, the master limiter, and the
// phone audio unlock.
import * as S from '@strudel/web';
import type { Piece } from '../shared/piece.js';
import { INSTR, sampleMap } from '../shared/vocabulary.js';
import { $, state } from './state.js';
import { redirectWorklets } from './worklets.js';

const SOUND_BASE = new URL('sounds/', document.baseURI).href;

function registerSamples(): Promise<unknown> {
  const map: Record<string, unknown> = {};
  for (const inst of Object.values(INSTR)) if (inst.sample) map[inst.sound] = sampleMap(inst);
  return S.samples(map, SOUND_BASE);
}

redirectWorklets();
export const ready: Promise<S.Repl> = S.initStrudel({ prebake: () => registerSamples() });

// A limiter on the master output keeps a busy mix from distorting. Recording taps the limiter's output.
// The volume control sits after the limiter, so it changes what you hear but not the MP3.
export let master: AudioNode | null = null;
let volumeNode: GainNode | null = null;
let volume = 0.8;

/** Listening volume, 0..1. Applies now if the audio engine is running, otherwise once it starts. */
export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (volumeNode) volumeNode.gain.setTargetAtTime(volumeGain(volume), volumeNode.context.currentTime, 0.02);
}
// The slider is linear, hearing is not: squaring makes the lower half of the slider useful.
const volumeGain = (v: number) => v * v;

ready.then(() => {
  const ctx = S.getAudioContext(),
    out = S.getSuperdoughAudioController().output;
  try {
    volumeNode = new GainNode(ctx, { gain: volumeGain(volume) });
    volumeNode.connect(ctx.destination);
    const lim = new DynamicsCompressorNode(ctx, { threshold: -8, knee: 4, ratio: 12, attack: 0.003, release: 0.2 });
    out.destinationGain.disconnect();
    out.destinationGain.connect(lim);
    lim.connect(volumeNode);
    master = lim;
  } catch (e) {
    console.warn('limiter not added', e);
  }
});
ready
  .then((r) => {
    state.repl = r;
  })
  .catch((e) => {
    console.error(e);
    $('recNote').textContent = 'Audio engine failed to load in this view.';
  });

// Strudel loads its audio processors (used by grit and other effects) only once audio has started, so
// the first note needing one would be dropped. Load them as soon as the engine is ready, once.
let worklets: Promise<void> | null = null;
export function effectsReady(): Promise<void> {
  worklets ??= ready.then(() => S.loadWorklets()).then(
    () => undefined,
    (e) => console.warn('audio effects not loaded', e),
  );
  return worklets;
}
void effectsReady();

/** The un-limited output, for recording if the limiter could not be added. */
export const rawOutput = (): AudioNode => S.getSuperdoughAudioController().output.destinationGain;
export const audioContext = (): AudioContext => S.getAudioContext();

// Recorded sounds are fetched once, ahead of first use, so a new instrument's first notes are not dropped.
const loading = new Map<string, Promise<unknown>>();
function preloadFor(p: Piece): Promise<unknown> {
  let ctx: AudioContext;
  try {
    ctx = S.getAudioContext();
  } catch {
    return Promise.resolve();
  }
  const jobs: Promise<unknown>[] = [];
  for (const L of p.layers) {
    const inst = INSTR[L.instrument];
    if (!inst || !inst.sample) continue;
    const m = sampleMap(inst);
    for (const rel of Array.isArray(m) ? m : Object.values(m)) {
      const url = SOUND_BASE + rel;
      if (!loading.has(url))
        loading.set(
          url,
          Promise.resolve(S.loadBuffer(url, ctx, inst.sound)).catch((e) => {
            loading.delete(url);
            console.warn('sample failed', url, e);
          }),
        );
      jobs.push(loading.get(url)!);
    }
  }
  return Promise.all(jobs);
}

/** Fetch the piece's sounds in the background. */
export function preload(p: Piece): void {
  ready.then(() => preloadFor(p)).catch(() => {});
}

/** Wait for the piece's sounds, but never longer than a few seconds. */
export function withSounds(p: Piece): Promise<void> {
  const note = $('recNote');
  let shown = false;
  const t = setTimeout(() => {
    shown = true;
    note.textContent = 'Loading sounds…';
  }, 300);
  return Promise.race([ready.then(() => preloadFor(p)), new Promise((r) => setTimeout(r, 8000))])
    .then(() => undefined)
    .catch(() => {})
    .finally(() => {
      clearTimeout(t);
      if (shown && note.textContent === 'Loading sounds…') note.textContent = '';
    });
}

/** Phones only let audio start inside the tap itself, before any waiting, so call this synchronously in the handler. */
export function unlockAudio(): void {
  try {
    // iPhone: play even with the silent switch on
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    // not supported
  }
  try {
    const ctx = S.getAudioContext();
    if (ctx.state !== 'running') void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    console.warn('unlock failed', e);
  }
}

// iPhone apps mute this kind of audio while the ringer is on silent. A looping silent media file
// marks the page as a media player, which lets the music through.
let keepAlive: HTMLAudioElement | null = null;
export function mediaSession(on: boolean): void {
  try {
    if (!keepAlive) {
      keepAlive = new Audio(new URL('silence.wav', document.baseURI).href);
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
      keepAlive.volume = 0.01;
    }
    if (on) keepAlive.play().catch(() => {});
    else keepAlive.pause();
  } catch {
    // no media element support
  }
}

/** Shortly after play, say so if the browser is still holding audio back. */
export function checkAudio(): void {
  setTimeout(() => {
    if (!state.playing) return;
    let ctxState = 'unknown';
    try {
      ctxState = S.getAudioContext().state;
    } catch {
      // no context
    }
    const note = $('recNote');
    if (ctxState !== 'running')
      note.textContent =
        'Audio is still locked by this browser. Tap stop, then play again. On a phone, also check the volume and the silent switch.';
    else if (note.textContent?.startsWith('Audio is still locked')) note.textContent = '';
  }, 1500);
}
