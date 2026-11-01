// The four areas of the grounds and everything that lives in them:
//   Cornfield  — a corn maze; scarecrows wake when you pass; beat the altar
//                guardians for the first Moon Sigil.
//   Graveyard  — crawling skulls among the graves, cultists by the chapel,
//                and a climb up the ruined bell tower for the second sigil.
//   Witch Ring — the cat-witch duels you among the standing stones; reflect
//                her hexes to knock her off her broom. Third sigil.
//   Moon Seal  — three sockets at the chasm; fill them and the bridge rises.
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { Lights, retroMat } from '../core/retro.js';
import { Bake, rng, clean, smooth, lerp } from '../core/geo.js';
import { addBox, addTrimesh } from '../core/physics.js';
import { M, Batch, box, cyl, sphere, ribbon, mat4, wallSeg, lanternPost, tuft, rock } from './kit.js';
import { groundAt, CORN, GRAVE, WITCH, SEAL, ROADS } from './outside.js';
import { spawn } from '../actors/enemies.js';
import audio from '../sound.js';

const V = (x, y, z) => new THREE.Vector3(x, y ?? 0, z);
const G = (x, z, dy = 0) => V(x, groundAt(x, z) + dy, z);
const PI = Math.PI;

// ================================================================== cornfield
const CORN_HALF = 26, CLEAR_R = 9.5;
const CORN_PATHS = [
  [[-36, 2], [-46, 2], [-46, -14], [-56, -14], [-57, -6]],
  [[-46, 2], [-46, 14], [-67, 14], [-66, 6]],
  [[-67, 14], [-82, 14], [-82, -20], [-74, -20]],
  [[-56, -14], [-56, -22], [-82, -22]],
].map(p => p.map(([x, z]) => V(x, 0, z)));
function pathDist(x, z) {
  let best = 1e9;
  for (const pts of CORN_PATHS) for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}
const isCorn = (x, z) => Math.abs(x - CORN.x) < CORN_HALF && Math.abs(z - CORN.z) < CORN_HALF && Math.hypot(x - CORN.x, z - CORN.z) > CLEAR_R && pathDist(x, z) > 2.3;

const STALK = (() => {
  const a = new THREE.PlaneGeometry(1.2, 2.7); a.translate(0, 1.35, 0);
  const g = clean(new THREE.BufferGeometry().copy(a));
  const b = clean(a.clone().rotateY(PI / 2));
  const merged = clean(mergeTwo(g, b));
  const n = merged.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return merged;
})();
function mergeTwo(a, b) {
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const uv = [...a.attributes.uv.array, ...b.attributes.uv.array];
  const idx = [...a.index.array, ...b.index.array.map(i => i + a.attributes.position.count)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function buildCornfield(b, glows, L) {
  const R = rng(77);
  const cb = b;
  for (let x = CORN.x - CORN_HALF; x < CORN.x + CORN_HALF; x += 0.95) for (let z = CORN.z - CORN_HALF; z < CORN.z + CORN_HALF; z += 0.95) {
    const px = x + (R() - 0.5) * 0.5, pz = z + (R() - 0.5) * 0.5;
    if (!isCorn(px, pz)) continue;
    const s = 0.85 + R() * 0.35;
    cb.add(STALK, M.corn, mat4([px, groundAt(px, pz) - 0.05, pz], [0, R() * PI, 0], [s, s * (0.9 + R() * 0.25), s]));
  }
  // dirt paths through the corn
  for (const pts of CORN_PATHS) b.add(ribbon(pts, 3.8, { s: 0.3, heightFn: (x, z) => groundAt(x, z), lift: 0.04 }), M.cornField);
  // solid corn: merge runs of 2m cells into boxes
  const cell = 2;
  for (let z = CORN.z - CORN_HALF + 1; z < CORN.z + CORN_HALF; z += cell) {
    let run = null;
    for (let x = CORN.x - CORN_HALF + 1; x <= CORN.x + CORN_HALF; x += cell) {
      // a cell is solid only if it's corn all the way to its corners (never on a path)
      const solid = x < CORN.x + CORN_HALF && isCorn(x, z) && isCorn(x - 1, z - 1) && isCorn(x + 1, z + 1) && isCorn(x - 1, z + 1) && isCorn(x + 1, z - 1);
      if (solid && !run) run = x;
      if ((!solid || x >= CORN.x + CORN_HALF - 1) && run !== null) {
        const x1 = solid ? x : x - cell;
        addBox(V((run + x1) / 2, 1.3, z), V((x1 - run) / 2 + cell / 2 - 0.2, 1.3, cell / 2 - 0.2));
        run = null;
      }
    }
  }
  // the altar in the clearing
  const c = G(CORN.x, CORN.z);
  b.add(cyl(3.2, 3.6, 0.5, 10, { s: 0.5 }), M.cobble, mat4([c.x, c.y + 0.25, c.z]));
  b.add(cyl(2.0, 2.2, 0.4, 10, { s: 0.5 }), M.wall, mat4([c.x, c.y + 0.7, c.z]));
  addBox(V(c.x, c.y + 0.45, c.z), V(2.6, 0.45, 2.6));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2 + 0.3, p = G(c.x + Math.cos(a) * 7.2, c.z + Math.sin(a) * 7.2);
    const lp = lanternPost(b, glows, p, { height: 1.3, color: 0xff5a20, light: false });
    L(lp, 0xff6a30, 1.3, 8, { flicker: 0.3 });
  }
  // red eyes watching from the corn
  for (let i = 0; i < 26; i++) {
    let x, z, k = 0;
    do { x = CORN.x + (R() - 0.5) * 50; z = CORN.z + (R() - 0.5) * 50; k++; } while ((!isCorn(x, z) || pathDist(x, z) > 5) && k < 30);
    const y = groundAt(x, z) + 1.3 + R() * 0.6, a = R() * PI * 2;
    for (const s of [-1, 1]) glows.add(V(x + Math.cos(a) * 0.12 * s, y, z + Math.sin(a) * 0.12 * s), 0xff2a10, 0.45, true);
  }
  return { cornBatch: cb, altar: c };
}

// ================================================================== graveyard
const TOWER = V(73, 0, -15), TOWER_H = 15;
export function buildGraveyard(b, glows, L) {
  const R = rng(91);
  const H = 24, gx = GRAVE.x, gz = GRAVE.z;
  // iron fence with a gate on the west side
  const fenceSide = (a, c, gap) => {
    const len = a.distanceTo(c), n = Math.round(len / 1.6);
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(c, i / n);
      if (gap && Math.abs(p.z - gap) < 4) continue;
      p.y = groundAt(p.x, p.z);
      b.add(box(0.1, 2.0, 0.1, { s: 4 }), M.iron, mat4([p.x, p.y + 1.0, p.z]));
      b.add(cyl(0, 0.09, 0.3, 4, { flat: true }), M.iron, mat4([p.x, p.y + 2.15, p.z]));
      if (i < n && !(gap && Math.abs(p.z - gap) < 5.6)) {
        const q = a.clone().lerp(c, (i + 0.5) / n);
        for (const y of [0.5, 1.6]) b.add(box(0.06, 0.08, len / n, { s: 4 }), M.iron, mat4([q.x, groundAt(q.x, q.z) + y, q.z], [0, Math.atan2(c.x - a.x, c.z - a.z), 0]));
      }
    }
  };
  const c00 = V(gx - H, 0, gz - H), c10 = V(gx + H, 0, gz - H), c11 = V(gx + H, 0, gz + H), c01 = V(gx - H, 0, gz + H);
  fenceSide(c00, c10); fenceSide(c10, c11); fenceSide(c11, c01); fenceSide(c01, c00, gz + 1);
  addBox(V(gx, 1.2, gz - H), V(H, 1.2, 0.15)); addBox(V(gx, 1.2, gz + H), V(H, 1.2, 0.15)); addBox(V(gx + H, 1.2, gz), V(0.15, 1.2, H));
  addBox(V(gx - H, 1.2, (gz - H + gz - 3) / 2), V(0.15, 1.2, (H - 4) / 2 + 0.5)); addBox(V(gx - H, 1.2, (gz + H + gz + 5) / 2), V(0.15, 1.2, (H - 4) / 2 - 0.5));
  // gate pillars with green lanterns
  for (const s of [-1, 1]) {
    const p = G(gx - H, gz + 1 + s * 4);
    b.add(box(1.0, 2.8, 1.0, { s: 0.5 }), M.darkStone, mat4([p.x, p.y + 1.4, p.z]));
    const lp = lanternPost(b, glows, V(p.x, p.y + 2.8, p.z), { height: 0.1, color: 0x40ff80, light: false });
    L(lp, 0x30ff70, 1.4, 9);
    addBox(V(p.x, p.y + 1.4, p.z), V(0.5, 1.4, 0.5));
  }
  // graves
  const graves = [];
  for (let i = 0; i < 90 && graves.length < 54; i++) {
    const x = gx - H + 3 + R() * (2 * H - 6), z = gz - H + 3 + R() * (2 * H - 6);
    if (Math.abs(z - (gz + 1)) < 3.2 && x < gx + 6) continue;                    // central path
    if (Math.hypot(x - TOWER.x, z - TOWER.z) < 10) continue;                      // tower
    if (Math.abs(x - (TOWER.x - 14.5)) < 7 && Math.abs(z - (TOWER.z + 1)) < 6.5) continue; // chapel
    if (Math.hypot(x - gx, z - gz) < 6) continue;                                  // ritual circle
    if (graves.some(g => Math.hypot(g.x - x, g.z - z) < 2.6)) continue;
    graves.push(V(x, groundAt(x, z), z));
  }
  for (const p of graves) {
    const yaw = (R() - 0.5) * 0.4 + PI / 2, tilt = (R() - 0.5) * 0.25, k = R();
    if (k < 0.55) {
      b.add(box(0.9, 1.1, 0.25, { s: 1 }), M.darkStone, mat4([p.x, p.y + 0.5, p.z], [0, yaw, tilt]));
      b.add(cyl(0.45, 0.45, 0.25, 8, { s: 1 }), M.darkStone, mat4([p.x, p.y + 1.05, p.z], [PI / 2, yaw, tilt]));
    } else if (k < 0.8) {
      b.add(box(0.22, 1.6, 0.22, { s: 2 }), M.darkStone, mat4([p.x, p.y + 0.75, p.z], [0, yaw, tilt]));
      b.add(box(0.9, 0.22, 0.22, { s: 2 }), M.darkStone, mat4([p.x, p.y + 1.1, p.z], [0, yaw, tilt]));
    } else {
      b.add(box(0.7, 1.8, 0.7, { s: 1 }), M.wall, mat4([p.x, p.y + 0.9, p.z], [0, yaw, 0]));
      b.add(cyl(0, 0.62, 0.7, 4, { flat: true }), M.wall, mat4([p.x, p.y + 2.15, p.z], [0, yaw + PI / 4, 0]));
    }
    b.add(box(1.0, 0.12, 1.9, { s: 1 }), M.dirt, mat4([p.x + 0.9, p.y + 0.02, p.z], [0, yaw - PI / 2, 0]));
    addBox(V(p.x, p.y + 0.7, p.z), V(0.45, 0.7, 0.45), yaw);
  }
  // ritual circle with green fire braziers
  const rc = G(gx, gz);
  b.add(clean(new THREE.RingGeometry(4.6, 5.2, 24).rotateX(-PI / 2)), M.bone, mat4([rc.x, rc.y + 0.06, rc.z]));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * PI * 2, p = G(gx + Math.cos(a) * 5, gz + Math.sin(a) * 5);
    b.add(cyl(0.3, 0.2, 0.9, 6, { s: 2 }), M.iron, mat4([p.x, p.y + 0.45, p.z]));
    b.add(cyl(0.45, 0.25, 0.3, 8, { s: 2 }), M.iron, mat4([p.x, p.y + 1.0, p.z]));
    const fp = V(p.x, p.y + 1.25, p.z);
    glows.add(fp, 0x30ff60, 1.6, true);
    L(fp, 0x30ff60, 1.3, 7, { flicker: 0.3 });
    addBox(V(p.x, p.y + 0.6, p.z), V(0.35, 0.6, 0.35));
  }
  // dead trees
  for (const [x, z] of [[46, -20], [80, 12], [52, 16], [84, -24]]) deadTree(b, G(x, z), R);
  // lanterns among the graves
  for (const [x, z, c] of [[48, -8, 0x40ff80], [56, 12, 0x5a8aff], [70, 0, 0x40ff80], [80, -16, 0x5a8aff], [64, 20, 0x40ff80], [50, -22, 0x5a8aff]]) {
    const lp = lanternPost(b, glows, G(x, z), { height: 1.6, color: c, light: false, mat: M.darkStone });
    L(lp, c, 1.5, 11);
    addBox(V(x, groundAt(x, z) + 1, z), V(0.3, 1, 0.3));
  }
  L(V(TOWER.x - 3, TOWER_H * 0.5, TOWER.z + 3), 0x6a7aff, 1.4, 16);
  L(V(TOWER.x + 3, TOWER_H * 0.7, TOWER.z - 3), 0x6a7aff, 1.2, 14);
  // chapel ruin + bell tower
  const ch = G(TOWER.x - 14.5, TOWER.z + 1);
  for (const [w, h, d, ox, oz] of [[10, 4.2, 0.8, 0, -4], [10, 3.0, 0.8, 0, 4], [0.8, 5.2, 8.8, -5, 0]]) {
    b.add(box(w, h, d, { s: 0.5 }), M.wall, mat4([ch.x + ox, ch.y + h / 2, ch.z + oz]));
    addBox(V(ch.x + ox, ch.y + h / 2, ch.z + oz), V(w / 2, h / 2, d / 2));
  }
  const tw = G(TOWER.x, TOWER.z);
  b.add(box(5, TOWER_H, 5, { s: 0.5 }), M.wall, mat4([tw.x, tw.y + TOWER_H / 2, tw.z]));
  addBox(V(tw.x, tw.y + TOWER_H / 2, tw.z), V(2.5, TOWER_H / 2, 2.5));
  // belfry on top: floor, four pillars, roof, bell
  const top = tw.y + TOWER_H;
  b.add(box(6, 0.5, 6, { s: 0.5 }), M.wall, mat4([tw.x, top + 0.25, tw.z]));
  addBox(V(tw.x, top + 0.25, tw.z), V(3, 0.25, 3));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.add(box(0.6, 3.4, 0.6, { s: 0.5 }), M.wall, mat4([tw.x + sx * 2.6, top + 2.2, tw.z + sz * 2.6]));
    addBox(V(tw.x + sx * 2.6, top + 2.2, tw.z + sz * 2.6), V(0.3, 1.7, 0.3));
  }
  b.add(cyl(0, 4.6, 3.2, 4, { s: 0.6, flat: true }), M.slate, mat4([tw.x, top + 5.5, tw.z], [0, PI / 4, 0]));
  b.add(box(6.2, 0.4, 6.2, { s: 0.5 }), M.wall, mat4([tw.x, top + 3.9, tw.z]));
  const bell = new THREE.LatheGeometry([[0.01, 0], [0.9, 0], [0.8, 0.2], [0.55, 0.8], [0.5, 1.2], [0.2, 1.35], [0.01, 1.36]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
  b.add(clean(bell), M.gold, mat4([tw.x, top + 2.3, tw.z]));
  const lp = V(tw.x, top + 1.6, tw.z);
  glows.add(lp, 0x6a8aff, 3, true); L(lp, 0x5a7aff, 1.5, 10);
  // climbing route: stone blocks spiralling around the outside of the tower
  const steps = [];
  const pts = [];
  for (let i = 0; i < 11; i++) {
    const a = PI * 0.75 + i * 0.62;
    const r = 3.9, y = tw.y + 1.6 + i * 1.32;
    pts.push({ p: V(tw.x + Math.cos(a) * r, y, tw.z + Math.sin(a) * r), a });
  }
  for (const [i, s] of pts.entries()) {
    if (i === 4 || i === 8) { steps.push({ crumble: s.p }); continue; }      // crumbling blocks
    if (i === 6) { steps.push({ gap: s.p }); continue; }                      // a double-jump gap
    b.add(box(1.8, 0.5, 1.8, { s: 0.5 }), M.wall, mat4([s.p.x, s.p.y - 0.25, s.p.z], [0, -s.a, 0]));
    addBox(V(s.p.x, s.p.y - 0.25, s.p.z), V(0.9, 0.25, 0.9), -s.a);
    steps.push({ block: s.p });
  }
  return { tower: tw, top, steps, ritual: rc, graves, chapel: ch };
}

function deadTree(b, p, R) {
  b.add(cyl(0.25, 0.45, 4.5, 6, { s: 1 }), M.bark, mat4([p.x, p.y + 2.2, p.z], [0.08, R() * 6, 0.05]));
  for (let i = 0; i < 4; i++) {
    const a = R() * PI * 2, y = 2.4 + i * 0.6;
    b.add(cyl(0.05, 0.14, 2.2, 5, { s: 1 }), M.bark, mat4([p.x + Math.cos(a) * 0.6, p.y + y + 0.5, p.z + Math.sin(a) * 0.6], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]));
  }
  addBox(V(p.x, p.y + 2, p.z), V(0.35, 2, 0.35));
}

// ================================================================== witch ring
export function buildWitchRing(b, glows, L) {
  const R = rng(55);
  const c = G(WITCH.x, WITCH.z);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * PI * 2, p = G(c.x + Math.cos(a) * 13.5, c.z + Math.sin(a) * 13.5);
    const h = 3.4 + R() * 1.4;
    if (i === 5) continue; // entrance gap facing the road
    b.add(box(1.3, h, 0.9, { s: 0.5 }), M.darkStone, mat4([p.x, p.y + h / 2 - 0.3, p.z], [0, -a + PI / 2, (R() - 0.5) * 0.15]));
    addBox(V(p.x, p.y + h / 2, p.z), V(0.65, h / 2, 0.45), -a + PI / 2);
    if (i % 3 === 0) b.add(box(1.3, 0.7, 4.2, { s: 0.5 }), M.darkStone, mat4([p.x, p.y + h + 0.05, p.z], [0, -a, 0]));
  }
  // cauldron
  const pts = [[0.01, 0.05], [0.7, 0.1], [1.05, 0.5], [1.1, 0.95], [0.95, 1.25], [1.05, 1.32]].map(([x, y]) => new THREE.Vector2(x, y));
  b.add(clean(new THREE.LatheGeometry(pts, 10)), M.iron, mat4([c.x, c.y, c.z]));
  b.add(clean(new THREE.CircleGeometry(0.95, 10).rotateX(-PI / 2)), retroMat({ color: 0x40ff60, emit: 1, scroll: [0.1, 0.05], map: T.cosmic }), mat4([c.x, c.y + 1.15, c.z]));
  addBox(V(c.x, c.y + 0.6, c.z), V(1, 0.6, 1));
  const cp = V(c.x, c.y + 1.5, c.z);
  glows.add(cp, 0x40ff60, 3.2, true); L(cp, 0x40ff60, 1.8, 11, { flicker: 0.25 });
  // jack-o'-lanterns
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * PI * 2 + 0.4, r = 9 + R() * 2.5, p = G(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
    pumpkin(b, glows, L, p, R, i < 3);
  }
  deadTree(b, G(c.x + 4, c.z - 6), R);
  return { center: c };
}

function pumpkin(b, glows, L, p, R, light) {
  const s = 0.45 + R() * 0.25;
  const m = retroMat({ color: 0xff7a14, chrome: 0.35, env: T.goldEnv, spec: 0.5, baked: true });
  if (!pumpkin.mat) pumpkin.mat = m;
  const g = sphere(1, 10, 7);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); const k = 1 - 0.08 * Math.pow(Math.abs(Math.cos(a * 5)), 0.5); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * 0.75, pos.getZ(i) * k); }
  g.computeVertexNormals();
  b.add(g, pumpkin.mat, mat4([p.x, p.y + s * 0.7, p.z], [0, R() * 6, 0], s));
  b.add(cyl(0.05, 0.08, 0.3, 5), M.bark, mat4([p.x, p.y + s * 1.45, p.z], [0.3, 0, 0.2], s * 1.5));
  const fp = V(p.x, p.y + s * 0.7, p.z);
  glows.add(fp, 0xff8a20, s * 2.2, true);
  if (light) L(fp, 0xff8a30, 0.9, 5, { flicker: 0.4 });
}

// ================================================================== moon seal
export function buildSeal(b, glows, L) {
  const c = V(SEAL.x, 0, SEAL.z);
  for (const s of [-1, 1]) {
    b.add(box(2.6, 10, 2.6, { s: 0.5 }), M.castle, mat4([s * 5.6, 5, c.z]));
    b.add(cyl(0, 2.2, 3, 4, { s: 0.5, flat: true }), M.slate, mat4([s * 5.6, 11.5, c.z], [0, PI / 4, 0]));
    addBox(V(s * 5.6, 5, c.z), V(1.3, 5, 1.3));
    const lp = V(s * 5.6, 7.5, c.z + 1.4);
    b.add(box(0.5, 0.7, 0.5, { s: 2 }), M.lantern, mat4([lp.x, lp.y, lp.z]));
    glows.add(lp, 0x5a8aff, 2.6, true); L(lp, 0x5a8aff, 1.4, 10);
  }
  b.add(box(13.8, 1.6, 2.4, { s: 0.5 }), M.castle, mat4([0, 10.2, c.z]));
  return { center: c };
}

// ================================================================== populate
export function populateOutside(game) {
  const O = game.outside, P = game.props, root = O.group;
  const A = O.areas;
  const st = { sigils: { corn: false, grave: false, witch: false }, hints: new Set(), bridge: 0, sealOpen: false };
  game.outsideState = st;
  O.music = () => 'outside';

  const hint = (key, text, secs = 5) => { if (st.hints.has(key)) return; st.hints.add(key); game.hud.hint(text, secs); };
  const gotSigil = (key) => {
    st.sigils[key] = true; game.sigils++;
    audio.play('sigil'); audio.duck(0.3, 3);
    game.hud.callout('Moon Sigil!');
    game.flash(0.5, 0xa0c0ff);
    setTimeout(() => game.hud.hint(game.sigils < 3 ? `Moon Sigil ${game.sigils} of 3. The seal at the chasm stirs…` : 'All three Moon Sigils! Return to the Moon Seal at the chasm.', 5), 1600);
    sockets[game.sigils - 1]?.light();
    game.player.heal(99);
  };

  // ---------------- checkpoints
  P.checkpoint(V(7.5, 0, -7.5), PI, 'Crossroads', root);
  P.checkpoint(G(-39, 9), -PI / 2, 'Cornfield', root);
  P.checkpoint(G(40, 8), PI / 2, 'Graveyard', root);
  P.checkpoint(G(31, 30), 1.0, 'Witch Ring', root);
  P.checkpoint(V(-6, 0, -42), PI, 'Moon Seal', root);

  // ---------------- motes and pots along the roads
  for (const x of [-2, 2]) P.motesLine(V(x, 0.7, 50), V(x, 0.7, 16), 13);
  P.motesRing(V(0, 0, 0), 8.5, 16, 0.7);
  P.motesLine(V(-14, 0.7, 0), V(-33, 0.7, 1.5), 7);
  P.motesLine(V(14, 0.7, 0), V(33, 0.7, -0.5), 7);
  P.motesLine(V(0, 0.7, -14), V(0, 0.7, -38), 8);
  P.motesLine(V(9, 0.7, 33.5), V(27, 0.7, 35.5), 6);
  for (const p of [V(9, 0, 9), V(-9.5, 0, 8), V(10, 0, -9.5), V(-10, 0, -9)]) P.pot(p, root);
  P.pot(V(-2.6, 0, 58)); P.pot(V(2.6, 0, 58), root, { heart: 0 });

  // ---------------- first foes on the road & plaza
  spawn(game, 'skull', V(-4, 0.5, -4), { aggro: 9, parent: root });
  spawn(game, 'skull', V(4, 0.5, -3), { aggro: 9, parent: root });
  spawn(game, 'cultist', V(0, 0.2, -32), { aggro: 13, parent: root });

  // ---------------- cornfield: scarecrows on poles along the paths, altar guardians
  const pole = (p) => {
    const bb = new Batch();
    bb.add(cyl(0.08, 0.1, 2.6, 5, { s: 1 }), M.bark, mat4([p.x, p.y + 1.3, p.z]));
    bb.add(box(1.8, 0.12, 0.12, { s: 1 }), M.bark, mat4([p.x, p.y + 2.0, p.z]));
    bb.build(root);
  };
  for (const [x, z, yaw] of [[-46, -6, PI], [-52, -14, PI / 2], [-58, 14, PI / 2], [-82, -6, 0], [-66, -22, -PI / 2]]) {
    const p = G(x, z); pole(p);
    spawn(game, 'scarecrow', p, { yaw, parent: root });
  }
  const altar = A.corn.altar;
  const guards = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * PI * 2 + 0.5, p = G(altar.x + Math.cos(a) * 5.2, altar.z + Math.sin(a) * 5.2);
    pole(p);
    guards.push(spawn(game, 'scarecrow', p, { yaw: Math.atan2(altar.x - p.x, altar.z - p.z) + PI, parent: root }));
  }
  for (const pts of CORN_PATHS) for (let i = 0; i < pts.length - 1; i++) P.motesLine(V(pts[i].x, 0.7 + groundAt(pts[i].x, pts[i].z), pts[i].z), V(pts[i + 1].x, 0.7 + groundAt(pts[i + 1].x, pts[i + 1].z), pts[i + 1].z), Math.max(2, Math.round(pts[i].distanceTo(pts[i + 1]) / 3)));
  for (const [x, z] of [[-82, -20], [-74, -20], [-82, -22], [-66, 6]]) P.pot(G(x, z), root, { drops: 5, heart: 0.5 });
  P.heart(G(-82, 14));

  // ---------------- graveyard
  for (const [x, z] of [[48, 8], [56, -12], [66, 10], [78, 4], [52, -20], [60, 18], [80, -6]]) spawn(game, 'skull', G(x, z, 0.5), { parent: root });
  spawn(game, 'cultist', G(62, -12, 0.2), { parent: root });
  spawn(game, 'cultist', G(76, 14, 0.2), { parent: root });
  for (let i = 0; i < 3; i++) spawn(game, 'bat', V(73 + Math.cos(i * 2) * 5, 9 + i * 3, -15 + Math.sin(i * 2) * 5), { parent: root, aggro: 11 });
  const tw = A.grave.tower;
  P.bouncer(G(tw.x - 3.6, tw.z + 3.2), 15, root);
  for (const s of A.grave.steps) {
    if (s.block) P.motesLine(s.block.clone().setY(s.block.y + 0.8), s.block.clone().setY(s.block.y + 1.4), 2);
    if (s.crumble) P.crumble(s.crumble.clone().setY(s.crumble.y - 0.25), V(1.8, 0.5, 1.8), root);
  }
  for (let i = 0; i < 6; i++) P.pot(G(52 + i * 4, 21), root);
  P.pot(G(66, -18), root); P.pot(G(64, -20), root, { heart: 1 });
  P.motesRing(A.grave.ritual, 3.2, 10, 0.8);

  // ---------------- sigils
  const sigilAt = (key, pos) => P.sigil(pos, root, () => gotSigil(key));
  sigilAt('grave', V(tw.x, A.grave.top + 0.5, tw.z));
  st.cornGuards = guards;

  // ---------------- moon seal sockets + the seal disc (a door that sinks)
  const sc = A.seal.center;
  const discMesh = new THREE.Mesh(cyl(4.4, 4.4, 1.0, 20, { s: 0.4 }), retroMat({ map: T.castle }));
  discMesh.rotation.x = PI / 2; discMesh.position.set(0, 4.6, sc.z);
  const seal = P.door(discMesh, V(4.4, 4.4, 0.5), root, { lift: -9.6, speed: 3 });
  const sockets = [];
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + i * PI * 2 / 3, p = V(Math.cos(a) * 2.5, 4.6 + Math.sin(a) * 2.5, sc.z + 0.55);
    const m = new THREE.Mesh(cyl(0.7, 0.7, 0.2, 10), retroMat({ color: 0x0a0a20 }));
    m.rotation.x = PI / 2; m.position.copy(p); root.add(m);
    const gi = game.glows.add(p.clone().setZ(p.z + 0.3), 0x000000, 0);
    sockets.push({ light() { m.material = retroMat({ color: 0xb0d0ff, emit: 1 }); game.glows.set(gi, p.clone().setZ(p.z + 0.3), 0x6a9aff, 3.4); game.glows.dirty(); } });
  }
  const sealLight = Lights.add(V(0, 4.6, sc.z + 2), 0x8ab0ff, 0, 12, { dynamic: true });

  // ---------------- per-frame triggers
  const p0 = V(0, 0, 0);
  O.tick = (dt, g) => {
    const p = g.player.pos;
    const near = (q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
    if (near(V(-4, 0, -4), 10)) hint('sword', 'CLICK to swing your sword — click three times for a combo. Jump on small foes to stomp them!');
    if (near(V(0, 0, -30), 14)) hint('parry', 'Hold RIGHT CLICK (or SHIFT) to raise your shield. Raise it right as an orb arrives to PARRY it back!', 7);
    if (near(V(-38, 0, 2), 6)) hint('corn', 'The scarecrows guard a sigil in the heart of the corn.');
    if (near(V(39, 0, 1), 6)) hint('grave', 'A Moon Sigil glimmers atop the bell tower. Use the rune pad to begin the climb.');
    if (near(V(29, 0, 35), 6)) hint('witch', 'Something cackles inside the stone ring…');
    if (near(tw, 9)) hint('plunge', 'Tip: in mid-air, CLICK to plunge your sword down.');
    // corn guardians wake when you enter the clearing; beat all three for the sigil
    if (!st.cornAwake && near(altar, CLEAR_R + 1)) { st.cornAwake = true; for (const e of guards) if (e.state === 'perched') { e.setState('wake'); e.vel.y = 6; e.gravity = 30; } game.hud.area('The Scarecrow Court'); }
    if (st.cornAwake && !st.cornSigil && guards.every(e => !e.alive)) { st.cornSigil = true; setTimeout(() => sigilAt('corn', altar.clone().setY(altar.y + 0.9)), 700); audio.play('secret'); }
    // area banners
    for (const [k, q, r, name, sub] of [['a_corn', V(-44, 0, 2), 6, 'The Cornfield', 'where the crows dare not land'], ['a_grave', V(42, 0, 1), 6, 'Hollowmere Graves', ''], ['a_seal', V(0, 0, -40), 6, 'The Moon Seal', ''], ['a_witch', V(36, 0, 37), 5, "The Witch's Ring", '']]) {
      if (!st.hints.has(k) && near(q, r)) { st.hints.add(k); game.hud.area(name, sub); }
    }
    // the seal opens with three sigils
    if (!st.sealOpen && game.sigils >= 3 && near(V(0, 0, sc.z), 9)) openSeal(g);
    if (st.bridge > 0 && st.bridge < 1) raiseBridge(dt, g);
    // into the castle
    if (st.bridge >= 1 && near(V(0, 0, -89), 2.6) && !st.entering) enterCastle(g);
    sealLight.intensity = Math.max(0, sealLight.intensity - dt * 0.5);
    game.witchFight?.update(dt);
  };

  function openSeal(g) {
    st.sealOpen = true;
    g.cutscene = true;
    audio.play('gateOpen'); audio.duck(0.2, 5);
    sealLight.intensity = 3;
    g.flash(0.6, 0x8ab0ff);
    g.shake(0.6);
    seal.openUp();
    g.hud.callout('The Seal Opens');
    O.bridgeGroup.visible = true;
    O.bridgeGroup.position.y = -40;
    st.bridge = 0.001;
    setTimeout(() => { g.cutscene = false; }, 2500);
  }
  function raiseBridge(dt, g) {
    st.bridge = Math.min(1, st.bridge + dt / 3.5);
    const k = 1 - Math.pow(1 - st.bridge, 3);
    O.bridgeGroup.position.y = -40 * (1 - k);
    if (Math.random() < 0.5) g.fx.spark.emit({ pos: V((Math.random() - 0.5) * 8, O.bridgeGroup.position.y, -50 - Math.random() * 30), vel: V(0, 4, 0), life: 0.8, size: 0.6, size1: 0, color: 0x8ab0ff });
    g.shake(0.15);
    if (st.bridge >= 1) {
      for (const m of O.bridgeGroup.children) { m.updateMatrixWorld(); addTrimesh(m.geometry, m.matrixWorld); }
      for (const lp of O.bridgeLanterns) { lanternLight(g, lp); }
      g.hud.hint('The bridge to Grimhold is open!', 4);
      audio.play('secret');
    }
  }
  function lanternLight(g, lp) {
    const p = V(lp.x, lp.y + 0.5, lp.z);
    g.glows.add(p, 0x5a8aff, 2.4, true);
    Lights.add(p, 0x4a7aff, 1.2, 8);
  }
  function enterCastle(g) {
    st.entering = true;
    g.fadeFlash();
    audio.play('doorOpen');
    setTimeout(() => g.enterCastle?.(), 50);
  }
  O.bridgeGroup.visible = false;
  O.onRespawn = () => {};
  game.spawnWitch = () => import('../actors/witch.js').then(m => m.startWitch(game, A.witch.center, () => sigilAt('witch', A.witch.center.clone().setY(A.witch.center.y + 1.6))));
  import('../actors/witch.js').then(m => m.setupWitch(game, A.witch.center, () => sigilAt('witch', A.witch.center.clone().setY(A.witch.center.y + 1.6)))).catch(e => console.warn('witch', e));
}
