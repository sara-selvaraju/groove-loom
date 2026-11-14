// The page's controls, layer cards and conversation, and the update cycle
// that keeps sound, cloth and code listing in step with the piece.
import { codeFor, audible, patternText } from '../shared/compiler.js';
import { describeChanges, sanitizeChanges, sanitizeWords, type Word } from '../shared/learning.js';
import { BLANK, STARTER, cleanText, sanitizePiece, type Layer } from '../shared/piece.js';
import type { ChatMessage } from '../shared/prompt.js';
import { decodeLink, encodePiece, isShareLink } from '../shared/share.js';
import { INSTR, KEYS, MAX_LAYERS, SCALES } from '../shared/vocabulary.js';
import { checkAudio, mediaSession, preload, setVolume, unlockAudio, withSounds } from './audio.js';
import { drawCloth, initCloth } from './cloth.js';
import { ComposerError, ServerComposer, aiAvailable, composerErrorText, type Composer } from './composer.js';
import { record, saveCloth } from './export.js';
import { compile, parsesAsMini } from './pattern.js';
import { $, clone, save, state } from './state.js';
import { setPlaying } from './transport.js';
import { LAYER_VARS, makeRow } from './weave.js';
import { learntTerms, recordExchange, wireWords } from './words.js';

const CHIPS = [
  'Start me off with a 4/4 beat',
  'Throw in a syncopated trumpet',
  'Make it groovier',
  'Add a dreamy pad with slow chords',
  'Try 3 against 4 on the drums',
  'Strip it back to drums and bass',
];

/** Hover help for the pattern line under each layer. */
const PATTERN_HELP =
  'notes: steps up the scale from the home note (0 is the home note, 7 is the same note higher, ~ is a rest).\n' +
  'rhythm: x is a hit and ~ is a rest; spaces share the bar out evenly.\n' +
  'accent: how hard each hit is, from 0 (silent) to 1 (full).';

/* ---------- Rendering ---------- */

function renderTransport(): void {
  const { piece } = state;
  $<HTMLInputElement>('tempo').value = String(piece.tempo);
  $('tempoOut').textContent = `${piece.tempo} bpm`;
  $<HTMLInputElement>('swing').value = String(piece.swing);
  $('swingOut').textContent =
    piece.swing < 0.02 ? 'straight' : piece.swing > 0.8 ? 'heavy shuffle' : `${Math.round(piece.swing * 100)}%`;
  $<HTMLSelectElement>('key').value = piece.key;
  $<HTMLSelectElement>('scale').value = piece.scale;
  $<HTMLButtonElement>('undo').disabled = !state.undoStack.length;
}

function renderLegend(): void {
  const lg = $('legend');
  lg.textContent = '';
  state.piece.layers.forEach((L, i) => {
    const s = document.createElement('span');
    s.style.setProperty('--thread', `var(${LAYER_VARS[i % 8]})`);
    const d = document.createElement('i');
    d.style.background = `var(${LAYER_VARS[i % 8]})`;
    s.append(d, L.name);
    lg.append(s);
  });
}

function slider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  fmt: (v: number) => string,
  onInput: (v: number) => void,
  id: string,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'ctl';
  const row = document.createElement('div');
  row.className = 'ctl-row';
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = label;
  const out = document.createElement('output');
  out.className = 'num';
  out.textContent = fmt(value);
  row.append(lab, out);
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.id = id;
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.value = String(value);
  inp.addEventListener('pointerdown', () => snapshot());
  inp.addEventListener('keydown', () => snapshot());
  inp.addEventListener('input', () => {
    out.textContent = fmt(Number(inp.value));
    onInput(Number(inp.value));
  });
  wrap.append(row, inp);
  return wrap;
}

function renderLayers(): void {
  const { piece } = state;
  const box = $('layers');
  box.textContent = '';
  $('layerCount').textContent = `${piece.layers.length} of ${MAX_LAYERS}`;
  if (!piece.layers.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'No layers yet. Try “start me off with a 4/4 beat”.';
    box.append(e);
    return;
  }
  const on = audible(piece);
  piece.layers.forEach((L: Layer, i) => {
    const inst = INSTR[L.instrument]!;
    const card = document.createElement('article');
    card.className = 'layer' + (on[i] ? '' : ' off');
    card.style.setProperty('--thread', `var(${LAYER_VARS[i % 8]})`);
    const yarn = document.createElement('span');
    yarn.className = 'yarn';
    yarn.setAttribute('aria-hidden', 'true');
    card.append(yarn);
    const h = document.createElement('div');
    h.className = 'lh';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = L.name;
    const ins = document.createElement('span');
    ins.className = 'in';
    ins.textContent = inst.label;
    const sp = document.createElement('span');
    sp.className = 'sp';
    const mk = (txt: string, title: string, pressed: boolean, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'tg';
      b.textContent = txt;
      b.title = title;
      b.setAttribute('aria-label', `${title} ${L.name}`);
      b.setAttribute('aria-pressed', String(pressed));
      b.onclick = fn;
      return b;
    };
    const btns = document.createElement('span');
    btns.className = 'btns';
    btns.append(
      mk('M', 'Mute', L.muted, () => {
        snapshot();
        L.muted = !L.muted;
        update();
      }),
      mk('S', 'Solo', L.solo, () => {
        snapshot();
        L.solo = !L.solo;
        update();
      }),
      mk('×', 'Remove', false, () => {
        snapshot();
        piece.layers.splice(i, 1);
        update();
      }),
    );
    h.append(nm, ins, sp, btns);
    card.append(h);
    if (L.about) {
      const a = document.createElement('p');
      a.className = 'about';
      a.textContent = L.about;
      card.append(a);
    }
    const draft = document.createElement('div');
    draft.className = 'draft';
    draft.setAttribute('role', 'img');
    fillDraft(draft, L, i);
    card.append(draft);
    const pat = document.createElement('div');
    pat.className = 'pat mono';
    pat.title = PATTERN_HELP;
    pat.textContent = patternText(L);
    card.append(pat);
    const k = document.createElement('div');
    k.className = 'knobs';
    const pct = (v: number) => `${Math.round(v * 100)}`;
    k.append(
      slider('Volume', L.volume, 0, 1, 0.01, pct, (v) => {
        L.volume = v;
        soft();
      }, `v-${L.id}`),
      slider(
        'Tone',
        L.tone,
        0,
        1,
        0.01,
        (v) => (v < 0.3 ? 'dark' : v < 0.45 ? 'warm' : v > 0.75 ? 'bright' : 'natural'),
        (v) => {
          L.tone = v;
          soft();
        },
        `t-${L.id}`,
      ),
      slider('Space', L.space, 0, 1, 0.01, pct, (v) => {
        L.space = v;
        soft();
      }, `s-${L.id}`),
      slider('Echo', L.echo, 0, 1, 0.01, (v) => (v < 0.03 ? 'off' : pct(v)), (v) => {
        L.echo = v;
        soft();
      }, `e-${L.id}`),
      slider('Grit', L.grit, 0, 1, 0.01, (v) => (v < 0.03 ? 'clean' : v < 0.45 ? 'warm' : 'dirty'), (v) => {
        L.grit = v;
        soft();
      }, `g-${L.id}`),
    );
    if (L.rhythm?.mode === 'euclid') {
      const R = L.rhythm;
      const hitsS = slider('Hits', R.hits, 0, R.steps, 1, String, (v) => {
        R.hits = v;
        soft(true);
      }, `h-${L.id}`);
      const stepsS = slider('Steps', R.steps, 1, 32, 1, String, (v) => {
        R.steps = v;
        R.hits = Math.min(R.hits, v);
        R.rotate = Math.min(R.rotate, v - 1);
        soft(true);
      }, `n-${L.id}`);
      const rotS = slider('Rotate', R.rotate, 0, Math.max(0, R.steps - 1), 1, String, (v) => {
        R.rotate = v;
        soft(true);
      }, `r-${L.id}`);
      stepsS.querySelector('input')!.addEventListener('change', () => renderLayers());
      k.append(hitsS, stepsS, rotS);
    }
    card.append(k);
    box.append(card);
  });
}

/** Keep the pattern readouts and drafts in step with the even-spacing sliders without re-rendering the cards. */
function renderPatTexts(): void {
  const cards = $('layers').querySelectorAll('.layer');
  state.piece.layers.forEach((L, i) => {
    const p = cards[i]?.querySelector('.pat');
    if (p) p.textContent = patternText(L);
    const d = cards[i]?.querySelector<HTMLDivElement>('.draft');
    if (d) fillDraft(d, L, i);
  });
}

/**
 * The layer's first bar as weaver's draft paper: one square per step, filled
 * where a note or hit starts. Read from the compiled pattern, so it always
 * matches what plays.
 */
function fillDraft(box: HTMLDivElement, L: Layer, i: number): void {
  const steps = L.rhythm?.mode === 'euclid' ? L.rhythm.steps : 16;
  const on = new Array<boolean>(steps).fill(false);
  const level = new Array<number>(steps).fill(1);
  try {
    for (const h of state.compiled?.perLayer[i]?.queryArc(0, 1) ?? []) {
      const at = Math.floor(h.part.begin.valueOf() * steps + 1e-6);
      if (at >= 0 && at < steps) {
        on[at] = true;
        const v = (h.value as { velocity?: unknown } | null)?.velocity;
        if (typeof v === 'number') level[at] = Math.min(1, Math.max(0, v));
      }
    }
  } catch {
    // a pattern that cannot be queried draws as empty
  }
  box.style.setProperty('--steps', String(steps));
  box.textContent = '';
  const beat = steps % 4 === 0 ? steps / 4 : 0;
  on.forEach((hit, k) => {
    const cell = document.createElement('i');
    if (hit) {
      cell.className = 'on';
      // Softer hits are drawn paler, so accents show.
      if (level[k]! < 0.98) cell.style.opacity = String(0.3 + 0.7 * level[k]!);
    }
    if (beat && k % beat === 0) cell.classList.add('beat');
    box.append(cell);
  });
  box.setAttribute('aria-label', `${on.filter(Boolean).length} of ${steps} steps play in the first bar`);
}

function renderLog(): void {
  const box = $('log');
  box.textContent = '';
  for (const m of state.log.slice(-12)) {
    const d = document.createElement('div');
    d.className = 'msg ' + (m.who === 'you' ? 'you' : 'loom') + (m.err ? ' err' : '');
    const w = document.createElement('span');
    w.className = 'who';
    w.textContent = m.who === 'you' ? 'You' : 'Loom';
    d.append(w, document.createTextNode(m.text));
    if (m.who === 'loom' && !m.err) appendLesson(d, sanitizeWords(m.words), sanitizeChanges(m.changes));
    box.append(d);
  }
  box.scrollTop = box.scrollHeight;
}

/**
 * Under a reply: the person's words linked to the music ideas behind them, then
 * what the app saw change. Text only, never markup.
 */
function appendLesson(msg: HTMLElement, words: Word[], changes: string[]): void {
  if (words.length) {
    const dl = document.createElement('dl');
    dl.className = 'words';
    for (const w of words) {
      const dt = document.createElement('dt');
      if (w.said) {
        const said = document.createElement('span');
        said.className = 'said';
        said.textContent = `“${w.said}”`;
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.setAttribute('aria-label', 'means');
        arrow.textContent = ' → ';
        dt.append(said, arrow);
      }
      const term = document.createElement('span');
      term.className = 'term';
      term.textContent = w.term;
      dt.append(term);
      const dd = document.createElement('dd');
      dd.textContent = w.meaning;
      dl.append(dt, dd);
    }
    msg.append(dl);
  }
  if (changes.length) {
    const box = document.createElement('div');
    box.className = 'changes';
    const h = document.createElement('span');
    h.className = 'changes-title';
    h.textContent = 'What changed';
    const ul = document.createElement('ul');
    for (const c of changes) {
      const li = document.createElement('li');
      li.textContent = c;
      ul.append(li);
    }
    box.append(h, ul);
    msg.append(box);
  }
}

/* ---------- Update cycle ---------- */

let softTimer = 0;
/** Debounced rebuild for knob drags. */
function soft(redrawPat?: boolean): void {
  clearTimeout(softTimer);
  softTimer = window.setTimeout(() => {
    rebuild();
    if (redrawPat) renderPatTexts();
  }, 60);
}

function rebuild(): void {
  const { piece } = state;
  state.compiled = compile(piece);
  $('code').textContent = codeFor(piece);
  renderLegend();
  if (state.playing && state.curRow) {
    const keep = state.curRow.cycle,
      seed = state.curRow.seed;
    state.curRow = makeRow(keep, state.rows[0]?.sig);
    state.curRow.seed = seed;
  }
  drawCloth();
  if (state.playing && state.repl) {
    // a newly added recorded instrument is fetched before the new pattern starts, so its first notes aren't dropped
    const target = state.compiled;
    void withSounds(piece).then(() => {
      if (state.playing && state.compiled === target && state.repl) {
        state.repl.setCps(target.cps);
        void state.repl.setPattern(target.pattern, true);
      }
    });
  } else preload(piece);
  save();
}

function update(): void {
  renderTransport();
  rebuild(); // compiles first, so the layer drafts read the new pattern
  renderLayers();
}

function snapshot(): void {
  state.undoStack.push(JSON.stringify(state.piece));
  if (state.undoStack.length > 40) state.undoStack.shift();
  $<HTMLButtonElement>('undo').disabled = false;
}

/* ---------- Share links ---------- */

/** Copies a link to the piece (or opens the phone's share sheet). The link carries the piece only, never the chat. */
async function sharePiece(): Promise<void> {
  const btn = $<HTMLButtonElement>('share');
  const url = location.origin + location.pathname + (await encodePiece(state.piece));
  if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: 'Groove Loom', text: 'Have a listen to what I made on Groove Loom.', url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // fall through to copying
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Link copied';
    window.setTimeout(() => (btn.textContent = 'Share link'), 2000);
  } catch {
    window.prompt('Copy this link to share your piece:', url);
  }
}

/**
 * Opens a piece from a share link in the address. The link's data is checked
 * by sanitizePiece like an AI reply; the current piece is kept for Undo.
 */
async function openShareLink(): Promise<void> {
  const hash = location.hash;
  if (!isShareLink(hash)) return;
  // Clear it, so a reload or a later share starts from the person's own piece.
  history.replaceState(null, '', location.pathname + location.search);
  const next = sanitizePiece(await decodeLink(hash), null, parsesAsMini);
  if (!next) {
    state.log.push({ who: 'loom', err: true, text: "That shared link is damaged or incomplete, so nothing changed. Ask whoever sent it for a fresh one." });
  } else {
    snapshot();
    state.piece = next;
    state.log.push({ who: 'loom', text: 'This piece came from a shared link. Press play to hear it, then change anything you like. Undo brings back the piece you had.' });
    update();
  }
  renderLog();
  save();
}

/* ---------- Ask the AI ---------- */

let ctl: AbortController | null = null;
/** Null until the server says the AI is on. */
let composer: Composer | null = null;

const INVITE_KEY = 'gl.invite';
const VOLUME_KEY = 'gl.volume';
/** Listening volume is a setting of this device, not part of the piece: not undone, not shared. */
function loadVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY) ?? '0.8');
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
  } catch {
    return 0.8;
  }
}
function inviteCode(): string | null {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}
function setInviteCode(code: string | null): void {
  try {
    if (code) localStorage.setItem(INVITE_KEY, code);
    else localStorage.removeItem(INVITE_KEY);
  } catch {
    // storage blocked: the code lasts until the page reloads
  }
  sessionInvite = code;
}
let sessionInvite: string | null = null;
const currentInvite = () => inviteCode() ?? sessionInvite;

function renderAiNote(): void {
  const note = $('aiNote'),
    form = $<HTMLFormElement>('inviteForm');
  if (!composer) {
    note.textContent = "The AI isn't switched on here. The knobs, mute, solo and undo still work.";
    form.hidden = true;
  } else if (!currentInvite()) {
    note.textContent = 'Enter the invite code to use the AI. The knobs work without it.';
    form.hidden = false;
  } else {
    note.textContent = '';
    form.hidden = true;
  }
}

async function ask(input: string): Promise<void> {
  const text = input.trim();
  if (!text || state.busy) return;
  if (!composer) {
    state.log.push({ who: 'loom', text: composerErrorText('unavailable'), err: true });
    renderLog();
    return;
  }
  if (!currentInvite()) {
    state.log.push({ who: 'loom', text: 'Enter the invite code below first, then ask again.', err: true });
    renderLog();
    renderAiNote();
    $<HTMLInputElement>('invite').focus();
    return;
  }
  const send = $<HTMLButtonElement>('send');
  state.busy = true;
  send.disabled = true;
  send.textContent = 'Thinking…';
  const history = state.log.slice();
  state.log.push({ who: 'you', text });
  renderLog();
  const pending: ChatMessage = { who: 'loom', text: 'Listening and arranging. This can take up to a minute.', err: false };
  state.log.push(pending);
  renderLog();
  ctl = new AbortController();
  try {
    const res = await composer.compose({ request: text, piece: state.piece, history, learnt: learntTerms() }, ctl.signal);
    const next = sanitizePiece(res.piece, state.piece, parsesAsMini);
    if (!next) throw new ComposerError('invalid_json');
    snapshot();
    const before = state.piece;
    state.piece = next;
    pending.text = cleanText(res.reply, 500) || 'Done.';
    pending.words = sanitizeWords(res.words);
    pending.changes = describeChanges(before, next);
    recordExchange(text, pending.words);
    update();
  } catch (e) {
    const code = e instanceof ComposerError ? e.code : 'failed';
    if (!(e instanceof ComposerError)) console.error('ask failed', e);
    pending.err = true;
    pending.text = composerErrorText(code);
    if (code === 'forbidden' || code === 'locked') {
      setInviteCode(null);
      renderAiNote();
    }
  } finally {
    state.busy = false;
    send.disabled = false;
    send.textContent = 'Send';
    renderLog();
    save();
  }
}

/* ---------- Wiring ---------- */

function wire(): void {
  // Two play buttons, one action: the one on the loom is for phones, where the control strip is out of view.
  const togglePlay = () => {
    unlockAudio();
    mediaSession(!state.playing);
    void setPlaying(!state.playing).then(() => {
      if (state.playing) checkAudio();
    });
  };
  $('play').onclick = togglePlay;
  $('loomPlay').onclick = togglePlay;

  $('askForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const prompt = $<HTMLTextAreaElement>('prompt');
    const t = prompt.value;
    prompt.value = '';
    void ask(t);
  });
  $('prompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $<HTMLFormElement>('askForm').requestSubmit();
    }
  });
  for (const c of CHIPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = c;
    b.onclick = () => void ask(c);
    $('chips').append(b);
  }

  for (const k of KEYS) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    $('key').append(o);
  }
  for (const [k, v] of Object.entries(SCALES)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = v;
    $('scale').append(o);
  }
  for (const id of ['tempo', 'swing']) {
    $(id).addEventListener('pointerdown', snapshot);
    $(id).addEventListener('keydown', snapshot);
  }
  $('tempo').addEventListener('input', (e) => {
    state.piece.tempo = Number((e.target as HTMLInputElement).value);
    renderTransport();
    soft();
  });
  $('swing').addEventListener('input', (e) => {
    state.piece.swing = Number((e.target as HTMLInputElement).value);
    renderTransport();
    soft();
  });
  $('key').addEventListener('change', (e) => {
    snapshot();
    state.piece.key = (e.target as HTMLSelectElement).value as typeof state.piece.key;
    update();
  });
  $('scale').addEventListener('change', (e) => {
    snapshot();
    state.piece.scale = (e.target as HTMLSelectElement).value as typeof state.piece.scale;
    update();
  });
  $('undo').onclick = () => {
    const prev = state.undoStack.pop();
    if (!prev) return;
    state.piece = JSON.parse(prev);
    update();
  };
  // Start over: a blank piece, an empty cloth and a fresh conversation. Undo still brings the last piece back.
  $('reset').onclick = () => {
    ctl?.abort();
    snapshot();
    if (state.playing) void setPlaying(false);
    state.piece = clone(BLANK);
    state.rows.length = 0;
    state.curRow = null;
    state.log = [{ who: 'loom', text: 'Blank slate. Describe a beat or a feel to begin. Undo brings the last piece back.' }];
    renderLog();
    update();
  };
  // Clear chat: forget the conversation (the AI sees it as context), keep the piece.
  $('clearChat').onclick = () => {
    ctl?.abort();
    state.log = [];
    renderLog();
    save();
  };

  const volume = $<HTMLInputElement>('volume');
  const showVolume = (v: number) => {
    volume.value = String(v);
    $('volumeOut').textContent = v === 0 ? 'off' : `${Math.round(v * 100)}%`;
  };
  const savedVolume = loadVolume();
  showVolume(savedVolume);
  setVolume(savedVolume);
  volume.addEventListener('input', () => {
    const v = Number(volume.value);
    showVolume(v);
    setVolume(v);
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      // not remembered
    }
  });

  $('inviteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('invite');
    const code = input.value.trim();
    if (!code) return;
    input.value = '';
    setInviteCode(code);
    renderAiNote();
  });

  $('record').onclick = () => {
    unlockAudio();
    mediaSession(true);
    void record();
  };
  $('saveCloth').onclick = () => void saveCloth();
  $('share').onclick = () => void sharePiece();
  // a link pasted into the address bar of an open page changes only the fragment
  window.addEventListener('hashchange', () => void openShareLink());
}

export function boot(): void {
  state.piece = sanitizePiece(state.piece, STARTER, parsesAsMini) ?? (sanitizePiece(STARTER, null, parsesAsMini) as typeof state.piece);
  wire();
  wireWords();
  initCloth();
  update();
  renderLog();
  void openShareLink();
  void aiAvailable().then((on) => {
    composer = on ? new ServerComposer(currentInvite) : null;
    renderAiNote();
  });
}
