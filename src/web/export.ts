// Make MP3 and Save cloth. Files are handed to the browser as ordinary downloads.
import { Mp3Encoder } from '@breezystack/lamejs';
import { audioContext, master, rawOutput, ready } from './audio.js';
import { paintRow } from './flat-cloth.js';
import { $, state } from './state.js';
import { setPlaying } from './transport.js';
import { COLS, bandH, tokens } from './weave.js';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function saveCloth(): Promise<void> {
  const { rows, piece } = state;
  const note = $('recNote');
  if (!rows.length) {
    note.textContent = 'Weave a few bars first: press play and let it run.';
    return;
  }
  const T = tokens(),
    W = 1440,
    colW = W / COLS,
    head = 72;
  const keep = [];
  let body = 0;
  for (const r of rows) {
    const h = bandH(r, colW);
    if (head + body + h + 24 > 16000) break;
    keep.push(r);
    body += h;
  }
  keep.reverse();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = head + body + 24;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = T.surface;
  ctx.fillRect(0, 0, W, c.height);
  ctx.fillStyle = T.ink;
  ctx.font = '800 28px "Recursive Variable", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Groove Loom', 24, head / 2);
  ctx.fillStyle = T.muted;
  ctx.font = '500 18px "Recursive Variable", system-ui, sans-serif';
  ctx.fillText(
    `${keep.length} bars · ${piece.tempo} bpm · ${piece.key} ${piece.scale} · ${piece.layers.map((l) => l.name).join(', ')}`,
    220,
    head / 2,
  );
  let y = head;
  for (const r of keep) {
    paintRow(ctx, r, y, W, T);
    y += bandH(r, colW);
  }
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) {
    note.textContent = "This browser couldn't make the image.";
    return;
  }
  download(blob, `groove-loom-cloth-${rows.length}-bars.png`);
  note.textContent = 'Cloth saved.';
}

function encodeMp3(left: Float32Array, right: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const enc = new Mp3Encoder(2, rate, 192),
    out: Uint8Array[] = [],
    block = 1152;
  const toI16 = (f: Float32Array) => {
    const a = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]!));
      a[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return a;
  };
  const L = toI16(left),
    R = toI16(right);
  for (let i = 0; i < L.length; i += block) {
    const b = enc.encodeBuffer(L.subarray(i, i + block), R.subarray(i, i + block));
    if (b.length) out.push(new Uint8Array(b));
  }
  const f = enc.flush();
  if (f.length) out.push(new Uint8Array(f));
  const total = out.reduce((n, a) => n + a.length, 0),
    res = new Uint8Array(total);
  let o = 0;
  for (const a of out) {
    res.set(a, o);
    o += a.length;
  }
  return res;
}

function concat(chunks: Float32Array[]): Float32Array {
  const n = chunks.reduce((s, a) => s + a.length, 0),
    r = new Float32Array(n);
  let o = 0;
  for (const a of chunks) {
    r.set(a, o);
    o += a.length;
  }
  return r;
}

/** Record the live output for the chosen number of bars, then encode it as an MP3. */
export async function record(): Promise<void> {
  const { piece } = state;
  const note = $('recNote'),
    button = $<HTMLButtonElement>('record');
  if (state.recording || !piece.layers.length) {
    if (!piece.layers.length) note.textContent = 'Add a layer first.';
    return;
  }
  state.recording = true;
  button.disabled = true;
  const bars = Number($<HTMLSelectElement>('bars').value),
    secs = (bars * 240) / piece.tempo;
  try {
    state.repl = await ready;
    const ctx = audioContext();
    await ctx.resume();
    if (state.playing) await setPlaying(false);
    const tap = master || rawOutput();
    // ScriptProcessorNode is deprecated; task 7 moves recording to an AudioWorklet.
    const proc = ctx.createScriptProcessor(4096, 2, 2),
      mute = ctx.createGain();
    mute.gain.value = 0;
    const Lc: Float32Array[] = [],
      Rc: Float32Array[] = [];
    proc.onaudioprocess = (ev) => {
      Lc.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      Rc.push(new Float32Array(ev.inputBuffer.getChannelData(ev.inputBuffer.numberOfChannels > 1 ? 1 : 0)));
    };
    tap.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
    await setPlaying(true);
    const t0 = performance.now();
    await new Promise<void>((res) => {
      const tick = () => {
        const s = (performance.now() - t0) / 1000;
        const bar = Math.min(bars, Math.floor(s / (240 / piece.tempo)) + 1);
        note.textContent = s < secs ? `Recording bar ${bar} of ${bars}…` : 'Letting the last notes ring…';
        if (s >= secs + 1.2) res();
        else setTimeout(tick, 200);
      };
      tick();
    });
    await setPlaying(false);
    tap.disconnect(proc);
    proc.disconnect();
    mute.disconnect();
    let left = concat(Lc),
      right = concat(Rc);
    // trim the silence before the first note (scheduler latency)
    let start = 0;
    const lim = Math.min(left.length, ctx.sampleRate);
    while (start < lim && Math.abs(left[start]!) < 1e-4 && Math.abs(right[start]!) < 1e-4) start++;
    const len = Math.min(left.length - start, Math.round((secs + 1.2) * ctx.sampleRate));
    left = left.subarray(start, start + len);
    right = right.subarray(start, start + len);
    note.textContent = 'Encoding MP3…';
    await new Promise((r) => setTimeout(r, 30));
    const mp3 = encodeMp3(left, right, ctx.sampleRate);
    const base = `groove-loom-${piece.tempo}bpm-${piece.key}-${piece.scale.replace(/\s+/g, '-')}`.replace(/#/g, 'sharp');
    download(new Blob([mp3], { type: 'audio/mpeg' }), `${base}.mp3`);
    note.textContent = `Saved ${bars} bars as an MP3.`;
  } catch (e) {
    console.error(e);
    note.textContent = 'Recording failed in this view.';
  } finally {
    state.recording = false;
    button.disabled = false;
  }
}
