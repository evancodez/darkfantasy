// Enemy models. Each build() returns { rig, root, m (materials), parts, update? }.
// Materials are created per instance so each enemy can flash when hit.
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat } from '../core/retro.js';
import { box, cyl, sphere, clean } from '../core/geo.js';
import { Rig } from './rig.js';

const PI = Math.PI;
const lathe = (pts, seg = 10, us = 2) => {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * us, uv.getY(i));
  return clean(g);
};
const cone = (r, h, seg = 6) => cyl(0, r, h, seg);

// ------------------------------------------------------------------ scarecrow
export function scarecrow() {
  const m = {
    cloth: retroMat({ map: T.checkerCloth, rim: 0.35, spec: 0.1 }),
    sack: retroMat({ map: T.burlap, rim: 0.3 }),
    straw: retroMat({ map: T.straw, rim: 0.2 }),
    dark: retroMat({ color: 0x14040a }),
    tooth: retroMat({ map: T.bone, emit: 0.3 }),
    eye: retroMat({ color: 0xff2a10, emit: 1, fog: 0.3 }),
    rope: retroMat({ map: T.wood, color: 0xc08060 }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 1.05;
  J('hips', null, [0, -0.05, 0]); J('spine', 'hips', [0, 0.05, 0]); J('head', 'spine', [0, 0.66, 0]);
  J('shoulderL', 'spine', [0.3, 0.52, 0]); J('elbowL', 'shoulderL', [0, -0.32, 0]);
  J('shoulderR', 'spine', [-0.3, 0.52, 0]); J('elbowR', 'shoulderR', [0, -0.32, 0]);
  J('legL', 'hips', [0.14, -0.05, 0]); J('kneeL', 'legL', [0, -0.45, 0]);
  J('legR', 'hips', [-0.14, -0.05, 0]); J('kneeR', 'legR', [0, -0.45, 0]);
  P('spine', box(0.56, 0.6, 0.34, { s: 2 }), m.cloth, [0, 0.3, 0]);
  P('spine', box(0.6, 0.07, 0.38, { s: 4 }), m.rope, [0, 0.04, 0]);
  P('spine', box(0.2, 0.2, 0.05, { s: 4 }), m.cloth, [0.1, 0.36, 0.18], [0, 0, 0.3]);
  for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; P('spine', cone(0.06, 0.24, 4), m.straw, [Math.sin(a) * 0.17, 0.6, Math.cos(a) * 0.12], [Math.cos(a) * 0.7 + 0.2, 0, -Math.sin(a) * 0.7]); }
  // sack head with a gaping mouth
  P('head', sphere(0.34, 10, 8), m.sack, [0, 0.12, 0], [0, 0, 0], [1, 1.1, 0.95]);
  P('head', cone(0.14, 0.3, 6), m.sack, [0.02, 0.56, -0.02], [0, 0, 0.25]);
  P('head', box(0.12, 0.04, 0.12, { s: 6 }), m.rope, [0.04, 0.42, -0.01], [0, 0, 0.25]);
  P('head', box(0.36, 0.2, 0.14), m.dark, [0, -0.02, 0.28]);
  for (let i = 0; i < 5; i++) { P('head', box(0.05, 0.06, 0.04), m.tooth, [-0.12 + i * 0.06, 0.06, 0.34]); P('head', box(0.05, 0.06, 0.04), m.tooth, [-0.11 + i * 0.055, -0.1, 0.34]); }
  P('head', sphere(0.075, 6, 5), m.eye, [0.13, 0.24, 0.27]);
  P('head', sphere(0.06, 6, 5), m.eye, [-0.12, 0.22, 0.28]);
  P('head', box(0.16, 0.14, 0.04, { s: 4 }), m.cloth, [-0.14, 0.38, 0.22], [0.3, 0.2, 0.2]);
  for (const [s, sd] of [[1, 'L'], [-1, 'R']]) {
    P('shoulder' + sd, cyl(0.085, 0.1, 0.34, 6, { s: 2 }), m.cloth, [0, -0.16, 0]);
    P('elbow' + sd, cyl(0.1, 0.08, 0.28, 6, { s: 2 }), m.cloth, [0, -0.12, 0]);
    for (let i = 0; i < 4; i++) P('elbow' + sd, cone(0.04, 0.18, 4), m.straw, [Math.sin(i * 1.6) * 0.05, -0.28, Math.cos(i * 1.6) * 0.05], [PI + Math.cos(i * 1.6) * 0.5, 0, Math.sin(i * 1.6) * 0.5]);
    for (let i = 0; i < 3; i++) P('elbow' + sd, cyl(0.025, 0.012, 0.3, 4), m.sack, [(i - 1) * 0.05, -0.42, 0.04], [0.3, 0, (i - 1) * 0.25]);
    P('leg' + sd, cyl(0.12, 0.1, 0.48, 6, { s: 2 }), m.cloth, [0, -0.22, 0]);
    P('knee' + sd, cyl(0.1, 0.12, 0.42, 6, { s: 2 }), m.cloth, [0, -0.2, 0]);
    for (let i = 0; i < 4; i++) P('knee' + sd, cone(0.05, 0.16, 4), m.straw, [Math.sin(i * 1.6) * 0.07, -0.44, Math.cos(i * 1.6) * 0.07], [PI, 0, 0]);
  }
  return { rig, root: rig.root, m };
}

// ------------------------------------------------------------------ cultist
export function cultist() {
  const m = {
    robe: retroMat({ map: T.robe, rim: 0.45, spec: 0.25, shine: 10, emit: 0.08 }),
    chrome: retroMat({ map: T.metal, chrome: 0.92, env: T.chrome, spec: 1.2, shine: 40, rim: 0.3 }),
    dark: retroMat({ color: 0x05030c }),
    eye: retroMat({ color: 0x40ff60, emit: 1, fog: 0.3 }),
    hand: retroMat({ map: T.bone, rim: 0.2 }),
    rope: retroMat({ map: T.robe, color: 0x803040 }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 0;
  J('hips', null, [0, 0, 0]); J('spine', 'hips', [0, 0.75, 0]); J('head', 'spine', [0, 0.62, 0]);
  J('shoulderL', 'spine', [0.26, 0.5, 0]); J('elbowL', 'shoulderL', [0, -0.3, 0]);
  J('shoulderR', 'spine', [-0.26, 0.5, 0]); J('elbowR', 'shoulderR', [0, -0.3, 0]);
  P('hips', lathe([[0.01, 0], [0.56, 0], [0.5, 0.25], [0.38, 0.75], [0.3, 1.0]], 12, 3), m.robe);
  P('spine', lathe([[0.3, 0], [0.32, 0.25], [0.26, 0.5], [0.16, 0.62], [0.01, 0.64]], 12, 3), m.robe);
  P('spine', cyl(0.33, 0.33, 0.06, 12, { s: 3 }), m.rope, [0, 0.0, 0]);
  P('spine', cyl(0.24, 0.3, 0.16, 12, { s: 3 }), m.robe, [0, 0.58, 0]);
  // helmet: bullet shape, face plate, lightning spike
  P('head', lathe([[0.01, -0.02], [0.24, 0.0], [0.27, 0.22], [0.24, 0.42], [0.15, 0.58], [0.04, 0.7], [0.01, 0.72]], 12, 2), m.chrome, [0, 0, 0]);
  P('head', box(0.34, 0.3, 0.06), m.dark, [0, 0.16, 0.24]);
  P('head', cone(0.17, 0.26, 3), m.chrome, [0, 0.07, 0.27], [PI, 0, 0], [1, 1, 0.4]);
  for (const s of [-1, 1]) P('head', box(0.1, 0.05, 0.03), m.eye, [s * 0.075, 0.2, 0.27], [0, 0, s * -0.35]);
  const zig = [[0, 0.78, 0, 0.5], [0.07, 0.96, 0, -0.6], [-0.02, 1.13, 0, 0.6], [0.06, 1.3, 0, -0.4]];
  for (const [x, y, z, r] of zig) P('head', box(0.06, 0.24, 0.06, { s: 6 }), m.chrome, [x, y, z], [0, 0, r]);
  P('head', cone(0.04, 0.16, 4), m.chrome, [0.03, 1.46, 0]);
  for (const [s, sd] of [[1, 'L'], [-1, 'R']]) {
    P('shoulder' + sd, cyl(0.1, 0.13, 0.34, 8, { s: 3 }), m.robe, [0, -0.15, 0]);
    P('elbow' + sd, lathe([[0.12, 0.02], [0.2, -0.3], [0.17, -0.34]], 8, 2), m.robe, [0, 0, 0]);
    P('elbow' + sd, box(0.1, 0.14, 0.08, { s: 6 }), m.hand, [0, -0.38, 0.02]);
    for (let i = 0; i < 3; i++) P('elbow' + sd, cyl(0.018, 0.012, 0.14, 4), m.hand, [(i - 1) * 0.03, -0.5, 0.04], [0.3, 0, (i - 1) * 0.15]);
  }
  return { rig, root: rig.root, m };
}

// ------------------------------------------------------------------ skull crawler
export function skull() {
  const m = { bone: retroMat({ map: T.bone, rim: 0.4, spec: 0.5, shine: 16 }), dark: retroMat({ color: 0x0a0414 }), eye: retroMat({ color: 0xff3020, emit: 1, fog: 0.3 }) };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 0.42;
  J('head', null, [0, 0, 0]); J('jaw', 'head', [0, -0.08, 0.06]);
  P('head', sphere(0.3, 10, 8), m.bone, [0, 0.06, -0.02], [0, 0, 0], [1, 0.95, 1.12]);
  for (const s of [-1, 1]) { P('head', sphere(0.085, 6, 5), m.dark, [s * 0.11, 0.06, 0.25]); P('head', sphere(0.035, 5, 4), m.eye, [s * 0.11, 0.06, 0.3]); }
  P('head', cone(0.05, 0.08, 3), m.dark, [0, -0.04, 0.32], [PI, 0, 0]);
  P('jaw', box(0.3, 0.07, 0.2, { s: 6 }), m.bone, [0, -0.04, 0.06]);
  for (let i = 0; i < 5; i++) { P('head', box(0.04, 0.06, 0.03), m.bone, [-0.08 + i * 0.04, -0.09, 0.28]); P('jaw', box(0.04, 0.05, 0.03), m.bone, [-0.08 + i * 0.04, 0.01, 0.15]); }
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? 1 : -1, sz = i % 2 ? -1 : 1;
    J('leg' + i, 'head', [sx * 0.18, -0.05, sz * 0.1]); J('shin' + i, 'leg' + i, [sx * 0.24, 0, 0]);
    P('leg' + i, cyl(0.03, 0.03, 0.26, 4), m.bone, [sx * 0.12, 0, 0], [0, 0, PI / 2]);
    P('shin' + i, cyl(0.03, 0.015, 0.34, 4), m.bone, [0, -0.15, 0]);
    rig.j['leg' + i].rotation.z = sx * 0.5; rig.j['shin' + i].rotation.z = -sx * 0.3;
    rig.j['leg' + i].rotation.y = sz * 0.5 * sx;
  }
  return { rig, root: rig.root, m };
}

// ------------------------------------------------------------------ bat
export function bat() {
  const m = { fur: retroMat({ map: T.fur, rim: 0.5, color: 0xc080ff }), wing: retroMat({ map: T.membrane, side: THREE.DoubleSide, rim: 0.3, color: 0xa060ff }), eye: retroMat({ color: 0xffe040, emit: 1 }), fang: retroMat({ map: T.bone }) };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  J('torso', null, [0, 0, 0]); J('wingL', 'torso', [0.12, 0.05, 0]); J('wingR', 'torso', [-0.12, 0.05, 0]);
  P('torso', sphere(0.2, 8, 6), m.fur, [0, 0, 0], [0, 0, 0], [1, 1.2, 1]);
  P('torso', sphere(0.15, 8, 6), m.fur, [0, 0.22, 0.06]);
  for (const s of [-1, 1]) { P('torso', cone(0.07, 0.22, 4), m.fur, [s * 0.09, 0.4, 0.04], [0, 0, -s * 0.3]); P('torso', box(0.05, 0.04, 0.02), m.eye, [s * 0.055, 0.25, 0.19]); P('torso', cone(0.015, 0.06, 3), m.fang, [s * 0.03, 0.14, 0.18], [PI, 0, 0]); }
  const ws = new THREE.Shape(); ws.moveTo(0, 0.1); ws.lineTo(0.75, 0.25); ws.lineTo(0.65, -0.05); ws.lineTo(0.5, 0.05); ws.lineTo(0.38, -0.12); ws.lineTo(0.22, -0.02); ws.lineTo(0, -0.1);
  const wg = clean(new THREE.ShapeGeometry(ws)); const uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) + 0.5);
  const wl = P('wingL', wg, m.wing, [0, 0, 0], [PI / 2, 0, 0]);
  const wr = P('wingR', wg, m.wing, [0, 0, 0], [PI / 2, 0, PI]);
  wr.scale.y = -1;
  return { rig, root: rig.root, m };
}

// ------------------------------------------------------------------ black knight
export function knight() {
  const m = {
    armor: retroMat({ map: T.metal, chrome: 0.85, env: T.chrome, color: 0x5a4a8a, spec: 0.9, shine: 26, rim: 0.5 }),
    dark: retroMat({ map: T.iron, rim: 0.3 }),
    horn: retroMat({ map: T.horn, rim: 0.4, spec: 0.5 }),
    eye: retroMat({ color: 0xff3018, emit: 1, fog: 0.3 }),
    shield: retroMat({ map: T.iron, color: 0x9a90c0, spec: 0.6, rim: 0.3 }),
    gold: retroMat({ map: T.gold, chrome: 0.7, env: T.goldEnv, spec: 0.6 }),
    red: retroMat({ map: T.robe, side: THREE.DoubleSide, rim: 0.3 }),
    bone: retroMat({ map: T.bone }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 1.0;
  J('hips', null, [0, -0.08, 0]); J('spine', 'hips', [0, 0.08, 0]); J('head', 'spine', [0, 0.66, 0]);
  J('shoulderL', 'spine', [0.38, 0.52, 0]); J('elbowL', 'shoulderL', [0, -0.34, 0]); J('handL', 'elbowL', [0, -0.3, 0]);
  J('shoulderR', 'spine', [-0.38, 0.52, 0]); J('elbowR', 'shoulderR', [0, -0.34, 0]); J('handR', 'elbowR', [0, -0.3, 0]);
  J('legL', 'hips', [0.16, -0.04, 0]); J('kneeL', 'legL', [0, -0.42, 0]);
  J('legR', 'hips', [-0.16, -0.04, 0]); J('kneeR', 'legR', [0, -0.42, 0]);
  P('hips', cyl(0.3, 0.26, 0.24, 8, { s: 3 }), m.dark);
  P('hips', box(0.4, 0.5, 0.03, { s: 2 }), m.red, [0, -0.3, 0.2], [-0.06, 0, 0]);
  P('spine', cyl(0.42, 0.3, 0.62, 8, { s: 3 }), m.armor, [0, 0.32, 0], [0, 0, 0], [1, 1, 0.78]);
  P('spine', box(0.16, 0.16, 0.06), m.gold, [0, 0.4, 0.3]);
  P('head', sphere(0.26, 10, 8), m.armor, [0, 0.16, 0], [0, 0, 0], [1, 1.15, 1.05]);
  P('head', box(0.34, 0.06, 0.1), m.dark, [0, 0.18, 0.24]);
  for (const s of [-1, 1]) {
    P('head', box(0.07, 0.035, 0.03), m.eye, [s * 0.07, 0.185, 0.29]);
    const h = new THREE.Group(); h.position.set(s * 0.2, 0.3, 0); h.rotation.set(0, 0, -s * 0.9); rig.j.head.add(h);
    for (let i = 0; i < 4; i++) rig.part(h, cyl(0.07 - i * 0.015, 0.08 - i * 0.015, 0.16, 6, { s: 4 }), m.horn, [0, 0.07 + i * 0.13, -i * i * 0.02], [-i * 0.3, 0, 0]);
  }
  for (const [s, sd] of [[1, 'L'], [-1, 'R']]) {
    P('shoulder' + sd, sphere(0.22, 8, 6), m.armor, [s * 0.04, 0.04, 0], [0, 0, 0], [1.1, 0.8, 1.1]);
    for (let i = 0; i < 3; i++) P('shoulder' + sd, cone(0.05, 0.18, 4), m.bone, [s * (0.08 + i * 0.07), 0.2, 0], [0, 0, -s * 0.3]);
    P('shoulder' + sd, cyl(0.1, 0.09, 0.34, 6, { s: 3 }), m.dark, [0, -0.17, 0]);
    P('elbow' + sd, cyl(0.12, 0.1, 0.3, 6, { s: 3 }), m.armor, [0, -0.15, 0]);
    P('hand' + sd, box(0.16, 0.16, 0.16, { s: 5 }), m.dark, [0, -0.05, 0]);
    P('leg' + sd, cyl(0.14, 0.12, 0.42, 6, { s: 3 }), m.dark, [0, -0.2, 0]);
    P('knee' + sd, cyl(0.12, 0.15, 0.42, 6, { s: 3 }), m.armor, [0, -0.2, 0]);
    P('knee' + sd, box(0.22, 0.14, 0.34, { s: 4 }), m.dark, [0, -0.44, 0.06]);
  }
  // tower shield (left) and great mace (right)
  const sh = new THREE.Group(); rig.j.handL.add(sh); sh.position.set(0.1, -0.05, 0.1); sh.rotation.y = PI / 2;
  rig.part(sh, box(0.8, 1.15, 0.08, { s: 1.5 }), m.shield, [0, 0, 0.06]);
  rig.part(sh, box(0.86, 0.08, 0.1, { s: 4 }), m.gold, [0, 0.55, 0.06]); rig.part(sh, box(0.86, 0.08, 0.1, { s: 4 }), m.gold, [0, -0.55, 0.06]);
  rig.part(sh, sphere(0.14, 6, 5), m.bone, [0, 0.1, 0.13], [0, 0, 0], [1, 1.1, 0.6]);
  const mace = new THREE.Group(); rig.j.handR.add(mace); mace.position.set(0, -0.05, 0);
  rig.part(mace, cyl(0.035, 0.035, 1.1, 5), m.dark, [0, 0, 0.35], [PI / 2, 0, 0]);
  rig.part(mace, sphere(0.2, 6, 5, { flat: true }), m.armor, [0, 0, 0.95]);
  for (let i = 0; i < 6; i++) { const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][i]; rig.part(mace, cone(0.07, 0.2, 4), m.bone, [d[0] * 0.22, d[1] * 0.22, 0.95 + d[2] * 0.22], [d[2] ? PI / 2 * d[2] : 0, 0, d[0] ? -PI / 2 * d[0] : (d[1] < 0 ? PI : 0)]); }
  return { rig, root: rig.root, m, shield: sh, mace };
}

// ------------------------------------------------------------------ cat witch on a broom
export function witch() {
  const m = {
    fur: retroMat({ map: T.fur, rim: 0.55, spec: 0.2 }),
    hat: retroMat({ map: T.hatCloth, rim: 0.4, spec: 0.3, side: THREE.DoubleSide }),
    band: retroMat({ map: T.robe, color: 0x9040ff }),
    eye: retroMat({ color: 0x50ff40, emit: 1, fog: 0.3 }),
    pupil: retroMat({ color: 0x020206 }),
    wood: retroMat({ map: T.wood, color: 0xc09070 }),
    straw: retroMat({ map: T.straw, rim: 0.3 }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  J('broom', null, [0, 0, 0]); J('torso', 'broom', [0, 0.35, -0.05]); J('head', 'torso', [0, 0.5, 0.02]);
  J('armL', 'torso', [0.22, 0.32, 0]); J('armR', 'torso', [-0.22, 0.32, 0]); J('hat', 'head', [0, 0.32, 0]);
  J('tail', 'torso', [0, 0.02, -0.25]); J('tail2', 'tail', [0, 0, -0.3]);
  P('broom', cyl(0.04, 0.04, 2.0, 5, { s: 2 }), m.wood, [0, 0, 0.1], [PI / 2, 0, 0]);
  P('broom', cyl(0.06, 0.3, 0.7, 8, { s: 2 }), m.straw, [0, 0, -1.15], [-PI / 2, 0, 0]);
  P('broom', cyl(0.08, 0.08, 0.08, 6), m.band, [0, 0, -0.8], [PI / 2, 0, 0]);
  P('torso', sphere(0.3, 8, 7), m.fur, [0, 0.2, 0], [0, 0, 0], [1, 1.15, 0.9]);
  for (const s of [-1, 1]) P('torso', sphere(0.12, 6, 5), m.fur, [s * 0.16, -0.08, 0.2], [0, 0, 0], [1, 0.8, 1.6]);
  P('head', sphere(0.3, 10, 8), m.fur, [0, 0.05, 0], [0, 0, 0], [1.08, 0.95, 1]);
  for (const s of [-1, 1]) {
    P('head', cone(0.12, 0.26, 4), m.fur, [s * 0.2, 0.3, -0.02], [0, 0, -s * 0.35]);
    P('head', sphere(0.105, 8, 6), m.eye, [s * 0.12, 0.08, 0.24], [0, 0, s * 0.3], [1.2, 0.85, 0.5]);
    P('head', box(0.025, 0.13, 0.02), m.pupil, [s * 0.12, 0.08, 0.3]);
  }
  P('head', sphere(0.035, 5, 4), m.pupil, [0, -0.04, 0.29]);
  P('hat', cyl(0.62, 0.62, 0.04, 14, { s: 1 }), m.hat, [0, 0, 0]);
  P('hat', cyl(0.24, 0.3, 0.1, 10, { s: 2 }), m.band, [0, 0.06, 0]);
  const tip = new THREE.Group(); rig.j.hat.add(tip); tip.position.y = 0.1;
  rig.part(tip, cyl(0.16, 0.28, 0.5, 10, { s: 2 }), m.hat, [0, 0.25, 0]);
  const tip2 = new THREE.Group(); tip.add(tip2); tip2.position.y = 0.5; tip2.rotation.x = -0.6;
  rig.part(tip2, cyl(0.02, 0.16, 0.5, 8, { s: 2 }), m.hat, [0, 0.24, 0]);
  for (const sd of ['L', 'R']) P('arm' + sd, cyl(0.07, 0.06, 0.4, 6, { s: 3 }), m.fur, [0, -0.18, 0]);
  P('tail', cyl(0.05, 0.06, 0.32, 5, { s: 3 }), m.fur, [0, 0, -0.15], [PI / 2, 0, 0]);
  P('tail2', cyl(0.03, 0.05, 0.32, 5, { s: 3 }), m.fur, [0, 0, -0.15], [PI / 2, 0, 0]);
  rig.j.armL.rotation.set(-1.0, 0, 0.3); rig.j.armR.rotation.set(-1.0, 0, -0.3);
  return { rig, root: rig.root, m };
}

const BUILDERS = { scarecrow, cultist, skull, bat, knight, witch };
export function build(who) {
  const b = BUILDERS[who]();
  b.update = b.update || (() => {});
  return b;
}
