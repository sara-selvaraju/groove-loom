// App state shared by the modules, and the per-browser draft in localStorage.
import type { Repl } from '@strudel/web';
import { STARTER, type Piece } from '../shared/piece.js';
import type { ChatMessage } from '../shared/prompt.js';
import type { Compiled } from './pattern.js';
import type { Row } from './weave.js';

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

function load(k: string): unknown {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

const WELCOME: ChatMessage = {
  who: 'loom',
  text: 'This is an example groove to start from. Press play, then tell me what to change, or press Start over for a blank slate.',
};

export const state = {
  /** Unvalidated until boot runs it through sanitizePiece. */
  piece: (load('gl.piece') ?? clone(STARTER)) as Piece,
  log: (Array.isArray(load('gl.log')) ? load('gl.log') : [WELCOME]) as ChatMessage[],
  undoStack: [] as string[],
  playing: false,
  repl: null as Repl | null,
  compiled: null as Compiled | null,
  busy: false,
  recording: false,
  /** Woven bars, newest first. */
  rows: [] as Row[],
  /** The bar being woven while playing. */
  curRow: null as Row | null,
  curCycle: -1,
};

export function save(): void {
  try {
    localStorage.setItem('gl.piece', JSON.stringify(state.piece));
    localStorage.setItem('gl.log', JSON.stringify(state.log.slice(-30)));
  } catch {
    // storage full or blocked: the draft just isn't kept
  }
}

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el as T;
}
