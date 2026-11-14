// Flat cloth: the 2D canvas renderer. The fallback when the 3D tapestry is
// unavailable, and the renderer Save cloth uses.
import { state } from './state.js';
import {
  COLS,
  bandH,
  makeRow,
  mix,
  pickH,
  pickList,
  rnd,
  seedRow,
  shade,
  tokens,
  type Row,
  type Tokens,
} from './weave.js';

let cv: HTMLCanvasElement;
let cx: CanvasRenderingContext2D;
let dpr = 1;

export function initFlatCloth(canvas: HTMLCanvasElement, onResize: () => void): void {
  cv = canvas;
  cx = canvas.getContext('2d')!;
  new ResizeObserver(() => {
    fitCanvas();
    onResize();
  }).observe(cv);
}

export function fitCanvas(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cv.clientWidth * dpr);
  cv.height = Math.round(cv.clientHeight * dpr);
}

type Ctx = CanvasRenderingContext2D;

function warpCell(ctx: Ctx, x: number, y: number, w: number, h: number, c: number, T: Tokens): void {
  const col = c % 24 === 0 ? T.warp2 : T.warp;
  ctx.fillStyle = shade(col, (rnd(c, 7) - 0.5) * 0.08);
  ctx.fillRect(x + w * 0.13, y, w * 0.74, h);
  ctx.fillStyle = 'rgba(255,255,255,.17)';
  ctx.fillRect(x + w * 0.3, y, w * 0.16, h);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.fillRect(x + w * 0.73, y, w * 0.14, h);
}
function weftCell(ctx: Ctx, x: number, y: number, w: number, h: number, col: string, seed: number): void {
  ctx.fillStyle = shade(col, (rnd(seed, 3) - 0.5) * 0.07);
  ctx.fillRect(x - w * 0.04, y + h * 0.1, w * 1.08, h * 0.8);
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.fillRect(x, y + h * 0.24, w, h * 0.16);
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  ctx.fillRect(x, y + h * 0.74, w, h * 0.16);
}
function floatThread(ctx: Ctx, x0: number, x1: number, y: number, h: number, col: string): void {
  const r = Math.min(h * 0.45, (x1 - x0) / 2);
  const round = (yy: number, hh: number) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, yy, x1 - x0, hh, r);
    else ctx.rect(x0, yy, x1 - x0, hh);
    ctx.fill();
  };
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  round(y + h * 0.12, h * 0.88); // cast shadow on the ground cloth
  ctx.fillStyle = col;
  round(y + h * 0.02, h * 0.86);
  ctx.fillStyle = 'rgba(255,255,255,.32)';
  ctx.fillRect(x0 + r * 0.6, y + h * 0.18, Math.max(0, x1 - x0 - r * 1.2), h * 0.14);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.fillRect(x0 + r * 0.6, y + h * 0.66, Math.max(0, x1 - x0 - r * 1.2), h * 0.14);
}
function bareWarp(ctx: Ctx, y: number, h: number, W: number, T: Tokens): void {
  const colW = W / COLS;
  ctx.fillStyle = T.gap;
  ctx.fillRect(0, y, W, h);
  for (let c = 0; c < COLS; c++) warpCell(ctx, c * colW, y, colW, h, c, T);
}

/** Paint one bar of cloth. upto = number of columns woven so far (live bar); the rest shows bare warp. */
export function paintRow(ctx: Ctx, row: Row, y0: number, W: number, T: Tokens, upto?: number): void {
  const seed = seedRow(row);
  const colW = W / COLS,
    picks = pickList(row),
    lim = upto == null ? COLS : upto;
  ctx.fillStyle = T.gap;
  ctx.fillRect(0, y0, W, bandH(row, colW));
  let y = y0;
  picks.forEach((p, pi) => {
    const h = pickH(colW, p.g),
      pk = p.g ? null : row.picks[p.k]!;
    // the notes carry the colour: between notes a layer's row is a faint tint, and each note floats in full colour on top
    const groundCol = pk && !pk.muted ? mix(T.layers[pk.ci] || T.ink, T.weft, 0.8) : T.weft;
    const covered = new Uint8Array(COLS);
    if (pk && !pk.muted) for (const sg of pk.segs) for (let c = sg.c0; c < sg.c1; c++) covered[c] = 1;
    for (let c = 0; c < COLS; c++) {
      const x = c * colW;
      if (c >= lim) {
        warpCell(ctx, x, y, colW, h, c, T);
        continue;
      }
      if (covered[c]) {
        warpCell(ctx, x, y, colW, h, c, T); // under the float; mostly hidden
        continue;
      }
      const over = (c + pi + seed) % 3 !== 0; // weft-faced twill: over two, under one, stepping each pick
      if (over) weftCell(ctx, x, y, colW, h, groundCol, seed * 97 + pi * 13 + c);
      else warpCell(ctx, x, y, colW, h, c, T);
    }
    if (pk && !pk.muted) {
      const base = T.layers[pk.ci] || T.ink;
      for (const sg of pk.segs) {
        if (sg.c0 >= lim) continue;
        const c1 = Math.min(sg.c1, lim);
        floatThread(ctx, sg.c0 * colW + colW * 0.06, c1 * colW - colW * 0.06, y, h, mix(base, '#ffffff', sg.lift * 0.5));
      }
    }
    y += h;
  });
}

function cachedRow(row: Row, W: number, T: Tokens): HTMLCanvasElement {
  const key = W + T.key;
  if (row._c && row._k === key) return row._c;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Math.ceil(bandH(row, W / COLS));
  paintRow(c.getContext('2d')!, row, 0, W, T);
  row._c = c;
  row._k = key;
  return c;
}

function paintTags(ctx: Ctx, row: Row, y: number, T: Tokens, fontPx: number): void {
  let x = 6 * dpr;
  ctx.font = `600 ${fontPx}px "Recursive Variable", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const t of row.tags) {
    const w = ctx.measureText(t).width + 12 * dpr,
      h = fontPx + 8 * dpr;
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = T.surface;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y + 3 * dpr, w, h, h / 2);
    else ctx.rect(x, y + 3 * dpr, w, h);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = T.ink;
    ctx.fillText(t, x + 6 * dpr, y + 3 * dpr + h / 2 + 0.5);
    x += w + 4 * dpr;
  }
}

function drawShuttle(ctx: Ctx, x: number, y: number, T: Tokens): void {
  const w = 30 * dpr,
    h = 9 * dpr;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * dpr, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = T.shuttle;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.beginPath();
  ctx.ellipse(x - w * 0.08, y - h * 0.18, w * 0.3, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw the flat cloth. ph = how far through the live bar, 0..1. */
export function drawFlat(ph?: number): void {
  if (!cv.width) return;
  const { rows, curRow, playing } = state;
  const T = tokens(),
    W = cv.width,
    H = cv.height,
    colW = W / COLS,
    fontPx = 11 * dpr;
  const loom = 22 * dpr; // bare warp waiting to be woven, below the cloth
  const fell = H - loom; // the weaving edge: new bars are added here
  bareWarp(cx, 0, H, W, T);
  const tag = (r: Row, y: number) => {
    if (r.tags.length && r.tags[0] !== 'first bar') paintTags(cx, r, y, T, fontPx);
  };
  // the cloth fills from the top; once it reaches the weaving edge, older bars scroll up out of view
  let rowsH = 0;
  for (const r of rows) {
    rowsH += bandH(r, colW);
    if (rowsH > fell) break;
  }
  const next = !(playing && curRow) && rows.length ? makeRow(0, rows[0]?.sig) : null;
  if (next) next.seed = 999;
  const lead = playing && curRow ? bandH(curRow, colW) : next ? bandH(next, colW) + 6 * dpr : 0;
  let y = (playing && curRow) || rows.length ? Math.min(fell, lead + rowsH) : fell; // bottom edge of the newest band
  if (playing && curRow) {
    const upto = Math.ceil((ph || 0) * COLS),
      bh = bandH(curRow, colW);
    y -= bh;
    paintRow(cx, curRow, y, W, T, upto);
    drawShuttle(cx, Math.min(W - 15 * dpr, Math.max(15 * dpr, (ph || 0) * W)), y + bh * 0.5, T);
    tag(curRow, y);
  } else if (!rows.length) {
    // nothing woven yet: bare warp, with the first bar sketched faintly at the weaving edge
    if (state.piece.layers.length) {
      const r = makeRow(0, null);
      r.seed = 999;
      y -= bandH(r, colW);
      cx.globalAlpha = 0.5;
      paintRow(cx, r, y, W, T);
      cx.globalAlpha = 1;
    }
  } else if (next) {
    // paused: the next bar is shown faintly at the weaving edge so changes are visible before weaving
    y -= bandH(next, colW);
    cx.globalAlpha = 0.5;
    paintRow(cx, next, y, W, T);
    cx.globalAlpha = 1;
    tag(next, y);
    y -= 6 * dpr;
  }
  for (const r of rows) {
    // rows is newest first, so work upward
    if (y < 0) break;
    y -= bandH(r, colW);
    cx.drawImage(cachedRow(r, W, T), 0, Math.round(y));
    tag(r, y);
  }
  // selvedges
  cx.fillStyle = T.gap;
  cx.globalAlpha = 0.6;
  cx.fillRect(0, 0, 2 * dpr, fell);
  cx.fillRect(W - 2 * dpr, 0, 2 * dpr, fell);
  cx.globalAlpha = 1;
}
