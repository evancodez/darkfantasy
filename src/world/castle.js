// Inside Grimhold (its own zone, far from the grounds):
//   The Hall of Procession — a curving checkerboard hall under pointed
//     arches and stained glass; three ambushes behind barriers of light.
//   The Spiral Spire — the big climb: ledges, moving & spinning platforms,
//     pendulum blades, crumbling blocks, elevators and a rune pad.
//   The Demon Gate — a giant demon face; strike both levers to open its jaw.
//   The Hoard — the dragon's arena (see actors/dragon.js).
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { G as GU, Lights, retroMat } from '../core/retro.js';
import { Bake, rng, clean, lerp } from '../core/geo.js';
import { addBox, addTrimesh, addCylinder } from '../core/physics.js';
import { M, Batch, box, cyl, sphere, ribbon, mat4, lanternPost } from './kit.js';
import { spawn } from '../actors/enemies.js';
import audio from '../sound.js';

const PI = Math.PI, D2R = PI / 180;
export const CO = new THREE.Vector3(0, 0, -700);           // zone origin
const V = (x, y, z) => new THREE.Vector3(CO.x + x, CO.y + y, CO.z + z);
const SC = new THREE.Vector3(40, 0, -82);                  // spire centre (local)
const RW = 16, RL = 13.2;                                    // wall radius, ledge radius
const along = (aDeg) => Math.atan2(Math.sin(aDeg * D2R), -Math.cos(aDeg * D2R));
const polar = (aDeg, r, y) => V(SC.x + Math.cos(aDeg * D2R) * r, y, SC.z + Math.sin(aDeg * D2R) * r);
export const HALL_START = V(0, 0, 3);
// back-and-forth travel at a steady speed with short eased turnarounds, so a
// hop while riding lands where you expect (0..1 position over `period` s)
const pingpong = (t, period, e = 0.18) => {
  const u = ((t / period) % 1 + 1) % 1, f = u < 0.5 ? u * 2 : 2 - u * 2, vmax = 1 / (1 - e);
  if (f < e) return 0.5 * vmax / e * f * f;
  if (f > 1 - e) { const g = 1 - f; return 1 - 0.5 * vmax / e * g * g; }
  return 0.5 * vmax * e + vmax * (f - e);
};

function flip(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

// a surface swept along a curve: profile = [[offset, height], ...] on one side
function sweep(curve, len, profile, side, s = 0.25, step = 1.5) {
  const N = Math.ceil(len / step), P = profile.length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const sd = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(side);
    let arc = 0;
    for (let j = 0; j < P; j++) {
      const [o, h] = profile[j];
      if (j > 0) arc += Math.hypot(o - profile[j - 1][0], h - profile[j - 1][1]);
      pos.push(p.x + sd.x * o, p.y + h, p.z + sd.z * o); uv.push(arc * s, t * len * s);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < P - 1; j++) {
    const a = i * P + j, b = a + P;
    if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return clean(g);
}

export function buildCastle(game) {
  const scene = game.scene, glows = game.glows, P = game.props;
  const group = new THREE.Group(); scene.add(group); group.visible = false;
  const b = new Batch();
  const R = rng(123);
  Bake.lights = []; Bake.ao = null; Bake.macro = null;
  const L = (p, c, i, r, o) => { const l = Lights.add(p, c, i, r, o); Bake.lights.push(l); return l; };
  const solid = (geo, mat, m) => { const g = b.add(geo, mat, m); addTrimesh(g); return g; };
  const block = (p, w, h, d, mat = M.wall, yaw = 0) => { b.add(box(w, h, d, { s: 0.5 }), mat, mat4([p.x, p.y - h / 2, p.z], [0, yaw, 0])); addBox(new THREE.Vector3(p.x, p.y - h / 2, p.z), new THREE.Vector3(w / 2, h / 2, d / 2), yaw); };
  const brazier = (p, color = 0x5a8aff, big = false) => {
    b.add(cyl(0.18, 0.3, 1.2, 6, { s: 2 }), M.iron, mat4([p.x, p.y + 0.6, p.z]));
    b.add(cyl(0.55, 0.3, 0.35, 8, { s: 2 }), M.iron, mat4([p.x, p.y + 1.3, p.z]));
    const fp = new THREE.Vector3(p.x, p.y + 1.7, p.z);
    glows.add(fp, color, big ? 3.4 : 2.4, true);
    L(fp, color, big ? 1.8 : 1.3, big ? 12 : 9, { flicker: 0.3 });
    fires.push({ p: fp, color });
    addBox(new THREE.Vector3(p.x, p.y + 0.75, p.z), new THREE.Vector3(0.35, 0.75, 0.35));
  };
  const fires = [];
  const blueWall = retroMat({ map: T.checkerBlue, baked: true, emit: 0.4 });

  // ============================================================ Hall of Procession
  // A long curving hall: checkerboard floor and wainscot, stone walls with
  // stained glass, pillars and pointed arches overhead (the galaxy shows
  // between them). Three ambushes; a barrier of light holds you in each.
  const hallPts = [V(0, 0, 8), V(0, 0, -14), V(5, 0, -32), V(16, 0, -47), V(31, 0, -56), V(40, 0, -60), V(40, 0, -66.9)];
  const hall = new THREE.CatmullRomCurve3(hallPts, false, 'centripetal');
  const hallLen = hall.getLength();
  const HWID = 4.6;
  const atS = (s, off = 0, y = 0) => { const t = THREE.MathUtils.clamp(s / hallLen, 0, 1), p = hall.getPointAt(t), tan = hall.getTangentAt(t); return p.add(new THREE.Vector3(-tan.z * off, y, tan.x * off)); };
  const tanAt = (s) => hall.getTangentAt(THREE.MathUtils.clamp(s / hallLen, 0, 1));
  solid(ribbon(hallPts, HWID * 2, { s: 0.25, lift: 0, segLen: 1.2 }), M.checker);
  b.add(ribbon(hallPts, 2.4, { s: 0.4, lift: 0.03, segLen: 1.2 }), retroMat({ map: T.robe, baked: true, emit: 0.1 }));
  for (const side of [-1, 1]) {
    solid(sweep(hall, hallLen, [[HWID, -8], [HWID, 0]], side, 0.25), M.castle);
    solid(sweep(hall, hallLen, [[HWID, 0], [HWID, 2.4]], side, 0.25), blueWall);
    b.add(sweep(hall, hallLen, [[HWID, 2.4], [HWID - 0.25, 2.55], [HWID - 0.25, 2.8], [HWID, 2.9]], side, 0.5), M.gold);
    solid(sweep(hall, hallLen, [[HWID, 2.9], [HWID, 10.5]], side, 0.25), M.castle);
    b.add(sweep(hall, hallLen, [[HWID, 10.5], [HWID - 0.6, 10.7], [HWID - 0.6, 11.4], [HWID + 0.4, 11.4]], side, 0.4), M.castle);
  }
  // entrance wall behind you
  block(V(0, 9, 8.6), 14, 18, 1.2, M.castle);
  b.add(box(5, 6, 0.4, { s: 0.5 }), M.wood, mat4([CO.x, CO.y + 3, CO.z + 7.9]));
  // pillars, arches overhead, stained glass and braziers
  const stained = retroMat({ map: T.stained, emit: 1, fog: 0.4 });
  const glassCols = [0x5a7aff, 0xff5a50, 0xb070ff, 0xffc040];
  for (let s = 5, k = 0; s < hallLen - 3; s += 8, k++) {
    const p = atS(s), tan = tanAt(s), yaw = Math.atan2(tan.x, tan.z);
    const side = new THREE.Vector3(-tan.z, 0, tan.x), up = new THREE.Vector3(0, 1, 0);
    for (const sd of [-1, 1]) {
      const q = atS(s, sd * (HWID - 0.45));
      block(q.clone().setY(q.y + 10.5), 0.9, 10.5, 0.9, M.castle, yaw);
      b.add(box(1.2, 0.5, 1.2, { s: 1 }), M.gold, mat4([q.x, q.y + 0.25, q.z], [0, yaw, 0]));
      b.add(box(1.2, 0.4, 1.2, { s: 1 }), M.castle, mat4([q.x, q.y + 10.3, q.z], [0, yaw, 0]));
      // stained glass between this pillar and the next
      const w = atS(s + 4, sd * (HWID - 0.03), 6.2), wt = tanAt(s + 4);
      b.add(clean(new THREE.PlaneGeometry(2.4, 4.8)), stained, mat4([w.x, w.y, w.z], [0, Math.atan2(wt.z * sd, -wt.x * sd), 0]));
      glows.add(w.clone().add(new THREE.Vector3(wt.z * sd, 0, -wt.x * sd).multiplyScalar(0.6)), new THREE.Color(glassCols[(k * 2 + (sd > 0 ? 1 : 0)) % 4]).multiplyScalar(0.45), 4.5);
      // a blue brazier at the foot of every other pillar
      if (k % 2 === 0) {
        const f = atS(s + 1.4, sd * (HWID - 0.7), 0);
        b.add(cyl(0.2, 0.3, 1.1, 6, { s: 2 }), M.iron, mat4([f.x, f.y + 0.55, f.z]));
        b.add(cyl(0.45, 0.25, 0.3, 8, { s: 2 }), M.iron, mat4([f.x, f.y + 1.2, f.z]));
        const fp = f.clone().setY(f.y + 1.5);
        glows.add(fp, 0x5a8aff, 2.2, true); L(fp, 0x4a7aff, 1.4, 10, { flicker: 0.25 }); fires.push({ p: fp, color: 0x5a8aff });
        addBox(f.clone().setY(f.y + 0.7), new THREE.Vector3(0.35, 0.7, 0.35));
      }
    }
    // a pointed arch springing from the pillar tops
    const segs = 9, R0 = HWID - 0.45;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI * i / segs, a1 = Math.PI * (i + 1) / segs, am = (a0 + a1) / 2;
      const ptA = (a) => new THREE.Vector3().addScaledVector(side, Math.cos(a) * R0).addScaledVector(up, 10.7 + Math.sin(a) * R0 * 0.9);
      const A = ptA(a0), Bp = ptA(a1), mid = A.clone().add(Bp).multiplyScalar(0.5);
      const xAxis = Bp.clone().sub(A).normalize(), zAxis = tan.clone(), yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(mid.add(p));
      b.add(box(A.distanceTo(Bp) + 0.1, 0.7, 0.7, { s: 1 }), M.castle, m);
    }
  }
  for (let s = 4; s < hallLen - 3; s += 2.4) P.mote(atS(s, 0, 0.8));
  // ambushes: enemies step out of thin air; a barrier of light blocks the way on
  const barrierMat = retroMat({ map: T.rune, color: 0xb070ff, emit: 1, additive: true, opacity: 0.55, side: THREE.DoubleSide, scroll: [0.2, 0.4] });
  const barrier = (s) => {
    const p = atS(s), tan = tanAt(s), yaw = Math.atan2(tan.x, tan.z);
    const mesh = new THREE.Mesh(box(HWID * 2, 8, 0.3, { s: 0.25 }), barrierMat);
    mesh.position.copy(p).setY(p.y + 4);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    mesh.quaternion.copy(q);
    return P.door(mesh, new THREE.Vector3(HWID, 4, 0.3), group, { lift: -8.5, speed: 7, quat: q, sound: 'gateOpen' });
  };
  const encounters = [
    { at: 12, gate: barrier(31), spawn: [['skull', 20, -2], ['skull', 21, 0.5], ['skull', 20, 2.5], ['cultist', 27, 0]] },
    { at: 36, gate: barrier(57), spawn: [['cultist', 46, -2.5], ['cultist', 47, 2.5], ['bat', 43, -1, 3], ['bat', 44, 1, 3.2]] },
    { at: 61, gate: null, spawn: [['knight', 72, 0], ['cultist', 78, -2.5], ['cultist', 79, 2.5], ['skull', 70, -2.8], ['skull', 70, 2.8]] },
  ];
  const hallProgress = (q) => { let best = 0, bd = 1e9; for (let s = 0; s <= hallLen; s += 1) { const d = atS(s).distanceToSquared(q); if (d < bd) { bd = d; best = s; } } return best; };
  // end door into the spire
  const hallDoorMesh = new THREE.Mesh(box(7.4, 7, 0.8, { s: 0.5 }), retroMat({ map: T.wood }));
  hallDoorMesh.position.copy(V(40, 3.5, -64.6));
  const hallDoor = P.door(hallDoorMesh, new THREE.Vector3(3.7, 3.5, 0.4), group, { lift: 7.5, speed: 3 });

  // ============================================================ the Spiral Spire
  const SH = 66;
  // the tower wall, with a doorway where the hall comes in (south, angle 90)
  const ring = (h, gap) => {
    const th0 = gap ? gap / 2 * D2R : 0, len = gap ? (360 - gap) * D2R : PI * 2;
    const g = new THREE.CylinderGeometry(RW, RW, h, gap ? 34 : 36, Math.ceil(h / 5), true, th0, len);
    const uv = g.attributes.uv, circ = Math.round(PI * 2 * RW * 0.25 * len / (PI * 2));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h * 0.25);
    return flip(clean(g));
  };
  solid(ring(22, 26), blueWall, mat4([CO.x + SC.x, CO.y - 4, CO.z + SC.z]));
  solid(ring(SH + 8 - 7, 0), blueWall, mat4([CO.x + SC.x, CO.y + 7 + (SH + 1) / 2, CO.z + SC.z]));
  b.add(box(9, 1.2, 2.4, { s: 0.5 }), M.castle, mat4([CO.x + SC.x, CO.y + 7.4, CO.z + SC.z + RW]));
  b.add(cyl(RW + 1.6, RW + 1.6, 1.2, 36, { s: 0.3 }), M.castle, mat4([CO.x + SC.x, CO.y + SH - 14.4, CO.z + SC.z]));
  for (const y of [-6, 12, 30, 48]) b.add(flip(cyl(RW - 0.2, RW - 0.2, 1.0, 36, { s: 0.4, open: true })), M.castle, mat4([CO.x + SC.x, CO.y + y, CO.z + SC.z]));
  // windows ring
  for (let i = 0; i < 18; i++) {
    const a = i * 20 + (i % 2) * 10, y = 4 + (i % 4) * 11 + 3;
    const p = polar(a, RW - 0.05, y);
    b.add(clean(new THREE.PlaneGeometry(1.4, 2.8)), M.window, mat4([p.x, p.y, p.z], [0, -a * D2R - PI / 2, 0]));
    glows.add(p.clone().lerp(polar(a, 0, y), 0.03), new THREE.Color(0xffa030).multiplyScalar(0.6), 4);
  }
  // central pillar
  const pil = SC;
  solid(cyl(3, 3, SH + 30, 16, { s: 0.25, hseg: 12 }), M.checker, mat4([CO.x + pil.x, CO.y + SH / 2 - 15, CO.z + pil.z]));
  // entrance shelf (an annulus sector at y=0)
  {
    const shape = new THREE.Shape();
    const a0 = 58 * D2R, a1 = 122 * D2R;
    shape.absarc(0, 0, RW, a0, a1, false); shape.absarc(0, 0, 9, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false, curveSegments: 10 });
    g.rotateX(PI / 2);
    const uv = g.attributes.uv; const ps = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) * 0.25, ps.getZ(i) * 0.25);
    solid(clean(g), M.checker, mat4([CO.x + SC.x, CO.y, CO.z + SC.z]));
  }
  brazier(polar(75, 14.2, 0), 0x5a8aff); brazier(polar(105, 14.2, 0), 0x5a8aff);

  // --- the climb: a list of stations
  const ledge = (a, y, w = 2.6, d = 2.6, r = RL, mat = M.wall) => { const p = polar(a, r, y); block(p, w, 0.6, d, mat, -a * D2R); return p; };
  const arcLedge = (a0, a1, y, w = 3.2, r = RL, mat = M.wall) => {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 7));
    for (let i = 0; i < n; i++) { const a = lerp(a0, a1, (i + 0.5) / n), len = Math.abs(a1 - a0) / n * D2R * r + 0.25; block(polar(a, r, y), w, 0.6, len, mat, -a * D2R); }
  };
  const motesUp = (a0, a1, y0, y1, n, r = RL) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; P.mote(polar(lerp(a0, a1, t), r, lerp(y0, y1, t) + 0.8)); } };
  const moverMesh = (w, h, d, mat = retroMat({ map: T.checker })) => new THREE.Mesh(box(w, h, d, { s: 0.5 }), mat);
  const moverMat = retroMat({ map: T.checker, rim: 0.2 });
  // 1. steps
  for (const [a, y] of [[48, 1.2], [34, 2.4], [20, 3.6], [6, 4.8]]) ledge(a, y);
  motesUp(56, 6, 0.6, 4.8, 6);
  ledge(-9, 5.6, 3.4, 3.4);
  // 2. arc mover
  {
    const m = moverMesh(2.6, 0.5, 2.6, moverMat);
    P.mover(m, new THREE.Vector3(1.3, 0.25, 1.3), (t) => { const a = lerp(-24, -50, pingpong(t, 5.0)); return { pos: polar(a, RL, 5.35), yaw: -a * D2R }; }, group);
  }
  ledge(-64, 5.8, 3, 3);
  // 3. pendulum walkway
  arcLedge(-72, -124, 6.0, 3.4);
  for (const [i, a] of [-86, -99, -112].entries()) P.pendulum(polar(a, RL, 12.9), 6.0, -a * D2R, group, { speed: 1.9, amp: 1.05, phase: i * 1.6 });
  motesUp(-76, -122, 6, 6, 8);
  // 4. crumbling blocks
  for (const [a, y] of [[-134, 6.8], [-146, 7.8], [-158, 8.8], [-170, 9.8]]) P.crumble(polar(a, RL, y - 0.25), new THREE.Vector3(2.6, 0.5, 2.6), group);
  motesUp(-134, -170, 7, 10, 4);
  // 5. landing A
  arcLedge(-178, -226, 10.6, 4.8);
  P.checkpoint(polar(-188, RL + 0.6, 10.6), along(-188), 'Spire — First Landing', group);
  brazier(polar(-200, 15, 10.6), 0xff8a30);
  for (const a of [-216, -220]) P.pot(polar(a, 14.6, 10.6), group);
  const knightA = spawn(game, 'knight', polar(-208, RL, 11), { parent: group, aggro: 9 });
  // 6. spinning discs toward the pillar
  const disc = (p, r, speed, ph = 0) => {
    const m = new THREE.Mesh(cyl(r, r, 0.5, 14, { s: 0.25 }), moverMat);
    P.mover(m, new THREE.Vector3(r * 0.86, 0.25, r * 0.86), (t) => ({ pos: p, yaw: t * speed + ph }), group);
  };
  disc(polar(-238, 8.9, 11.2), 2.1, 0.9);
  disc(polar(-258, 6.6, 11.9), 2.0, -1.1);
  motesUp(-232, -262, 11.6, 12.4, 4, 7.8);
  // 7. pillar spiral
  const pillarSteps = [[-276, 12.6], [-304, 14.2], [-332, 15.8], [-360, 17.4], [-388, 19], [-416, 20.6]];
  for (const [a, y] of pillarSteps) ledge(a, y, 2.3, 2.3, 4.6, M.castle);
  motesUp(-276, -416, 13.4, 21.4, 7, 4.6);
  for (let i = 0; i < 3; i++) spawn(game, 'bat', polar(-300 - i * 40, 9, 18 + i * 2), { parent: group, aggro: 10 });
  // 8. radial mover out to the wall
  {
    const m = moverMesh(2.6, 0.5, 2.6, moverMat);
    P.mover(m, new THREE.Vector3(1.3, 0.25, 1.3), (t) => ({ pos: polar(-432, lerp(6.0, 12.4, pingpong(t, 5.0)), 21.0), yaw: 432 * D2R }), group);
  }
  // 9. bounce pad up to a high ledge
  const padL = ledge(-442, 21.6, 3.4, 3.4);
  P.bouncer(padL.clone().setY(padL.y), 23, group);
  ledge(-458, 28.4, 3.4, 3.4);
  motesUp(-442, -458, 23, 29, 4);
  // 10. steps
  for (const [a, y] of [[-472, 29.4], [-486, 30.4], [-500, 31.4]]) ledge(a, y);
  // 11. landing B (cultists harass from above)
  arcLedge(-510, -556, 32.4, 4.8);
  P.checkpoint(polar(-518, RL + 0.6, 32.4), along(-518), 'Spire — High Landing', group);
  brazier(polar(-530, 15, 32.4), 0xff8a30);
  P.pot(polar(-546, 14.6, 32.4), group, { heart: 0.8 });
  ledge(-572, 37.2, 2.6, 2.6, 14.2); ledge(-590, 39.6, 2.6, 2.6, 14.2);
  spawn(game, 'cultist', polar(-572, 14.2, 37.5), { parent: group, aggro: 22, stay: true });
  spawn(game, 'cultist', polar(-590, 14.2, 39.9), { parent: group, aggro: 22, stay: true });
  // 12. elevators
  for (const [i, a, y0, y1] of [[0, -566, 32.2, 36.8], [1, -582, 35.2, 41.2], [2, -598, 39.0, 45.2]]) {
    const m = moverMesh(2.6, 0.5, 2.6, moverMat);
    P.mover(m, new THREE.Vector3(1.3, 0.25, 1.3), (t) => ({ pos: polar(a, RL - 2.2, lerp(y0, y1, pingpong(t + i * 1.4, 5.4))), yaw: -a * D2R }), group);
  }
  ledge(-614, 45.6, 3.4, 3.4);
  // 13. final pendulums + steps to the top
  arcLedge(-622, -652, 46.0, 3.4);
  for (const [i, a] of [-632, -644].entries()) P.pendulum(polar(a, RL, 52.9), 6.0, -a * D2R, group, { speed: 2.2, amp: 1.1, phase: i * 2 });
  for (const [a, y] of [[-664, 47.4], [-678, 48.8], [-692, 50.2], [-706, 51.6]]) ledge(a, y);
  motesUp(-622, -706, 46.4, 51.6, 10);
  // landing C + doorway at -740 (= -20 deg)
  arcLedge(-714, -766, 52.4, 4.8);
  P.checkpoint(polar(-722, RL + 0.6, 52.4), along(-722), 'Spire — Summit', group);

  // ============================================================ the Demon Gate hall
  const dA = -20 * D2R, fwd = new THREE.Vector3(Math.cos(dA), 0, Math.sin(dA)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const HY = 52.4, HL = 30, HW = 16;
  const hp = (f, r, y = HY) => polar(-20, RW, y).addScaledVector(fwd, f).addScaledVector(right, r);
  const hyaw = Math.atan2(fwd.x, fwd.z);
  // floor and walls
  block(hp(HL / 2 - 1, 0, HY), HW, 1.2, HL + 2, M.granite, hyaw);
  // doorway connector through the spire wall
  block(hp(-1.5, 0, HY), 5, 1.2, 4, M.granite, hyaw);
  for (const s of [-1, 1]) {
    block(hp(HL / 2, s * (HW / 2 + 0.6), HY + 10), 1.2, 10, HL, M.castle, hyaw);
    for (let f = 4; f < HL - 2; f += 6) {
      // chains hanging from above
      const cp = hp(f, s * (HW / 2 - 1.2), HY);
      for (let k = 0; k < 7; k++) b.add(box(0.12, 0.5, 0.3, { s: 4 }), M.iron, mat4([cp.x, cp.y + 4 + k * 0.45, cp.z], [0, hyaw + (k % 2) * PI / 2, 0]));
      brazier(hp(f + 3, s * (HW / 2 - 1.4)), 0xff7a20, true);
    }
  }
  // gold piles and skull heaps along the walls
  const pile = (p, r, h) => { const g = new THREE.SphereGeometry(r, 10, 5, 0, PI * 2, 0, PI / 2); g.scale(1, h / r, 1); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2); b.add(clean(g), M.coins, mat4([p.x, p.y, p.z])); };
  for (const [f, r] of [[6, -6], [12, 6.2], [20, -6.3], [24, 6]]) pile(hp(f, r), 1.6 + R(), 0.8 + R() * 0.4);
  const skullGeo = sphere(0.22, 7, 5);
  for (let i = 0; i < 40; i++) { const f = 3 + R() * (HL - 6), r = (R() < 0.5 ? -1 : 1) * (5.5 + R() * 1.8); const p = hp(f, r, HY + 0.15 + R() * 0.3); b.add(skullGeo, M.bone, mat4([p.x, p.y, p.z], [R(), R() * 6, 0])); }
  // the demon face (its jaw is the door)
  const face = buildDemonFace(hp(HL, 0), hyaw, group, glows, L, b);
  const knights = [spawn(game, 'knight', hp(12, -3, HY + 0.3), { parent: group, aggro: 14, yaw: hyaw + PI }), spawn(game, 'knight', hp(17, 3, HY + 0.3), { parent: group, aggro: 14, yaw: hyaw + PI })];
  let pulled = 0;
  const pull = () => { pulled++; game.hud.hint(pulled < 2 ? 'One lever down… one remains.' : 'The Demon Gate groans open…', 3); if (pulled >= 2) face.open(); };
  P.lever(hp(22, -6.2, HY), hyaw + PI / 2, group, pull);
  P.lever(hp(22, 6.2, HY), hyaw - PI / 2, group, pull);
  P.checkpoint(hp(3, -5.5), hyaw, 'The Demon Gate', group);

  // ============================================================ the Hoard (arena)
  const AC = hp(HL + 26, 0);
  const AR = 21;
  const arena = { center: AC.clone(), radius: AR, y: HY, fwd: fwd.clone(), yaw: hyaw };
  {
    const g = new THREE.CylinderGeometry(AR, AR - 2, 3, 40, 1);
    const ps = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) * 0.25, ps.getZ(i) * 0.25);
    solid(clean(g), M.granite, mat4([AC.x, AC.y - 1.5, AC.z]));
    b.add(clean(new THREE.RingGeometry(AR - 4, AR - 3.4, 40).rotateX(-PI / 2)), M.gold, mat4([AC.x, AC.y + 0.03, AC.z]));
    b.add(clean(new THREE.RingGeometry(5.5, 6.0, 30).rotateX(-PI / 2)), M.gold, mat4([AC.x, AC.y + 0.03, AC.z]));
  }
  // passage from the jaw to the arena
  block(hp(HL + 2.5, 0, HY), 6, 1.2, 9, M.granite, hyaw);
  // parapet with gaps, gold, skulls, braziers, great chains
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * PI * 2;
    const p = AC.clone().add(new THREE.Vector3(Math.cos(a) * (AR - 0.4), 0, Math.sin(a) * (AR - 0.4)));
    if (new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).dot(fwd) < -0.93) continue;     // the entrance
    if (i % 4 === 0) { brazier(AC.clone().add(new THREE.Vector3(Math.cos(a) * (AR - 2.2), 0, Math.sin(a) * (AR - 2.2))), 0xff6a20, true); }
    block(p.clone().setY(p.y + 1.2), 1.0, 1.2, 5.7, M.castle, -a);
    if (i % 3 === 1) pile(AC.clone().add(new THREE.Vector3(Math.cos(a) * (AR - 3.2), 0, Math.sin(a) * (AR - 3.2))), 1.7 + R(), 0.9);
  }
  // four broken pillars to duck behind when the fire comes
  for (let i = 0; i < 4; i++) {
    const a = Math.atan2(fwd.z, fwd.x) + PI / 4 + i * PI / 2, q = AC.clone().add(new THREE.Vector3(Math.cos(a) * 14.2, 0, Math.sin(a) * 14.2));
    const h = 4.2 + (i % 2) * 1.6;
    block(q.clone().setY(HY + h), 2.2, h, 2.2, M.castle, a);
    b.add(box(2.7, 0.5, 2.7, { s: 1 }), M.gold, mat4([q.x, HY + 0.25, q.z], [0, a, 0]));
    b.add(box(1.6, 1.0, 1.6, { s: 1 }), M.castle, mat4([q.x + 0.3, HY + h + 0.35, q.z], [0.3, a, 0.25]));
    for (let k = 0; k < 3; k++) b.add(box(0.8, 0.6, 0.7, { s: 1 }), M.castle, mat4([q.x + Math.cos(a + k * 2) * 1.8, HY + 0.3, q.z + Math.sin(a + k * 2) * 1.8], [R(), R() * 6, R()]));
  }
  for (let i = 0; i < 60; i++) { const a = R() * PI * 2, r = AR - 2.5 - R() * 2; const p = AC.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.2 + R() * 0.2, Math.sin(a) * r)); b.add(skullGeo, M.bone, mat4([p.x, p.y, p.z], [R(), R() * 6, 0])); }
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2 + 0.3, base = AC.clone().add(new THREE.Vector3(Math.cos(a) * (AR + 3), 0, Math.sin(a) * (AR + 3)));
    for (let k = 0; k < 30; k++) { const p = base.clone().lerp(AC.clone().add(new THREE.Vector3(Math.cos(a) * 9, 34, Math.sin(a) * 9)), k / 30); b.add(box(0.3, 1.0, 0.7, { s: 3 }), M.iron, mat4([p.x, p.y + 10 - k * 0.5, p.z], [0.6, a + (k % 2) * PI / 2, 0])); }
  }

  // the void below everything
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-PI / 2), game.outside.group.children.find(c => c.renderOrder === -5)?.material);
  sea.position.set(CO.x, CO.y - 60, CO.z); sea.renderOrder = -5; group.add(sea);

  b.build(group, { name: 'castle' });

  // ============================================================ zone behaviour
  const st = { hints: new Set(), procDone: false };
  const zone = {
    group, killY: CO.y - 18, arena, face, fires, st,
    music: () => st.boss ? 'boss' : 'castle',
    onEnter(g, silent) {
      GU.uFogNear.value = 18; GU.uFogFar.value = 130;
      if (!silent) {
        g.hud.area('The Hall of Procession', 'Grimhold');
        audio.music('castle'); audio.stopLoop('wind');
      }
    },
    tick(dt, g) {
      const p = g.player.pos;
      const near = (q, r) => q.distanceTo(p) < r;
      // the hall's ambushes
      if (!st.procDone && p.z > CO.z - 75 && p.distanceTo(atS(hallLen / 2)) < 70) {
        const prog = hallProgress(p);
        for (const [n, e] of encounters.entries()) {
          if (!e.started && prog > e.at) {
            e.started = true; e.foes = [];
            audio.play('cultistChant'); g.hud.callout(n === 2 ? 'The Hall Guard!' : 'Ambush!', 'small');
            if (n === 0) g.hud.hint('Defeat them all to lower the barrier of light.', 4);
            e.queue = e.spawn.map((sp, k) => ({ sp, t: 0.25 + k * 0.22, k }));
          }
          if (e.queue?.length) {
            // foes step out of thin air one after another (game time, so pausing is safe)
            for (const q of e.queue) q.t -= dt;
            for (const q of e.queue.filter(q => q.t <= 0)) {
              const [kind, s2, off, y = 0.3] = q.sp, at = atS(s2, off, y);
              const foe = spawn(g, kind, at, { parent: group, aggro: 40, yaw: Math.atan2(-tanAt(s2).x, -tanAt(s2).z), perched: false });
              if (kind === 'cultist') foe.cast = 1.5 + q.k * 0.7;
              e.foes.push(foe); g.fx.pop(at.clone().setY(at.y + 1), 0xb070ff, 16); audio.play('orbCast', { volume: 0.6 });
            }
            e.queue = e.queue.filter(q => q.t > 0);
          }
          if (e.started && !e.done && e.foes && e.foes.length === e.spawn.length && e.foes.every(f => !f.alive)) {
            e.done = true; audio.play('secret');
            if (e.gate) e.gate.openUp();
            else { st.procDone = true; hallDoor.openUp(); g.hud.hint('The way to the Spire is open.', 3); }
          }
        }
      }
      for (const [k, q, r, name, sub] of [['spire', polar(90, 12, 0), 5, 'The Spiral Spire', 'climb'], ['gate', hp(4, 0), 5, 'The Demon Gate', '']]) {
        if (!st.hints.has(k) && near(q, r)) { st.hints.add(k); g.hud.area(name, sub); if (k === 'spire') audio.music('spire'); }
      }
      if (!st.hints.has('climb') && near(polar(70, 12, 0), 6)) { st.hints.add('climb'); g.hud.hint('Climb! Falling costs a heart — the lantern shrines save your progress.', 5); }
      face.update(dt, g);
      // into the hoard
      if (face.isOpen && !st.dragon) { st.dragon = true; g.startDragon?.(arena); }
      if (st.dragon && !st.boss && p.distanceTo(AC) < AR - 3) { st.boss = true; g.dragon?.wake(); }
      for (const f of fires) if (Math.random() < dt * 4 && f.p.distanceToSquared(p) < 900) g.fx.fire(f.p, 1, 0.6);
    },
    unsafeAt: (q) => false,
    camHint(q, c) {
      const dx = q.x - (CO.x + SC.x), dz = q.z - (CO.z + SC.z), r = Math.hypot(dx, dz);
      if (r > RW + 0.5 || q.y < CO.y - 12 || q.y > CO.y + 54) return null;
      // on the central pillar look in from outside; elsewhere look out from the middle
      const inner = c ? (c.spireInner = c.spireInner ? r < 9.5 : r < 6.5) : r < 7.6;
      if (inner) return { yaw: Math.atan2(dx, dz), pitch: 0.32, dist: 8 };
      return { yaw: Math.atan2(-dx, -dz), pitch: 0.36, dist: 8.5 };
    },

  };
  // chapter select: jump straight to a section (clears what comes before)
  zone.skipTo = (where) => {
    for (const e of encounters) { e.started = e.done = true; e.foes = []; e.gate?.openUp(); }
    st.procDone = true; hallDoor.openUp();
    const spots = {
      spire: [polar(84, 12.4, 0.3), along(84) + PI * 0.15, 'The Spiral Spire'],
      gate: [hp(3, 0, HY + 0.3), hyaw, 'The Demon Gate'],
      dragon: [hp(HL + 3.5, 0, HY + 0.3), hyaw, 'The Hoard'],
    };
    if (where === 'dragon') face.openNow();
    const [pos, yaw, name] = spots[where];
    game.player.teleport(pos, yaw);
    game.setCheckpoint(pos, yaw, name);
    if (where === 'spire') audio.music('spire');
  };
  game.zones.castle = zone;
  game.enterCastle = () => {
    game.enterZone('castle', HALL_START, PI);
    game.setCheckpoint(HALL_START, PI, 'Hall of Procession');
  };
  return zone;
}

// ------------------------------------------------------------------ demon face
// shade a geometry like an airbrushed 90s render: dark at the silhouette,
// bright where it faces the viewer
function airbrush(g, dir = new THREE.Vector3(0, 0.2, 1).normalize(), lo = 0.25) {
  const n = g.attributes.normal, c = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const k = Math.max(0, n.getX(i) * dir.x + n.getY(i) * dir.y + n.getZ(i) * dir.z);
    const v = lo + (1 - lo) * Math.pow(k, 0.8);
    c[i * 3] = v; c[i * 3 + 1] = v; c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function buildDemonFace(pos, yaw, group, glows, L, b) {
  const root = new THREE.Group(); root.position.copy(pos); root.rotation.y = yaw + PI; group.add(root);
  const m = {
    skin: retroMat({ map: T.skin, chrome: 0.25, env: T.redEnv, spec: 0.9, shine: 14, rim: 0.15, emit: 0.2, vcol: true, edge: 0.5 }),
    horn: retroMat({ map: T.horn, spec: 0.8, shine: 22, rim: 0.4, vcol: true }),
    fang: retroMat({ map: T.bone, spec: 0.9, rim: 0.3, emit: 0.15 }),
    eye: retroMat({ color: 0xffffff, emit: 1, map: T.flame, scroll: [0.05, -0.9] }),
    dark: retroMat({ color: 0x0a0208 }),
  };
  const add = (g, mat, p, r = [0, 0, 0], s = 1, parent = root) => { const me = new THREE.Mesh(mat.vertexColors ? airbrush(g) : g, mat); me.position.set(...p); me.rotation.set(...r); if (typeof s === 'number') me.scale.setScalar(s); else me.scale.set(...s); parent.add(me); return me; };
  // skull: a wide dome, cheekbones, a heavy angry brow in a V
  const dome = sphere(1, 16, 12);
  { const ps = dome.attributes.position; for (let i = 0; i < ps.count; i++) { let x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i); if (y < 0) { x *= 1 + y * 0.25; z *= 1 + y * 0.2; } ps.setXYZ(i, x * 6.2, y * 5.0, z * 2.6); } dome.computeVertexNormals(); }
  add(dome, m.skin, [0, 8.2, -1.8]);
  for (const s of [-1, 1]) {
    add(sphere(1.6, 10, 8), m.skin, [s * 3.6, 5.6, 0.2], [0, 0, 0], [1.25, 0.9, 0.8]);                          // cheek
    add(box(4.6, 1.2, 2.2, { s: 0.5 }), m.skin, [s * 2.2, 9.0, 0.6], [0.35, -s * 0.25, s * 0.36]);             // brow, sloping to the nose
    add(sphere(1.1, 10, 8), m.eye, [s * 2.3, 7.75, 0.45], [0, 0, -s * 0.35], [1.35, 0.62, 0.4]);                // flaming eye
    add(box(2.8, 0.25, 0.4), m.dark, [s * 2.3, 8.35, 0.75], [0, 0, s * 0.35]);                                  // eyelid line
    // huge ribbed horns: out, then up and back
    const h = new THREE.Group(); h.position.set(s * 5.4, 11.2, -2.2); h.rotation.set(0, 0, -s * 1.05); root.add(h);
    let parent = h;
    for (let i = 0; i < 11; i++) {
      const seg = new THREE.Group(); seg.position.y = i ? 1.05 : 0; seg.rotation.set(-0.1, 0, s * 0.26); parent.add(seg);
      const r = 1.45 - i * 0.12;
      add(cyl(r * 0.84, r, 1.1, 9, { s: 0.6 }), m.horn, [0, 0.55, 0], [0, 0, 0], 1, seg);
      add(cyl(r * 1.04, r * 1.04, 0.16, 9), m.horn, [0, 0.08, 0], [0, 0, 0], 1, seg);
      parent = seg;
    }
    const lp = new THREE.Vector3(s * 2.3, 7.75, 1.6).applyEuler(root.rotation).add(pos);
    glows.add(lp, 0xffa020, 5, true);
    L(lp, 0xff8a20, 1.6, 12, { flicker: 0.3 });
  }
  add(cyl(0, 1.2, 2.8, 3, { flat: true }), m.skin, [0, 6.2, 1.2], [-0.25, PI, 0], [1, 1, 0.8]);             // nose ridge
  for (const s of [-1, 1]) add(sphere(0.25, 6, 5), m.dark, [s * 0.45, 5.0, 2.05]);
  // crown of bones across the brow
  for (let i = 0; i < 7; i++) { const x = (i - 3) * 1.15; add(cyl(0.32, 0.32, 2.3, 6), m.fang, [x, 12.4 - Math.abs(i - 3) * 0.35, -0.6], [0, 0, (i - 3) * 0.1]); add(sphere(0.42, 6, 5), m.fang, [x * 1.02, 13.6 - Math.abs(i - 3) * 0.35, -0.6]); }
  // upper lip, long fangs, the dark throat
  add(box(10, 1.4, 3.2, { s: 0.5 }), m.skin, [0, 4.0, 0.4]);
  for (let i = 0; i < 9; i++) { const x = (i - 4) * 1.0, big = i === 1 || i === 7; add(cyl(0, big ? 0.5 : 0.34, big ? 3.6 : 1.8, 6), m.fang, [x, big ? 1.6 : 2.5, 1.5], [PI, 0, 0]); }
  add(box(8.6, 5, 1, { s: 0.5 }), m.dark, [0, 1.6, -0.6]);
  // the lower jaw (the door) on a hinge
  const jaw = new THREE.Group(); jaw.position.set(0, 0.9, -0.8); root.add(jaw);
  add(box(9.6, 1.6, 3.6, { s: 0.5 }), m.skin, [0, 0, 1.2], [0, 0, 0], 1, jaw);
  for (let i = 0; i < 8; i++) add(cyl(0, 0.34, i === 0 || i === 7 ? 2.6 : 1.5, 6), m.fang, [(i - 3.5) * 1.1, 1.3, 2.3], [0, 0, 0], 1, jaw);
  add(cyl(0, 3.6, 3.4, 4, { flat: true }), m.skin, [0, -1.7, 1.4], [PI, PI / 4, 0], [1.25, 1, 0.55], jaw);   // pointed chin
  const jawDoor = { k: 0 };
  const wp = new THREE.Vector3(0, 2.4, 1).applyEuler(root.rotation).add(pos);
  const col = addBox(wp, new THREE.Vector3(8.6, 3.2, 1.2), yaw);
  // the head itself (above the mouth) is solid so the camera can't slip inside it
  addBox(new THREE.Vector3(0, 9.5, -1.6).applyEuler(root.rotation).add(pos), new THREE.Vector3(6.4, 4.6, 2.6), yaw);
  const face = {
    root, jaw, isOpen: false, opening: false,
    open() { if (this.opening) return; this.opening = true; audio.play('gateOpen'); audio.play('dragonRoar', { volume: 0.5, pitch: 0.7 }); },
    openNow() { this.opening = true; jawDoor.k = 0.999; },
    update(dt, g) {
      if (this.opening && jawDoor.k < 1) {
        jawDoor.k = Math.min(1, jawDoor.k + dt * 0.5);
        jaw.rotation.x = jawDoor.k * 0.55; jaw.position.y = 0.9 - jawDoor.k * 2.6;
        g.shake(0.2);
        if (jawDoor.k >= 1) { this.isOpen = true; col.setTranslation({ x: 0, y: -999, z: 0 }); g.hud.hint('Enter the jaws… the Star-Eater waits in its hoard.', 4); }
      }
    },
  };
  return face;
}
