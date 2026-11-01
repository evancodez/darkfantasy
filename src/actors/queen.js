// The Marionette Queen: an eight-metre porcelain puppet hanging from glowing
// strings in the Big Top. You can't hurt the doll — you cut her strings.
//   Phase 1 (both arms strung): she slams a hand down where you stand (it sticks
//     to the floor for a moment: strike the glowing knot at its wrist), sweeps
//     an arm low across the ring (jump it or shield it), and throws stars (parry
//     one back into her face and she slumps, both wrists open).
//   Phase 2 (arms cut, hanging by the crown): she dives headlong at you and is
//     stuck with her crown on the floor (strike the crown knot), spins with her
//     limp arms flailing, and drops tin soldiers into the ring.
// Cut the crown string and she falls apart.
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat, Lights } from '../core/retro.js';
import { box, cyl, sphere, clean } from '../core/geo.js';
import { CT, makeFairMaterials, crescent, starSolid, valance } from '../world/carnival/assets.js';
import { StarShot } from './fairfolk.js';
import { spawn } from './enemies.js';
import audio from '../sound.js';

const PI = Math.PI, R = Math.random;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2; return d; };
const lathe = (pts, seg = 14, us = 2) => {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * us, uv.getY(i));
  return clean(g);
};
// stretch a unit-tall (y) mesh between two points
function span(mesh, a, b, thick = 1) {
  _a.copy(b).sub(a); const len = Math.max(0.001, _a.length());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, _a.divideScalar(len));
  mesh.scale.set(thick, len, thick);
}
// two-bone IK: elbow position for shoulder S, hand H, bone lengths a, b, pole direction
function elbow(S, H, a, b, pole, out) {
  _a.copy(H).sub(S); let d = _a.length();
  d = Math.min(Math.max(d, 0.01), (a + b) * 0.999); _a.normalize();
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a)).normalize();
  return out.copy(S).addScaledVector(_a, x).addScaledVector(_b, h);
}

const ARM_HP = 4, HEAD_HP = 6, PER_OPENING = 3;
const HEM = 0.9, SHOULDER_Y = 5.5, HEAD_Y = 6.55, CROWN_Y = 7.6, UPPER = 2.3, FORE = 2.1, BAR_Y = 17;

export function setupQueen(game, { group, center, radius = 14 }) {
  makeFairMaterials();
  const m = {
    gown: retroMat({ map: CT.starCloth, color: 0xd8c0ff, rim: 0.08, edge: 0.45, emit: 0.22, side: THREE.DoubleSide }),
    velvet: retroMat({ map: CT.velvet, rim: 0.1, edge: 0.35, emit: 0.12, side: THREE.DoubleSide }),
    face: retroMat({ map: CT.queenFace, spec: 0.35, shine: 14, rim: 0.12, edge: 0.25, emit: 0.1 }),
    porcelain: retroMat({ map: CT.porcelain, spec: 0.35, shine: 14, rim: 0.15, edge: 0.4, emit: 0.06 }),
    frill: retroMat({ map: CT.porcelain, color: 0xffe8f6, side: THREE.DoubleSide, rim: 0.2, emit: 0.1 }),
    gold: retroMat({ map: CT.gild, chrome: 0.45, env: T.goldEnv, spec: 0.35, emit: 0.2, edge: 0.3 }),
    hair: retroMat({ map: CT.velvet, color: 0x5a7aff, rim: 0.3, edge: 0.4 }),
    string: retroMat({ color: 0xfff0d8, emit: 1, fog: 0.2 }),
    knot: retroMat({ color: 0xff6ab8, emit: 1, fog: 0.2 }),
    gem: retroMat({ color: 0x40f0d8, emit: 1, fog: 0.3 }),
    warn: retroMat({ color: 0xff3a8a, emit: 1, additive: true, opacity: 0.6, side: THREE.DoubleSide, fog: 0.2 }),
  };
  const root = new THREE.Group(); group.add(root); root.visible = false;
  const body = new THREE.Group(); root.add(body);
  const add = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => { const me = new THREE.Mesh(geo, mat); me.position.set(...pos); me.rotation.set(...rot); me.scale.set(...scl); parent.add(me); return me; };
  // gown: a bell skirt of star cloth over a frilled petticoat, a velvet bodice
  const skirt = add(body, lathe([[0.02, 4.25], [0.72, 4.2], [0.95, 3.6], [1.5, 2.6], [2.2, 1.4], [2.75, 0.35], [2.85, 0.05], [0.02, 0.05]], 18, 6), m.gown, [0, HEM - 0.05, 0]);
  add(body, valance(2.85, 18, 0.45, { flare: 0.4 }), m.frill, [0, HEM + 0.1, 0]);
  add(body, valance(2.2, 14, 0.35, { flare: 0.3 }), m.gold, [0, HEM + 1.4, 0]);
  add(body, lathe([[0.7, 0], [0.62, 0.45], [0.78, 0.9], [0.95, 1.25], [0.6, 1.4], [0.3, 1.5]], 14, 3), m.velvet, [0, HEM + 4.1, 0]);
  add(body, cyl(0.74, 0.74, 0.12, 14), m.gold, [0, HEM + 4.18, 0]);
  for (let i = 0; i < 5; i++) add(body, sphere(0.07, 6, 5), m.gem, [0, HEM + 4.4 + i * 0.2, 0.68 + Math.sin(i * 0.7) * 0.1]);
  for (const s of [-1, 1]) add(body, sphere(0.36, 8, 6), m.velvet, [s * 1.0, SHOULDER_Y - 0.05, 0], [0, 0, 0], [1.1, 0.8, 1]);
  // neck and ruff
  const neck = new THREE.Group(); neck.position.y = SHOULDER_Y + 0.25; body.add(neck);
  add(neck, cyl(0.22, 0.28, 0.9, 8), m.porcelain, [0, 0.4, 0]);
  add(neck, lathe([[0.2, 0], [0.9, 0.12], [0.55, 0.22], [1.05, 0.34], [0.25, 0.42]], 18, 4), m.frill, [0, 0.05, 0]);
  const head = new THREE.Group(); head.position.y = HEAD_Y - SHOULDER_Y + 0.15; head.scale.setScalar(1.45); neck.add(head);
  add(head, clean(new THREE.SphereGeometry(0.75, 18, 12)), m.face, [0, 0, 0], [0, 0, 0], [1, 1.12, 1]);
  // hair: a tall blue-violet pompadour and side curls
  for (const [x, y, z, r] of [[0, 0.5, -0.2, 0.62], [0.42, 0.25, -0.3, 0.42], [-0.42, 0.25, -0.3, 0.42], [0, 0.85, -0.35, 0.45], [0.55, -0.25, -0.15, 0.24], [-0.55, -0.25, -0.15, 0.24]]) add(head, sphere(r, 9, 7), m.hair, [x, y, z]);
  // crescent-moon crown with star finials
  const crown = new THREE.Group(); crown.position.y = 0.95; head.add(crown);
  add(crown, cyl(0.55, 0.62, 0.22, 12, { open: true }), m.gold, [0, 0, -0.05]);
  add(crown, crescent(0.6, 0.12), m.gold, [0, 0.55, -0.05], [0, 0, -0.5]);
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.45; add(crown, starSolid(0.14, 0.06, 0.05), m.gold, [Math.sin(a) * 0.6, 0.22 + Math.cos(a * 2) * 0.05, Math.cos(a) * 0.6 - 0.05], [0, a, 0]); }
  add(crown, sphere(0.1, 6, 5), m.gem, [0, 0.1, 0.62]);
  // arms: segments placed every frame between IK joints
  const arms = [1, -1].map(side => {
    const upper = add(root, cyl(0.36, 0.3, 1, 8, { s: 1 }), m.porcelain);
    const fore = add(root, cyl(0.3, 0.22, 1, 8, { s: 1 }), m.porcelain);
    const ball = [add(root, sphere(0.42, 8, 6), m.gold), add(root, sphere(0.34, 8, 6), m.gold), add(root, sphere(0.27, 8, 6), m.gold)];
    const hand = new THREE.Group(); root.add(hand);
    add(hand, lathe([[0.2, -0.05], [0.55, -0.32], [0.38, -0.36], [0.62, -0.6], [0.25, -0.62]], 12, 3), m.frill);
    add(hand, box(0.62, 0.65, 0.22, { s: 2 }), m.porcelain, [0, 0.35, 0]);
    for (let i = 0; i < 4; i++) { add(hand, cyl(0.07, 0.05, 0.75, 5), m.porcelain, [-0.2 + i * 0.13, 0.95 - Math.abs(i - 1.5) * 0.06, 0]); add(hand, cyl(0, 0.06, 0.22, 5), m.gold, [-0.2 + i * 0.13, 1.42 - Math.abs(i - 1.5) * 0.06, 0]); }
    add(hand, cyl(0.07, 0.05, 0.5, 5), m.porcelain, [side * 0.3, 0.45, 0.08], [0, 0, side * 0.6]);
    const knot = add(root, sphere(0.28, 8, 6), m.knot);
    return { side, upper, fore, ball, hand, knot, H: new THREE.Vector3(), V: new THREE.Vector3(), tgt: new THREE.Vector3(), S: new THREE.Vector3(), E: new THREE.Vector3(), cut: false, hp: ARM_HP, stuck: 0, pin: null };
  });
  // the control bar above and the strings
  const bar = new THREE.Group(); group.add(bar); bar.visible = false;
  add(bar, box(7, 0.35, 0.35, { s: 1 }), m.gold); add(bar, box(0.35, 0.35, 4.4, { s: 1 }), m.gold);
  for (const [x, z] of [[3.5, 0], [-3.5, 0], [0, 2.2], [0, -2.2]]) add(bar, sphere(0.3, 6, 5), m.gold, [x, 0, z]);
  const strings = { L: add(group, box(1, 1, 1), m.string), R: add(group, box(1, 1, 1), m.string), head: add(group, box(1, 1, 1), m.string), back: add(group, box(1, 1, 1), m.string) };
  const headKnot = add(root, sphere(0.34, 8, 6), m.knot);
  const warn = add(group, clean(new THREE.RingGeometry(1.6, 2.4, 24).rotateX(-PI / 2)), m.warn); warn.visible = false;
  const light = Lights.add(center.clone().setY(center.y + 6), 0xff7ac0, 0, 14, { dynamic: true });
  Object.values(strings).forEach(s => (s.visible = false));

  // ---------------------------------------------------------------- state
  const Q = {
    root, pos: center.clone(), y: 14, vy: 0, yaw: 0, spin: 0, state: 'waiting', t: 0, phase: 1, cool: 2, alive: true, active: false,
    headHp: HEAD_HP, headCut: false, openHits: 0, slumpK: 0, diveK: 0, focus: new THREE.Vector3(), foes: [], summonT: 0, barPos: center.clone().setY(BAR_Y), lookYaw: 0, flash: 0,
  };
  const g = game, ARENA = center;
  // targets: the two wrist knots, the crown knot, and her face (for parried stars)
  const knotTarget = (arm) => ({
    pos: new THREE.Vector3(), radius: 0.9, height: 1.3, alive: true, noAim: true, stompable: false, aimHeight: 0.6, big: true,
    onHit(hit) {
      if (arm.cut || Q.state === 'dying') return 'ignored';
      if (hit.kind === 'reflect') return faceT.onHit(hit);
      if (!(arm.stuck > 0 || Q.state === 'stunned')) { audio.play('knightClang'); return 'blocked'; }
      const dmg = Math.min(hit.dmg >= 2 ? 2 : 1, PER_OPENING - Q.openHits);
      arm.hp -= dmg; Q.openHits += dmg; Q.flash = 1; audio.play('queenHurt', { volume: 0.6 });
      g.fx.sparks(arm.knot.position, 14, 0xff9ad0, 6);
      if (arm.hp <= 0) cutString(arm);
      else if (Q.openHits >= PER_OPENING) jerkFree();
      return 'hit';
    },
  });
  for (const arm of arms) { arm.target = knotTarget(arm); g.addTarget(arm.target); }
  const crownT = {
    pos: new THREE.Vector3(), radius: 1.0, height: 1.4, alive: true, noAim: true, stompable: false, aimHeight: 0.6, big: true,
    onHit(hit) {
      if (Q.headCut || Q.phase < 2 || Q.state === 'dying') return 'ignored';
      if (hit.kind === 'reflect') return faceT.onHit(hit);
      if (!(Q.state === 'stuck' || Q.state === 'stunned')) { audio.play('knightClang'); return 'blocked'; }
      const dmg = Math.min(hit.dmg >= 2 ? 2 : 1, PER_OPENING - Q.openHits);
      Q.headHp -= dmg; Q.openHits += dmg; Q.flash = 1; audio.play('queenHurt');
      g.fx.sparks(headKnot.position, 16, 0xff9ad0, 7);
      if (Q.headHp <= 0) cutHead();
      else if (Q.openHits >= PER_OPENING) jerkFree();
      return 'hit';
    },
  };
  g.addTarget(crownT);
  const faceT = {
    pos: new THREE.Vector3(), radius: 1.2, height: 1.6, alive: true, noAim: true, stompable: false, aimHeight: 0.8,
    onHit(hit) {
      if (hit.kind !== 'reflect' || Q.state === 'dying') return 'ignored';
      Q.flash = 1; audio.play('queenHurt'); g.hud.callout('Stunned!', 'small');
      setState('stunned');
      return 'hit';
    },
  };
  g.addTarget(faceT);
  const setTargets = (on) => { for (const t of [arms[0].target, arms[1].target, crownT, faceT]) t.alive = on; arms.forEach(a => (a.target.alive = on && !a.cut)); crownT.alive = on && !Q.headCut; };
  setTargets(false);

  function setState(s) { Q.state = s; Q.t = 0; Q.hit = false; if (s === 'stunned' || s === 'stuck') Q.openHits = 0; }
  function frac() { return (arms.reduce((n, a) => n + (a.cut ? 0 : a.hp), 0) + (Q.headCut ? 0 : Q.headHp)) / (ARM_HP * 2 + HEAD_HP); }
  // enough punishment for one opening: she yanks herself back up on her strings
  function jerkFree() {
    Q.openHits = 0; audio.play('queenLaugh', { volume: 0.6, pitch: 1.2 }); g.shake(0.25);
    for (const a of arms) { a.stuck = 0; a.pin = null; a.V.y += 14; }
    Q.plantAt = null;
    if (Q.state === 'stunned' || Q.state === 'stuck' || Q.state === 'slam') { setState('recover'); Q.cool = 1.0; }
  }
  function cutString(arm) {
    arm.cut = true; arm.stuck = 0; arm.target.alive = false;
    strings[arm.side > 0 ? 'L' : 'R'].visible = false;
    audio.play('stringSnap'); g.hitstop(0.12); g.shake(0.5); g.flash(0.4, 0xffc0e0);
    g.fx.pop(arm.knot.position, 0xffa0d8, 26);
    g.props.burst(arm.knot.position.clone(), 6);
    g.props.heart(arm.H.clone().setY(floorY + 0.2));
    if (arms.every(a => a.cut)) {
      Q.phase = 2; g.hud.callout('Her arms fall limp!', 'small');
      setTimeout(() => audio.play('queenLaugh', { pitch: 0.8 }), 600);
      Q.summonT = 1.5; setState('recover');
    } else { g.hud.callout('String cut!', 'small'); setState('recover'); }
  }
  function cutHead() {
    Q.headCut = true; crownT.alive = false; strings.head.visible = false; strings.back.visible = false;
    audio.play('stringSnap'); audio.play('queenHurt', { pitch: 0.7 });
    g.hitstop(0.2); g.shake(0.8); g.flash(0.7, 0xffd0f0);
    setState('dying');
  }

  // ---------------------------------------------------------------- helpers
  const toLocal = (x, y, z, out) => out.set(Q.pos.x + Math.sin(Q.yaw) * z + Math.cos(Q.yaw) * x, Q.y + y, Q.pos.z + Math.cos(Q.yaw) * z - Math.sin(Q.yaw) * x);
  const shoulder = (arm, out) => toLocal(arm.side * 1.15, SHOULDER_Y, 0, out);
  const P = () => g.player.pos;
  const floorY = ARENA.y;
  const inRing = (v, r = radius - 3) => { const dx = v.x - ARENA.x, dz = v.z - ARENA.z, d = Math.hypot(dx, dz); if (d > r) { v.x = ARENA.x + dx / d * r; v.z = ARENA.z + dz / d * r; } return v; };
  function pickAttack() {
    const live = arms.filter(a => !a.cut);
    const r = R();
    if (Q.phase === 1) {
      if (r < 0.45) return startSlam(live[Math.floor(R() * live.length)]);
      if (r < 0.75) return startSweep(live[Math.floor(R() * live.length)]);
      return startVolley(3);
    }
    if (r < 0.5) return startDive();
    if (r < 0.75) return startSpin();
    return startVolley(5);
  }
  function startSlam(arm) { Q.arm = arm; Q.aim = inRing(P().clone().setY(floorY)); setState('slamRaise'); audio.play('queenLaugh', { volume: 0.5, pitch: 1.2 }); }
  function startSweep(arm) { Q.arm = arm; setState('sweepWind'); audio.play('jackCrank', { pitch: 0.6 }); }
  function startVolley(n) { Q.shots = n; setState('volley'); }
  function startDive() { setState('diveRise'); audio.play('queenLaugh', { volume: 0.7 }); }
  function startSpin() { setState('spin'); audio.play('queenLaugh', { pitch: 1.3 }); }

  // ---------------------------------------------------------------- update
  function update(dt) {
    if (!Q.active) return;
    const p = P(), pl = g.player;
    Q.t += dt; Q.flash = Math.max(0, Q.flash - dt * 4); Q.cool -= dt;
    for (const a of arms) a.stuck = Math.max(0, a.stuck - dt);
    let hover = 0.25 + Math.sin(g.time * 1.3) * 0.25, wantY = 0, faceRate = 3;
    Q.plant = null;
    const toP = _c.set(p.x - Q.pos.x, 0, p.z - Q.pos.z), dP = toP.length();
    const yawToP = Math.atan2(toP.x, toP.z);
    // default hand rest: dangling a little out to the sides, swaying
    for (const a of arms) {
      if (a.cut) { shoulder(a, a.tgt); a.tgt.y -= 3.9; a.tgt.x += Math.sin(g.time * 1.7 + a.side) * 0.5 + (Q.state === 'spin' ? Math.cos(Q.yaw + a.side * PI / 2) * 3.4 : 0); a.tgt.z += Math.cos(g.time * 1.3) * 0.4 + (Q.state === 'spin' ? -Math.sin(Q.yaw + a.side * PI / 2) * 3.4 : 0); if (Q.state === 'spin') a.tgt.y += 2.4; continue; }
      if (a.pin) { a.tgt.copy(a.pin); continue; }
      toLocal(a.side * 2.4, 3.2 + Math.sin(g.time * 1.6 + a.side) * 0.35, 1.3, a.tgt);
    }
    switch (Q.state) {
      case 'descend':
        Q.y += (hover - Q.y) * (1 - Math.exp(-dt * 1.8)); Q.vy = 0;
        if (Q.t > 2.6) { setState('idle'); Q.cool = 1.2; g.hud.boss('The Marionette Queen', frac()); }
        break;
      case 'idle': case 'recover': {
        // drift to a spot a few metres from you, always facing you
        const want = _a.copy(p).addScaledVector(toP.normalize(), -6.5); inRing(want);
        Q.pos.x += (want.x - Q.pos.x) * (1 - Math.exp(-dt * 0.9)); Q.pos.z += (want.z - Q.pos.z) * (1 - Math.exp(-dt * 0.9));
        if (Q.state === 'recover' && Q.t > 1.2) setState('idle');
        if (Q.state === 'idle' && Q.cool <= 0 && !pl.dead) {
          Q.summonT -= 1;
          if (Q.phase === 2 && Q.summonT <= 0 && Q.foes.filter(f => f.alive).length < 2) { setState('summon'); Q.summonT = 3; }
          else pickAttack();
        }
        break;
      }
      case 'slamRaise': {
        const a = Q.arm;
        Q.aim.lerp(inRing(_a.copy(p).setY(floorY)), 1 - Math.exp(-dt * (Q.t < 0.55 ? 3 : 0.4)));
        a.pin = (a.pin || new THREE.Vector3()).copy(Q.aim).setY(floorY + 6.5);
        warn.visible = true; warn.position.copy(Q.aim).setY(floorY + 0.06); warn.scale.setScalar(0.6 + Q.t * 0.6);
        a.glow = Math.sin(Q.t * 30) > 0 ? 1 : 0.4;
        faceRate = 5;
        if (Q.t > 0.95) { setState('slam'); audio.play('queenSwipe', { pitch: 0.7 }); }
        break;
      }
      case 'slam': {
        const a = Q.arm;
        a.pin.copy(Q.aim).setY(floorY + 0.35);
        if (Q.t > 0.12 && !Q.hit) {
          Q.hit = true; warn.visible = false;
          audio.play('queenSlam'); g.shake(0.7); g.fx.rings.add(Q.aim.clone().setY(floorY + 0.1), { color: 0xff8ad0, r0: 0.5, r1: 4, life: 0.4 });
          g.fx.puff(Q.aim, 14, 0x8a6aa0, 0.8);
          const hd = Math.hypot(p.x - Q.aim.x, p.z - Q.aim.z);
          if (hd < 2.6 && p.y < floorY + 1.2) { const r = pl.receive({ dmg: 1, from: Q.aim.clone(), kind: 'melee', source: { onParried: () => setState('stunned') } }); }
          a.stuck = 2.8; Q.openHits = 0;
        }
        if (Q.t > 0.12 + 2.8) { a.pin = null; Q.hit = false; setState('recover'); Q.cool = 1.4; }
        break;
      }
      case 'sweepWind': {
        const a = Q.arm;
        faceRate = 6;
        a.pin = (a.pin || new THREE.Vector3()); toLocal(a.side * 5.2, 1.4, -1.6, a.pin);
        a.glow = Math.sin(Q.t * 30) > 0 ? 1 : 0.4;
        if (Q.t > 0.8) { setState('sweep'); Q.hit = false; audio.play('queenSwipe'); }
        break;
      }
      case 'sweep': {
        // the hand scythes round in front of her, knee-high
        const a = Q.arm, k = Math.min(1, Q.t / 0.55), ang = a.side * (1.9 - k * 3.8);
        faceRate = 0;
        toLocal(Math.sin(ang) * 5.8, 0.9, Math.cos(ang) * 5.8, a.pin);
        if (!Q.hit && a.H.distanceTo(_a.copy(p).setY(p.y + 0.6)) < 1.7 && p.y < floorY + 1.5) {
          Q.hit = true;
          pl.receive({ dmg: 1, from: Q.pos.clone(), kind: 'melee', source: { onParried: () => setState('stunned') } });
        }
        if (Q.t > 0.75) { a.pin = null; setState('recover'); Q.cool = 1.2; }
        break;
      }
      case 'volley': {
        faceRate = 6;
        const live = arms.filter(a => !a.cut);
        Q.glow = 1;
        if (Q.t > 0.55 && Q.shots > 0 && Q.t > 0.55 + (Q.fired || 0) * 0.38) {
          Q.fired = (Q.fired || 0) + 1; Q.shots--;
          const from = live.length ? live[Q.fired % live.length].H.clone() : headKnot.position.clone();
          const to = _a.copy(p).setY(p.y + 0.9);
          new StarShot(g, from, to.sub(from).normalize().multiplyScalar(11), { owner: faceT, homing: 0.6, life: 4, reflectDmg: 1, kb: 3 });
          audio.play('starShot');
        }
        if (Q.shots <= 0 && Q.t > 0.55 + (Q.fired || 0) * 0.38 + 0.6) { Q.fired = 0; Q.glow = 0; setState('recover'); Q.cool = 1.6; }
        break;
      }
      case 'stunned':
        // slumped: both wrists drop to the floor beside her, the head lolls
        faceRate = 0; Q.glow = 0;
        for (const a of arms) if (!a.cut) { a.pin = (a.pin || new THREE.Vector3()); toLocal(a.side * 3.0, 0.35 - Q.y, 2.0, a.pin); a.pin.y = floorY + 0.35; }
        wantY = -1.2;
        // hanging only by the crown, she sags head-first to the floor
        if (Q.phase === 2) Q.plant = Q.plantAt || (Q.plantAt = headKnot.getWorldPosition(new THREE.Vector3()).setY(floorY + 1.1));
        if (Q.t > 2.8) { for (const a of arms) a.pin = null; Q.plantAt = null; setState('recover'); Q.cool = 1.0; }
        break;
      case 'diveRise':
        faceRate = 6; wantY = 3.5; Q.glow = 1;
        Q.aim = inRing(_a.copy(p).setY(floorY), radius - 2).clone();
        warn.visible = true; warn.position.copy(Q.aim).setY(floorY + 0.06); warn.scale.setScalar(1.2 + Q.t * 0.5);
        if (Q.t > 1.0) { setState('dive'); Q.from = Q.pos.clone(); Q.yaw = Math.atan2(Q.aim.x - Q.pos.x, Q.aim.z - Q.pos.z); audio.play('queenSwipe', { pitch: 0.6 }); }
        break;
      case 'dive': {
        // she plunges head first; the crown hits the floor where you stood
        faceRate = 0; Q.glow = 0;
        const k = Math.min(1, Q.t / 0.45);
        Q.diveK = k * k; wantY = 3.5;
        Q.plant = Q.aim; Q.plantK = k * k;
        if (k >= 1 && !Q.hit) {
          Q.hit = true; warn.visible = false;
          audio.play('queenSlam', { pitch: 0.8 }); g.shake(0.9); g.fx.rings.add(Q.aim.clone().setY(floorY + 0.1), { color: 0xff8ad0, r0: 0.5, r1: 5, life: 0.45 });
          g.fx.puff(Q.aim, 18, 0x8a6aa0, 0.9);
          if (Math.hypot(p.x - Q.aim.x, p.z - Q.aim.z) < 3.2 && p.y < floorY + 1.4) pl.receive({ dmg: 1, from: Q.aim.clone(), kind: 'melee', unblockable: true });
          setState('stuck'); Q.hit = false;
        }
        break;
      }
      case 'stuck':
        faceRate = 0; Q.diveK = 1; Q.plant = Q.aim; Q.plantK = 1;
        if (Q.t > 2.9) { setState('recover'); Q.cool = 1.4; }
        break;
      case 'spin': {
        Q.spin += dt * 9;
        const want = _a.copy(p); inRing(want);
        _b.copy(want).sub(Q.pos).setY(0); const l = _b.length();
        if (l > 0.1) Q.pos.addScaledVector(_b.normalize(), Math.min(l, dt * 3.2));
        if (dP < 3.6 && p.y < floorY + 2 && !Q.hit) { Q.hit = true; pl.receive({ dmg: 1, from: Q.pos.clone(), kind: 'melee' }); }
        if (Q.t > 0.8) Q.hit = false;
        if (Math.floor(Q.t * 2.2) !== Math.floor((Q.t - dt) * 2.2)) audio.play('queenSwipe', { volume: 0.5, pitch: 1.4 });
        if (Q.t > 3.4) { Q.spin = 0; setState('recover'); Q.cool = 1.5; }
        break;
      }
      case 'summon':
        faceRate = 2; Q.glow = 1;
        if (Q.t > 0.6 && !Q.summoned) {
          Q.summoned = true; audio.play('queenLaugh');
          for (const s of [-1, 1]) {
            const at = inRing(_a.copy(p).add(_b.set(Math.cos(Q.yaw) * s * 5, 0, -Math.sin(Q.yaw) * s * 5)), radius - 2).clone().setY(floorY + 0.3);
            const foe = spawn(g, 'tin', at, { parent: group, aggro: 40, yaw: Q.yaw });
            Q.foes.push(foe); g.fx.pop(at.clone().setY(at.y + 1.2), 0xff7ac0, 18); audio.play('confetti', { volume: 0.6 });
          }
        }
        if (Q.t > 1.4) { Q.summoned = false; Q.glow = 0; setState('recover'); Q.cool = 2.2; }
        break;
      case 'dying':
        die(dt);
        break;
    }
    if (Q.state !== 'dying') {
      if (!Q.plant && Q.state !== 'descend') { Q.vy += ((wantY + hover) - Q.y) * 30 * dt - Q.vy * 8 * dt; Q.y += Q.vy * dt; }
      if (Q.state !== 'spin' && Q.state !== 'dive' && Q.state !== 'stuck' && faceRate) Q.yaw += angDiff(Q.yaw, yawToP) * (1 - Math.exp(-dt * faceRate));
      const sag = Q.state === 'stunned' && Q.phase === 2;
      if (sag) Q.diveK = Math.min(1, Q.diveK + dt * 3);
      else if (Q.state !== 'dive' && Q.state !== 'stuck') Q.diveK = Math.max(0, Q.diveK - dt * 1.5);
      if (!['slamRaise', 'sweepWind', 'volley', 'diveRise', 'summon'].includes(Q.state)) { for (const a of arms) a.glow = 0; }
    }
    pose(dt);
    if (Q.state !== 'dying') g.hud.boss(undefined, frac());
  }

  // ---------------------------------------------------------------- pose the puppet
  const pole = new THREE.Vector3();
  function pose(dt) {
    root.position.set(Q.pos.x, Q.y, Q.pos.z);
    if (Q.plant) {
      // pin her crown to a point on the floor: measure where it is and slide her there
      body.rotation.set(Q.diveK * 1.9, Q.yaw, 0); body.position.y = Q.diveK * 1.5;
      root.updateMatrixWorld(true);
      const cw = crown.localToWorld(_a.set(0, 0.7, 0)), k = Q.state === 'dive' ? Q.plantK : 1 - Math.exp(-dt * 14);
      Q.pos.x += (Q.plant.x - cw.x) * k; Q.pos.z += (Q.plant.z - cw.z) * k; Q.y += (Q.plant.y - cw.y + (Q.state === 'dive' ? 0 : 0.2)) * k; Q.vy = 0;
      root.position.set(Q.pos.x, Q.y, Q.pos.z);
    }
    // tip over head-first when diving; slump when stunned
    Q.slumpK += ((Q.state === 'stunned' ? 1 : 0) - Q.slumpK) * (1 - Math.exp(-dt * 6));
    body.rotation.set(Q.diveK * 1.9 + Q.slumpK * 0.35 + Math.sin(g.time * 1.1) * 0.03, Q.yaw + Q.spin, Math.sin(g.time * 0.9) * 0.05);
    body.position.y = Q.diveK * 1.5;
    neck.rotation.set(Q.slumpK * 0.6, 0, Math.sin(g.time * 0.7) * 0.18 + (Math.sin(g.time * 0.37) > 0.92 ? 0.35 : 0));
    root.updateMatrixWorld(true);
    // arms (positions are world-space; root only carries the group transform)
    const inv = _m.copy(root.matrixWorld).invert();
    for (const a of arms) {
      const sh = body.localToWorld(_a.set(a.side * 1.15, SHOULDER_Y, 0));
      a.S.copy(sh);
      // hands chase their targets on a spring: weighty, puppet-like
      const fast = a.pin && (Q.state === 'slam' || Q.state === 'sweep'), w = fast ? 38 : a.pin ? 13 : 5;
      if (!a.init) { a.init = true; a.H.copy(a.tgt); a.V.set(0, 0, 0); }
      a.V.addScaledVector(_b.copy(a.tgt).sub(a.H), w * w * dt).multiplyScalar(Math.exp(-dt * w * (a.pin ? 1.8 : 1.1)));
      a.H.addScaledVector(a.V, dt);
      if (a.H.y < floorY + 0.3) a.H.y = floorY + 0.3;
      pole.set(Math.cos(Q.yaw) * a.side, -0.7, -Math.sin(Q.yaw) * a.side).add(_b.set(-Math.sin(Q.yaw), 0, -Math.cos(Q.yaw)).multiplyScalar(0.8));
      elbow(a.S, a.H, UPPER, FORE, pole, a.E);
      const lS = a.S.clone().applyMatrix4(inv), lE = a.E.clone().applyMatrix4(inv), lH = a.H.clone().applyMatrix4(inv);
      span(a.upper, lS, lE); span(a.fore, lE, lH);
      a.ball[0].position.copy(lS); a.ball[1].position.copy(lE); a.ball[2].position.copy(lH);
      a.hand.position.copy(lH); a.hand.quaternion.setFromUnitVectors(UP, _b.copy(lH).sub(lE).normalize());
      a.knot.position.copy(a.H); a.knot.position.applyMatrix4(inv); a.knot.position.y += 0.05;
      a.knot.visible = !a.cut;
      const vul = !a.cut && (a.stuck > 0 || Q.state === 'stunned');
      a.knot.scale.setScalar(vul ? 1.3 + Math.sin(g.time * 14) * 0.25 : 1);
      a.target.pos.copy(a.H).setY(a.H.y - 0.6);
      a.target.noAim = !vul;
      // string from the wrist up to the bar
      if (!a.cut) span(strings[a.side > 0 ? 'L' : 'R'], a.H, barEnd(a.side > 0 ? 'L' : 'R'), 0.05);
    }
    // crown knot, face target, the head and back strings
    const crownW = crown.localToWorld(_a.set(0, 0.7, 0)).clone();
    headKnot.position.copy(crownW).applyMatrix4(inv); headKnot.visible = !Q.headCut;
    const headVul = Q.phase === 2 && (Q.state === 'stuck' || Q.state === 'stunned');
    headKnot.scale.setScalar(headVul ? 1.4 + Math.sin(g.time * 14) * 0.3 : 1);
    crownT.pos.copy(crownW).setY(crownW.y - 0.7); crownT.noAim = !headVul;
    head.getWorldPosition(faceT.pos); faceT.pos.y -= 0.8;
    Q.focus.copy(Q.pos).setY(floorY + Math.max(2.5, Q.y + 4.5));
    if (!Q.headCut) { span(strings.head, crownW, barEnd('head'), 0.06); span(strings.back, body.localToWorld(_b.set(0, SHOULDER_Y - 0.2, -0.6)), barEnd('back'), 0.05); }
    // the bar trails above her
    Q.barPos.x += (Q.pos.x - Q.barPos.x) * (1 - Math.exp(-dt * 2)); Q.barPos.z += (Q.pos.z - Q.barPos.z) * (1 - Math.exp(-dt * 2));
    if (Q.state !== 'dying') Q.barPos.y += (floorY + BAR_Y + Q.y * 0.4 - Q.barPos.y) * (1 - Math.exp(-dt * 3));
    bar.position.copy(Q.barPos); bar.rotation.set(Math.sin(g.time * 0.8) * 0.06 + Q.diveK * 0.3, Q.yaw + Q.spin * 0.3, Math.sin(g.time * 0.6) * 0.08);
    bar.updateMatrixWorld(true);
    // glow and flash
    const gl = Math.max(Q.flash, Q.glow ? 0.25 + Math.sin(g.time * 20) * 0.15 : 0);
    for (const mm of [m.porcelain, m.face, m.gown, m.velvet]) mm.uniforms.uFlash.value = Q.flash * 0.6;
    m.gem.uniforms.uColor.value.setHex(Q.glow ? 0xffffff : 0x40f0d8);
    for (const a of arms) a.knot.material = a.glow ? m.gem : m.knot;
    light.pos.copy(Q.focus); light.intensity = 0.4 + gl * 1.6;
  }
  const barLocal = { L: [3.5, 0, 0], R: [-3.5, 0, 0], head: [0, 0, 2.2], back: [0, 0, -2.2] };
  function barEnd(k) { return bar.localToWorld(_c.set(...barLocal[k])).clone(); }

  // ---------------------------------------------------------------- defeat
  function die(dt) {
    Q.dieT = (Q.dieT || 0) + dt;
    const k = Math.min(1, Q.dieT / 1.4);
    if (!Q.fell) { Q.fell = true; audio.play('puppetClatter'); g.hud.boss(null); setTargets(false); g.player.cam.focus = null; for (const f of Q.foes) if (f.alive) f.onHit({ dmg: 99, from: f.pos }); }
    // she drops in a heap; the head rolls loose; the bar crashes down
    Q.y += (-HEM - 0.2 - Q.y) * (1 - Math.exp(-dt * 6));
    body.rotation.x += (1.35 - body.rotation.x) * (1 - Math.exp(-dt * 3));
    body.scale.y = 1 - k * 0.45;
    for (const a of arms) { a.cut = true; a.pin = null; strings[a.side > 0 ? 'L' : 'R'].visible = false; }
    Q.barPos.y = Math.max(floorY + 0.4, Q.barPos.y - dt * (6 + Q.dieT * 20));
    if (Q.barPos.y <= floorY + 0.45 && !Q.barDown) { Q.barDown = true; audio.play('queenSlam', { pitch: 0.7 }); g.shake(0.6); g.fx.puff(Q.barPos, 14, 0x8a6aa0, 0.9); }
    if (Q.dieT > 0.3 && Q.dieT < 2.4 && R() < dt * 20) g.fx.sparks(_a.copy(Q.pos).setY(floorY + 1 + R() * 4).add(_b.set(R() * 4 - 2, 0, R() * 4 - 2)), 6, [0xff7ac0, 0x40e0c8, 0xffd060][Math.floor(R() * 3)], 7);
    if (Q.dieT > 2.6 && !Q.burst) {
      Q.burst = true; audio.play('confetti'); g.flash(0.6, 0xffe0f0);
      g.fx.pop(_a.copy(Q.pos).setY(floorY + 2), 0xff9ad0, 40); g.props.burst(_a.clone(), 30);
    }
    if (Q.dieT > 4.2 && !Q.done) { Q.done = true; Q.active = false; g.onFinalVictory?.(); }
  }

  // ---------------------------------------------------------------- control
  Q.begin = () => {
    if (Q.active || Q.dead) return;
    Q.active = true; root.visible = true; bar.visible = true;
    Q.y = 12; Q.vy = 0; Q.pos.copy(ARENA).add(_a.set(0, 0, -4)); Q.yaw = 0;
    for (const a of arms) { if (!a.cut) a.hp = ARM_HP; a.init = false; a.pin = null; a.stuck = 0; strings[a.side > 0 ? 'L' : 'R'].visible = !a.cut; }
    Q.diveK = 0; Q.plantAt = null; Q.spin = 0;
    if (!Q.headCut) Q.headHp = HEAD_HP;
    strings.head.visible = strings.back.visible = true;
    setTargets(true);
    setState('descend');
    g.player.cam.focus = Q.focus;
    audio.music('bigtop'); audio.play('curtain'); setTimeout(() => audio.play('queenLaugh'), 900);
    g.hud.area('The Marionette Queen', 'cut her strings');
    setTimeout(() => g.hud.hint('Strike the glowing knots when a hand is stuck to the floor — or parry her stars back at her.', 6), 2600);
    g.hud.boss('The Marionette Queen', frac());
  };
  // after a fall: she rises back into the rafters (cut strings stay cut)
  Q.reset = () => {
    if (!Q.active || Q.state === 'dying') return;
    Q.active = false; root.visible = false; bar.visible = false; warn.visible = false;
    Object.values(strings).forEach(s => (s.visible = false));
    setTargets(false); g.hud.boss(null); g.player.cam.focus = null;
    for (const f of Q.foes) if (f.alive) { f.alive = false; f.removed = true; f.root.removeFromParent(); g.removeTarget(f); }
    Q.foes = []; Q.state = 'waiting';
  };
  Q.update = update; Q.arms = arms; Q.crownT = crownT;
  return Q;
}
