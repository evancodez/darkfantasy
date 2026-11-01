// The Midnight Carnival — a starlight fair on a shard of the broken moon,
// drifting through a rose-and-teal nebula. Reached through the moon gate that
// opens in the dragon's hoard.
//   The Midway — stalls, lantern strings, imps, jack-in-the-boxes.
//   The Hub — the three-tier Orrery Carousel (counter-rotating decks, bobbing
//     moon-horses); a Moon Ticket waits on its crown.
//   The Lantern Wheel — ride a gondola to the top and leap to the crow's nest.
//   The High Wire — up the helter-skelter, along tightropes, across sinking
//     balloon rafts and a swinging trapeze to the Starlight Perch; the circus
//     cannon fires you home.
//   The Big Top — three tickets part its curtains; the Marionette Queen waits.
import * as THREE from 'three';
import { G as GU, Lights, retroMat } from '../../core/retro.js';
import { Bake, rng, clean, smooth, lerp } from '../../core/geo.js';
import { T } from '../../core/tex.js';
import { addBox, addTrimesh, addCylinder, addPlatform, world } from '../../core/physics.js';
import { M, Batch, box, cyl, sphere, mat4, terrainPatch, cliffSkirt } from '../kit.js';
import { Prop, put } from '../props.js';
import { spawn } from '../../actors/enemies.js';
import '../../actors/fairfolk.js';
import { setupQueen } from '../../actors/queen.js';
import { CT, CM, makeFairMaterials, tent, stall, lanternString, balloons, flossTree, lamp, crystals, moonGate, valance, scallops, tentRoof, pennant, starSolid, crescent, between, UNIT_CYL } from './assets.js';
import { createFairSky } from './sky.js';
import audio from '../../sound.js';

const PI = Math.PI;
export const CN = new THREE.Vector3(900, 0, 0);               // zone origin
const V = (x, y, z) => new THREE.Vector3(CN.x + x, CN.y + y, CN.z + z);
export const FAIR_SPAWN = V(0, 0.2, 49.5);
const HUB = V(0, 0, -18);                                     // carousel centre
const FW = V(-46, 19, -18), FW_R = 16;                        // lantern wheel hub
const HS = V(40, 0, -8);                                      // helter-skelter
const BT = V(0, 0, -70), BT_R = 24;                           // big top
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ the moon shard
const ZC = -14;
function edgeR(x, z) {
  const a = Math.atan2(z - ZC, x);
  return 1 + 0.06 * Math.sin(3 * a + 1) + 0.04 * Math.sin(7 * a + 2) + 0.02 * Math.sin(13 * a);
}
const RX = (x) => (x > 0 ? 55 : 70), RZ = 93;
function inIsland(lx, lz) { const k = edgeR(lx, lz); return (lx / (RX(lx) * k)) ** 2 + ((lz - ZC) / (RZ * k)) ** 2 < 1; }
function snapEdge(lx, lz) {
  // slide a boundary vertex onto the smooth rim
  let lo = 0, hi = 1.5;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (inIsland(lx * m, ZC + (lz - ZC) * m)) lo = m; else hi = m; }
  return [lx * lo, ZC + (lz - ZC) * lo];
}
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
// 1 on paths and under buildings, 0 out on the dunes
function flatness(x, z) {
  let f = 0;
  const S = (d, r, fall = 4) => { f = Math.max(f, smooth(r + fall, r, d)); };
  S(segDist(x, z, 0, -3, 0, 64), 12);
  S(Math.hypot(x, z + 18), 20);
  S(segDist(x, z, -16, -18, -60, -18), 9);
  S(segDist(x, z, 14, -16, 40, -8), 6); S(Math.hypot(x - 40, z + 8), 9);
  S(segDist(x, z, 0, -30, 0, -48), 7);
  S(Math.hypot(x, z + 70), 30);
  S(Math.hypot(x, z - 56), 10);
  return f;
}
const CRATERS = [[-30, 30, 7, 1.4], [28, 34, 5, 1.0], [-58, 18, 6, 1.2], [-24, -48, 8, 1.5], [36, -40, 6, 1.1], [-56, -50, 5, 0.9], [26, 14, 4, 0.8]];
function heightAt(lx, lz) {
  let h = 0.7 * Math.sin(lx * 0.11 + 0.5) * Math.sin(lz * 0.09) + 0.45 * Math.sin(lx * 0.23 + lz * 0.19) + 0.25 * Math.sin(lx * 0.5 - lz * 0.37);
  for (const [cx, cz, r, d] of CRATERS) { const q = Math.hypot(lx - cx, lz - cz) / r; if (q < 1) h -= d * (1 - q * q); else if (q < 1.45) h += d * 0.35 * Math.sin((q - 1) / 0.45 * PI); }
  const k = edgeR(lx, lz), e = Math.sqrt((lx / (RX(lx) * k)) ** 2 + ((lz - ZC) / (RZ * k)) ** 2);
  h -= smooth(0.86, 1.0, e) * 1.2;
  return h * (1 - flatness(lx, lz));
}
export const fairGround = (x, z) => CN.y + heightAt(x - CN.x, z - CN.z);

// ------------------------------------------------------------------ props
class Ticket extends Prop {
  constructor(game, pos, parent, onGet) {
    super(game); this.pos = pos.clone(); this.onGet = onGet; this.t = Math.random() * 6;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g); this.group = g;
    const mat = retroMat({ map: CT.ticket, emit: 0.85, alphaTest: 0.5, side: THREE.DoubleSide, fog: 0.4 });
    this.card = put(g, new THREE.Mesh(clean(new THREE.PlaneGeometry(1.5, 0.75)), mat), 0, 1.5, 0);
    const beam = put(g, new THREE.Mesh(cyl(0.5, 0.9, 40, 8, { open: true }), retroMat({ color: 0xff6ac0, emit: 1, additive: true, opacity: 0.32, side: THREE.DoubleSide, fog: 0.3 })), 0, 20, 0);
    this.beam = beam;
    this.glow = game.glows.add(pos.clone().setY(pos.y + 1.5), 0xffb060, 4.5, true);
  }
  update(dt) {
    this.t += dt;
    this.card.rotation.y = this.t * 2.2; this.card.rotation.z = Math.sin(this.t * 1.7) * 0.15;
    this.card.position.y = 1.5 + Math.sin(this.t * 2) * 0.15;
    if (Math.random() < dt * 10) this.game.fx.spark.emit({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 1.4, 0.8 + Math.random() * 1.6, (Math.random() - .5) * 1.4)), vel: new THREE.Vector3(0, 1, 0), life: 0.8, size: 0.4, size1: 0, color: Math.random() < 0.5 ? 0xffd070 : 0xff8ad0 });
    const p = this.game.player;
    if (p && !p.dead && p.pos.distanceTo(this.pos) < 1.7) {
      this.alive = false; this.group.removeFromParent();
      this.game.glows.set(this.glow, this.pos, 0x000000, 0); this.game.glows.dirty();
      this.game.fx.pop(this.pos.clone().setY(this.pos.y + 1.5), 0xffc060, 30);
      for (let i = 0; i < 24; i++) this.game.fx.dust.emit({ pos: this.pos.clone().setY(this.pos.y + 1.5), vel: new THREE.Vector3((Math.random() - .5) * 8, 3 + Math.random() * 6, (Math.random() - .5) * 8), life: 1.4, size: 0.18, size1: 0.12, color: [0xff6aa8, 0x40e0c8, 0xffd050, 0x9a7aff][i % 4], gravity: 9, drag: 1 });
      this.onGet?.();
    }
  }
}

// a striped gift box: breaks open for star-motes (and sometimes a heart)
class Gift extends Prop {
  constructor(game, pos, mesh) {
    super(game); this.pos = pos.clone(); this.mesh = mesh; this.radius = 0.5; this.height = 0.9; this.noAim = true;
    game.addTarget(this);
  }
  onHit() { this.break(); return 'hit'; }
  break() {
    if (!this.alive) return;
    this.alive = false; this.game.removeTarget(this); this.mesh.removeFromParent();
    const g = this.game, c = _v.copy(this.pos).setY(this.pos.y + 0.5);
    audio.play('balloonPop', { pitch: 0.9 + Math.random() * 0.2 }); audio.play('confetti', { volume: 0.4 });
    for (let i = 0; i < 14; i++) g.fx.dust.emit({ pos: c, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6), life: 1.0, size: 0.16, size1: 0.1, color: [0xff6aa8, 0x40e0c8, 0xffd050, 0x9a7aff][i % 4], gravity: 10, floor: this.pos.y + 0.05 });
    g.props.burst(c.clone(), 3);
    if (Math.random() < 0.22) g.props.heart(this.pos);
  }
}

// carnival lamp: a checkpoint (lights up as you pass)
class Lamp extends Prop {
  constructor(game, pos, yaw, name, parent) {
    super(game); this.pos = pos.clone(); this.yaw = yaw; this.name = name; this.lit = false;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g);
    put(g, new THREE.Mesh(cyl(0.45, 0.55, 0.35, 8, { s: 1 }), CM.mGild), 0, 0.17, 0);
    put(g, new THREE.Mesh(cyl(0.11, 0.15, 2.6, 6, { s: 1 }), CM.mCane), 0, 1.6, 0);
    put(g, new THREE.Mesh(cyl(0.35, 0.18, 0.25, 8), CM.mGild), 0, 2.95, 0);
    this.off = retroMat({ map: CT.paper, color: 0x3a2a4a }); this.on = retroMat({ map: CT.paper, color: 0xff9ad8, emit: 1, fog: 0.4 });
    this.globe = put(g, new THREE.Mesh(cyl(0.38, 0.38, 0.7, 8, { s: 2 }), this.off), 0, 3.42, 0);
    put(g, new THREE.Mesh(cyl(0, 0.42, 0.35, 8), CM.mGild), 0, 3.95, 0);
    put(g, new THREE.Mesh(starSolid(0.18, 0.08, 0.05), CM.mGild), 0, 4.32, 0);
    this.flameP = pos.clone().setY(pos.y + 3.42);
    this.glow = game.glows.add(this.flameP, 0x000000, 3.2, true);
    this.light = Lights.add(this.flameP, 0xff8ad0, 0, 9);
    addBox(pos.clone().setY(pos.y + 1.4), new THREE.Vector3(0.25, 1.4, 0.25));
  }
  update(dt) {
    const p = this.game.player;
    if (this.lit) { if (Math.random() < dt * 4) this.game.fx.glow.emit({ pos: this.flameP.clone().add(new THREE.Vector3((Math.random() - .5) * .3, 0.3, (Math.random() - .5) * .3)), vel: new THREE.Vector3(0, 0.9, 0), life: 0.8, size: 0.25, size1: 0, color: 0xffa0e0 }); return; }
    if (p && !p.dead && p.pos.distanceTo(this.pos) < 2.4) this.light_();
  }
  light_(silent = false) {
    this.lit = true; this.globe.material = this.on;
    this.game.glows.set(this.glow, this.flameP, 0xff8ad0, 3.2); this.game.glows.dirty();
    this.light.intensity = 1.5;
    this.game.setCheckpoint(this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 1.6, 0.1, Math.cos(this.yaw) * 1.6)), this.yaw, this.name);
    if (!silent) { audio.play('lanternOn'); audio.play('checkpoint', { volume: 0.5 }); this.game.fx.pop(this.flameP, 0xff8ad0, 14); this.game.hud.callout('Checkpoint', 'small'); }
  }
}

// a raft hung from balloons: sinks while you stand on it, floats back up after
class SinkRaft extends Prop {
  constructor(game, top, parent, proto, r = 1.5) {
    super(game); this.home = top.clone().setY(top.y - 0.15); this.y = 0; this.t = Math.random() * 6;
    this.mesh = new THREE.Group(); parent.add(this.mesh);
    for (const c of proto.children) this.mesh.add(c.clone());
    this.mesh.position.copy(this.home);
    this.pf = addPlatform(new THREE.Vector3(r, 0.15, r), this.mesh, { radius: r });
    this.pf.setPose(this.home);
  }
  update(dt) {
    const p = this.game.player; this.t += dt;
    const on = p && p.grounded && p.platform === this.pf;
    if (on && !this.wasOn) audio.play('balloonPop', { volume: 0.25, pitch: 1.6 });
    this.wasOn = on;
    this.y = Math.max(-3, Math.min(0, this.y + (on ? -0.55 : 1.3) * dt));
    const bob = on ? 0 : Math.sin(this.t * 1.6) * 0.12;
    this.pf.setPose(_v.copy(this.home).setY(this.home.y + this.y + bob));
    this.mesh.rotation.z = on ? Math.sin(this.t * 7) * 0.02 : 0;
  }
}

// velvet curtains that part (or close) across a doorway, with a collider while shut
class Curtains extends Prop {
  constructor(game, center, width, height, yaw, parent, { closed = true } = {}) {
    super(game); this.c = center.clone(); this.w = width; this.h = height; this.yaw = yaw; this.k = closed ? 0 : 1; this.want = this.k;
    const g = new THREE.Group(); g.position.copy(center); g.rotation.y = yaw; parent.add(g); this.group = g;
    this.panels = [-1, 1].map(s => put(g, new THREE.Mesh(box(width / 2 + 0.1, height, 0.25, { s: 0.6 }), CM.mVelvet), s * width / 4, height / 2, 0));
    put(g, new THREE.Mesh(box(width + 0.6, 0.5, 0.5, { s: 1 }), CM.mGild), 0, height + 0.2, 0);
    this.half = new THREE.Vector3(width / 2, height / 2, 0.3);
    this.col = closed ? addBox(center.clone().setY(center.y + height / 2), this.half, yaw) : null;
  }
  set(open) {
    if (open === (this.want === 1)) return;
    this.want = open ? 1 : 0; audio.play('curtain');
    if (open && this.col) { world.removeCollider(this.col, false); this.col = null; }
    if (!open && !this.col) this.col = addBox(this.c.clone().setY(this.c.y + this.h / 2), this.half, this.yaw);
  }
  update(dt) {
    this.k += Math.sign(this.want - this.k) * Math.min(Math.abs(this.want - this.k), dt * 0.9);
    for (const [i, s] of [-1, 1].entries()) { const pnl = this.panels[i]; pnl.position.x = s * (this.w / 4 + this.k * this.w * 0.42); pnl.scale.x = 1 - this.k * 0.6; }
  }
}

// the circus cannon: step into its mouth to be fired across the fair
class Cannon extends Prop {
  constructor(game, pos, target, flight, parent) {
    super(game); this.pos = pos.clone(); this.target = target.clone(); this.flight = flight; this.state = 'idle'; this.t = 0;
    const dx = target.x - pos.x, dz = target.z - pos.z, yaw = Math.atan2(dx, dz);
    const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = yaw; parent.add(g); this.group = g;
    // carriage, two spoked wheels, a star-painted barrel pitched skyward
    put(g, new THREE.Mesh(box(1.4, 0.6, 2.4, { s: 1 }), CM.mGild), 0, 0.5, -0.4);
    for (const s of [-1, 1]) {
      const wh = put(g, new THREE.Mesh(clean(new THREE.TorusGeometry(0.85, 0.12, 5, 14)), CM.mGild), s * 0.95, 0.9, -0.4); wh.rotation.y = PI / 2;
      for (let i = 0; i < 6; i++) { const sp = put(g, new THREE.Mesh(box(0.08, 1.6, 0.08), CM.mGild), s * 0.95, 0.9, -0.4); sp.rotation.x = i * PI / 6; }
    }
    this.barrel = new THREE.Group(); this.barrel.position.set(0, 1.25, -0.4); this.barrel.rotation.x = -0.75; g.add(this.barrel);
    put(this.barrel, new THREE.Mesh(cyl(0.62, 0.78, 3.4, 12, { s: 1 }), CM.mStar), 0, 1.0, 0);
    for (const y of [-0.5, 0.6, 2.5]) put(this.barrel, new THREE.Mesh(cyl(0.82, 0.82, 0.2, 12), CM.mGild), 0, y, 0);
    put(this.barrel, new THREE.Mesh(cyl(0.5, 0.5, 0.05, 12), CM.dark), 0, 2.71, 0);
    this.mouth = new THREE.Vector3(0, 2.75, 0);
    this.glow = game.glows.add(pos.clone().setY(pos.y + 2.5), 0xff8ad0, 3, true);
    addBox(pos.clone().add(new THREE.Vector3(Math.sin(yaw) * -0.4, 0.5, Math.cos(yaw) * -0.4)), new THREE.Vector3(0.7, 0.5, 1.2), yaw);
    this.load = pos.clone().add(new THREE.Vector3(Math.sin(yaw) * -2.4, 0, Math.cos(yaw) * -2.4));
    const pad = new THREE.Mesh(clean(new THREE.RingGeometry(0.55, 0.85, 20).rotateX(-PI / 2)), retroMat({ color: 0xff8ad0, emit: 1, fog: 0.3, side: THREE.DoubleSide }));
    pad.position.copy(this.load).setY(this.load.y + 0.06); parent.add(pad); this.pad = pad;
  }
  update(dt) {
    const g = this.game, p = g.player; this.t += dt;
    if (this.state === 'idle') {
      this.pad.scale.setScalar(1 + Math.sin(this.t * 5) * 0.08);
      if (p && !p.dead && p.grounded && Math.hypot(p.pos.x - this.load.x, p.pos.z - this.load.z) < 0.85 && Math.abs(p.pos.y - this.load.y) < 1) {
        this.state = 'load'; this.t = 0; p.frozen = true; p.vel.set(0, 0, 0);
        audio.play('rideBell'); g.hud.callout('Hold on to your hat!', 'small');
      }
      if (this.load && p && !this.hinted && p.pos.distanceTo(this.load) < 6) { this.hinted = true; g.hud.hint('Stand on the glowing ring behind the cannon to be fired home.', 4); }
    } else if (this.state === 'load') {
      this.barrel.updateMatrixWorld(true);
      const m = this.barrel.localToWorld(_v.copy(this.mouth));
      p.pos.copy(m).setY(m.y - 1.2); p.char.teleport(p.pos);
      this.barrel.scale.setScalar(1 + Math.sin(this.t * 40) * 0.03 * Math.min(1, this.t * 2));
      if (this.t > 0.9) {
        this.state = 'cool'; this.t = 0; this.barrel.scale.setScalar(1);
        const T = this.flight, d = _w.copy(this.target).sub(p.pos);
        p.frozen = false; p.ballistic = true; p.noCut = true; p.grounded = false; p.jumps = 1;
        p.vel.set(d.x / T, (d.y + 0.5 * 36 * T * T) / T, d.z / T);
        p.yaw = Math.atan2(d.x, d.z); p.action = 'flip'; p.actionT = 0;
        audio.play('cannon'); g.shake(0.8); g.flash(0.4, 0xffc0e0);
        g.fx.puff(m, 16, 0xc0a0d0, 1.0); g.fx.pop(m, 0xff8ad0, 24);
        for (let i = 0; i < 30; i++) g.fx.dust.emit({ pos: m, vel: d.clone().normalize().multiplyScalar(4 + Math.random() * 6).add(new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 4, (Math.random() - .5) * 4)), life: 1.6, size: 0.18, size1: 0.12, color: [0xff6aa8, 0x40e0c8, 0xffd050, 0x9a7aff][i % 4], gravity: 8, drag: 1.2 });
      }
    } else if (this.state === 'cool' && this.t > 2) this.state = 'idle';
  }
}

// ================================================================== build
export function buildCarnival(game) {
  makeFairMaterials();
  const scene = game.scene, glows = game.glows, P = game.props;
  const group = new THREE.Group(); scene.add(group); group.visible = false;
  const b = new Batch();
  const R = rng(777);
  // bake the shard under a violet sky with rose moonlight
  const saved = { sky: Bake.sky.clone(), ground: Bake.ground.clone(), sun: Bake.sun.clone(), sunDir: Bake.sunDir.clone(), lights: Bake.lights, ao: Bake.ao, macro: Bake.macro, shadow: Bake.shadow };
  Bake.sky.setHex(0x6a52c8); Bake.ground.setHex(0x123a4a); Bake.sun.setHex(0x9a70d0); Bake.sunDir.set(-0.6, 0.62, -0.5).normalize();
  Bake.lights = []; Bake.ao = null; Bake.shadow = null;
  Bake.macro = (p, n, c) => { const k = 0.5 + 0.5 * Math.sin(p.x * 0.05 + p.z * 0.03); c.r *= 0.92 + k * 0.16; c.b *= 1.08 - k * 0.12; };
  const L = (p, c, i, r, o) => { const l = Lights.add(p, c, i, r, o); Bake.lights.push(l); return l; };
  const solidBox = (pos, half, yaw = 0, rot = null) => addBox(pos, half, yaw, rot);
  // lights first, so the bake sees them
  L(V(0, 6, -18), 0xffa0e0, 1.6, 18); L(V(0, 12, -18), 0x60f0e0, 1.2, 14);
  L(V(0, 5, 30), 0xff7ab8, 1.0, 16); L(V(0, 5, 12), 0x50e0d0, 1.0, 16);
  L(FW.clone(), 0xffc060, 1.6, 22); L(V(-46, 3, -14), 0xff7ab8, 1.2, 12);
  L(V(40, 8, -8), 0x60f0e0, 1.2, 14); L(V(0, 5, 58), 0xc070ff, 1.6, 14);
  L(V(0, 18, -70), 0xffa0d8, 0.8, 26); L(V(-12, 10, -70), 0x50e0d0, 0.9, 18); L(V(12, 10, -70), 0xffc060, 0.8, 18); L(V(0, 6, -44), 0xff8ad0, 1.4, 12);

  // ---------------------------------------------------------------- the shard
  const patch = terrainPatch({ x0: CN.x - 82, z0: CN.z - 120, x1: CN.x + 66, z1: CN.z + 92, cell: 2,
    heightAt: (x, z) => fairGround(x, z), inside: (x, z) => inIsland(x - CN.x, z - CN.z),
    snap: (x, z) => { const [a, c] = snapEdge(x - CN.x, z - CN.z); return [a + CN.x, c + CN.z]; }, s: 0.22 });
  b.add(patch.geo, CM.dust, null, { macro: true });
  addTrimesh(patch.geo);
  const under = cliffSkirt(patch, (p) => new THREE.Vector3(CN.x + (p.x - CN.x) * 0.25, CN.y - 34 - Math.sin(p.x * 0.3) * 6, CN.z + ZC + (p.z - CN.z - ZC) * 0.25), { rows: 7, s: 0.12, jitter: 2.6, seed: 77 });
  b.add(under, CM.rock);
  // glowing crystals hanging under the rim and studding the edge
  for (let i = 0; i < 46; i++) {
    const a = R() * PI * 2, k = 0.9 + R() * 0.07;
    let lx = Math.cos(a) * 80, lz = ZC + Math.sin(a) * 95; [lx, lz] = snapEdge(lx, lz); lx *= k; lz = ZC + (lz - ZC) * k;
    if (flatness(lx, lz) > 0.3) continue;
    crystals(b, glows, V(lx, heightAt(lx, lz) - 0.2, lz), 0.6 + R() * 1.0, R, { glow: i % 3 === 0 });
  }
  for (let i = 0; i < 14; i++) {
    const a = R() * PI * 2; const [ex, ez] = snapEdge(Math.cos(a) * 80, ZC + Math.sin(a) * 95);
    const p = V(ex * 0.8, -6 - R() * 10, ZC + (ez - ZC) * 0.8);
    for (let k = 0; k < 4; k++) { const h = 2 + R() * 4; b.add(cyl(0, 0.45 + R() * 0.3, h, 6, { flat: true }), CM.crystal, mat4([p.x + R() * 2, p.y - h / 2, p.z + R() * 2], [PI + (R() - 0.5) * 0.6, R() * 6, (R() - 0.5) * 0.6])); }
    glows.add(p.clone().setY(p.y - 2), 0x30d0c0, 6, true);
  }

  // ---------------------------------------------------------------- paths
  const ring = (c, r0, r1, mat, y = 0.04, seg = 48) => { const g = clean(new THREE.RingGeometry(r0, r1, seg, 2).rotateX(-PI / 2)); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * 0.25, p.getZ(i) * 0.25); b.add(g, mat, mat4([c.x, c.y + y, c.z])); };
  const strip = (ax, az, bx, bz, w, mat = CM.tiles) => { const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az); b.add(box(w, 0.1, len, { s: 0.25 }), mat, mat4([CN.x + (ax + bx) / 2, 0.0, CN.z + (az + bz) / 2], [0, yaw, 0])); };
  strip(0, -2, 0, 50, 10);
  ring(HUB, 0, 17, CM.tiles);
  strip(-17, -18, -40, -18, 6);
  strip(14, -14, 36, -8, 5);
  strip(0, -34, 0, -46, 7);
  ring(V(0, 0, 55), 0, 6, CM.tiles);
  ring(HUB, 17, 17.6, CM.gild, 0.06);

  // ---------------------------------------------------------------- arrival: the moon gate
  const gate = moonGate(group, glows, V(0, 0, 59.5), 0, 2.8);
  solidBox(V(0, 0.25, 59.5), new THREE.Vector3(4, 0.25, 0.8));
  for (const s of [-1, 1]) solidBox(V(s * 2.9, 3, 59.5), new THREE.Vector3(0.5, 3, 0.5));

  // ---------------------------------------------------------------- the entrance arch
  for (const s of [-1, 1]) {
    const p = V(s * 7.5, 0, 44);
    b.add(cyl(1.3, 1.5, 9, 10, { s: 0.25 }), CM.stripeTeal, mat4([p.x, 4.5, p.z]));
    b.add(cyl(1.6, 1.6, 0.4, 10, { s: 1 }), CM.gild, mat4([p.x, 9.1, p.z]));
    b.add(tentRoof(1.9, 3.2, { sides: 10, s: 2 }), CM.stripePink, mat4([p.x, 9.3, p.z]));
    b.add(valance(1.9, 10, 0.4), CM.gild, mat4([p.x, 9.3, p.z]));
    b.add(cyl(0.04, 0.04, 1.4, 4), M.iron, mat4([p.x, 13.1, p.z]));
    b.add(pennant(1.4, 0.6), CM.stripeTeal, mat4([p.x, 13.75, p.z], [0, 0.6, 0]));
    solidBox(p.clone().setY(4.5), new THREE.Vector3(1.2, 4.5, 1.2));
    glows.add(p.clone().setY(9.6), 0xffc060, 2.4, true);
  }
  // arched truss with chasing bulbs and a great crescent moon
  for (let i = 0; i < 16; i++) {
    const a0 = PI * i / 16, a1 = PI * (i + 1) / 16, p0 = V(-Math.cos(a0) * 7.5, 9 + Math.sin(a0) * 2.6, 44), p1 = V(-Math.cos(a1) * 7.5, 9 + Math.sin(a1) * 2.6, 44);
    b.add(UNIT_CYL, CM.gild, between(p0, p1, 0.18));
    b.add(box(0.12, 1, 0.12), CM.bulbs, between(p0.clone().setZ(p0.z + 0.2), p1.clone().setZ(p1.z + 0.2), 1));
  }
  b.add(crescent(2.0, 0.35), CM.gild, mat4([CN.x, 12.6, CN.z + 44], [0, 0, -0.4]));
  glows.add(V(0, 12.6, 44.5), 0xffd070, 6, true);
  for (const s of [-1, 1]) b.add(starSolid(0.7, 0.3, 0.2), CM.gild, mat4([CN.x + s * 3.6, 11.1, CN.z + 44], [0, 0, s * 0.3]));
  // ticket booths flanking the gate
  for (const s of [-1, 1]) {
    const p = V(s * 11.5, 0, 46);
    b.add(box(2.6, 2.6, 2.6, { s: 0.5 }), CM.gild, mat4([p.x, 1.3, p.z]));
    b.add(box(2.0, 1.0, 0.1), retroMat({ map: CT.swirl, emit: 0.6, baked: true }), mat4([p.x, 1.9, p.z + 1.31]));
    b.add(tentRoof(2.2, 2.0, { sides: 8, s: 2 }), CM.stripePink, mat4([p.x, 2.6, p.z]));
    solidBox(p.clone().setY(1.3), new THREE.Vector3(1.3, 1.3, 1.3));
    balloons(b, V(s * 13, 2.6, 47.5), 5, R);
  }

  // ---------------------------------------------------------------- the midway
  const stallZ = [36, 27, 18, 9];
  const stripes = [CM.stripePink, CM.stripeTeal, CM.stripeViolet];
  const lightC = [0xff7ab8, 0x50e8d0, 0xa080ff];
  stallZ.forEach((z, i) => {
    for (const s of [-1, 1]) {
      const k = (i + (s > 0 ? 1 : 0)) % 3;
      const p = V(s * 9.4, 0, z), yaw = s < 0 ? PI / 2 : -PI / 2;
      const lp = stall(b, glows, p, yaw, { mat: stripes[k], light: lightC[k] });
      if ((i + (s > 0 ? 1 : 0)) % 2 === 0) Bake.lights.push(Lights.add(lp, lightC[k], 0.9, 7));
      solidBox(p.clone().setY(1.6).add(new THREE.Vector3(-s * 0.15, 0, 0)), new THREE.Vector3(1.25, 1.6, 2.3), yaw + PI / 2);
      if (R() < 0.7) balloons(b, V(s * 11.9, 3.0, z + 2.2), 3 + Math.floor(R() * 3), R);
    }
  });
  // lantern strings zig-zag over the avenue between tall candy poles
  for (let z = 40, k = 0; z > 2; z -= 6, k++) {
    for (const s of [-1, 1]) { b.add(cyl(0.1, 0.12, 6.4, 6, { s: 1 }), CM.cane, mat4([CN.x + s * 12.2, 3.2, CN.z + z + (s > 0 ? 3 : 0)])); b.add(sphere(0.18, 6, 5), CM.gild, mat4([CN.x + s * 12.2, 6.5, CN.z + z + (s > 0 ? 3 : 0)])); }
    lanternString(b, glows, V(-12.2, 6.2, z), V(12.2, 6.2, z + 3), { sag: 1.3, n: 8, light: k % 2 === 0 });
  }
  // the fortune teller's cabinet and the high striker
  {
    const p = V(-11, 0, 2);
    b.add(box(2.2, 3.2, 1.6, { s: 0.5 }), CM.gild, mat4([p.x, 1.6, p.z], [0, PI / 2, 0]));
    b.add(box(0.1, 1.6, 1.5), retroMat({ color: 0x30c8b8, emit: 0.4, baked: true, opacity: 1 }), mat4([p.x + 0.82, 2.1, p.z]));
    b.add(sphere(0.38, 10, 8), CM.porcelain, mat4([p.x + 0.4, 2.45, p.z]));
    b.add(cyl(0.42, 0.3, 0.42, 10, { s: 2 }), CM.starCloth, mat4([p.x + 0.4, 2.82, p.z]));
    b.add(sphere(0.25, 10, 8), retroMat({ color: 0x80fff0, emit: 1, baked: true }), mat4([p.x + 0.6, 1.95, p.z]));
    b.add(tentRoof(1.8, 1.4, { sides: 6, s: 2 }), CM.stripeViolet, mat4([p.x, 3.2, p.z]));
    glows.add(V(-10.4, 1.95, 2), 0x60fff0, 2.4, true);
    solidBox(p.clone().setY(1.6), new THREE.Vector3(0.8, 1.6, 1.1));
    const s = V(11, 0, 2);
    b.add(box(1.2, 0.4, 1.2, { s: 1 }), CM.gild, mat4([s.x, 0.2, s.z]));
    b.add(box(0.4, 9, 0.4, { s: 0.5 }), CM.stripePink, mat4([s.x, 4.6, s.z]));
    b.add(box(0.14, 8, 0.05), CM.bulbsSlow, mat4([s.x - 0.22, 4.8, s.z], [0, 0, 0]));
    b.add(sphere(0.55, 10, 8), CM.gild, mat4([s.x, 9.5, s.z]));
    glows.add(V(11, 9.5, 2), 0xffd070, 3, true);
    solidBox(s.clone().setY(4.5), new THREE.Vector3(0.6, 4.5, 0.6));
  }

  // ---------------------------------------------------------------- the hub: lamps, floss trees
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * PI * 2 + 0.31;
    if ([0, 2, 7].includes(i)) continue;            // keep the paths clear
    const p = V(Math.cos(a) * 15.2, 0, -18 + Math.sin(a) * 15.2);
    lamp(b, glows, p, i % 2 ? 0x60f0e0 : 0xff8ad0, { light: i % 3 === 0 });
    solidBox(p.clone().setY(1.8), new THREE.Vector3(0.3, 1.8, 0.3));
  }
  const treeOk = (lx, lz) => inIsland(lx * 1.08, ZC + (lz - ZC) * 1.08) && flatness(lx, lz) < 0.05 && Math.hypot(lx + 46, lz + 18) > 20 && Math.hypot(lx, lz + 70) > 30;
  for (let i = 0, n = 0; i < 400 && n < 46; i++) {
    const lx = (R() - 0.5) * 130, lz = ZC + (R() - 0.5) * 175;
    if (!treeOk(lx, lz)) continue;
    n++; flossTree(b, V(lx, heightAt(lx, lz) - 0.1, lz), 4 + R() * 3.5, R);
    if (n % 2 === 0) solidBox(V(lx, heightAt(lx, lz) + 1.5, lz), new THREE.Vector3(0.25, 1.5, 0.25));
  }
  for (let i = 0; i < 260; i++) {
    const lx = (R() - 0.5) * 130, lz = ZC + (R() - 0.5) * 175;
    if (!inIsland(lx, lz) || flatness(lx, lz) > 0.5) continue;
    glows.add(V(lx, heightAt(lx, lz) + 0.15, lz), R() < 0.5 ? 0xff7ac0 : 0x40e8d0, 0.35 + R() * 0.3, true);
  }

  // ---------------------------------------------------------------- the Orrery Carousel
  const rides = { tiers: [], horses: [[], [], []], gondolas: [], rafts: [], trapeze: null };
  const deck = (r, h, mat, rimMat) => {
    const g = new THREE.Group();
    put(g, new THREE.Mesh(cyl(r, r, h, 24, { s: 0.25 }), mat));
    put(g, new THREE.Mesh(cyl(r + 0.05, r + 0.05, h * 0.6, 24, { s: 0.5, open: true }), rimMat), 0, -h * 0.05, 0);
    put(g, new THREE.Mesh(clean(new THREE.TorusGeometry(r + 0.08, 0.07, 4, 48).rotateX(PI / 2)), CM.bulbs), 0, h / 2 - 0.02, 0);
    put(g, new THREE.Mesh(valance(r, 24, 0.55, { flare: 0.08 }), CM.mPink), 0, -h / 2, 0);
    return g;
  };
  // one moon-horse, merged per material and cloned for the herd
  const horseProto = (() => {
    const hb = new Batch(), H = (g, m, pos, rot = [0, 0, 0], s = [1, 1, 1]) => hb.add(g, m, mat4(pos, rot, s));
    const body = CM.horse[0];
    H(sphere(0.42, 10, 8), body, [0, -0.32, 0], [0, 0, 0], [0.62, 0.66, 1.25]);
    H(cyl(0.16, 0.22, 0.75, 8), body, [0, -0.02, 0.5], [-0.75, 0, 0]);
    H(sphere(0.2, 8, 6), body, [0, 0.36, 0.78], [0, 0, 0], [0.9, 0.9, 1.4]);
    H(cyl(0.02, 0.06, 0.4, 5), CM.mGild, [0, 0.62, 0.92], [0.5, 0, 0]);
    for (const s of [-1, 1]) {
      H(cyl(0.06, 0.05, 0.6, 5), body, [s * 0.18, -0.6, 0.38], [-0.9, 0, 0]);
      H(cyl(0.06, 0.05, 0.6, 5), body, [s * 0.18, -0.62, -0.42], [0.8, 0, 0]);
      H(sphere(0.05, 5, 4), CM.mGild, [s * 0.12, 0.42, 0.98]);
    }
    H(sphere(0.2, 8, 6), CM.mPink, [0, 0.02, 0.05], [0, 0, 0], [1.25, 0.45, 1.6]);
    H(box(0.62, 0.06, 0.7), CM.mGild, [0, 0.08, 0.02]);
    for (let i = 0; i < 5; i++) H(sphere(0.11, 6, 5), CM.mTeal, [0, 0.28 + i * 0.03, 0.42 - i * 0.12 + 0.2]);
    H(cyl(0.02, 0.14, 0.55, 6), CM.mTeal, [0, -0.25, -0.62], [-2.2, 0, 0]);
    const g = new THREE.Group(); hb.build(g, { name: 'horse' }); return g;
  })();
  const horseMats = CM.horse;
  const tiers = [
    { r: 9.5, top: 0.42, h: 0.42, period: 18, horses: 8, hr: 7.4, poleTop: 4.6, mat: CM.mTiles },
    { r: 6.4, top: 3.9, h: 0.5, period: -14, horses: 6, hr: 4.9, poleTop: 7.8, mat: CM.mPlanks },
    { r: 4.25, top: 7.4, h: 0.5, period: 11, horses: 4, hr: 2.95, poleTop: 10.6, mat: CM.mTiles },
  ];
  tiers.forEach((T, ti) => {
    const w = PI * 2 / T.period;
    const mesh = deck(T.r, T.h, T.mat, CM.mGild);
    for (let i = 0; i < T.horses; i++) {
      const a = i / T.horses * PI * 2;
      put(mesh, new THREE.Mesh(cyl(0.06, 0.06, T.poleTop - T.top, 5, { s: 1 }), CM.mGild), Math.cos(a) * T.hr, (T.poleTop - T.top) / 2 + T.h / 2, Math.sin(a) * T.hr);
      put(mesh, new THREE.Mesh(sphere(0.14, 6, 5), CM.mGild), Math.cos(a) * T.hr, T.poleTop - T.top + T.h / 2, Math.sin(a) * T.hr);
    }
    put(mesh, new THREE.Mesh(clean(new THREE.TorusGeometry(T.hr, 0.08, 4, 40).rotateX(PI / 2)), CM.mGild), 0, T.poleTop - T.top + T.h / 2, 0);
    rides.tiers.push(Object.assign(P.mover(mesh, new THREE.Vector3(T.r, T.h / 2, T.r), (t) => ({ pos: _v.set(HUB.x, T.top - T.h / 2, HUB.z), yaw: -w * t }), group, { radius: T.r }), { T }));
    for (let i = 0; i < T.horses; i++) {
      const a0 = i / T.horses * PI * 2, ph = i * 1.7 + ti;
      const hm = new THREE.Group();
      for (const c of horseProto.children) hm.add(new THREE.Mesh(c.geometry, c.material === CM.horse[0] ? horseMats[(i + ti) % 3] : c.material));
      rides.horses[ti].push(P.mover(hm, new THREE.Vector3(0.3, 0.15, 0.7), (t) => {
        const a = a0 + w * t;
        return { pos: _v.set(HUB.x + Math.cos(a) * T.hr, T.top + 0.85 + (0.5 + 0.5 * Math.sin(t * 2.0 + ph)) * 1.45, HUB.z + Math.sin(a) * T.hr), yaw: -a + (w < 0 ? PI : 0) };
      }, group));
    }
  });
  // the mirrored column and the crown
  b.add(cyl(1.35, 1.45, 11, 12, { s: 0.6 }), retroMat({ map: CT.porcelain, chrome: 0.8, env: T.blueEnv, baked: true, emit: 0.15 }), mat4([HUB.x, 5.5, HUB.z]));
  for (const y of [0.3, 3.0, 6.6, 10.5]) b.add(cyl(1.55, 1.55, 0.3, 12, { s: 1 }), CM.gild, mat4([HUB.x, y, HUB.z]));
  addCylinder(HUB.clone().setY(5.5), 5.5, 1.4);
  b.add(cyl(2.1, 1.6, 0.4, 16, { s: 0.5 }), CM.gild, mat4([HUB.x, 10.8, HUB.z]));
  addCylinder(HUB.clone().setY(10.8), 0.2, 2.1);
  b.add(valance(2.1, 16, 0.5), CM.stripePink, mat4([HUB.x, 10.6, HUB.z]));
  b.add(crescent(1.3, 0.25), CM.gild, mat4([HUB.x, 13.4, HUB.z - 1.2], [0, 0, -0.4]));
  b.add(cyl(0.08, 0.08, 2.4, 5), CM.gild, mat4([HUB.x, 12.2, HUB.z - 1.2]));
  glows.add(V(0, 13.4, -19.2), 0xffd070, 4, true);
  // motes swirl around each deck
  P.motesRing(HUB.clone().setY(1.6), 8.2, 14);
  P.motesRing(HUB.clone().setY(5.2), 5.2, 10);
  P.motesRing(HUB.clone().setY(8.8), 3.6, 6);

  // ---------------------------------------------------------------- the Lantern Wheel
  const wheel = new THREE.Group(); wheel.position.copy(FW); group.add(wheel);
  {
    const wb = new Batch(), W = (g, m, mt) => wb.add(g, m, mt);
    for (const z of [-1.7, 1.7]) {
      W(clean(new THREE.TorusGeometry(FW_R, 0.22, 6, 64)), CM.mGild, mat4([0, 0, z]));
      W(clean(new THREE.TorusGeometry(FW_R + 0.32, 0.1, 4, 96)), CM.bulbs, mat4([0, 0, z]));
      W(clean(new THREE.TorusGeometry(FW_R * 0.55, 0.14, 5, 48)), CM.mGild, mat4([0, 0, z]));
      for (let i = 0; i < 20; i++) { const a = i / 20 * PI * 2; W(box(0.14, FW_R, 0.14), i % 2 ? CM.mGild : CM.mCane, mat4([Math.cos(a) * FW_R / 2, Math.sin(a) * FW_R / 2, z], [0, 0, a - PI / 2])); }
    }
    for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; W(cyl(0.09, 0.09, 3.6, 5), CM.mGild, mat4([Math.cos(a) * FW_R, Math.sin(a) * FW_R, 0], [PI / 2, 0, 0])); }
    W(cyl(1.5, 1.5, 4.2, 14), CM.mStar, mat4([0, 0, 0], [PI / 2, 0, 0]));
    for (const z of [-2.15, 2.15]) W(starSolid(2.2, 1.0, 0.25), CM.mGild, mat4([0, 0, z]));
    wb.build(wheel, { name: 'wheel' });
  }
  glows.add(FW.clone().setZ(FW.z + 2.6), 0xffd070, 8, true);
  // the A-frame and the boarding deck
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = V(-46 + sx * 7.5, 0, -18 + sz * 3.8), top = FW.clone().setZ(FW.z + sz * 2.4);
    b.add(box(0.6, 1, 0.6, { s: 1 }), CM.stripeViolet, between(foot, top, 1));
    const len = foot.distanceTo(top), dir = top.clone().sub(foot).normalize();
    solidBox(foot.clone().add(top).multiplyScalar(0.5), new THREE.Vector3(0.3, len / 2, 0.3), 0, new THREE.Quaternion().setFromUnitVectors(UP, dir));
  }
  b.add(box(6, 0.3, 2.6, { s: 0.5 }), CM.planks, mat4([FW.x, 0.15, FW.z + 3.6]));
  solidBox(V(-46, 0.15, -14.4), new THREE.Vector3(3, 0.15, 1.3));
  b.add(box(6.2, 0.12, 0.05), CM.bulbs, mat4([FW.x, 0.35, FW.z + 4.92]));
  // gondolas: open swing-seats under little striped canopies
  const gondola = (() => {
    const g = new THREE.Group(), gb = new Batch(), A = (geo, m, mt) => gb.add(geo, m, mt);
    A(box(2.4, 0.3, 2.0, { s: 0.6 }), CM.mPlanks, mat4([0, 0, 0]));
    A(box(2.5, 0.12, 2.1), CM.mGild, mat4([0, -0.15, 0]));
    A(box(2.2, 0.5, 0.3, { s: 1 }), CM.mVelvet, mat4([0, 0.4, -0.85]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) A(cyl(0.04, 0.04, 2.3, 4), CM.mGild, mat4([sx * 1.1, 1.2, sz * 0.9]));
    A(cyl(0.06, 0.06, 2.0, 4), CM.mGild, mat4([0, 2.4, 0], [PI / 2, 0, 0]));
    A(tentRoof(1.7, 0.9, { sides: 8, s: 1 }), CM.mPink, mat4([0, 2.35, 0], [0, PI / 8, 0]));
    A(valance(1.7, 8, 0.3), CM.mGild, mat4([0, 2.35, 0], [0, PI / 8, 0]));
    gb.build(g, { name: 'gondola' });
    return g;
  })();
  const fwW = PI * 2 / 38;
  let gondolaClock = null;
  for (let i = 0; i < 10; i++) {
    const a0 = i / 10 * PI * 2, gm = gondola.clone();
    const mv = P.mover(gm, new THREE.Vector3(1.2, 0.15, 1.0), (t) => {
      const a = a0 + fwW * t;
      return { pos: _v.set(FW.x + Math.cos(a) * FW_R, FW.y + Math.sin(a) * FW_R - 2.4, FW.z), yaw: 0 };
    }, group);
    gondolaClock = gondolaClock || mv; rides.gondolas.push(mv);
  }
  // the crow's nest beside the top of the wheel, on a tall mast
  {
    const p = V(-46, 32.4, -22.9);
    b.add(cyl(0.3, 0.45, 32.3, 8, { s: 0.25, hseg: 6 }), CM.cane, mat4([p.x, 16.1, p.z]));
    b.add(cyl(1.75, 1.2, 0.5, 14, { s: 0.6 }), CM.gild, mat4([p.x, p.y - 0.25, p.z]));
    b.add(cyl(1.7, 1.7, 0.08, 14, { s: 0.4 }), CM.planks, mat4([p.x, p.y + 0.02, p.z]));
    b.add(valance(1.75, 14, 0.4), CM.stripeTeal, mat4([p.x, p.y - 0.4, p.z]));
    addCylinder(p.clone().setY(p.y - 0.25), 0.25, 1.75);
    addCylinder(V(-46, 16, -22.9), 16, 0.4);
    glows.add(p.clone().setY(p.y + 0.5), 0xffd070, 3, true);
  }
  // perches for the imps that pelt you on the ride
  const impPerches = [V(-29, 14, -28), V(-62, 23, -10)];
  for (const p of impPerches) {
    b.add(cyl(1.5, 1.2, 0.4, 12, { s: 0.6 }), CM.planks, mat4([p.x, p.y - 0.2, p.z]));
    b.add(valance(1.5, 12, 0.3), CM.stripePink, mat4([p.x, p.y - 0.4, p.z]));
    addCylinder(p.clone().setY(p.y - 0.2), 0.2, 1.5);
    balloons(b, p.clone().setY(p.y - 0.1), 7, R, { spread: 1.4, height: 3.2, size: 0.55 });
  }
  // motes ringing the wheel's ride path
  for (let i = 0; i < 22; i++) { const a = i / 22 * PI * 2; if (Math.sin(a) < -0.85) continue; P.mote(new THREE.Vector3(FW.x + Math.cos(a) * FW_R, FW.y + Math.sin(a) * FW_R - 1.4, FW.z)); }

  // ---------------------------------------------------------------- helter-skelter and the high wire
  {
    const TR = 2.4, TH = 15, turns = 1.5, a0 = PI, N = 96;
    b.add(cyl(TR, TR + 0.1, TH, 12, { s: 0.25, hseg: 4 }), CM.stripeTeal, mat4([HS.x, TH / 2, HS.z]));
    addCylinder(HS.clone().setY(TH / 2), TH / 2, TR);
    b.add(cyl(2.7, 2.7, 0.3, 14, { s: 0.5 }), CM.gild, mat4([HS.x, TH - 0.15, HS.z]));
    b.add(cyl(2.6, 2.6, 0.06, 14, { s: 0.4 }), CM.planks, mat4([HS.x, TH + 0.02, HS.z]));
    addCylinder(HS.clone().setY(TH - 0.15), 0.15, 2.7);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.add(cyl(0.08, 0.08, 3.8, 5), CM.cane, mat4([HS.x + Math.cos(a) * 2.3, TH + 1.9, HS.z + Math.sin(a) * 2.3])); }
    b.add(tentRoof(3.3, 3.2, { sides: 10, s: 2 }), CM.stripePink, mat4([HS.x, TH + 3.8, HS.z]));
    b.add(valance(3.3, 10, 0.4), CM.gild, mat4([HS.x, TH + 3.8, HS.z]));
    b.add(pennant(1.6, 0.7), CM.stripeTeal, mat4([HS.x, TH + 8.4, HS.z], [0, 0.4, 0]));
    b.add(cyl(0.04, 0.04, 1.6, 4), M.iron, mat4([HS.x, TH + 7.7, HS.z]));
    glows.add(HS.clone().setY(TH + 4.2), 0xff8ad0, 3, true);
    // the spiral ramp (walk up it) with a raised outer lip
    const top = [], uv = [], idx = [], lip = [], luv = [], lidx = [], und = [], uidx = [], uuv = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = a0 + t * turns * PI * 2, y = 0.12 + t * (TH - 0.12), c = Math.cos(a), s = Math.sin(a);
      top.push(HS.x + c * TR, y, HS.z + s * TR, HS.x + c * 5.1, y, HS.z + s * 5.1); uv.push(0, t * 30, 1, t * 30);
      lip.push(HS.x + c * 5.1, y, HS.z + s * 5.1, HS.x + c * 5.1, y + 0.55, HS.z + s * 5.1, HS.x + c * 5.3, y + 0.55, HS.z + s * 5.3, HS.x + c * 5.3, y - 0.4, HS.z + s * 5.3);
      luv.push(t * 30, 0, t * 30, 0.3, t * 30, 0.4, t * 30, 1);
      und.push(HS.x + c * TR, y - 0.4, HS.z + s * TR, HS.x + c * 5.3, y - 0.4, HS.z + s * 5.3); uuv.push(0, t * 30, 1, t * 30);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); uidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      const l = i * 4; if (i > 7 && i < N - 3) for (let k = 0; k < 3; k++) lidx.push(l + k, l + k + 4, l + k + 1, l + k + 1, l + k + 4, l + k + 5);
    }
    const mk = (pp, uu, ii) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2)); g.setIndex(ii); g.computeVertexNormals(); return clean(g); };
    const ramp = mk(top, uv, idx), lipG = mk(lip, luv, lidx), undG = mk(und, uuv, uidx);
    b.add(ramp, CM.planks); b.add(lipG, CM.stripePink); b.add(undG, CM.stripeViolet);
    addTrimesh(ramp); addTrimesh(lipG);
    for (let i = 0; i <= 18; i++) { const t = (i + 0.5) / 19, a = a0 + t * turns * PI * 2; P.mote(new THREE.Vector3(HS.x + Math.cos(a) * 3.8, 0.9 + t * (TH - 0.12), HS.z + Math.sin(a) * 3.8)); }
  }
  // fixed masts out over the void, joined by tightropes
  const mast = (c, r, star = false) => {
    b.add(cyl(0.25, 0.35, 40, 8, { s: 0.25, hseg: 8 }), CM.cane, mat4([c.x, c.y - 20.3, c.z]));
    b.add(cyl(r, r * 0.8, 0.4, 16, { s: 0.6 }), CM.planks, mat4([c.x, c.y - 0.2, c.z]));
    b.add(clean(new THREE.TorusGeometry(r, 0.1, 4, 32).rotateX(PI / 2)), CM.gild, mat4([c.x, c.y, c.z]));
    b.add(valance(r, 14, 0.35), star ? CM.stripeTeal : CM.stripePink, mat4([c.x, c.y - 0.4, c.z]));
    if (star) b.add(starSolid(r * 0.75, r * 0.32, 0.04), CM.gild, mat4([c.x, c.y + 0.02, c.z], [-PI / 2, 0, 0]));
    addCylinder(c.clone().setY(c.y - 0.2), 0.2, r);
    glows.add(c.clone().setY(c.y - 0.5), 0xff8ad0, 2, true);
  };
  const rope = (a, c) => {
    b.add(UNIT_CYL, CM.rope, between(a, c, 0.07));
    const d = c.clone().sub(a), len = d.length(), mid = a.clone().add(c).multiplyScalar(0.5);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
    solidBox(mid.setY(mid.y - 0.12), new THREE.Vector3(0.22, 0.1, len / 2), 0, _q.clone());
    for (const e of [a, c]) b.add(sphere(0.16, 6, 5), CM.gild, mat4([e.x, e.y, e.z]));
    P.motesLine(a.clone().lerp(c, 0.15).setY(lerp(a.y, c.y, 0.15) + 0.9), a.clone().lerp(c, 0.85).setY(lerp(a.y, c.y, 0.85) + 0.9), Math.max(2, Math.round(len / 3)));
  };
  const P1 = V(58, 15, -8), P2 = V(80.5, 17.2, 11), P3 = V(80.5, 18, 26.5);
  mast(P1, 1.4); mast(P2, 1.7); mast(P3, 3.2, true);
  rope(V(45.2, 15, -8), V(56.6, 15, -8));
  rope(V(80.5, 17.2, 12.7), V(80.5, 18, 23.3));
  // sinking balloon rafts
  const raftProto = (() => {
    const g = new THREE.Group(), rb = new Batch();
    rb.add(cyl(1.5, 1.3, 0.3, 14, { s: 0.6 }), CM.mPlanks, mat4([0, 0, 0]));
    rb.add(cyl(1.55, 1.55, 0.14, 14), CM.mGild, mat4([0, 0.1, 0]));
    rb.build(g);
    const bb = new Batch(); const r0 = rng(5);
    for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2, d = i ? 0.9 : 0, top = new THREE.Vector3(Math.cos(a) * d, 4.4 + r0() * 0.9, Math.sin(a) * d); bb.add(sphere(0.6, 9, 7), CM.balloon[i % 5], mat4([top.x, top.y, top.z], [0, 0, 0], [1, 1.18, 1])); bb.add(UNIT_CYL, CM.mRope, between(new THREE.Vector3(Math.cos(a) * 1.3, 0.1, Math.sin(a) * 1.3), top.clone().setY(top.y - 0.7), 0.015)); }
    bb.build(g);
    return g;
  })();
  for (const p of [V(61.5, 15.3, -3.5), V(64.5, 15.8, 1.8), V(67.2, 16.4, 7.2)]) rides.rafts.push(P.add(new SinkRaft(game, p, group, raftProto)));
  // the swinging trapeze
  {
    const pivot = V(72.5, 24.6, 11), len = 7.9, amp = 0.53, wT = PI * 2 / 4.0;
    b.add(box(10.5, 0.4, 0.4, { s: 1 }), CM.gild, mat4([pivot.x, pivot.y + 0.2, pivot.z]));
    for (const s of [-1, 1]) b.add(cyl(0.2, 0.3, 40, 8, { s: 0.25, hseg: 8 }), CM.cane, mat4([pivot.x + s * 5.3, pivot.y - 19.6, pivot.z]));
    const tm = new THREE.Group(), tb = new Batch();
    tb.add(box(2.4, 0.3, 1.2, { s: 0.8 }), CM.mGild, mat4([0, 0, 0]));
    tb.add(box(2.5, 0.08, 1.3), CM.mPink, mat4([0, 0.17, 0]));
    tb.build(tm);
    const ropes = [-1, 1].map(s => put(tm, new THREE.Mesh(UNIT_CYL, CM.mRope), 0, 0, 0));
    rides.trapeze = P.mover(tm, new THREE.Vector3(1.2, 0.15, 0.6), (t) => {
      const th = amp * Math.sin(t * wT);
      const pos = _v.set(pivot.x + Math.sin(th) * len, pivot.y - Math.cos(th) * len, pivot.z);
      for (const [k, s] of [-1, 1].entries()) {
        const a = new THREE.Vector3(s * 1.1, 0.1, 0), c = new THREE.Vector3(pivot.x - pos.x + s * 1.1, pivot.y - pos.y, 0);
        ropes[k].position.copy(a).add(c).multiplyScalar(0.5); ropes[k].quaternion.setFromUnitVectors(UP, c.clone().sub(a).normalize()); ropes[k].scale.set(0.035, c.distanceTo(a), 0.035);
      }
      return { pos, yaw: 0 };
    }, group);
  }
  // the Starlight Perch: ticket, a jack, and the cannon home
  const cannonTarget = V(14, 0.1, -6), cannon = P.add(new Cannon(game, V(77.4, 18, 25.0), cannonTarget, 2.6, group));
  {
    // motes strung along the flight, to be scooped up in mid-air
    const s0 = cannon.load.clone().setY(cannon.load.y + 2.6), d = cannonTarget.clone().sub(s0), T = 2.6, vy = (d.y + 18 * T * T) / T;
    for (let i = 2; i < 13; i++) { const t = i / 14 * T; P.mote(new THREE.Vector3(s0.x + d.x / T * t, s0.y + vy * t - 18 * t * t + 0.6, s0.z + d.z / T * t)); }
  }

  // ---------------------------------------------------------------- the Big Top
  const BTH = 8, BTroof = 18;
  {
    const gap = 0.15;           // the entrance arc (radians) faces +z
    // outer canvas wall, roof, lining
    const wallG = new THREE.CylinderGeometry(BT_R, BT_R, BTH, 40, 2, true, gap, PI * 2 - gap * 2);
    const wg = clean(wallG); { const uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 22, uv.getY(i) * 2); }
    b.add(wg, CM.stripePink, mat4([BT.x, BTH / 2, BT.z]));
    b.add(tentRoof(BT_R + 1.2, BTroof, { sides: 40, sag: 0.1, s: 22 }), CM.stripePink, mat4([BT.x, BTH, BT.z]));
    b.add(valance(BT_R + 1.2, 40, 0.9, { flare: 0.1 }), CM.gild, mat4([BT.x, BTH + 0.05, BT.z]));
    const lining = (g) => { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); return g; };
    const inWall = lining(clean(new THREE.CylinderGeometry(BT_R - 0.15, BT_R - 0.15, BTH, 40, 2, true, gap, PI * 2 - gap * 2)));
    { const uv = inWall.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 30, uv.getY(i) * 3); }
    b.add(inWall, CM.starCloth, mat4([BT.x, BTH / 2, BT.z]));
    b.add(lining(tentRoof(BT_R + 1.0, BTroof - 0.4, { sides: 40, sag: 0.1, s: 30 })), CM.starCloth, mat4([BT.x, BTH - 0.1, BT.z]));
    // peak, flags, side peaks
    b.add(cyl(0.3, 0.4, 6, 8, { s: 1 }), CM.cane, mat4([BT.x, BTH + BTroof + 1.5, BT.z]));
    b.add(crescent(1.6, 0.3), CM.gild, mat4([BT.x, BTH + BTroof + 5.6, BT.z], [0, 0.3, -0.4]));
    glows.add(BT.clone().setY(BTH + BTroof + 5.6), 0xffd070, 7, true);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2 + PI / 8, p = new THREE.Vector3(BT.x + Math.cos(a) * (BT_R + 0.4), BTH + 0.5, BT.z + Math.sin(a) * (BT_R + 0.4));
      b.add(cyl(0.05, 0.05, 2.2, 4), M.iron, mat4([p.x, p.y + 1.1, p.z]));
      b.add(pennant(1.4, 0.6), i % 2 ? CM.stripeTeal : CM.stripeViolet, mat4([p.x, p.y + 2.1, p.z], [0, -a, 0]));
    }
    // bulb strings running down the roof
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * PI * 2, pts = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, r = Math.max(0.3, (BT_R + 1.2) * t), y = BTH + BTroof * (1 - t) - Math.sin(t * PI) * BTroof * 0.1 + 0.15; pts.push(new THREE.Vector3(BT.x + Math.cos(a) * r, y, BT.z + Math.sin(a) * r)); }
      for (let k = 0; k < 8; k++) b.add(box(0.14, 1, 0.14), CM.bulbsSlow, between(pts[k], pts[k + 1], 1));
    }
    // wall colliders around the ring, leaving the entrance open
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = (i + 0.5) / segs * PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2))) < gap + 0.04) continue;
      solidBox(new THREE.Vector3(BT.x + Math.cos(a) * BT_R, BTH / 2, BT.z + Math.sin(a) * BT_R), new THREE.Vector3(0.3, BTH / 2, BT_R * PI / segs + 0.2), -a);
    }
    // the portico: a striped porch with the ticket marquee
    const pz = BT.z + BT_R;
    for (const s of [-1, 1]) {
      b.add(box(0.6, 6.4, 5, { s: 0.4 }), CM.stripeTeal, mat4([BT.x + s * 3.6, 3.2, pz + 1.0]));
      solidBox(new THREE.Vector3(BT.x + s * 3.6, 3.2, pz + 1.0), new THREE.Vector3(0.3, 3.2, 2.5));
      b.add(cyl(0.35, 0.35, 7, 8, { s: 1 }), CM.cane, mat4([BT.x + s * 3.6, 3.5, pz + 3.6]));
      b.add(sphere(0.45, 8, 6), CM.gild, mat4([BT.x + s * 3.6, 7.2, pz + 3.6]));
    }
    b.add(box(8, 0.5, 5.6, { s: 0.4 }), CM.stripeViolet, mat4([BT.x, 6.6, pz + 1.0]));
    b.add(box(8.2, 1.8, 0.4, { s: 0.6 }), CM.gild, mat4([BT.x, 7.6, pz + 3.8]));
    b.add(box(8.3, 0.16, 0.05), CM.bulbs, mat4([BT.x, 8.52, pz + 4.02])); b.add(box(8.3, 0.16, 0.05), CM.bulbs, mat4([BT.x, 6.68, pz + 4.02]));
    b.add(crescent(0.9, 0.2), CM.gild, mat4([BT.x, 9.4, pz + 3.8], [0, 0, -0.4]));
    // interior: the ring, its curb, the bleachers and their puppet audience
    const ringG = clean(new THREE.CircleGeometry(15, 48).rotateX(-PI / 2));
    b.add(ringG, CM.ring, mat4([BT.x, 0.06, BT.z]));
    b.add(clean(new THREE.TorusGeometry(15.25, 0.28, 4, 64).rotateX(PI / 2)), CM.gild, mat4([BT.x, 0.12, BT.z]));
    const bl = [[16.5, 0], [16.5, 0.7], [18, 0.7], [18, 1.4], [19.5, 1.4], [19.5, 2.1], [21, 2.1], [21, 2.8], [23.6, 2.8], [23.6, 0]];
    const bleach = clean(new THREE.LatheGeometry(bl.map(([x, y]) => new THREE.Vector2(x, y)), 40, 0.32, PI * 2 - 0.64));
    { const uv = bleach.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 40, uv.getY(i) * 2); }
    b.add(bleach, CM.velvet, mat4([BT.x, 0, BT.z]));
    addTrimesh(bleach, mat4([BT.x, 0, BT.z]));
    const audienceR = rng(91);
    for (let i = 0; i < 70; i++) {
      const row = i % 4, a = PI / 2 + 0.4 + audienceR() * (PI * 2 - 0.8), r = 17.2 + row * 1.5, y = 0.7 + row * 0.7;
      const p = new THREE.Vector3(BT.x + Math.cos(a) * r, y, BT.z + Math.sin(a) * r), yaw = Math.atan2(BT.x - p.x, BT.z - p.z);
      b.add(cyl(0.18, 0.32, 0.8, 6), CM.dark, mat4([p.x, p.y + 0.4, p.z]));
      b.add(sphere(0.24, 7, 5), CM.dark, mat4([p.x, p.y + 1.0, p.z]));
      for (const s of [-1, 1]) b.add(sphere(0.045, 4, 3), retroMat({ color: 0xffe0f0, emit: 1, fog: 0.5, baked: true }), mat4([p.x + Math.sin(yaw) * 0.2 + Math.cos(yaw) * s * 0.09, p.y + 1.04, p.z + Math.cos(yaw) * 0.2 - Math.sin(yaw) * s * 0.09]));
    }
    // king poles at the ring's edge, spotlight beams from the dark above
    for (const s of [-1, 1]) {
      const p = new THREE.Vector3(BT.x + s * 16.2, 0, BT.z);
      b.add(cyl(0.45, 0.55, BTH + BTroof * 0.55, 8, { s: 0.5, hseg: 4 }), CM.cane, mat4([p.x, (BTH + BTroof * 0.55) / 2, p.z]));
      addCylinder(p.clone().setY(8), 8, 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * PI * 2 + PI / 4, top = new THREE.Vector3(BT.x + Math.cos(a) * 9.5, 15.5, BT.z + Math.sin(a) * 9.5), foot = new THREE.Vector3(BT.x - Math.cos(a) * 2.5, 0, BT.z - Math.sin(a) * 2.5);
      const cone = new THREE.Mesh(cyl(0.6, 3.6, 1, 12, { open: true }), retroMat({ color: [0xff7ac0, 0x50e8d0, 0xffd060, 0xa080ff][i], emit: 1, additive: true, opacity: 0.075, side: THREE.DoubleSide, fog: 0.2, depthWrite: false }));
      cone.applyMatrix4(between(top, foot, 1)); group.add(cone);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * PI * 2;
      lanternString(b, glows, BT.clone().setY(BTH + BTroof - 4), new THREE.Vector3(BT.x + Math.cos(a) * (BT_R - 1), BTH - 0.5, BT.z + Math.sin(a) * (BT_R - 1)), { sag: 1.6, n: 6 });
    }
  }
  // the curtains: closed until you hold all three tickets
  const curtains = P.add(new Curtains(game, V(0, 0, -70 + BT_R + 2.2), 6.6, 6.0, 0, group));
  const seal = P.add(new Curtains(game, V(0, 0, -70 + BT_R - 0.4), 6.6, 6.0, 0, group, { closed: false }));
  const marquee = [-1, 0, 1].map(k => {
    const m = new THREE.Mesh(clean(new THREE.PlaneGeometry(1.5, 0.75)), retroMat({ map: CT.ticket, color: 0x3a2a3a, alphaTest: 0.5, fog: 0.5 }));
    m.position.copy(V(k * 2.4, 7.6, -70 + BT_R + 4.02)); group.add(m); return m;
  });

  // ---------------------------------------------------------------- distant shards drifting in the nebula
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * PI * 2 + R() * 0.3, d = 130 + R() * 90, c = V(Math.cos(a) * d, -25 + R() * 55, ZC + Math.sin(a) * d), s = 6 + R() * 12;
    const g = new THREE.IcosahedronGeometry(1, 1), pp = g.attributes.position;
    for (let k = 0; k < pp.count; k++) { const y = pp.getY(k); pp.setXYZ(k, pp.getX(k) * (0.8 + R() * 0.4), y > 0 ? y * 0.25 : y * (1.4 + R() * 0.8), pp.getZ(k) * (0.8 + R() * 0.4)); }
    g.computeVertexNormals();
    b.add(clean(g), CM.rockFar, mat4([c.x, c.y, c.z], [0, R() * 6, 0], s));
    if (R() < 0.6) { tent(b, glows, c.clone().setY(c.y + s * 0.25), s * 0.18, s * 0.2, { mat: R() < 0.5 ? CM.stripePink : CM.stripeTeal, s: 0.4 }); }
    glows.add(c.clone().setY(c.y + s * 0.3), R() < 0.5 ? 0xff7ac0 : 0x50e8d0, s * 0.6, true);
  }

  // a sea of nebula below everything
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-PI / 2), retroMat({ map: CT.swirl, color: 0x6a2a8a, emit: 0.7, scroll: [0.002, 0.004], fog: 0.85 }));
  { const uv = sea.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 30, uv.getY(i) * 30); }
  sea.position.copy(V(0, -90, 0)); sea.renderOrder = -5; group.add(sea);

  b.build(group, { name: 'carnival' });
  Object.assign(Bake, { lights: saved.lights, ao: saved.ao, macro: saved.macro, shadow: saved.shadow });
  Bake.sky.copy(saved.sky); Bake.ground.copy(saved.ground); Bake.sun.copy(saved.sun); Bake.sunDir.copy(saved.sunDir);

  // ================================================================ gameplay
  const st = { hints: new Set(), tickets: 0, boss: false };
  game.tickets = 0;
  const gotTicket = (where) => {
    st.tickets++; game.tickets = st.tickets;
    audio.play('ticket'); game.flash(0.4, 0xffd8a0);
    game.hud.callout(`Moon Ticket ${st.tickets}/3`);
    marquee[st.tickets - 1].material = retroMat({ map: CT.ticket, emit: 0.9, alphaTest: 0.5, fog: 0.4 });
    game.glows.add(marquee[st.tickets - 1].position.clone().setZ(marquee[st.tickets - 1].position.z + 0.3), 0xffc060, 2.6, true);
    if (st.tickets >= 3) {
      setTimeout(() => { curtains.set(true); audio.play('portalOpen', { volume: 0.5 }); game.hud.hint('All three tickets! The Big Top’s curtains part…', 5); }, 900);
    } else game.hud.hint(['', 'One ticket… two more to find.', 'Two tickets! One more opens the Big Top.'][st.tickets], 4);
  };
  P.add(new Ticket(game, HUB.clone().setY(11.0), group, () => gotTicket('carousel')));
  P.add(new Ticket(game, V(-46, 32.4, -22.9), group, () => gotTicket('wheel')));
  P.add(new Ticket(game, V(82.4, 18.0, 27.6), group, () => gotTicket('wire')));
  // checkpoints
  const lamps = [
    [V(4.2, 0, 47.5), PI, 'The Moon Gate'], [V(5, 0, 1), PI, 'The Midway'], [V(-33, 0, -13.6), -PI / 2, 'The Lantern Wheel'],
    [V(32.5, 0, -2.5), PI / 2 + 0.4, 'The Helter-Skelter'], [V(39.2, 15.08, -9.3), PI / 2, 'The High Wire'], [V(6.2, 0, -41.6), PI, 'The Big Top'],
  ].map(([p, yaw, name]) => P.add(new Lamp(game, p, yaw, name, group)));
  // gift boxes
  const giftMats = [CM.mPink, CM.mTeal, retroMat({ map: CT.stripeViolet, rim: 0.15 })];
  const giftAt = (lx, lz, y = null) => {
    const p = V(lx, y ?? heightAt(lx, lz), lz), g = new THREE.Group(); g.position.copy(p); g.rotation.y = R() * 6; group.add(g);
    put(g, new THREE.Mesh(box(0.8, 0.7, 0.8, { s: 1.4 }), giftMats[Math.floor(R() * 3)]), 0, 0.35, 0);
    put(g, new THREE.Mesh(box(0.84, 0.72, 0.16), CM.mGild), 0, 0.35, 0); put(g, new THREE.Mesh(box(0.16, 0.72, 0.84), CM.mGild), 0, 0.35, 0);
    for (const s of [-1, 1]) { const bw = put(g, new THREE.Mesh(sphere(0.16, 6, 5), CM.mGild), s * 0.14, 0.8, 0); bw.scale.set(1.2, 0.7, 0.7); }
    P.add(new Gift(game, p, g));
  };
  for (const [x, z] of [[-6, 40], [6, 32], [-6.5, 14], [6.5, 6], [-3, 22], [12, -26], [-13, -9], [9, -33], [-36, -22], [-34, -12], [30, -14], [34, 0], [-7, -44], [7, -38]]) giftAt(x, z);
  giftAt(58, -8.6, 15.0);
  // motes: down the midway, round the hub, along the paths
  P.motesLine(V(-3, 0.9, 50), V(-3, 0.9, 4), 14); P.motesLine(V(3, 0.9, 46), V(3, 0.9, 8), 12);
  P.motesRing(HUB.clone().setY(0.9), 13, 18);
  P.motesLine(V(-18, 0.9, -18), V(-36, 0.9, -18), 7); P.motesLine(V(16, 0.9, -14), V(32, 0.9, -9), 6); P.motesLine(V(0, 0.9, -32), V(0, 0.9, -42), 5);
  // folk of the fair
  const foes = [];
  const F = (kind, p, o = {}) => { const e = spawn(game, kind, p, { parent: group, ...o }); foes.push(e); return e; };
  F('imp', V(-4, 0.4, 30)); F('imp', V(5, 0.4, 20)); F('imp', V(-2, 0.4, 8));
  F('jack', V(-6.2, 0, 24), { yaw: PI / 2 }); F('jack', V(6.4, 0, 3.5), { yaw: -PI / 2 });
  F('tin', V(-13, 0.3, -6), { patrol: [V(-13, 0, -6), V(13, 0, -6)] }); F('tin', V(13, 0.3, -30), { patrol: [V(13, 0, -30), V(-13, 0, -30)] });
  F('imp', V(-12, 0.4, -31));
  F('imp', impPerches[0].clone().setY(impPerches[0].y + 0.2), { perch: true, aggro: 34, throwRange: 30 });
  F('imp', impPerches[1].clone().setY(impPerches[1].y + 0.2), { perch: true, aggro: 34, throwRange: 30 });
  F('tin', V(20, 0.3, -13), { patrol: [V(18, 0, -14), V(31, 0, -9)] }); F('imp', V(30, 0.4, 2));
  F('jack', V(80.4, 18, 29.1), { yaw: PI, trigger: 3.8 });
  F('tin', V(-5, 0.3, -40), { yaw: 0 }); F('tin', V(5, 0.3, -40), { yaw: 0 });

  // the queen herself
  const queen = setupQueen(game, { group, center: BT.clone(), radius: 14.5 });
  const fairSky = createFairSky(scene);

  // ---------------------------------------------------------------- zone
  const palette = {
    fog: 0x2a0a38, near: 30, far: 175, sky: 0x6a4ac0, ground: 0x0e3444, sun: 0xa880e0, rim: 0x40e0d0, sunDir: new THREE.Vector3(-0.6, 0.62, -0.5).normalize(),
  };
  let savedPal = null;
  const zone = {
    group, killY: CN.y - 16, queen, st, rides, cannon, spots: { HUB, FW, HS, BT, P1, P2, P3 },
    ambient: [0xff8ad0, 0x50f0e0, 0.25],
    music: () => (queen.active ? 'bigtop' : 'carnival'),
    onEnter(g, silent) {
      savedPal = savedPal || { fog: GU.uFogColor.value.clone(), near: GU.uFogNear.value, far: GU.uFogFar.value, sky: GU.uAmbSky.value.clone(), ground: GU.uAmbGround.value.clone(), sun: GU.uSunColor.value.clone(), rim: GU.uRimColor.value.clone(), sunDir: GU.uSunDir.value.clone() };
      GU.uFogColor.value.setHex(palette.fog); GU.uFogNear.value = palette.near; GU.uFogFar.value = palette.far;
      GU.uAmbSky.value.setHex(palette.sky); GU.uAmbGround.value.setHex(palette.ground); GU.uSunColor.value.setHex(palette.sun); GU.uRimColor.value.setHex(palette.rim); GU.uSunDir.value.copy(palette.sunDir);
      g.sky.group.visible = false; fairSky.group.visible = true;
      if (!queen.active) { g.hud.boss(null); g.player.cam.focus = null; }
      audio.stopLoop('wind'); audio.startLoop('nebula', { volume: 0.5 }); audio.startLoop('ghostCrowd', { volume: 0.6 }); audio.startLoop('carousel', { volume: 0 });
      if (!silent) {
        audio.music('carnival');
        g.hud.area('The Midnight Carnival', 'on a shard of the broken moon');
        if (!st.hints.has('intro')) { st.hints.add('intro'); setTimeout(() => g.zone === 'carnival' && st.tickets < 3 && g.hud.hint('Find three Moon Tickets to open the Big Top.', 6), 2600); }
      }
    },
    onLeave(g) {
      if (savedPal) {
        GU.uFogColor.value.copy(savedPal.fog); GU.uFogNear.value = savedPal.near; GU.uFogFar.value = savedPal.far;
        GU.uAmbSky.value.copy(savedPal.sky); GU.uAmbGround.value.copy(savedPal.ground); GU.uSunColor.value.copy(savedPal.sun); GU.uRimColor.value.copy(savedPal.rim); GU.uSunDir.value.copy(savedPal.sunDir);
      }
      g.sky.group.visible = true; fairSky.group.visible = false;
      for (const l of ['nebula', 'ghostCrowd', 'carousel']) audio.stopLoop(l);
      queen.reset();
    },
    onRespawn(g) {
      if (queen.active) { queen.reset(); seal.set(true); audio.music('carnival'); st.boss = false; }
    },
    tick(dt, g) {
      const p = g.player.pos;
      fairSky.update(g.time, g.camera.position);
      wheel.rotation.z = (fwW * gondolaClock.t) % (PI * 2);
      gate.heart.rotation.z += dt * 0.6;
      audio.setLoopVolume('carousel', Math.max(0, 1 - p.distanceTo(HUB) / 30) * 0.9);
      // area banners and the fortune teller
      for (const [k, q, r, name, sub] of [['wheel', V(-38, 0, -18), 9, 'The Lantern Wheel', ''], ['wire', V(36, 0, -6), 8, 'The High Wire', 'mind your step'], ['hub', HUB, 12, 'The Orrery Carousel', '']]) {
        if (!st.hints.has(k) && p.distanceTo(q) < r) { st.hints.add(k); g.hud.area(name, sub); }
      }
      if (p.distanceTo(V(-9.6, 0, 2)) < 3.8) {
        if (!st.fortune || g.time - st.fortune > 12) {
          st.fortune = g.time; audio.play('portalOpen', { volume: 0.25, pitch: 1.6 });
          g.hud.hint(st.tickets >= 3 ? 'Madame Lune: “The Queen pulls every string. Cut them.”' : 'Madame Lune: “Three Moon Tickets — on the Carousel’s crown, atop the Lantern Wheel, and past the High Wire.”', 6);
        }
      }
      // into the Big Top
      if (!st.boss && st.tickets >= 3 && Math.hypot(p.x - BT.x, p.z - BT.z) < 13.5 && p.y < 3) {
        st.boss = true; seal.set(false);
        g.setCheckpoint(V(0, 0.1, -70 + BT_R - 3), PI, 'The Big Top');
        queen.begin();
      }
      queen.update(dt);
    },
    unsafeAt: () => false,
  };
  game.zones.carnival = zone;

  // ---------------------------------------------------------------- the way in
  game.enterFair = () => {
    if (queen.active) { queen.reset(); seal.set(true); st.boss = false; }
    game.enterZone('carnival', FAIR_SPAWN, PI);
    game.setCheckpoint(FAIR_SPAWN, PI, 'The Moon Gate');
  };
  zone.skipTo = (where) => {
    if (where === 'queen') {
      for (let i = st.tickets; i < 3; i++) { st.tickets++; marquee[i].material = retroMat({ map: CT.ticket, emit: 0.9, alphaTest: 0.5 }); }
      game.tickets = 3;
      for (const p of P.list) if (p instanceof Ticket && p.alive) { p.alive = false; p.group.removeFromParent(); game.glows.set(p.glow, p.pos, 0, 0); }
      game.glows.dirty();
      curtains.set(true);
      const pos = V(0, 0.1, -70 + BT_R - 3);
      game.player.teleport(pos, PI); game.setCheckpoint(pos, PI, 'The Big Top');
    }
  };
  // the moon gate that opens in the dragon's hoard once the Star-Eater falls
  game.openMoonGate = () => {
    const c = game.zones.castle, a = c.arena, at = a.center.clone().setY(a.y);
    if (!game.hoardGate) {
      const gg = moonGate(c.group, glows, at, a.yaw, 2.8);
      game.hoardGate = { gate: gg, pos: at, t: 0 };
      gg.group.scale.setScalar(0.01);
      audio.play('portalOpen'); game.shake(0.4); game.flash(0.4, 0xd0a0ff);
      game.hud.hint('A moon gate has opened in the hoard… step through it.', 6);
    }
  };
  game.hoardGateTick = (dt) => {
    const h = game.hoardGate; if (!h || game.zone !== 'castle') return;
    h.t += dt; h.gate.group.scale.setScalar(Math.min(1, h.t * 0.8) ** 0.5); h.gate.heart.rotation.z += dt * 0.6;
    if (Math.random() < dt * 12) game.fx.spark.emit({ pos: h.gate.center.clone().add(new THREE.Vector3((Math.random() - .5) * 4, (Math.random() - .5) * 4, (Math.random() - .5) * 1)), vel: new THREE.Vector3(0, 0.8, 0), life: 0.8, size: 0.5, size1: 0, color: Math.random() < 0.5 ? 0xff8ad0 : 0x60f0e0 });
    const p = game.player.pos;
    if (h.t > 1.5 && !h.used && Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < 2.2 && Math.abs(p.y - h.pos.y) < 2) {
      h.used = true; audio.play('portalEnter'); game.R.post.uWarp.value = 0.01;
      game.cutscene = true;
      const t0 = performance.now();
      const warp = () => {
        const k = (performance.now() - t0) / 1000;
        game.R.post.uWarp.value = Math.min(1, k * 1.2);
        if (k < 1.0) return requestAnimationFrame(warp);
        game.R.post.uWarp.value = 0; game.cutscene = false; h.used = false;
        game.enterFair();
      };
      requestAnimationFrame(warp);
    }
  };
  return zone;
}
