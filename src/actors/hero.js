// Wick, the Candle Knight: a stubby knight in chrome plate with a crimson cape,
// a moon shield, a rune sword and a blue candle flame burning on the helmet.
// The flame is the health meter you can read on the character itself.
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat } from '../core/retro.js';
import { box, cyl, sphere, clean } from '../core/geo.js';
import { Rig, mixPose, sampleKeys } from './rig.js';

const PI = Math.PI;

function bladeGeo(len = 0.86, w = 0.1, th = 0.028) {
  // diamond cross-section, tapering to a point; v runs along the blade
  const pos = [], uv = [], idx = [];
  const rows = 6;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, z = t * len, k = i === rows ? 0 : 1 - Math.pow(t, 3) * 0.75;
    const ww = w / 2 * k, tt = th / 2 * k;
    pos.push(-ww, 0, z, 0, tt, z, ww, 0, z, 0, -tt, z);
    uv.push(0, t, 0.5, t, 1, t, 0.5, t);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < 4; j++) {
    const a = i * 4 + j, b = i * 4 + (j + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return clean(g);
}

// ----------------------------------------------------------------- poses
const IDLE = {
  hips: [0, 0, 0], spine: [0.06, 0, 0], head: [-0.04, 0, 0],
  shoulderL: [-0.12, 0, 0.2], elbowL: [-0.55, 0, 0], handL: [0, 0, 0],
  shoulderR: [-0.25, 0, -0.18], elbowR: [-0.5, 0, 0], handR: [1.25, 0, 0],
  legL: [0, 0, 0.04], kneeL: [0.05, 0, 0], footL: [0, 0, 0],
  legR: [0, 0, -0.04], kneeR: [0.05, 0, 0], footR: [0, 0, 0],
};
const AIR_UP = {
  spine: [0.12, 0, 0], head: [-0.15, 0, 0],
  legL: [-1.0, 0, 0.05], kneeL: [1.5, 0, 0], footL: [0.3, 0, 0], legR: [0.25, 0, -0.05], kneeR: [0.7, 0, 0],
  shoulderL: [-0.6, 0, 0.75], elbowL: [-0.6, 0, 0], shoulderR: [-0.5, 0, -0.8], elbowR: [-0.4, 0, 0], handR: [1.0, 0, 0],
};
const AIR_DOWN = {
  spine: [0.0, 0, 0], head: [0.1, 0, 0],
  legL: [-0.35, 0, 0.18], kneeL: [0.5, 0, 0], footL: [0.2, 0, 0], legR: [0.2, 0, -0.18], kneeR: [0.6, 0, 0],
  shoulderL: [-0.3, 0, 1.15], elbowL: [-0.3, 0, 0], shoulderR: [-0.3, 0, -1.15], elbowR: [-0.3, 0, 0], handR: [1.1, 0, 0],
};
const TUCK = {
  spine: [0.4, 0, 0], head: [0.3, 0, 0],
  legL: [-1.6, 0, 0.1], kneeL: [2.2, 0, 0], legR: [-1.5, 0, -0.1], kneeR: [2.2, 0, 0],
  shoulderL: [-1.0, 0, 0.4], elbowL: [-1.2, 0, 0], shoulderR: [-1.0, 0, -0.4], elbowR: [-1.2, 0, 0], handR: [1.4, 0, 0],
};
const GUARD = {
  spine: [0.14, 0.15, 0], head: [-0.05, -0.1, 0],
  shoulderL: [-1.2, 0, 0.05], elbowL: [-0.6, 0, 0],
  shoulderR: [0.15, 0, -0.35], elbowR: [-0.7, 0, 0], handR: [1.3, 0, 0],
  legL: [-0.35, 0, 0.12], kneeL: [0.55, 0, 0], legR: [0.25, 0, -0.12], kneeR: [0.45, 0, 0],
};
const HURT = {
  spine: [-0.45, 0, 0], head: [-0.35, 0, 0],
  shoulderL: [-0.7, 0, 1.0], elbowL: [-0.4, 0, 0], shoulderR: [-0.7, 0, -1.0], elbowR: [-0.4, 0, 0],
  legL: [-0.5, 0, 0.1], kneeL: [0.6, 0, 0], legR: [0.3, 0, -0.1], kneeR: [0.3, 0, 0],
};
const PLUNGE = {
  spine: [0.35, 0, 0], head: [0.2, 0, 0],
  shoulderR: [-0.65, 0, 0.25], elbowR: [-0.1, 0, 0], handR: [2.3, 0, 0],
  shoulderL: [-0.65, 0, -0.2], elbowL: [-0.2, 0, 0],
  legL: [-0.9, 0, 0.12], kneeL: [1.4, 0, 0], legR: [-0.8, 0, -0.12], kneeR: [1.4, 0, 0],
};
// landing absorb and a heels-in skid when you reverse at speed
const LAND = {
  spine: [0.42, 0, 0], head: [-0.22, 0, 0],
  legL: [-0.75, 0, 0.14], kneeL: [1.35, 0, 0], footL: [-0.55, 0, 0],
  legR: [-0.55, 0, -0.14], kneeR: [1.15, 0, 0], footR: [-0.5, 0, 0],
  shoulderL: [-0.5, 0, 0.6], elbowL: [-0.5, 0, 0], shoulderR: [-0.45, 0, -0.6], elbowR: [-0.5, 0, 0],
};
const SKID = {
  spine: [-0.28, 0, 0], head: [0.12, 0, 0],
  legL: [-0.8, 0, 0.12], kneeL: [0.3, 0, 0], footL: [-0.35, 0, 0],
  legR: [0.35, 0, -0.12], kneeR: [0.9, 0, 0],
  shoulderL: [-0.7, 0, 0.85], elbowL: [-0.4, 0, 0], shoulderR: [-0.6, 0, -0.85], elbowR: [-0.4, 0, 0],
};
const VICTORY = {
  spine: [-0.1, 0, 0], head: [-0.3, 0, 0],
  shoulderR: [-2.9, 0, -0.15], elbowR: [0, 0, 0], handR: [1.33, 0, 0],
  shoulderL: [-0.2, 0, 0.5], elbowL: [-0.8, 0, 0],
  legL: [-0.15, 0, 0.12], legR: [0.1, 0, -0.12],
};

// attack keyframes (time in seconds)
const W1 = { spine: [0.12, -0.8, 0], shoulderR: [-1.25, 0, -1.0], elbowR: [-0.25, 0, 0], handR: [0, -1.45, 0], shoulderL: [-0.35, 0, 0.45], legL: [-0.45, 0, 0.1], kneeL: [0.3, 0, 0], legR: [0.35, 0, -0.1], kneeR: [0.35, 0, 0] };
const S1 = { spine: [0.18, 0.9, 0], shoulderR: [-1.4, 0, 0.75], elbowR: [-0.1, 0, 0], handR: [0, -1.45, 0], shoulderL: [-0.2, 0, 0.6], legL: [-0.5, 0, 0.1], kneeL: [0.4, 0, 0], legR: [0.4, 0, -0.1], kneeR: [0.4, 0, 0] };
const W2 = { spine: [0.12, 0.75, 0], shoulderR: [-1.35, 0, 0.7], elbowR: [-0.35, 0, 0], handR: [0, 1.45, 0], shoulderL: [-0.3, 0, 0.5], legL: [0.3, 0, 0.1], kneeL: [0.3, 0, 0], legR: [-0.45, 0, -0.1], kneeR: [0.35, 0, 0] };
const S2 = { spine: [0.18, -0.95, 0], shoulderR: [-1.35, 0, -1.1], elbowR: [-0.1, 0, 0], handR: [0, 1.45, 0], shoulderL: [-0.25, 0, 0.7], legL: [0.35, 0, 0.1], kneeL: [0.4, 0, 0], legR: [-0.5, 0, -0.1], kneeR: [0.45, 0, 0] };
const SPIN = { spine: [0.25, 0, 0], shoulderR: [-1.5, 0, -1.35], elbowR: [0, 0, 0], handR: [0, -1.5, 0], shoulderL: [-0.5, 0, 1.2], legL: [-0.5, 0, 0.3], kneeL: [0.7, 0, 0], legR: [0.4, 0, -0.3], kneeR: [0.6, 0, 0] };
export const ATTACKS = {
  atk1: { dur: 0.34, hit: [0.07, 0.17], keys: [[0, W1], [0.06, W1], [0.15, S1], [0.34, mixPose(S1, IDLE, 0.4)]] },
  atk2: { dur: 0.34, hit: [0.07, 0.17], keys: [[0, W2], [0.06, W2], [0.15, S2], [0.34, mixPose(S2, IDLE, 0.4)]] },
  atk3: { dur: 0.52, hit: [0.08, 0.36], keys: [[0, SPIN], [0.4, SPIN], [0.52, mixPose(SPIN, IDLE, 0.5)]] },
};

// ----------------------------------------------------------------- model
export function buildHero() {
  const m = {
    // brushed steel plate (matte, soft highlight); only the helm is polished chrome
    armor: retroMat({ map: T.metal, chrome: 0.62, env: T.silver, color: 0xd4daf8, spec: 0.3, shine: 12, rim: 0.15, emit: 0.1, edge: 0.4 }),
    helm: retroMat({ map: T.metal, chrome: 0.82, env: T.silver, color: 0xe0e6ff, spec: 0.45, shine: 24, rim: 0.15, emit: 0.12, edge: 0.3 }),
    dark: retroMat({ map: T.iron, spec: 0.15, shine: 10, rim: 0.2, emit: 0.06, edge: 0.3 }),
    red: retroMat({ map: T.robe, rim: 0.25, spec: 0.05, side: THREE.DoubleSide, emit: 0.14, edge: 0.3 }),
    gold: retroMat({ map: T.gold, chrome: 0.55, env: T.goldEnv, spec: 0.35, rim: 0.15, emit: 0.14, edge: 0.3 }),
    eye: retroMat({ color: 0xffe880, emit: 1, fog: 0.4 }),
    blade: retroMat({ map: T.runes, chrome: 0.3, env: T.chrome, emit: 0.55, spec: 1.2, shine: 40 }),
    shield: retroMat({ map: T.shield, spec: 0.3, shine: 14, rim: 0.2, emit: 0.16, edge: 0.25 }),
    flame: retroMat({ color: 0x9ad6ff, emit: 1, additive: true, opacity: 0.95, fog: 0.3 }),
    flameCore: retroMat({ color: 0xffffff, emit: 1, fog: 0.3 }),
  };
  const rig = new Rig();
  const J = (n, p, pos) => rig.joint(n, p, pos), P = (...a) => rig.part(...a);
  rig.body.position.y = 0.76;
  J('hips', null, [0, -0.2, 0]);
  J('spine', 'hips', [0, 0.06, 0]);
  J('head', 'spine', [0, 0.43, 0]);
  J('shoulderL', 'spine', [0.27, 0.34, 0]); J('elbowL', 'shoulderL', [0, -0.24, 0]); J('handL', 'elbowL', [0, -0.23, 0]);
  J('shoulderR', 'spine', [-0.27, 0.34, 0]); J('elbowR', 'shoulderR', [0, -0.24, 0]); J('handR', 'elbowR', [0, -0.23, 0]);
  J('legL', 'hips', [0.115, -0.03, 0]); J('kneeL', 'legL', [0, -0.25, 0]); J('footL', 'kneeL', [0, -0.22, 0]);
  J('legR', 'hips', [-0.115, -0.03, 0]); J('kneeR', 'legR', [0, -0.25, 0]); J('footR', 'kneeR', [0, -0.22, 0]);
  J('cape0', 'spine', [0, 0.36, -0.19]); J('cape1', 'cape0', [0, -0.27, 0]); J('cape2', 'cape1', [0, -0.27, 0]);

  // torso
  P('hips', cyl(0.2, 0.17, 0.17, 8, { s: 4 }), m.dark, [0, 0, 0], [0, 0, 0], [1, 1, 0.85]);
  P('spine', cyl(0.28, 0.21, 0.4, 8, { s: 3 }), m.armor, [0, 0.21, 0.01], [0, 0, 0], [1, 1, 0.82]);
  P('spine', cyl(0.3, 0.28, 0.06, 8, { s: 3 }), m.gold, [0, 0.41, 0.01], [0, 0, 0], [1, 1, 0.82]);
  P('spine', cyl(0.215, 0.215, 0.07, 8, { s: 4 }), m.gold, [0, 0.02, 0], [0, 0, 0], [1, 1, 0.85]);
  P('spine', box(0.08, 0.08, 0.04, { s: 8 }), m.gold, [0, 0.02, 0.19]);
  P('hips', box(0.28, 0.3, 0.03, { s: 3 }), m.red, [0, -0.13, 0.15], [-0.08, 0, 0]);
  P('hips', box(0.3, 0.26, 0.03, { s: 3 }), m.red, [0, -0.11, -0.15], [0.1, 0, 0]);
  // head: round helm, visor slot, glowing eyes, gorget, candle
  P('head', cyl(0.2, 0.25, 0.09, 10, { s: 4 }), m.gold, [0, 0.01, 0]);
  P('head', sphere(0.3, 12, 9), m.helm, [0, 0.24, 0.0], [0, 0, 0], [1, 1.04, 1.08]);
  P('head', box(0.4, 0.075, 0.12, { s: 6 }), m.dark, [0, 0.21, 0.27]);
  for (const s of [-1, 1]) P('head', box(0.08, 0.04, 0.03), m.eye, [s * 0.08, 0.212, 0.33]);
  P('head', box(0.05, 0.1, 0.5, { s: 4 }), m.gold, [0, 0.5, -0.02]);
  P('head', cyl(0.075, 0.055, 0.09, 8, { s: 4 }), m.gold, [0, 0.57, 0]);
  const flame = new THREE.Group(); rig.j.head.add(flame); flame.position.set(0, 0.62, 0);
  rig.part(flame, sphere(0.075, 8, 6), m.flame, [0, 0.07, 0]);
  rig.part(flame, cyl(0, 0.074, 0.2, 8), m.flame, [0, 0.17, 0]);
  const flameCore = rig.part(flame, sphere(0.04, 6, 5), m.flameCore, [0, 0.07, 0], [0, 0, 0], [1, 1.5, 1]);
  // arms
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    P('shoulder' + side, sphere(0.15, 8, 6), m.armor, [s * 0.02, 0.03, 0], [0, 0, 0], [1.15, 0.85, 1.1]);
    P('shoulder' + side, cyl(0.07, 0.062, 0.24, 6, { s: 4 }), m.dark, [0, -0.12, 0]);
    P('elbow' + side, cyl(0.085, 0.07, 0.21, 6, { s: 4 }), m.armor, [0, -0.11, 0]);
    P('hand' + side, box(0.12, 0.12, 0.13, { s: 6 }), m.dark, [0, -0.04, 0]);
    P('leg' + side, cyl(0.1, 0.085, 0.25, 6, { s: 4 }), m.dark, [0, -0.12, 0]);
    P('knee' + side, sphere(0.075, 6, 5), m.gold, [0, 0, 0.05]);
    P('knee' + side, cyl(0.088, 0.105, 0.22, 6, { s: 4 }), m.armor, [0, -0.11, 0]);
    P('foot' + side, box(0.17, 0.11, 0.27, { s: 5 }), m.dark, [0, -0.03, 0.045]);
    P('foot' + side, box(0.17, 0.05, 0.08, { s: 5 }), m.armor, [0, 0.01, 0.15]);
  }
  // cape: three hinged panels
  const cw = [0.46, 0.52, 0.58];
  for (let i = 0; i < 3; i++) P('cape' + i, box(cw[i], 0.29, 0.02, { s: 3 }), m.red, [0, -0.135, 0]);
  // sword in the right hand (blade along the hand's +Z)
  const sword = new THREE.Group(); rig.j.handR.add(sword); sword.position.set(0, -0.05, 0);
  rig.part(sword, cyl(0.026, 0.026, 0.17, 6, { s: 4 }), m.dark, [0, 0, 0.0], [PI / 2, 0, 0]);
  rig.part(sword, sphere(0.04, 6, 5), m.gold, [0, 0, -0.1]);
  rig.part(sword, box(0.28, 0.045, 0.05, { s: 6 }), m.gold, [0, 0, 0.1]);
  rig.part(sword, bladeGeo(), m.blade, [0, 0, 0.12]);
  // shield on the left hand
  const shield = new THREE.Group(); rig.j.handL.add(shield);
  const shieldRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI / 2, 0));
  const shieldRestPos = new THREE.Vector3(0.06, -0.06, 0);
  shield.quaternion.copy(shieldRest); shield.position.copy(shieldRestPos);
  const face = clean(new THREE.CircleGeometry(0.31, 12));
  rig.part(shield, face, m.shield, [0, 0, 0.026]);
  rig.part(shield, cyl(0.31, 0.31, 0.05, 12, { s: 2 }), m.gold, [0, 0, 0], [PI / 2, 0, 0]);
  rig.part(shield, sphere(0.06, 6, 5), m.gold, [0, 0, 0.045]);

  // ------------------------------------------------------------ animation
  const st = { t: 0, phase: 0, squash: 0, flip: 0, spin: 0, guardW: 0, cape: [0.15, 0.08, 0.06], land: 0, skid: 0, lean: 0, idleT: 0 };
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();
  const guardQ = new THREE.Quaternion(), guardP = new THREE.Vector3(0.05, 0.98, 0.42);

  function update(dt, s) {
    st.t += dt;
    const sp = s.speed || 0, run = Math.min(1, sp / 7);
    let pose, k = 1 - Math.exp(-dt * 16);
    if (s.dead) {
      pose = mixPose(HURT, { spine: [-0.2, 0, 0], legL: [-0.2, 0, 0.3], legR: [0.1, 0, -0.3] }, 0.5);
    } else if (!s.grounded) {
      const w = THREE.MathUtils.clamp(0.5 - s.vy / 14, 0, 1);
      pose = mixPose(AIR_UP, AIR_DOWN, w);
    } else {
      // run cycle, phase advanced by distance travelled
      st.phase += sp * dt * (PI * 2 / 2.1);
      const a = Math.sin(st.phase), c = Math.cos(st.phase);
      const breathe = Math.sin(st.t * 2.2) * 0.03;
      const idle = mixPose(IDLE, { spine: [0.06 + breathe, 0, 0], shoulderL: [-0.12 - breathe, 0, 0.2], shoulderR: [-0.25 - breathe, 0, -0.18] }, 1);
      // idle for a while: glance around
      st.idleT = sp < 0.3 && !s.action && !(s.guard > 0) ? st.idleT + dt : 0;
      const look = THREE.MathUtils.smoothstep(st.idleT, 3, 4.5), lt = st.idleT - 3;
      idle.head = [-0.04 + Math.sin(lt * 0.9) * 0.08 * look, Math.sin(lt * 0.55) * 0.6 * look, 0];
      idle.spine[1] = Math.sin(lt * 0.55 - 0.6) * 0.12 * look;
      idle.hips = [0, 0, Math.sin(lt * 0.4) * 0.04 * look];
      // run: hips roll with the stride, elbows pump, the sword trails low behind
      const runP = {
        hips: [0, -a * 0.2, a * 0.06], spine: [0.24, a * 0.24, -a * 0.04], head: [-0.17, -a * 0.18, a * 0.04],
        legL: [-a * 0.98, 0, 0.04], kneeL: [0.25 + Math.max(0, -c) * 1.4, 0, 0], footL: [Math.max(0, a) * 0.35, 0, 0],
        legR: [a * 0.98, 0, -0.04], kneeR: [0.25 + Math.max(0, c) * 1.4, 0, 0], footR: [Math.max(0, -a) * 0.35, 0, 0],
        shoulderL: [a * 0.8 - 0.15, 0, 0.25], elbowL: [-0.75 - Math.max(0, a) * 0.5, 0, 0],
        shoulderR: [-a * 0.55 + 0.25, 0, -0.3], elbowR: [-0.55, 0, 0], handR: [1.95, 0, 0],
      };
      pose = mixPose(idle, runP, run);
    }
    // landing: knees absorb the drop; skidding: dig the heels in
    st.land = Math.max(st.land * Math.exp(-dt * 7), s.landed ? Math.min(1, 0.35 + s.landed / 22) : 0);
    st.skid += ((s.skid && s.grounded ? 1 : 0) - st.skid) * (1 - Math.exp(-dt * 14));
    if (st.land > 0.02 && s.grounded && !s.dead) pose = mixPose(pose, LAND, st.land * (s.action ? 0.4 : 1));
    if (st.skid > 0.02) pose = mixPose(pose, SKID, st.skid);
    if (s.guard > 0) pose = mixPose(pose, GUARD, s.guard);
    st.guardW += ((s.guard > 0 ? 1 : 0) - st.guardW) * (1 - Math.exp(-dt * 22));

    // actions override with snappier blending
    const act = s.action, at = s.actionT || 0;
    let flipTarget = 0, spinTarget = 0;
    if (act && ATTACKS[act]) { pose = mixPose(pose, sampleKeys(ATTACKS[act].keys, at), 1); k = 1 - Math.exp(-dt * 40); }
    if (act === 'atk3') spinTarget = -PI * 2 * THREE.MathUtils.smoothstep(at, 0.04, 0.36);
    if (act === 'flip') { pose = mixPose(pose, TUCK, Math.min(1, at * 8)); flipTarget = PI * 2 * THREE.MathUtils.smoothstep(at, 0, 0.42); k = 1 - Math.exp(-dt * 30); }
    if (act === 'plunge') { pose = mixPose(pose, at < 0.14 ? TUCK : PLUNGE, 1); flipTarget = at < 0.14 ? PI * 2 * (at / 0.14) * 0.5 : 0; k = 1 - Math.exp(-dt * 30); }
    if (act === 'plungeLand') { pose = mixPose(PLUNGE, { legL: [-1.2, 0, 0.3], kneeL: [2.0, 0, 0], legR: [0.2, 0, -0.3], kneeR: [1.6, 0, 0], spine: [0.5, 0, 0] }, 1); k = 1; }
    if (act === 'hurt') { pose = mixPose(pose, HURT, 1); k = 1 - Math.exp(-dt * 30); }
    if (act === 'victory') pose = mixPose(pose, VICTORY, Math.min(1, at * 4));
    rig.apply(pose, k);

    // body: bob, squash & stretch, flips, spin
    st.squash += (0 - st.squash) * (1 - Math.exp(-dt * 12));
    if (s.landed) st.squash = Math.min(0.35, 0.12 + s.landed * 0.02);
    const sq = st.squash - (!s.grounded ? Math.min(0.12, Math.max(0, s.vy) * 0.01) : 0);
    const bob = s.grounded && !act ? Math.abs(Math.cos(st.phase)) * 0.07 * run : 0;
    rig.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    let crouch = act === 'plungeLand' ? -0.28 : (s.guard > 0 ? -0.07 : 0);
    if (s.grounded) crouch -= st.land * 0.12 + st.skid * 0.05;
    if (s.dead) crouch = -0.45;
    rig.body.position.y = 0.76 - sq * 0.5 + bob + crouch;
    st.flip = flipTarget ? flipTarget : st.flip + (0 - st.flip) * (1 - Math.exp(-dt * 30));
    if (!act || (act !== 'flip' && act !== 'plunge')) st.flip = 0;
    rig.body.rotation.x = st.flip + (s.dead ? -1.35 : 0);
    rig.body.rotation.y = spinTarget;
    // bank into turns (positive yaw rate turns toward local +x)
    const lean = s.dead ? 0 : THREE.MathUtils.clamp(-(s.turn || 0) * 0.05, -0.3, 0.3) * run * (s.grounded ? 1 : 0.4);
    st.lean += (lean - st.lean) * (1 - Math.exp(-dt * 8));
    rig.body.rotation.z = st.lean;

    // cape: trails with speed, lifts while falling, flutters
    const fl = Math.sin(st.t * 13) * 0.06 * (0.3 + run) + Math.sin(st.t * 7.7) * 0.03;
    const lift = !s.grounded ? THREE.MathUtils.clamp(-s.vy * 0.06, -0.3, 0.9) : 0;
    const tgt = [0.12 + run * 0.55 + lift + fl, 0.1 + run * 0.3 + lift * 0.4 + fl * 1.4, 0.08 + run * 0.25 + fl * 1.8];
    for (let i = 0; i < 3; i++) { st.cape[i] += (tgt[i] - st.cape[i]) * (1 - Math.exp(-dt * (9 - i * 2))); rig.j['cape' + i].rotation.x = st.cape[i]; }

    // shield: snaps to face forward while guarding
    rig.root.updateMatrixWorld(true);
    if (st.guardW > 0.01) {
      rig.j.handL.getWorldQuaternion(_q);
      guardQ.copy(rig.root.quaternion);
      _q2.copy(_q).invert().multiply(guardQ);
      shield.quaternion.copy(shieldRest).slerp(_q2, st.guardW);
      _p.copy(guardP).applyMatrix4(rig.root.matrixWorld);
      _m.copy(rig.j.handL.matrixWorld).invert();
      _p.applyMatrix4(_m);
      shield.position.copy(shieldRestPos).lerp(_p, st.guardW);
    } else { shield.quaternion.copy(shieldRest); shield.position.copy(shieldRestPos); }

    // candle flame: flickers, shrinks with health
    const hp = s.hpFrac ?? 1;
    const f = 0.85 + Math.sin(st.t * 21) * 0.08 + Math.sin(st.t * 37) * 0.06;
    flame.scale.set(0.55 + hp * 0.55, (0.4 + hp * 0.8) * f, 0.55 + hp * 0.55);
    flame.rotation.z = Math.sin(st.t * 5.3) * 0.12 - (s.speed || 0) * 0.0; flame.rotation.x = -run * 0.5 + lift * 0.3;
    m.flame.uniforms.uColor.value.setHex(hp > 0.34 ? 0x9ad6ff : 0xff9a6a);
  }

  const tipLocal = new THREE.Vector3(0, -0.05, 0.98), baseLocal = new THREE.Vector3(0, -0.05, 0.2);
  return {
    rig, root: rig.root, mats: m, update, sword, shield, flame,
    swordTip: (out) => out.copy(tipLocal).applyMatrix4(rig.j.handR.matrixWorld),
    swordBase: (out) => out.copy(baseLocal).applyMatrix4(rig.j.handR.matrixWorld),
    flameWorld: (out) => flame.getWorldPosition(out),
  };
}
