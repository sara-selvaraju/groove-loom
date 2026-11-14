// The wooden loom around the tapestry: side rails, the front beam, the reed
// that packs each new bar, and the shuttle that carries the yarn across.
// Grain is drawn once on a canvas and tinted by the theme's wood colour.
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  Vector2,
  type Texture,
} from 'three';

/** Repeatable noise, so the grain looks the same on every load. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pale grain lines on white; the material colour supplies the wood's tone. Grain runs along u. */
function grainTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  const r = rand(7);
  for (let i = 0; i < 90; i++) {
    const y0 = r() * c.height,
      amp = 2 + r() * 7,
      freq = 0.002 + r() * 0.006,
      phase = r() * Math.PI * 2;
    g.strokeStyle = `rgba(70, 40, 15, ${0.05 + r() * 0.13})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // a few knots
  for (let i = 0; i < 3; i++) {
    const x = r() * c.width,
      y = r() * c.height;
    for (let k = 6; k > 0; k--) {
      g.strokeStyle = `rgba(70, 40, 15, ${0.04 * k})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x, y, k * 5, k * 2, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export interface LoomFrame {
  group: Group;
  reed: Group;
  shuttle: Group;
  beam: Mesh;
  setWood(color: string): void;
  setYarn(color: string): void;
}

/** half = half the cloth's width in scene units. */
export function createLoomFrame(half: number): LoomFrame {
  const group = new Group();
  const grain = grainTexture();

  // Long rails: grain along their length (z), so the texture is turned a quarter.
  const railGrain = grain.clone();
  railGrain.rotation = Math.PI / 2;
  railGrain.center = new Vector2(0.5, 0.5);
  railGrain.repeat.set(1, 8);
  railGrain.needsUpdate = true;
  const railWood = new MeshStandardMaterial({ map: railGrain, roughness: 0.72, metalness: 0 });
  const beamWood = new MeshStandardMaterial({ map: grain, roughness: 0.68, metalness: 0 });

  const RAIL_X = half + 0.42,
    RAIL_LEN = 60;
  for (const side of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.36, 0.26, RAIL_LEN), railWood);
    rail.position.set(side * RAIL_X, 0.13, 1.5 - RAIL_LEN / 2);
    group.add(rail);
  }

  // The front (breast) beam the cloth runs over.
  const beam = new Mesh(new CylinderGeometry(0.32, 0.32, RAIL_X * 2 + 0.36, 40), beamWood);
  beam.rotation.z = Math.PI / 2;
  group.add(beam);

  // The reed: a wooden top and bottom bar with metal teeth (dents) the warp passes between.
  const reed = new Group();
  const reedWidth = half * 2 + 0.5;
  const top = new Mesh(new BoxGeometry(reedWidth, 0.1, 0.18), beamWood);
  top.position.y = 0.6;
  const bottom = new Mesh(new BoxGeometry(reedWidth, 0.08, 0.18), beamWood);
  bottom.position.y = 0.04;
  // Light steel. Kept mostly non-metallic: with no reflected surroundings in the scene, true metal renders black.
  const metal = new MeshStandardMaterial({ color: '#cfd5dc', roughness: 0.38, metalness: 0.15 });
  const DENTS = 96;
  const dents = new InstancedMesh(new BoxGeometry(0.02, 0.5, 0.07), metal, DENTS);
  const m = new Matrix4();
  for (let i = 0; i < DENTS; i++) {
    m.makeTranslation(-half + ((i + 0.5) / DENTS) * half * 2, 0.32, 0);
    dents.setMatrixAt(i, m);
  }
  reed.add(top, bottom, dents);
  group.add(reed);

  // The shuttle: a boat shape with pointed ends, carrying a bobbin of yarn.
  const shuttle = new Group();
  const profile = [
    [0, -1],
    [0.12, -0.92],
    [0.24, -0.7],
    [0.3, -0.35],
    [0.31, 0],
    [0.3, 0.35],
    [0.24, 0.7],
    [0.12, 0.92],
    [0, 1],
  ].map(([x, y]) => new Vector2(x, y));
  const body = new Mesh(new LatheGeometry(profile, 32), beamWood);
  body.rotation.z = Math.PI / 2; // lie along x
  body.scale.set(0.3, 0.62, 0.42); // before the turn: thickness, half-length, depth
  const yarnMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0 });
  const bobbin = new Mesh(new CylinderGeometry(0.075, 0.075, 0.5, 24), yarnMat);
  bobbin.rotation.z = Math.PI / 2;
  bobbin.position.y = 0.06;
  shuttle.add(body, bobbin);
  group.add(shuttle);

  return {
    group,
    reed,
    shuttle,
    beam,
    setWood(color: string) {
      railWood.color.set(color);
      beamWood.color.set(color);
    },
    setYarn(color: string) {
      yarnMat.color.set(color);
    },
  };
}
