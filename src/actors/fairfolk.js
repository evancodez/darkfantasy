// The Midnight Carnival's folk:
//   Star-hat imps — hop about, giggle, and lob spinning stars (parry them back).
//   Jack-in-the-boxes — crank a tune, then spring out at you; strike the jester
//     while it bobs on its spring (the box itself is armoured).
//   Tin soldiers — wind-up toys that march and lunge with a bayonet; after a few
//     lunges their key runs down and they slump, wide open, until they rewind.
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat } from '../core/retro.js';
import { box, cyl, sphere, clean } from '../core/geo.js';
import { addBox, world } from '../core/physics.js';
import { Rig } from './rig.js';
import { Enemy, Orb, ENEMIES } from './enemies.js';
import { BUILDERS } from './models.js';
import { CT, makeFairMaterials, starSolid } from '../world/carnival/assets.js';
import audio from '../sound.js';

const PI = Math.PI, R = Math.random;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const cone = (r, h, seg = 6) => cyl(0, r, h, seg);
const lathe = (pts, seg = 10, us = 2) => {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * us, uv.getY(i));
  return clean(g);
};
const faceGeo = (r) => clean(new THREE.SphereGeometry(r, 14, 10));

// ================================================================== models
function imp() {
  makeFairMaterials();
  const m = {
    skin: retroMat({ map: CT.porcelain, color: 0xa688ff, spec: 0.2, rim: 0.25, edge: 0.4, emit: 0.08 }),
    hat: retroMat({ map: CT.starCloth, rim: 0.2, side: THREE.DoubleSide, emit: 0.12, edge: 0.25 }),
    tunic: retroMat({ map: CT.stripeTeal, rim: 0.2, edge: 0.3 }),
    gold: retroMat({ map: T.gold, chrome: 0.5, env: T.goldEnv, emit: 0.3 }),
    eye: retroMat({ color: 0xfff060, emit: 1, fog: 0.3 }),
    dark: retroMat({ color: 0x0a0414 }),
    tooth: retroMat({ color: 0xfff4ff, emit: 0.3 }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 0.42;
  J('hips', null, [0, 0, 0]); J('spine', 'hips', [0, 0.05, 0]); J('head', 'spine', [0, 0.5, 0]);
  J('hat', 'head', [0, 0.28, -0.02]); J('tip', 'hat', [0, 0.42, 0]);
  J('armL', 'spine', [0.24, 0.32, 0]); J('armR', 'spine', [-0.24, 0.32, 0]);
  J('legL', 'hips', [0.12, -0.04, 0]); J('legR', 'hips', [-0.12, -0.04, 0]);
  P('spine', sphere(0.27, 9, 7), m.tunic, [0, 0.18, 0], [0, 0, 0], [1, 1.05, 0.9]);
  P('spine', cyl(0.27, 0.27, 0.06, 9), m.gold, [0, 0.1, 0]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; P('spine', cone(0.07, 0.16, 4), m.tunic, [Math.sin(a) * 0.25, -0.05, Math.cos(a) * 0.22], [PI + Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]); }
  // head: big round, long pointed ears, saucer eyes, a wide grin
  P('head', sphere(0.3, 12, 9), m.skin, [0, 0.04, 0], [0, 0, 0], [1.1, 0.95, 1]);
  for (const s of [-1, 1]) {
    P('head', cone(0.1, 0.42, 5), m.skin, [s * 0.38, 0.1, -0.02], [0, 0, -s * 1.25]);
    P('head', sphere(0.1, 8, 6), m.eye, [s * 0.12, 0.08, 0.25], [0, 0, s * 0.25], [1, 1.2, 0.5]);
    P('head', box(0.03, 0.1, 0.02), m.dark, [s * 0.12, 0.08, 0.3]);
  }
  P('head', box(0.3, 0.06, 0.06), m.dark, [0, -0.1, 0.27], [0, 0, 0]);
  for (let i = 0; i < 4; i++) P('head', cone(0.025, 0.05, 3), m.tooth, [-0.09 + i * 0.06, -0.08, 0.3], [PI, 0, 0]);
  // the star hat: a wide brim and a cone that flops over at the tip
  P('hat', cyl(0.48, 0.48, 0.035, 14, { s: 1 }), m.hat, [0, 0, 0]);
  P('hat', cyl(0.16, 0.3, 0.44, 10, { s: 1.5 }), m.hat, [0, 0.22, 0]);
  P('hat', cyl(0.305, 0.305, 0.07, 10), m.gold, [0, 0.04, 0]);
  rig.j.tip.rotation.x = -0.7;
  P('tip', cyl(0.02, 0.16, 0.5, 8, { s: 1.5 }), m.hat, [0, 0.24, 0]);
  rig.part(rig.j.tip, starSolid(0.11, 0.05, 0.04), m.gold, [0, 0.52, 0]);
  for (const sd of ['L', 'R']) {
    P('arm' + sd, cyl(0.05, 0.04, 0.3, 5), m.skin, [0, -0.14, 0]);
    P('arm' + sd, sphere(0.07, 6, 5), m.skin, [0, -0.3, 0]);
    P('leg' + sd, cyl(0.06, 0.05, 0.28, 5), m.dark, [0, -0.14, 0]);
    P('leg' + sd, cone(0.08, 0.3, 5), m.gold, [0, -0.3, 0.1], [PI / 2 + 0.4, 0, 0]);
  }
  // a star held in the right hand while winding up
  const star = rig.part('armR', starSolid(0.2, 0.09, 0.06), retroMat({ color: 0xffd860, emit: 1, fog: 0.3 }), [0, -0.38, 0.05]);
  star.visible = false;
  return { rig, root: rig.root, m, star };
}

function jack() {
  makeFairMaterials();
  const m = {
    box: retroMat({ map: CT.stripeViolet, rim: 0.2, edge: 0.3, emit: 0.05 }),
    gold: retroMat({ map: CT.gild, chrome: 0.4, env: T.goldEnv, emit: 0.2 }),
    face: retroMat({ map: CT.queenFace, spec: 0.3, shine: 14, rim: 0.12, emit: 0.06 }),
    hatA: retroMat({ map: CT.stripePink, rim: 0.2, side: THREE.DoubleSide }),
    hatB: retroMat({ map: CT.stripeTeal, rim: 0.2, side: THREE.DoubleSide }),
    ruff: retroMat({ map: CT.porcelain, color: 0xfff0ff, side: THREE.DoubleSide, rim: 0.2 }),
    spring: retroMat({ map: T.metal, chrome: 0.7, env: T.silver, spec: 0.4 }),
    bell: retroMat({ map: T.gold, chrome: 0.6, env: T.goldEnv, emit: 0.4 }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 0;
  J('box', null, [0, 0, 0]); J('lid', 'box', [0, 1.1, -0.55]); J('crank', 'box', [0.58, 0.55, 0]);
  J('spring', 'box', [0, 0.75, 0]); J('jhead', 'spring', [0, 1, 0]);
  P('box', box(1.1, 1.1, 1.1, { s: 0.9 }), m.box, [0, 0.55, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P('box', box(0.1, 1.14, 0.1), m.gold, [x * 0.55, 0.57, z * 0.55]);
  for (const y of [0.04, 1.08]) for (const [w, d] of [[1.2, 0.1], [0.1, 1.2]]) for (const s of [-1, 1]) P('box', box(w, 0.08, d), m.gold, [d > 0.5 ? s * 0.55 : 0, y, w > 0.5 ? s * 0.55 : 0]);
  for (const r of [0, PI / 2, PI, -PI / 2]) P('box', starSolid(0.28, 0.12, 0.04), m.gold, [Math.sin(r) * 0.57, 0.55, Math.cos(r) * 0.57], [0, r, 0]);
  P('lid', box(1.16, 0.1, 1.16, { s: 0.9 }), m.box, [0, 0.05, 0.55]);
  P('lid', box(1.2, 0.06, 1.2), m.gold, [0, 0.11, 0.55]);
  P('crank', cyl(0.05, 0.05, 0.2, 5), m.gold, [0.1, 0, 0], [0, 0, PI / 2]);
  P('crank', box(0.06, 0.4, 0.06), m.gold, [0.2, -0.17, 0]);
  P('crank', sphere(0.08, 6, 5), m.bell, [0.26, -0.36, 0]);
  // the spring: a helix of wire, scaled to stretch
  const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * PI * 2 * 7; pts.push(new THREE.Vector3(Math.cos(a) * 0.16, i / 64, Math.sin(a) * 0.16)); }
  rig.part('spring', clean(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.03, 4)), m.spring);
  // jester head: painted porcelain, frilled ruff, three-pointed belled hat
  rig.part('jhead', faceGeo(0.36), m.face, [0, 0.42, 0]);
  rig.part('jhead', lathe([[0.05, 0], [0.5, 0.05], [0.42, 0.14], [0.55, 0.18], [0.2, 0.22]], 14, 3), m.ruff, [0, 0, 0]);
  for (const [k, rz, mat] of [[0, 0, m.hatA], [1, 1.0, m.hatB], [2, -1.0, m.hatB]]) {
    const h = new THREE.Group(); h.position.set(0, 0.68, 0); h.rotation.set(-0.25, 0, rz); rig.j.jhead.add(h);
    rig.part(h, cyl(0.04, 0.2, 0.55, 8, { s: 1.5 }), mat, [0, 0.27, 0]);
    rig.part(h, sphere(0.08, 6, 5), m.bell, [0, 0.58, 0]);
  }
  rig.j.spring.scale.y = 0.05; rig.j.jhead.visible = false;
  return { rig, root: rig.root, m };
}

function tin() {
  makeFairMaterials();
  const tinMat = (c, o = {}) => retroMat({ map: CT.tin, color: c, spec: 0.45, shine: 16, rim: 0.2, edge: 0.35, emit: 0.05, ...o });
  const m = {
    coat: tinMat(0xe8304a), navy: tinMat(0x2a2a70), white: tinMat(0xfff4ff), black: tinMat(0x24203a),
    gold: retroMat({ map: T.gold, chrome: 0.55, env: T.goldEnv, spec: 0.4, emit: 0.18 }),
    face: retroMat({ map: CT.porcelain, color: 0xffe2d4, spec: 0.3, rim: 0.15, edge: 0.3 }),
    cheek: retroMat({ color: 0xff6a8a, emit: 0.3 }), eye: retroMat({ color: 0x0a0414 }),
    plume: retroMat({ map: CT.flossPink, color: 0xff5070, rim: 0.3 }),
    steel: retroMat({ map: T.metal, chrome: 0.75, env: T.silver, spec: 0.5 }),
    wood: retroMat({ map: T.wood, color: 0xb07050 }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 0.9;
  J('hips', null, [0, 0, 0]); J('spine', 'hips', [0, 0.04, 0]); J('head', 'spine', [0, 0.62, 0]);
  J('shoulderL', 'spine', [0.3, 0.5, 0]); J('shoulderR', 'spine', [-0.3, 0.5, 0]); J('handR', 'shoulderR', [0, -0.52, 0.04]);
  J('legL', 'hips', [0.13, -0.02, 0]); J('legR', 'hips', [-0.13, -0.02, 0]); J('key', 'spine', [0, 0.3, -0.27]);
  P('hips', cyl(0.27, 0.25, 0.16, 10, { s: 2 }), m.white);
  P('spine', cyl(0.3, 0.26, 0.58, 10, { s: 2 }), m.coat, [0, 0.29, 0]);
  P('spine', cyl(0.27, 0.27, 0.08, 10), m.black, [0, 0.03, 0]);
  P('spine', box(0.1, 0.1, 0.04), m.gold, [0, 0.03, 0.27]);
  for (const s of [-1, 1]) P('spine', box(0.07, 0.72, 0.04), m.white, [0, 0.3, 0.255], [0, 0, s * 0.6]);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) P('spine', sphere(0.03, 5, 4), m.gold, [s * 0.12, 0.16 + i * 0.11, 0.27]);
  for (const s of [-1, 1]) {
    P('spine', sphere(0.12, 7, 5), m.gold, [s * 0.3, 0.55, 0], [0, 0, 0], [1.2, 0.5, 1]);
    for (let i = 0; i < 4; i++) P('spine', cyl(0.015, 0.015, 0.14, 3), m.gold, [s * (0.22 + i * 0.05), 0.47, 0.06 - i * 0.04]);
  }
  P('head', cyl(0.11, 0.11, 0.1, 8), m.face, [0, 0.0, 0]);
  P('head', sphere(0.22, 10, 8), m.face, [0, 0.18, 0]);
  for (const s of [-1, 1]) { P('head', sphere(0.03, 5, 4), m.eye, [s * 0.08, 0.21, 0.2]); P('head', sphere(0.055, 6, 4), m.cheek, [s * 0.13, 0.12, 0.17], [0, 0, 0], [1, 0.7, 0.5]); }
  P('head', box(0.2, 0.04, 0.05), m.black, [0, 0.12, 0.21], [0, 0, 0]);
  // the shako: tall drum hat, gold band and star badge, a red plume
  P('head', cyl(0.2, 0.22, 0.42, 10, { s: 1.5 }), m.navy, [0, 0.52, -0.01]);
  P('head', cyl(0.215, 0.215, 0.06, 10), m.gold, [0, 0.34, -0.01]);
  P('head', cyl(0.205, 0.205, 0.04, 10), m.gold, [0, 0.73, -0.01]);
  rig.part('head', starSolid(0.1, 0.045, 0.03), m.gold, [0, 0.53, 0.21]);
  P('head', box(0.36, 0.04, 0.16), m.black, [0, 0.33, 0.16], [0.25, 0, 0]);
  P('head', sphere(0.1, 7, 6), m.plume, [0, 0.86, -0.01], [0, 0, 0], [0.8, 1.6, 0.8]);
  for (const sd of ['L', 'R']) {
    P('shoulder' + sd, cyl(0.085, 0.075, 0.48, 6, { s: 2 }), m.coat, [0, -0.24, 0]);
    P('shoulder' + sd, cyl(0.085, 0.085, 0.07, 6), m.gold, [0, -0.44, 0]);
    P('shoulder' + sd, sphere(0.08, 6, 5), m.white, [0, -0.52, 0]);
    P('leg' + sd, cyl(0.1, 0.09, 0.56, 6, { s: 2 }), m.white, [0, -0.3, 0]);
    P('leg' + sd, cyl(0.1, 0.11, 0.32, 6, { s: 2 }), m.black, [0, -0.72, 0]);
    P('leg' + sd, box(0.18, 0.08, 0.3), m.black, [0, -0.86, 0.06]);
  }
  // rifle with a bayonet
  const gun = new THREE.Group(); rig.j.handR.add(gun); gun.rotation.x = PI;
  rig.part(gun, box(0.07, 1.1, 0.1, { s: 2 }), m.wood, [0, 0.3, 0]);
  rig.part(gun, cyl(0.025, 0.025, 0.5, 5), m.steel, [0, 0.95, 0.02]);
  rig.part(gun, cone(0.035, 0.45, 4), m.steel, [0, 1.38, 0.02]);
  // the wind-up key in the back
  P('key', cyl(0.03, 0.03, 0.2, 5), m.gold, [0, 0, -0.08], [PI / 2, 0, 0]);
  for (const s of [-1, 1]) P('key', clean(new THREE.TorusGeometry(0.12, 0.035, 5, 10)), m.gold, [s * 0.13, 0, -0.2], [0, PI / 2, 0]);
  return { rig, root: rig.root, m };
}
Object.assign(BUILDERS, { imp, jack, tin });

// ================================================================== projectile: a spinning star
const STAR_GEO = starSolid(0.32, 0.14, 0.1);
export class StarShot extends Orb {
  constructor(game, pos, vel, o = {}) {
    super(game, pos, vel, { color: 0xffd050, kind: 'star', hitSound: 'starHit', kb: 3.5, ...o });
    this.mesh.geometry = STAR_GEO;
  }
  update(dt) {
    super.update(dt);
    this.mesh.rotation.z += dt * 14; this.mesh.rotation.y += dt * 3;
  }
}

// ================================================================== imp
export class Imp extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'imp', pos, { hp: 2, radius: 0.42, height: 1.5, drops: 4, aggro: 14, ...o });
    this.popColor = 0xff7ad0; this.seed = R() * 10; this.throwT = 1.2 + R() * 1.6; this.hopT = R(); this.perch = o.perch ?? false;
    this.aimHeight = 0.9; this.heartChance = 0.1; this.throwRange = o.throwRange ?? 16;
  }
  think(dt) {
    const d = this.distP(), p = this.player;
    this.windupGlow = 0;
    if (this.model.star) this.model.star.visible = this.state === 'windup';
    switch (this.state) {
      case 'idle':
        this.steer(0, 0, dt, 10);
        this.hopT -= dt;
        if (this.grounded && this.hopT <= 0) { this.vel.y = 4; this.hopT = 0.8 + R(); }
        if (d < this.aggro && !p.dead) { this.setState('active'); audio.play('impGiggle', { pitch: 0.9 + R() * 0.3 }); }
        break;
      case 'stunned': this.steer(0, 0, dt); if (this.stun <= 0) this.setState('active'); break;
      case 'active': {
        this.facePlayer(dt, 8);
        const toP = this.toPlayer(_b).setY(0).normalize();
        if (!this.perch && d < 3.4 && this.grounded && this.t > 0.3 && !p.dead) {
          // a cheeky back-flip out of sword reach
          this.vel.set(-toP.x * 6.5, 9, -toP.z * 6.5); this.setState('hop');
          audio.play('impGiggle', { pitch: 1.1 + R() * 0.2 });
          break;
        }
        this.hopT -= dt;
        if (this.grounded && this.hopT <= 0) {
          // skip sideways around you, keeping a throwing distance
          const side = (Math.sin(this.game.time * 0.9 + this.seed) > 0 ? 1 : -1) * (this.perch ? 0 : 3.2);
          const fwd = this.perch ? 0 : d > 9 ? 2.4 : d < 5.5 ? -2.4 : 0;
          this.vel.x = -toP.z * side + toP.x * fwd; this.vel.z = toP.x * side + toP.z * fwd; this.vel.y = 5.5;
          this.hopT = 0.5 + R() * 0.5;
        }
        if (this.grounded) this.steer(0, 0, dt, 14);
        this.throwT -= dt;
        if (this.throwT <= 0 && d < this.throwRange && !p.dead) { this.setState('windup'); audio.play('impGiggle', { pitch: 1.3, volume: 0.6 }); }
        if (d > this.aggro * 2.2) this.setState('idle');
        break;
      }
      case 'hop':
        if (this.grounded && this.t > 0.15) this.setState('active');
        break;
      case 'windup':
        this.facePlayer(dt, 12); if (this.grounded) this.steer(0, 0, dt, 20);
        this.windupGlow = Math.sin(this.t * 36) > 0 ? 0.3 : 0.05;
        if (R() < 0.5) this.game.fx.spark.emit({ pos: this.handPos(), life: 0.25, size: 0.35, size1: 0, color: 0xffe080 });
        if (this.t > 0.6) {
          const from = this.handPos(), to = _b.copy(p.pos).setY(p.pos.y + 0.9);
          new StarShot(this.game, from, to.sub(from).normalize().multiplyScalar(9.5), { owner: this, homing: 0.7, life: 4, reflectDmg: 2 });
          audio.play('impThrow');
          this.throwT = 2.2 + R() * 1.6;
          this.setState('active');
        }
        break;
    }
  }
  handPos() { return _a.set(-Math.cos(this.yaw) * 0.3 + Math.sin(this.yaw) * 0.3, 1.25, Math.sin(this.yaw) * 0.3 + Math.cos(this.yaw) * 0.3).add(this.pos).clone(); }
  animate(dt) {
    const t = this.game.time + this.seed, s = this.state, j = this.rig.j;
    let pose;
    if (s === 'windup') pose = { armR: [-2.8, 0, -0.3], armL: [-0.6, 0, 0.6], spine: [-0.2, 0.3, 0], head: [-0.1, 0, 0], legL: [-0.3, 0, 0], legR: [0.3, 0, 0] };
    else if (s === 'hop') pose = { armR: [-2.2, 0, -1.2], armL: [-2.2, 0, 1.2], spine: [-0.6, 0, 0], head: [-0.4, 0, 0], legL: [-1, 0, 0], legR: [-1, 0, 0] };
    else if (s === 'stunned') pose = { spine: [0.2, 0, Math.sin(t * 8) * 0.3], head: [0.3, 0, Math.sin(t * 8) * 0.4], armL: [0, 0, 0.9], armR: [0, 0, -0.9] };
    else {
      const air = !this.grounded, k = Math.sin(t * 5);
      pose = { spine: [0.1, Math.sin(t * 2) * 0.2, k * 0.08], head: [0.05, Math.sin(t * 1.6) * 0.3, -k * 0.12], armL: [air ? -2 : -0.4 + k * 0.4, 0, 0.5], armR: [air ? -2 : -0.4 - k * 0.4, 0, -0.5], legL: [air ? -0.8 : k * 0.4, 0, 0.1], legR: [air ? 0.4 : -k * 0.4, 0, -0.1] };
    }
    this.rig.apply(pose, 1 - Math.exp(-dt * 14));
    // the hat tip flops with every hop
    j.tip.rotation.x = -0.7 + THREE.MathUtils.clamp(-this.vel.y * 0.05, -0.4, 0.5) + Math.sin(t * 4) * 0.05;
    this.rig.body.rotation.x = s === 'hop' ? -Math.min(PI * 2, this.t * 11) : 0;
  }
}

// ================================================================== jack-in-the-box
export class Jack extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'jack', pos, { hp: 3, radius: 0.65, height: 1.2, drops: 5, stompable: false, aggro: 10, ...o });
    this.popColor = 0xff5aa0; this.ext = 0.05; this.lean = 0; this.cool = 0.5; this.crankA = 0; this.seed = R() * 10;
    this.heartChance = 0.3; this.big = true; this.trigger = o.trigger ?? 4.8;
    this.col = addBox(pos.clone().setY(pos.y + 0.55), new THREE.Vector3(0.56, 0.55, 0.56), this.yaw);
    this.char.teleport(new THREE.Vector3(pos.x, pos.y - 300, pos.z));
  }
  guards(hit) {
    if (this.state === 'out' || this.state === 'pop' || this.state === 'stunned') return false;
    this.flash = 0.15; return true;
  }
  physics() {}
  onParried() { this.stun = 2.6; this.setState('stunned'); this.flash = 0.6; }
  die() { super.die(); world.removeCollider(this.col, false); }
  think(dt) {
    const d = this.distP(), p = this.player;
    this.windupGlow = 0;
    this.cool -= dt;
    switch (this.state) {
      case 'idle':
        if (d < this.aggro && !p.dead) {
          this.crankA += dt * 3;
          if (Math.floor(this.crankA / 4) !== Math.floor((this.crankA - dt * 3) / 4)) audio.play('jackCrank', { volume: 0.45 });
          this.facePlayer(dt, 2);
        }
        if (d < this.trigger && this.cool <= 0 && !p.dead) { this.setState('windup'); audio.play('jackCrank'); }
        break;
      case 'windup':
        this.facePlayer(dt, 6);
        this.crankA += dt * 22;
        this.windupGlow = Math.sin(this.t * 40) > 0 ? 0.35 : 0;
        if (this.t > 0.7) {
          this.setState('pop'); this.hitDone = false; audio.play('jackPop'); this.game.shake(0.15);
          this.game.fx.sparks(_a.copy(this.pos).setY(this.pos.y + 1.2), 12, 0xffa0e0, 5);
        }
        break;
      case 'pop':
        if (!this.hitDone && this.t > 0.08) {
          this.hitDone = true;
          const head = this.headPos();
          if (p.pos.distanceTo(_b.copy(head).setY(head.y - 0.6)) < 1.7 || this.inFront(0.35, 3.0)) this.strike(1, { kb: 3 });
        }
        if (this.t > 0.25) this.setState('out');
        break;
      case 'out':
        if (this.t > 1.9) this.setState('retract');
        break;
      case 'stunned':
        if (this.stun <= 0) this.setState('retract');
        break;
      case 'retract':
        if (this.t > 0.35) { this.setState('idle'); this.cool = 1.4; }
        break;
    }
  }
  headPos() { return _a.set(Math.sin(this.yaw) * this.ext * Math.sin(this.lean), 0.75 + this.ext * Math.cos(this.lean) + 0.4, Math.cos(this.yaw) * this.ext * Math.sin(this.lean)).add(this.pos); }
  animate(dt) {
    const j = this.rig.j, s = this.state, t = this.game.time + this.seed;
    const out = s === 'pop' || s === 'out' || s === 'stunned';
    const target = out ? 2.2 : 0.05;
    // springy: overshoot on the way out, wobble while hanging there
    this.extV = (this.extV || 0) + ((target - this.ext) * (out ? 420 : 160) - (this.extV || 0) * (out ? 14 : 22)) * dt;
    this.ext = Math.max(0.05, this.ext + this.extV * dt);
    this.lean += ((out ? (s === 'stunned' ? 0.2 : 0.85) : 0) - this.lean) * (1 - Math.exp(-dt * 10));
    j.spring.scale.y = this.ext; j.spring.rotation.x = this.lean + (s === 'out' ? Math.sin(t * 7) * 0.12 : 0);
    j.spring.rotation.z = s === 'stunned' ? Math.sin(t * 6) * 0.3 : 0;
    j.jhead.visible = this.ext > 0.3;
    j.jhead.scale.set(1, 1 / Math.max(0.3, this.ext), 1);
    j.jhead.rotation.x = -this.lean * 0.6;
    j.lid.rotation.x += ((this.ext > 0.25 || s === 'windup' ? -2.2 + (s === 'windup' ? Math.sin(t * 50) * 0.3 + 1.9 : 0) : 0) - j.lid.rotation.x) * (1 - Math.exp(-dt * 18));
    j.crank.rotation.x = this.crankA;
    this.rig.body.position.x = s === 'windup' ? Math.sin(t * 60) * 0.04 : 0;
  }
}

// ================================================================== tin soldier
export class Tin extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'tin', pos, { hp: 4, radius: 0.45, height: 1.9, drops: 6, aggro: 12, ...o });
    this.popColor = 0xff4a5a; this.seed = R() * 10; this.wind = 1; this.keyA = 0; this.stepT = 0; this.march = 0;
    this.patrol = o.patrol || null; this.leg = 0; this.parryStun = 2.2; this.heartChance = 0.25;
  }
  think(dt) {
    const d = this.distP(), p = this.player;
    this.windupGlow = 0;
    const walk = (yaw, speed) => { this.face(yaw, dt, 5); this.steer(Math.sin(this.yaw) * speed, Math.cos(this.yaw) * speed, dt, 14); this.march += dt * speed * 1.6; };
    switch (this.state) {
      case 'idle':
        if (this.patrol) {
          const tgt = this.patrol[this.leg % 2], h = _b.copy(tgt).sub(this.pos);
          if (Math.hypot(h.x, h.z) < 0.8) this.leg++;
          walk(Math.atan2(h.x, h.z), 1.7);
        } else this.steer(0, 0, dt);
        if (d < this.aggro && !p.dead) { this.setState('march'); audio.play('windup', { volume: 0.5 }); }
        break;
      case 'march': {
        const h = this.toPlayer(_b);
        walk(Math.atan2(h.x, h.z), d > 2.6 ? 2.5 : 0);
        if (d < 2.9 && this.t > 0.4 && !p.dead) this.setState('aim');
        if (d > this.aggro * 2) this.setState('idle');
        break;
      }
      case 'aim':
        this.facePlayer(dt, 6); this.steer(0, 0, dt, 25);
        this.windupGlow = this.t > 0.3 ? (Math.sin(this.t * 40) > 0 ? 0.35 : 0.05) : 0;
        if (this.t > 0.65) { this.setState('lunge'); this.hitDone = false; this.vel.x += Math.sin(this.yaw) * 8; this.vel.z += Math.cos(this.yaw) * 8; audio.play('knightSwing', { pitch: 1.3 }); }
        break;
      case 'lunge':
        if (!this.hitDone && this.t > 0.05 && this.inFront(0.3, 2.6)) { this.hitDone = true; this.strike(1); }
        if (this.t > 0.3) { this.setState('recover'); this.wind -= 0.36; }
        break;
      case 'recover':
        this.steer(0, 0, dt, 20);
        if (this.t > 0.5) this.setState(this.wind <= 0 ? 'rundown' : 'march');
        if (this.state === 'rundown') { this.stun = 2.6; audio.play('tinFall', { volume: 0.5, pitch: 1.3 }); }
        break;
      case 'rundown':
        // the spring is spent: slumped and wide open (hits do double damage)
        this.steer(0, 0, dt, 20); this.stun = Math.max(this.stun, 0.01);
        if (this.t > 2.6) { this.setState('rewind'); this.stun = 0; audio.play('windup'); }
        break;
      case 'rewind':
        this.steer(0, 0, dt, 20);
        if (this.t > 0.8) { this.wind = 1; this.setState('march'); }
        break;
      case 'stunned':
        this.steer(0, 0, dt);
        if (this.stun <= 0) this.setState('march');
        break;
    }
    // stiff little footsteps
    if (this.march - this.stepT > PI && d < 18) { this.stepT = this.march; audio.play('tinStep', { volume: 0.35, pitch: 0.9 + R() * 0.2 }); }
  }
  onHurt() { audio.play('tinClang', { volume: 0.7 }); if (this.state === 'march' || this.state === 'idle') this.setState('march'); }
  animate(dt) {
    const j = this.rig.j, s = this.state, t = this.game.time + this.seed;
    const keyRate = s === 'rundown' ? 0 : s === 'rewind' ? 30 : s === 'aim' ? 14 : 3 + this.wind * 3;
    this.keyA += dt * keyRate; j.key.rotation.z = this.keyA;
    let pose;
    const a = Math.sin(this.march);
    if (s === 'aim') pose = { shoulderR: [-1.5, 0, 0.1], shoulderL: [-1.3, 0, -0.5], spine: [-0.08, 0.2, 0], head: [0, -0.2, 0], legL: [-0.3, 0, 0], legR: [0.3, 0, 0] };
    else if (s === 'lunge') pose = { shoulderR: [-1.55, 0, 0.05], shoulderL: [-1.4, 0, -0.4], spine: [0.35, 0, 0], head: [-0.2, 0, 0], legL: [-0.6, 0, 0], legR: [0.5, 0, 0] };
    else if (s === 'rundown') pose = { spine: [0.55, 0, 0.15], head: [0.5, 0, 0.3], shoulderR: [0.2, 0, 0.05], shoulderL: [0.2, 0, -0.1], legL: [0, 0, 0.05], legR: [0, 0, -0.05] };
    else if (s === 'stunned') pose = { spine: [-0.15, 0, Math.sin(t * 7) * 0.15], head: [0.2, 0, Math.sin(t * 7) * 0.3], shoulderR: [-0.5, 0, 0.3], shoulderL: [-0.3, 0, -0.4] };
    else pose = { spine: [0, 0, 0], head: [0, 0, 0], legL: [a * 0.55, 0, 0], legR: [-a * 0.55, 0, 0], shoulderL: [-a * 0.5, 0, -0.05], shoulderR: [-0.35, 0, 0.05] };
    if (s === 'rewind') pose = { ...pose, spine: [0.2 - this.t * 0.25, 0, 0] };
    this.rig.apply(pose, 1 - Math.exp(-dt * (s === 'lunge' ? 30 : 12)));
    this.rig.body.position.y = 0.9 + (s === 'march' || s === 'idle' ? Math.abs(Math.cos(this.march)) * 0.05 : 0) - (s === 'rundown' ? 0.08 : 0);
  }
}

Object.assign(ENEMIES, { imp: Imp, jack: Jack, tin: Tin });
