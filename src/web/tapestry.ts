// Tapestry on a loom, drawn in 3D with three.js. The same bars and threads as
// the flat cloth: each crossing of a warp thread and a weft pick is one texel
// of a data texture, and a shader draws the yarns. The flat cloth is the
// fallback when WebGL2 or the shader is unavailable.
import {
  Color,
  ColorManagement,
  DataTexture,
  DirectionalLight,
  HemisphereLight,
  LinearSRGBColorSpace,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createLoomFrame } from './loom-frame.js';
import { state } from './state.js';
import { TAP_FS, TAP_VS } from './tapestry-shaders.js';
import { COLS, makeRow, mix, pickList, rnd, seedRow, tokens, type Pick, type Row } from './weave.js';

// Match the prototype's three.js r128 look: colours as given, no colour-space conversion.
ColorManagement.enabled = false;

export interface Tapestry {
  ok: boolean;
  draw(ph?: number): void;
  theme(): void;
}

interface Part {
  row: Row;
  upto?: number;
  ghost?: boolean;
  label?: boolean;
}

/** Returns null when 3D is unavailable; onFail runs if the shader is rejected after the first frame. */
export function createTapestry(host: HTMLCanvasElement, tagBox: HTMLElement, onFail: () => void): Tapestry | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: host, antialias: true });
  } catch (e) {
    console.warn('3D cloth unavailable, using flat cloth', e);
    return null;
  }
  if (!renderer || !renderer.getContext()) return null;
  renderer.outputColorSpace = LinearSRGBColorSpace;

  const PICK = 0.08,
    CELL = 0.1,
    HALF = (COLS * CELL) / 2,
    MAXP = 512;
  const scene = new Scene(),
    camera = new PerspectiveCamera(38, 1, 0.1, 100);
  const data = new Uint8Array(COLS * MAXP * 4);
  const tex = new DataTexture(data, COLS, MAXP, RGBAFormat);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  const pal = Array.from({ length: 12 }, () => new Color());
  const U = {
    uTex: { value: tex },
    uRows: { value: MAXP },
    uFell: { value: 0 },
    uScroll: { value: 0 },
    uPal: { value: pal },
    uBg: { value: new Color() },
    uWarp: { value: new Color() },
    uWarp2: { value: new Color() },
    uCam: { value: new Vector3() },
  };
  const bed = new Mesh(
    new PlaneGeometry(HALF * 2 + 1.6, 70),
    new ShaderMaterial({ uniforms: U, vertexShader: TAP_VS, fragmentShader: TAP_FS }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.z = -28;
  const frame = createLoomFrame(HALF);
  const { reed, shuttle, beam } = frame;
  // Light intensities are scaled by pi: three.js now uses physical light units, r128 did not.
  scene.add(bed, frame.group, new HemisphereLight(0xffffff, 0x3a3a3a, 0.6 * Math.PI));
  const sun = new DirectionalLight(0xfff4e6, 0.7 * Math.PI);
  sun.position.set(-4, 8, -6);
  // A soft fill from the weaver's side, so the faces of the reed, shuttle and beam aren't in shade.
  // (The cloth's shader does its own lighting and ignores these.)
  const fill = new DirectionalLight(0xffffff, 0.45 * Math.PI);
  fill.position.set(2, 6, 10);
  scene.add(sun, fill);

  let zTop = -10,
    zBot = 2,
    fellNear = 0.5,
    fz: number | null = null,
    fellT = 0,
    scroll = 0,
    mode = '',
    lastPicks = 0,
    lastNewest: Row | null = null,
    beatAt = -1e9,
    last = performance.now();
  let ph = 0,
    pending = false,
    checked = false;
  const tagEls: HTMLSpanElement[] = [];

  function rayZ(ndcY: number): number {
    const v = new Vector3(0, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
    return camera.position.z + v.z * (-camera.position.y / v.y);
  }
  function layout(): boolean {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return false;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const el = (62 * Math.PI) / 180,
      target = new Vector3(0, 0, -1.6);
    const hf = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const D = (HALF + 0.95) / Math.tan(hf / 2); // wide enough to show the side rails
    camera.position.set(0, D * Math.sin(el), target.z + D * Math.cos(el));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    zTop = rayZ(0.86);
    zBot = rayZ(-1);
    fellNear = zBot - 1.65; // room in front of the cloth for the shuttle's path and the reed
    beam.position.set(0, 0.05, zBot - 0.2);
    return true;
  }
  function applyTheme(): void {
    const T = tokens();
    pal[0]!.set(T.weft);
    T.layers.forEach((h, i) => pal[i + 1]!.set(h || T.ink));
    pal[10]!.set(mix(T.weft, '#000000', 0.2));
    U.uBg.value.set(T.gap);
    U.uWarp.value.set(T.warp);
    U.uWarp2.value.set(T.warp2);
    scene.background = new Color(T.gap);
    frame.setWood(mix(T.shuttle, '#000000', 0.08));
    frame.setYarn(T.layers[0] || T.ink);
  }
  // write one pick (a row of crossings) into the texture
  function writePick(p: number, row: Row, pk: Pick, i: number, upto: number, ghost: boolean | undefined, k2: number): void {
    const seed = row.seed || 0;
    const o = p * COLS * 4,
      gb = ghost ? 4 : 0,
      pb = (p + (seed & 1)) & 1 ? 16 : 0;
    if (pk.g) {
      const R = i === 0 ? 10 : 0; // the first pick of each bar is a shade darker: a bar line
      const dye = Math.round(rnd(seed * 7 + i, k2) * 255);
      for (let c = 0; c < COLS; c++) {
        const k = o + c * 4;
        if (c >= upto) {
          data[k] = data[k + 1] = data[k + 2] = data[k + 3] = 0;
          continue;
        }
        data[k] = R;
        data[k + 1] = 1;
        data[k + 2] = gb | pb;
        data[k + 3] = dye;
      }
      return;
    }
    const L = row.picks[pk.k]!,
      fl = new Int16Array(COLS).fill(-1),
      sh = k2 ? 1 : 0; // the second yarn is offset by one warp: interlocking teeth
    const dye = Math.round(rnd(seed * 7 + i, k2 + 5) * 255);
    if (!L.muted)
      L.segs.forEach((sg, j) => {
        for (let c = Math.min(COLS - 1, sg.c0 + sh); c < Math.min(COLS, sg.c1 + sh); c++) fl[c] = j;
      });
    for (let c = 0; c < COLS; c++) {
      const k = o + c * 4;
      if (c >= upto) {
        data[k] = data[k + 1] = data[k + 2] = data[k + 3] = 0;
        continue;
      }
      if (fl[c]! >= 0) {
        const sg = L.segs[fl[c]!]!;
        data[k] = L.ci + 1;
        data[k + 1] = 3;
        data[k + 2] =
          (c === Math.min(COLS - 1, sg.c0 + sh) ? 1 : 0) | (c === Math.min(COLS, sg.c1 + sh) - 1 ? 2 : 0) | gb | pb;
        data[k + 3] = Math.round((sg.lift || 0) * 255);
      } else {
        data[k] = L.muted ? 0 : L.ci + 1;
        data[k + 1] = 1;
        data[k + 2] = (L.muted ? 0 : 8) | gb | pb;
        data[k + 3] = dye;
      }
    }
  }
  // each layer's pick is woven two yarns deep so its colour reads as a band; ground picks are one yarn
  const depth = (pk: Pick) => (pk.g ? 1 : 2);
  function build(): { picks: number; tags: { at: number; text: string }[]; newest: Row | null } {
    const { playing, curRow, rows, piece } = state;
    const parts: Part[] = [];
    if (playing && curRow) parts.push({ row: curRow, upto: Math.ceil(ph * COLS) });
    else if (!rows.length) {
      // Nothing woven yet: bare warp, with the first bar sketched faintly at the weaving edge.
      if (piece.layers.length) {
        const r = makeRow(0, null);
        r.seed = 999;
        parts.push({ row: r, ghost: true });
      }
    } else {
      const r = makeRow(0, rows[0]?.sig);
      r.seed = 999;
      parts.push({ row: r, ghost: true, label: true });
    }
    for (const r of rows) parts.push({ row: r });
    let p = 0;
    const tags: { at: number; text: string }[] = [];
    for (const part of parts) {
      const r = part.row;
      seedRow(r);
      const list = pickList(r);
      for (let i = list.length - 1; i >= 0 && p < MAXP; i--)
        for (let k = 0; k < depth(list[i]!) && p < MAXP; k++, p++) writePick(p, r, list[i]!, i, part.upto ?? COLS, part.ghost, k);
      if (r.tags.length && r.tags[0] !== 'first bar' && (!part.ghost || part.label)) tags.push({ at: p, text: r.tags.join('  ') });
      if (p >= MAXP) break;
    }
    data.fill(0, p * COLS * 4);
    tex.needsUpdate = true;
    return { picks: p, tags, newest: parts[0]?.row || null };
  }
  function placeTags(tags: { at: number; text: string }[]): void {
    const w = host.clientWidth,
      h = host.clientHeight;
    while (tagEls.length < tags.length) {
      const e = document.createElement('span');
      e.className = 'tap-tag';
      tagBox.append(e);
      tagEls.push(e);
    }
    tagEls.forEach((e, i) => {
      const t = tags[i];
      if (!t || fz == null) {
        e.hidden = true;
        return;
      }
      const dz = t.at - scroll,
        z = fz - dz * PICK;
      const v = new Vector3(-HALF + 0.15, 0.02, z).project(camera);
      const x = ((v.x + 1) / 2) * w,
        y = ((1 - v.y) / 2) * h;
      if (dz < 0 || v.z > 1 || y < 8 || y > h - 8 || z < zTop - 4) {
        e.hidden = true;
        return;
      }
      e.hidden = false;
      e.textContent = t.text;
      const s = Math.max(0.55, Math.min(1, (y / h) * 1.2 + 0.2));
      e.style.transform = `translate(${x.toFixed(1)}px, ${(y - 9).toFixed(1)}px) scale(${s.toFixed(2)})`;
    });
  }
  function render(): void {
    pending = false;
    if (!api.ok || !layout()) return;
    const playing = state.playing;
    const now = performance.now(),
      dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const b = build();
    const m = playing ? 'play' : state.rows.length ? 'paused' : 'preview';
    const target = fellNear;
    if (m !== mode || fz == null) {
      mode = m;
      fz = fellT = target;
      scroll = 0;
    } else if (b.newest !== lastNewest || b.picks !== lastPicks) {
      const added = b.picks - lastPicks,
        moved = (target - fellT) / PICK;
      if (added > 0) {
        scroll = Math.max(-80, Math.min(80, scroll + added - moved));
        if (playing) beatAt = now;
      }
      fellT = target;
    }
    lastPicks = b.picks;
    lastNewest = b.newest;
    const k = 1 - Math.exp(-dt * 6);
    fz += (fellT - fz) * k;
    scroll -= scroll * k;
    if (Math.abs(scroll) < 0.01) scroll = 0;
    U.uFell.value = fz;
    U.uScroll.value = scroll;
    U.uCam.value.copy(camera.position);
    const beat = Math.exp(-(now - beatAt) / 120); // the reed swings in to pack each new bar
    // From the cloth outwards, as on a real loom: the weaving edge, the shuttle's path, the reed.
    reed.position.set(0, 0, fz + 0.8 - 0.62 * beat);
    // The shuttle crosses while the bar is woven; at rest it waits by the left rail.
    if (playing) shuttle.position.set(-HALF + ph * HALF * 2, 0.1, fz + 0.36);
    else shuttle.position.set(-HALF - 0.05, 0.1, fz + 0.36);
    renderer.render(scene, camera);
    if (!checked) {
      // a graphics chip that rejects the shader gets the flat cloth
      checked = true;
      const programs = (renderer.info.programs ?? []) as { diagnostics?: { runnable: boolean } }[];
      const bad = programs.some((pr) => pr.diagnostics && pr.diagnostics.runnable === false);
      if (bad) {
        api.ok = false;
        host.hidden = true;
        tagBox.textContent = '';
        onFail();
        return;
      }
    }
    placeTags(b.tags);
    if (!playing && (Math.abs(fellT - fz) > 0.002 || scroll !== 0)) request();
  }
  function request(): void {
    if (!pending) {
      pending = true;
      requestAnimationFrame(render);
    }
  }

  const api: Tapestry = {
    ok: true,
    draw(p?: number) {
      ph = p || 0;
      if (state.playing) render();
      else request();
    },
    theme() {
      applyTheme();
      request();
    },
  };
  applyTheme();
  new ResizeObserver(() => request()).observe(host);
  return api;
}
