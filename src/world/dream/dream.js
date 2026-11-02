// Book II — the Mirror Sea: the dream of a sleeping god. A perfectly still
// lagoon of mirror-glass under a kaleidoscope sky, pouring off the edge of the
// world into a starry abyss. Wick steps through a mirror and finds:
//   The Glass Lagoon — walk on your own reflection among chrome monoliths,
//     half-sunk moon arches, drifting lotus lanterns and schools of chrome koi
//     swimming through the air.
//   The Jelly Reef (west) — bounce up a tower of giant iridescent jellyfish to
//     the coral crown. First Dream Shard.
//   The Sleeping Colossus (north) — a marble head the size of a hill, eyes
//     closed. Climb the dream-stair that builds itself out of thin air as you
//     go, round and round the head to the lotus on its crown. Second shard.
//   The Hanging Isle (east) — ride an upward waterfall, then a glass manta
//     ray, to an island hanging upside-down over its own reflection; climb its
//     pagoda for the third shard.
//   Three shards wake the Dreamer: its eyes open, a rose-window arena forms
//     before its face, and a pillar of light lifts you up to Somnia.
import * as THREE from 'three';
import { G as GU, Lights, retroMat } from '../../core/retro.js';
import { Bake, rng, clean, mat4, Batch, box, cyl, sphere } from '../../core/geo.js';
import { addBox, addTrimesh, addCylinder, addPlatform, world } from '../../core/physics.js';
import { Prop, put } from '../props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { spawn } from '../../actors/enemies.js';
import '../../actors/dreamfolk.js';
import { setupSomnia } from '../../actors/somnia.js';
import { createMirror } from '../../core/mirror.js';
import { DT, DM, makeDreamMaterials, holoMat, prismMat, fallsMat, lotus, petalGeo, colossusHeadGeo, lashGeo, hand, monolith, arch, pagoda, crystals, stairs, bellGeo, fishGeo } from './assets.js';
import { createDreamSky, SUN_DIR } from './sky.js';
import audio from '../../sound.js';

const PI = Math.PI;
export const DN = new THREE.Vector3(-900, 0, 0);               // zone origin
const V = (x, y, z) => new THREE.Vector3(DN.x + x, DN.y + y, DN.z + z);
export const DREAM_SPAWN = V(0, 0.5, 55);
const LAGOON_R = 72;
const HEAD = V(0, 13, -46), HEAD_S = new THREE.Vector3(13, 14, 13);
const REEF = V(-44, 0, 6);
const UP1 = V(34, 0, -2), LEDGE = V(39.5, 11, -6.5), ISLE = V(55, 22, -18), ISLE_R = 9.5;
const AR = V(0, 12, -6), AR_R = 14, PILLAR = V(0, 0, 13.5);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const R0 = Math.random;

// ------------------------------------------------------------------ props
// a Dream Shard: a slowly turning prism in a column of rainbow light
class Shard extends Prop {
  constructor(game, pos, parent, onGet) {
    super(game); this.pos = pos.clone(); this.onGet = onGet; this.t = R0() * 6;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g); this.group = g;
    const geo = clean(new THREE.OctahedronGeometry(0.55, 0)); geo.scale(0.8, 1.6, 0.8);
    this.gem = put(g, new THREE.Mesh(geo, prismMat({ bright: 1.2 })), 0, 1.4, 0);
    this.inner = put(g, new THREE.Mesh(geo, retroMat({ color: 0xffffff, emit: 1, fog: 0.3 })), 0, 1.4, 0); this.inner.scale.setScalar(0.45);
    put(g, new THREE.Mesh(cyl(0.6, 1.1, 46, 10, { open: true }), fallsMat({ dir: 1, speed: 0.3, opacity: 0.35, tint: 0xc0a0ff })), 0, 23, 0);
    this.glow = game.glows.add(pos.clone().setY(pos.y + 1.4), 0xd0b0ff, 5, true);
  }
  update(dt) {
    this.t += dt;
    this.gem.rotation.y = this.t * 1.6; this.inner.rotation.y = -this.t * 2.4;
    this.gem.position.y = this.inner.position.y = 1.4 + Math.sin(this.t * 2) * 0.18;
    if (R0() < dt * 12) this.game.fx.spark.emit({ pos: this.pos.clone().add(new THREE.Vector3((R0() - .5) * 1.6, 0.6 + R0() * 1.8, (R0() - .5) * 1.6)), vel: new THREE.Vector3(0, 1.2, 0), life: 0.9, size: 0.4, size1: 0, color: [0xff80e0, 0x80f0ff, 0xffe080][Math.floor(R0() * 3)] });
    const p = this.game.player;
    if (p && !p.dead && p.pos.distanceTo(_v.copy(this.pos).setY(this.pos.y + 0.6)) < 1.9) {
      this.alive = false; this.group.removeFromParent();
      this.game.glows.set(this.glow, this.pos, 0x000000, 0); this.game.glows.dirty();
      const c = this.pos.clone().setY(this.pos.y + 1.4);
      this.game.fx.pop(c, 0xd0b0ff, 36);
      for (let i = 0; i < 30; i++) this.game.fx.dust.emit({ pos: c, vel: new THREE.Vector3((R0() - .5) * 9, 3 + R0() * 7, (R0() - .5) * 9), life: 1.6, size: 0.2, size1: 0.1, color: [0xff70e0, 0x70f0ff, 0xffe080, 0xa080ff][i % 4], gravity: 7, drag: 1 });
      this.onGet?.();
    }
  }
}

// a lotus lantern floating on the glass: a checkpoint
class LotusLamp extends Prop {
  constructor(game, pos, yaw, name, parent) {
    super(game); this.pos = pos.clone(); this.yaw = yaw; this.name = name; this.lit = false;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g); this.group = g;
    const b = new Batch();
    lotus(b, DM.mLotus, DM.mGold, new THREE.Vector3(0, 0.05, 0), 1.1, { rings: 3, n: 8, open: 0.75 });
    b.build(g);
    put(g, new THREE.Mesh(cyl(1.25, 1.3, 0.12, 12), DM.mChrome), 0, 0.03, 0);
    this.off = retroMat({ color: 0x3a2a6a, emit: 0.2 }); this.on = retroMat({ color: 0xc0f0ff, emit: 1, fog: 0.35 });
    this.orb = put(g, new THREE.Mesh(sphere(0.32, 10, 8), this.off), 0, 0.75, 0);
    this.orbP = pos.clone().setY(pos.y + 0.75);
    this.glowI = game.glows.add(this.orbP, 0x000000, 3, true);
    this.light = Lights.add(this.orbP, 0x80e0ff, 0, 8);
  }
  update(dt) {
    this.orb.position.y = 0.75 + Math.sin(this.game.time * 2 + this.pos.x) * 0.08;
    if (this.lit) { if (R0() < dt * 3) this.game.fx.glow.emit({ pos: this.orbP.clone().add(new THREE.Vector3((R0() - .5) * .4, 0.3, (R0() - .5) * .4)), vel: new THREE.Vector3(0, 0.7, 0), life: 1, size: 0.25, size1: 0, color: R0() < 0.5 ? 0x80f0ff : 0xff90e0 }); return; }
    const p = this.game.player;
    if (p && !p.dead && p.pos.distanceTo(this.pos) < 2.4) this.light_();
  }
  light_(silent = false) {
    this.lit = true; this.orb.material = this.on;
    this.game.glows.set(this.glowI, this.orbP, 0x90e8ff, 3); this.game.glows.dirty();
    this.light.intensity = 1.4;
    this.game.setCheckpoint(this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 1.8, 0.1, Math.cos(this.yaw) * 1.8)), this.yaw, this.name);
    if (!silent) { audio.play('checkpoint', { volume: 0.6 }); audio.play('dreamStep', { pitch: 1.5 }); this.game.fx.pop(this.orbP, 0x90e8ff, 14); this.game.hud.callout('Checkpoint', 'small'); }
  }
}

// an iridescent bubble drifting over the glass: pop it for motes
class DreamBubble extends Prop {
  constructor(game, pos, parent, mat) {
    super(game); this.home = pos.clone(); this.pos = pos.clone(); this.radius = 0.7; this.height = 1.2; this.noAim = true; this.t = R0() * 9;
    this.mesh = new THREE.Mesh(sphere(0.65, 12, 9), mat); this.mesh.position.copy(pos); parent.add(this.mesh);
    game.addTarget(this);
  }
  onHit() { this.pop(); return 'hit'; }
  onStomp() { this.pop(); }
  pop() {
    if (!this.alive) return;
    this.alive = false; this.game.removeTarget(this); this.mesh.removeFromParent();
    const g = this.game, c = this.pos.clone().setY(this.pos.y + 0.6);
    audio.play('bubblePop', { pitch: 0.8 + R0() * 0.3 });
    for (let i = 0; i < 12; i++) g.fx.dust.emit({ pos: c, vel: new THREE.Vector3((R0() - .5) * 5, 2 + R0() * 3, (R0() - .5) * 5), life: 0.9, size: 0.14, size1: 0, color: [0x9ad8ff, 0xff90e0, 0xffffff][i % 3], gravity: 6 });
    g.props.burst(c, 3);
    if (R0() < 0.25) g.props.heart(this.pos);
  }
  update(dt) {
    this.t += dt;
    this.pos.set(this.home.x + Math.sin(this.t * 0.4) * 0.8, this.home.y + Math.sin(this.t * 1.1) * 0.25, this.home.z + Math.cos(this.t * 0.33) * 0.8);
    this.mesh.position.copy(this.pos).setY(this.pos.y + 0.6);
    this.mesh.scale.set(1 + Math.sin(this.t * 3) * 0.05, 1 - Math.sin(this.t * 3) * 0.05, 1);
    this.stompable = true;
  }
}

// a giant jellyfish: land on its bell and it flings you skyward (hold JUMP: higher)
class Jelly extends Prop {
  constructor(game, top, r, parent, { bob = 0.6, period = 5, hue = 0x7a9aff } = {}) {
    super(game); this.home = top.clone(); this.r = r; this.t = R0() * 9; this.bob = bob; this.w = PI * 2 / period; this.squash = 0;
    const g = new THREE.Group(); g.position.copy(top); parent.add(g); this.group = g;
    // (the group sits at the collider's centre; its top is 0.25 up)
    this.bell = put(g, new THREE.Mesh(bellGeo(r * 1.15, 22), holoMat({ color: hue, opacity: 0.62, glow: 0.35 })), 0, 0.3, 0);
    this.inner = put(g, new THREE.Mesh(sphere(r * 0.45, 12, 8), retroMat({ color: 0xff90e0, emit: 1, fog: 0.35 })), 0, 0.25 - r * 0.45, 0); this.inner.scale.y = 0.6;
    // the cap you land on: a soft glowing disc
    put(g, new THREE.Mesh(cyl(r * 0.92, r * 0.98, 0.12, 20), holoMat({ color: 0xc0e0ff, opacity: 0.5, glow: 0.6 })), 0, 0.2, 0);
    // seven trailing tentacles in one mesh
    const tg = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * PI * 2, len = 4 + R0() * 4;
      tg.push(clean(new THREE.PlaneGeometry(0.35, len, 1, 10)).applyMatrix4(mat4([Math.cos(a) * r * 0.55, 0.25 - r * 0.8 - len / 2, Math.sin(a) * r * 0.55], [0, -a, 0])));
    }
    put(g, new THREE.Mesh(mergeGeometries(tg, false), holoMat({ color: hue, opacity: 0.5, glow: 0.4, wobble: 0.25 })));
    this.pf = addPlatform(new THREE.Vector3(r, 0.25, r), g, { radius: r });
    this.pf.setPose(top.clone().setY(top.y - 0.25));
    this.glow = game.glows.add(top.clone().setY(top.y - r * 0.4), 0xff90e0, 4, true);
  }
  update(dt) {
    this.t += dt;
    const y = this.home.y + Math.sin(this.t * this.w) * this.bob - 0.25;
    this.pf.setPose(_v.copy(this.home).setY(y));
    this.game.glows.set(this.glow, _w.copy(this.home).setY(y - this.r * 0.2), 0xff90e0, 4); this.game.glows.dirty();
    this.squash *= Math.exp(-dt * 5);
    const pulse = Math.sin(this.t * 2.2) * 0.04;
    this.bell.scale.set(1 + this.squash * 0.25 + pulse, 1 - this.squash * 0.4 - pulse, 1 + this.squash * 0.25 + pulse);
    const p = this.game.player;
    if (p && !p.dead && p.grounded && p.platform === this.pf) {
      const big = p.jumpHeld;
      p.vel.y = big ? 22 : 17.5; p.grounded = false; p.jumps = 0; p.noCut = true; p.airHits = 0; p.coyote = 0; p.jumpBuf = 0; p.springT = 0.15;
      if (big) { p.action = 'flip'; p.actionT = 0; }
      this.squash = 1;
      audio.play('jellyBounce', { pitch: big ? 1.15 : 1 });
      this.game.fx.rings.add(_v.copy(this.home).setY(y + 0.35), { color: 0xff90e0, r0: 0.5, r1: this.r * 1.6, life: 0.4 });
      for (let i = 0; i < 10; i++) this.game.fx.spark.emit({ pos: _v.copy(p.pos).setY(p.pos.y + 0.2), vel: new THREE.Vector3((R0() - .5) * 3, 4 + R0() * 6, (R0() - .5) * 3), life: 0.6, size: 0.4, size1: 0, color: R0() < 0.5 ? 0xff90e0 : 0x90e0ff });
    }
  }
}

// a waterfall pouring UP: step in and it lifts you; at the top you float
class Updraft extends Prop {
  constructor(game, base, r, top, parent) {
    super(game); this.base = base.clone(); this.r = r; this.top = top; this.inside = false; this.vol = 0;
    const g = new THREE.Group(); g.position.copy(base); parent.add(g); this.group = g;
    const h = top - base.y + 3;
    const sheet = (rr, sp, op) => { const geo = cyl(rr, rr, h, 18, { open: true }); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.08); return put(g, new THREE.Mesh(geo, fallsMat({ dir: 1, speed: sp, opacity: op })), 0, h / 2, 0); };
    sheet(r, 0.7, 0.42); sheet(r * 0.6, 1.1, 0.26);
    this.foam = put(g, new THREE.Mesh(clean(new THREE.RingGeometry(r * 0.6, r * 1.5, 24).rotateX(-PI / 2)), retroMat({ color: 0xc0f0ff, emit: 1, additive: true, opacity: 0.5, side: THREE.DoubleSide, fog: 0.3 })), 0, 0.05, 0);
    this.glow = game.glows.add(base.clone().setY(base.y + 0.5), 0x90e0ff, 6, true);
    this.cap = game.glows.add(base.clone().setY(top + 1.5), 0xd0b0ff, 7, true);
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.foam.rotation.y += dt * 0.8; this.foam.scale.setScalar(1 + Math.sin(g.time * 4) * 0.06);
    if (R0() < dt * 14) g.fx.glow.emit({ pos: _v.set(this.base.x + (R0() - .5) * this.r * 1.6, this.base.y + R0() * (this.top - this.base.y), this.base.z + (R0() - .5) * this.r * 1.6), vel: new THREE.Vector3(0, 5 + R0() * 4, 0), life: 1.2, size: 0.3, size1: 0, color: [0x90e0ff, 0xff90e0, 0xffffff][Math.floor(R0() * 3)], alpha: 0.9 });
    const inside = p && !p.dead && Math.hypot(p.pos.x - this.base.x, p.pos.z - this.base.z) < this.r && p.pos.y > this.base.y - 0.5 && p.pos.y < this.top + 2.5;
    if (inside) {
      // (gravity is pre-paid: the player subtracts it right after this)
      const want = p.pos.y < this.top - 1.5 ? 10 : Math.max(-0.5, (this.top - p.pos.y) * 3);
      p.vel.y += (want - p.vel.y) * (1 - Math.exp(-dt * 7)) + 36 * dt;
      if (p.grounded && want > 1) { p.vel.y = Math.max(p.vel.y, 4); p.grounded = false; }
      p.noCut = true; p.jumps = 0; p.airHits = 0;
      if (p.action === 'plunge') p.action = null;
      if (!this.inside) { audio.play('updraftEnter'); g.dreamRipple?.(this.base, 0.8); }
    }
    this.inside = inside;
    this.vol += ((inside ? 0.9 : 0) - this.vol) * (1 - Math.exp(-dt * 4));
    g.updraftVol = Math.max(g.updraftVol || 0, this.vol);
  }
}

// a stepping tile of the dream-stair: a faint ghost until you come near, then it
// unfolds into lapis and stained glass with a chime (a rising scale as you climb)
class DreamTile extends Prop {
  constructor(game, pos, r, i, parent, mats) {
    super(game); this.pos = pos.clone(); this.i = i; this.k = 0; this.shown = false;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g); this.group = g;
    this.solid = new THREE.Group(); g.add(this.solid);
    put(this.solid, new THREE.Mesh(cyl(r, r * 0.85, 0.5, 6, { s: 0.6 }), DM.mLapis), 0, -0.25, 0);
    put(this.solid, new THREE.Mesh(clean(new THREE.CircleGeometry(r * 0.78, 6).rotateX(-PI / 2)), mats.glass), 0, 0.012, 0);
    put(this.solid, new THREE.Mesh(clean(new THREE.TorusGeometry(r * 0.92, 0.07, 4, 6)), DM.mChrome), 0, 0.0, 0).rotation.x = PI / 2;
    this.ghost = put(g, new THREE.Mesh(cyl(r, r, 0.4, 6), mats.ghost), 0, -0.2, 0);
    this.solid.scale.setScalar(0.01);
    addCylinder(pos.clone().setY(pos.y - 0.25), 0.25, r);
  }
  update(dt) {
    const p = this.game.player;
    if (!this.shown && p && p.pos.distanceTo(this.pos) < 9.5) {
      this.shown = true; audio.play('dreamStep', { pitch: 0.8 + Math.min(1, this.i * 0.035) * 0.8, volume: 0.7 });
      for (let k = 0; k < 8; k++) this.game.fx.spark.emit({ pos: this.pos.clone().add(new THREE.Vector3((R0() - .5) * 2, 0.2, (R0() - .5) * 2)), vel: new THREE.Vector3(0, 2, 0), life: 0.6, size: 0.4, size1: 0, color: R0() < 0.5 ? 0xa0c0ff : 0xff90e0 });
    }
    if (this.shown && this.k < 1) {
      this.k = Math.min(1, this.k + dt * 3.2);
      const e = this.k, s = e < 1 ? 1 + Math.sin(e * PI) * 0.25 : 1;
      this.solid.scale.set(e * s, e, e * s); this.solid.rotation.y = (1 - e) * PI;
      this.ghost.visible = e < 0.5;
    }
  }
}

// a dream-stair tile that blinks in and out on a beat (its partner opposite)
class PhaseTile extends Prop {
  constructor(game, pos, r, phase, parent, mats) {
    super(game); this.pos = pos.clone(); this.phase = phase; this.on = true;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g); this.group = g;
    put(g, new THREE.Mesh(cyl(r, r * 0.85, 0.4, 6, { s: 0.6 }), mats.phase), 0, 0, 0);
    put(g, new THREE.Mesh(clean(new THREE.TorusGeometry(r * 0.92, 0.07, 4, 6)), DM.mChrome), 0, 0.2, 0).rotation.x = PI / 2;
    this.pf = addPlatform(new THREE.Vector3(r, 0.2, r), g, { radius: r });
    this.pf.setPose(pos.clone().setY(pos.y - 0.2));
  }
  update() {
    const T = 3.2, t = (this.game.time / T + this.phase) % 1;
    const on = t < 0.62;
    const warn = on && t > 0.5;
    this.group.visible = on && !(warn && Math.floor(this.game.time * 14) % 2);
    if (on !== this.on) {
      this.on = on;
      if (on) { this.pf.setPose(this.pos.clone().setY(this.pos.y - 0.2)); audio.play('dreamStep', { pitch: 1.6, volume: 0.35 }); }
      else { this.pf.setPose(_v.set(0, -500, 0)); this.group.position.copy(this.pos).setY(this.pos.y - 0.2); }
    }
  }
}

// a glass manta ray gliding between two landings along one smooth arc (pausing
// at each end); it banks round gently, never faster than a rider can stand
function mantaPath(A, B, a1, b1, glide = 5.5, wait = 2.6) {
  const T = (glide + wait) * 2;
  const bez = (p0, p1, p2, p3, t, out) => { const u = 1 - t; return out.set(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t); };
  const pos = new THREE.Vector3(), nxt = new THREE.Vector3();
  let yaw = Math.atan2(a1.x - A.x, a1.z - A.z), want = yaw, lastT = 0;
  const at = (t, out) => {
    t = ((t % T) + T) % T;
    if (t < wait) return out.copy(A).setY(A.y + Math.sin(t * 2) * 0.08);
    t -= wait;
    if (t < glide) return bez(A, a1, b1, B, THREE.MathUtils.smoothstep(t / glide, 0, 1), out);
    t -= glide;
    if (t < wait) return out.copy(B).setY(B.y + Math.sin(t * 2) * 0.08);
    t -= wait;
    return bez(B, b1, a1, A, THREE.MathUtils.smoothstep(t / glide, 0, 1), out);
  };
  return (t) => {
    at(t, pos); at(t + 0.08, nxt);
    const dx = nxt.x - pos.x, dz = nxt.z - pos.z;
    if (dx * dx + dz * dz > 1e-5) want = Math.atan2(dx, dz);
    let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const dt = Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
    yaw += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9);
    return { pos: pos.clone(), yaw };
  };
}

// ================================================================== build
export function buildDream(game) {
  makeDreamMaterials();
  const scene = game.scene, glows = game.glows, P = game.props;
  const group = new THREE.Group(); scene.add(group); group.visible = false;
  const b = new Batch();
  const R = rng(4242);
  const saved = { sky: Bake.sky.clone(), ground: Bake.ground.clone(), sun: Bake.sun.clone(), sunDir: Bake.sunDir.clone(), lights: Bake.lights, ao: Bake.ao, macro: Bake.macro, shadow: Bake.shadow };
  // light comes down from the mandala and back up off the mirror
  Bake.sky.setHex(0x4438a0); Bake.ground.setHex(0x1e4490); Bake.sun.setHex(0x9a86e0); Bake.sunDir.set(-0.3, 0.75, 0.6).normalize();
  Bake.lights = []; Bake.ao = null; Bake.shadow = null;
  Bake.macro = (p, n, c) => { const k = 0.5 + 0.5 * Math.sin(p.x * 0.04 - p.z * 0.03 + p.y * 0.05); c.r *= 0.9 + k * 0.2; c.g *= 0.95 + (1 - k) * 0.1; };
  const L = (p, c, i, r, o) => { const l = Lights.add(p, c, i, r, o); Bake.lights.push(l); return l; };
  L(V(0, 6, 55), 0xa080ff, 1.4, 16); L(V(0, 4, -24), 0xff90e0, 0.7, 18); L(V(-12, 22, -46), 0x70e0ff, 1.2, 20); L(V(14, 18, -50), 0xff80e0, 1.2, 20);
  L(V(-44, 8, 6), 0xff80e0, 1.5, 22); L(V(-50, 26, 2), 0x70e0ff, 1.3, 18); L(V(36, 6, -2), 0x70e0ff, 1.5, 16); L(V(55, 28, -18), 0xffd080, 1.3, 18); L(V(55, 18, -18), 0x70f0c0, 1.2, 14);

  // ---------------------------------------------------------------- the lagoon: one great mirror
  const mirror = createMirror(clean(new THREE.CircleGeometry(LAGOON_R, 120)), { res: 0.5, tint: 0xa8b0ff, sheen: 0.24, etch: 0.1, etchColor: 0x9a7aff, center: V(0, 0, -6) });
  mirror.mesh.rotation.x = -PI / 2; mirror.mesh.position.copy(DN); group.add(mirror.mesh);
  addCylinder(V(0, -1, 0), 1, LAGOON_R);
  game.dreamRipple = (p, s = 1) => { if (game.zone === 'dream' && p.y < DN.y + 1.2) mirror.ripple(p, s); };
  // the edge of the dream: the lagoon pours over into the abyss
  {
    const geo = cyl(LAGOON_R, LAGOON_R - 6, 60, 120, { open: true }); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.35, uv.getY(i) * 0.04);
    const falls = new THREE.Mesh(geo, fallsMat({ dir: -1, speed: 0.5, opacity: 0.7, tint: 0x8ab0ff })); falls.position.copy(V(0, -30, 0)); group.add(falls);
    const lip = new THREE.Mesh(clean(new THREE.TorusGeometry(LAGOON_R, 0.18, 4, 160)), retroMat({ color: 0xd0f0ff, emit: 1, fog: 0.4 })); lip.rotation.x = PI / 2; lip.position.copy(V(0, 0.02, 0)); group.add(lip);
  }
  // spawn dais and the mirror you arrive through
  b.add(cyl(5.2, 5.6, 0.5, 24, { s: 0.5 }), DM.lapis, mat4(V(0, 0.25, 58)));
  b.add(clean(new THREE.TorusGeometry(5.2, 0.16, 4, 32)), DM.gold, mat4(V(0, 0.5, 58), [PI / 2, 0, 0]));
  addCylinder(V(0, 0.25, 58), 0.25, 5.4);
  const portal = new THREE.Group(); portal.position.copy(V(0, 0.5, 62.6)); group.add(portal);
  { const fr = new THREE.Mesh(clean(new THREE.TorusGeometry(1, 0.12, 6, 40)), DM.mChrome); fr.scale.set(2.2, 3.3, 2.2); fr.position.y = 3.3; portal.add(fr);
    const fr2 = new THREE.Mesh(clean(new THREE.TorusGeometry(1.08, 0.05, 4, 40)), DM.mGold); fr2.scale.set(2.2, 3.3, 2.2); fr2.position.y = 3.3; portal.add(fr2);
    const face = new THREE.Mesh(clean(new THREE.CircleGeometry(1, 40)), holoMat({ color: 0x8a7aff, opacity: 0.85, glow: 0.5, side: THREE.DoubleSide })); face.scale.set(2.15, 3.25, 1); face.position.y = 3.3; portal.add(face);
    lotus(b, DM.lotus, DM.gold, V(0, 0.5, 62.6), 1.6, { rings: 2, n: 10, open: 1.2 });
    addBox(V(0, 3.5, 62.6), new THREE.Vector3(2.4, 3.5, 0.3)); }
  glows.add(V(0, 3.8, 62.6), 0x9a7aff, 9, true);

  // ---------------------------------------------------------------- the sleeping colossus
  const headGeo = colossusHeadGeo();
  const headM = new THREE.Matrix4().compose(HEAD, new THREE.Quaternion(), HEAD_S);
  b.add(headGeo, DM.marble, headM);
  addTrimesh(headGeo.clone().applyMatrix4(headM));
  const tmp = new THREE.Mesh(headGeo), ray = new THREE.Raycaster();
  const surf = (x, y) => { ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1)); const h = ray.intersectObject(tmp)[0]; return h ? h.point.clone() : new THREE.Vector3(x, y, 0.8); };
  const lashes = [], wakeEyes = [];
  for (const s of [-1, 1]) {
    const e = surf(s * 0.24, 0.07);
    const lash = new THREE.Mesh(lashGeo(0.2, 0.03, 0.012), DM.mGold);
    lash.matrixAutoUpdate = false; lash.matrix.copy(headM).multiply(new THREE.Matrix4().makeTranslation(e.x, e.y + 0.005, e.z + 0.012)); group.add(lash); lashes.push(lash);
    const eye = new THREE.Mesh(sphere(1, 16, 10), prismMat({ bright: 1.6 }));
    eye.matrixAutoUpdate = false; eye.userData.base = new THREE.Matrix4().copy(headM).multiply(new THREE.Matrix4().makeTranslation(e.x, e.y + 0.01, e.z - 0.01));
    eye.matrix.copy(eye.userData.base).multiply(new THREE.Matrix4().makeScale(0.1, 0.001, 0.035)); group.add(eye); wakeEyes.push(eye);
  }
  const third = surf(0, 0.3);
  const urna = new THREE.Mesh(clean(new THREE.OctahedronGeometry(1, 0)), prismMat({ bright: 1.3 }));
  urna.matrixAutoUpdate = false; urna.matrix.copy(headM).multiply(new THREE.Matrix4().compose(third.clone().setZ(third.z + 0.01), new THREE.Quaternion(), new THREE.Vector3(0.035, 0.05, 0.02))); group.add(urna);
  // long earlobes with gold hoops, a gold diadem
  for (const s of [-1, 1]) {
    const ear = new THREE.Matrix4().copy(headM).multiply(mat4([s * 0.74, -0.02, -0.06], [0, 0, s * 0.08], [0.07, 0.32, 0.15]));
    b.add(sphere(1, 10, 10), DM.marble, ear);
    b.add(clean(new THREE.TorusGeometry(1, 0.15, 6, 16)), DM.gold, new THREE.Matrix4().copy(headM).multiply(mat4([s * 0.76, -0.4, -0.02], [0, PI / 2, 0], [0.07, 0.07, 0.07])));
  }
  b.add(clean(new THREE.TorusGeometry(1, 0.025, 6, 64)), DM.gold, new THREE.Matrix4().copy(headM).multiply(mat4([0, 0.45, 0.02], [PI / 2 + 0.1, 0, 0], [0.66, 0.78, 1])));
  // a lotus on the crown, holding the second shard
  const CROWN = HEAD.clone().setY(HEAD.y + HEAD_S.y + 0.6);
  lotus(b, DM.lotus, DM.gold, CROWN.clone().setY(CROWN.y - 0.4), 4.2, { rings: 3, n: 12, open: 0.5 });
  b.add(cyl(4.6, 4.2, 0.6, 24, { s: 0.5 }), DM.lapis, mat4(CROWN.clone().setY(CROWN.y - 0.3)));
  addCylinder(CROWN.clone().setY(CROWN.y - 0.3), 0.3, 4.6);
  // a great chrome halo turning slowly behind the head
  const halo = new THREE.Group(); halo.position.copy(V(0, 16, -70)); group.add(halo);
  { const hb = new Batch();
    hb.add(clean(new THREE.TorusGeometry(24, 0.7, 6, 72)), DM.mChrome); hb.add(clean(new THREE.TorusGeometry(21.5, 0.25, 4, 72)), DM.mGold);
    for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2; hb.add(box(0.3, 9, 0.3), DM.mGold, mat4([Math.cos(a) * 17, Math.sin(a) * 17, 0], [0, 0, a + PI / 2])); hb.add(clean(new THREE.OctahedronGeometry(0.8)), DM.mChrome, mat4([Math.cos(a) * 24, Math.sin(a) * 24, 0])); }
    hb.add(clean(new THREE.TorusGeometry(12.5, 0.4, 5, 48)), DM.mChrome);
    hb.build(halo); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; glows.add(V(Math.cos(a) * 24, 16 + Math.sin(a) * 24, -70), i % 2 ? 0xff90e0 : 0x90e0ff, 5, true); }
  // hands: one rising palm-up to the east (the stair starts there), one resting palm-down to the west
  hand(b, DM.marble, V(18, 3.4, -30), 4.6, PI / 2, { up: true, curl: 0.55 });
  addBox(V(19.6, 3.4, -30), new THREE.Vector3(2.55, 1.05, 2.8), PI / 2);
  hand(b, DM.marble, V(-20, 0.6, -28), 4.6, -PI / 2, { up: true, curl: 0.8 });
  addBox(V(-21.6, 0.6, -28), new THREE.Vector3(2.55, 1.05, 2.8), -PI / 2);

  // ---------------------------------------------------------------- the dream-stair round the head
  const tileMats = { glass: retroMat({ map: DT.stained, emit: 0.85, fog: 0.4 }), ghost: holoMat({ color: 0x9ab0ff, opacity: 0.18, glow: 0.4 }), phase: holoMat({ color: 0xff90e0, opacity: 0.85, glow: 0.7, depthWrite: true }) };
  // lily pads up from the water to the palm
  for (const [x, y, z] of [[20.5, 1.3, -20.8], [19.2, 2.8, -24.9]]) {
    const p = V(x, y, z);
    b.add(cyl(1.7, 1.5, 0.3, 14, { s: 0.6 }), DM.moss, mat4([p.x, p.y - 0.15, p.z]));
    lotus(b, DM.lotus, DM.gold, p.clone().setY(p.y + 0.05), 0.5, { rings: 1, n: 6, open: 0.9 });
    addCylinder(p.clone().setY(p.y - 0.15), 0.15, 1.7);
  }
  const N = 22, TERRACE = 11, DISCS = [6, 16], PHASED = [18, 19], stairPts = [];
  const sizeOf = (i) => (i === TERRACE ? 4.2 : DISCS.includes(i) ? 2.5 : i < N ? 1.35 : 1.35);
  { let th = 0.62, s = 0;
    for (let i = 0; i < N; i++) {
      if (i > 0) { const step = sizeOf(i - 1) + sizeOf(i) + 0.9; const rr = 18.5 - s * 0.04; th -= step / rr; s += step; }
      const rr = 18.5 - s * 0.04;
      stairPts.push(V(Math.cos(th) * rr, 5.6 + i * 0.95, -46 + Math.sin(th) * rr));
    }
    stairPts.push(V(Math.cos(th) * 11.2, 5.6 + N * 0.95, -46 + Math.sin(th) * 11.2), V(Math.cos(th) * 7.6, 5.6 + N * 0.95 + 0.45, -46 + Math.sin(th) * 7.6)); }
  stairPts.forEach((p, i) => {
    if (i === TERRACE) {
      // the brow terrace: a broad lotus where your reflection waits
      b.add(cyl(4.2, 3.6, 0.8, 18, { s: 0.5 }), DM.lapis, mat4(p.clone().setY(p.y - 0.4)));
      lotus(b, DM.lotus, DM.gold, p.clone().setY(p.y - 0.5), 4.4, { rings: 2, n: 14, open: 0.25 });
      addCylinder(p.clone().setY(p.y - 0.4), 0.4, 4.2);
      return;
    }
    if (DISCS.includes(i)) {
      // a slowly spinning mandala disc
      const mesh = new THREE.Group();
      put(mesh, new THREE.Mesh(cyl(2.5, 2.1, 0.5, 24, { s: 0.5 }), DM.mLapis), 0, 0, 0);
      put(mesh, new THREE.Mesh(clean(new THREE.CircleGeometry(2.3, 24).rotateX(-PI / 2)), tileMats.glass), 0, 0.26, 0);
      for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; put(mesh, new THREE.Mesh(petalGeo(1.0, 0.45, 0.3), DM.mLotus), Math.cos(a) * 2.4, 0.1, Math.sin(a) * 2.4).rotation.set(PI / 2 - 0.4, -a + PI / 2, 0, 'YXZ'); }
      const w = i === 6 ? 0.45 : -0.55, c = p.clone().setY(p.y - 0.25);
      P.mover(mesh, new THREE.Vector3(2.5, 0.25, 2.5), (t) => ({ pos: c, yaw: t * w }), group, { radius: 2.5 });
      return;
    }
    if (PHASED.includes(i)) { P.add(new PhaseTile(game, p, 1.4, i === 18 ? 0 : 0.5, group, tileMats)); return; }
    P.add(new DreamTile(game, p, 1.35, i, group, tileMats));
  });
  const TER = stairPts[TERRACE];
  const discs = P.list.filter(x => x.path && x.pf && x.mesh.position.distanceTo(HEAD) < 30), phaseTiles = P.list.filter(x => x instanceof PhaseTile);

  // ---------------------------------------------------------------- the jelly reef
  const jellyTops = [[7, 1.4, 6], [2, 5.4, 1], [-4, 9.2, 4], [-3, 13, 10.5], [4, 16.8, 11], [9, 20.6, 5.5], [5, 24.4, -1.5], [-2, 28, -4]];
  const hues = [0x7a9aff, 0xc07aff, 0x7ad8ff, 0xff8ad8];
  const jellies = jellyTops.map(([x, y, z], i) => P.add(new Jelly(game, REEF.clone().add(new THREE.Vector3(x, y, z)), i === 0 ? 2.2 : 1.9, group, { bob: i === 0 ? 0.2 : 0.55, period: 4.5 + (i % 3), hue: hues[i % 4] })));
  // the coral crown: a chrome coral tree with a brain-coral top
  const CORAL = REEF.clone().add(new THREE.Vector3(-9, 0, -4)), CORAL_TOP = 31.5;
  {
    let p0 = CORAL.clone();
    for (let k = 0; k < 6; k++) {
      const p1 = CORAL.clone().add(new THREE.Vector3(Math.sin(k * 1.7) * 1.4, (k + 1) * CORAL_TOP / 6, Math.cos(k * 1.3) * 1.2));
      const len = p0.distanceTo(p1), mid = p0.clone().lerp(p1, 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, p1.clone().sub(p0).normalize());
      b.add(cyl(1.0 - k * 0.08, 1.15 - k * 0.08, len + 0.4, 8, { s: 0.6 }), DM.chrome, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
      if (k > 0 && k < 5) for (const s of [-1, 1]) { const br = p1.clone().add(new THREE.Vector3(s * 2.5, 1.5, s * 0.8)); b.add(cyl(0.18, 0.35, 3.2, 6), DM.chrome, new THREE.Matrix4().compose(p1.clone().lerp(br, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, br.clone().sub(p1).normalize()), new THREE.Vector3(1, 1, 1))); glows.add(br, 0xff90e0, 2.4, true); }
      p0 = p1;
    }
    addCylinder(CORAL.clone().setY(CORAL_TOP / 2), CORAL_TOP / 2, 1.0);
    const top = CORAL.clone().setY(CORAL_TOP);
    b.add(sphere(3.4, 16, 10), DM.lapis, mat4([top.x, top.y - 1.1, top.z], [0, 0, 0], [1, 0.35, 1]));
    b.add(cyl(3.3, 3.3, 0.2, 20, { s: 0.6 }), DM.moss, mat4([top.x, top.y - 0.05, top.z]));
    for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; b.add(cyl(0.12, 0.25, 1.4, 5), DM.chrome, mat4([top.x + Math.cos(a) * 3.1, top.y + 0.6, top.z + Math.sin(a) * 3.1], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4])); }
    addCylinder(top.clone().setY(top.y - 0.6), 0.6, 3.3);
  }
  // chrome coral spires growing out of the water around the reef
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * PI * 2 + 0.3, rr = 16 + R() * 6, p = REEF.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr));
    const h = 4 + R() * 7;
    b.add(cyl(0.2, 0.7, h, 6), DM.chrome, mat4([p.x, h / 2, p.z], [(R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3]));
    for (let k = 0; k < 3; k++) b.add(cyl(0.08, 0.25, h * 0.4, 5), DM.chrome, mat4([p.x + (R() - 0.5) * 1.5, h * (0.4 + k * 0.15), p.z + (R() - 0.5) * 1.5], [(R() - 0.5) * 1.4, 0, (R() - 0.5) * 1.4]));
    addCylinder(p.clone().setY(h / 2), h / 2, 0.6);
    glows.add(p.clone().setY(h + 0.3), 0x90e0ff, 2.5, true);
  }

  // ---------------------------------------------------------------- the hanging isle
  P.add(new Updraft(game, UP1, 2.4, 13, group));
  // the opal ledge
  b.add(cyl(4.5, 4.2, 1.4, 16, { s: 0.4 }), DM.rock, mat4(LEDGE.clone().setY(LEDGE.y - 0.7)));
  b.add(cyl(4.2, 0.4, 6, 9, { s: 0.3, flat: true }), DM.rock, mat4(LEDGE.clone().setY(LEDGE.y - 4.4), [PI, 0, 0]));
  b.add(cyl(4.4, 4.4, 0.15, 16, { s: 0.6 }), DM.moss, mat4(LEDGE.clone().setY(LEDGE.y + 0.02)));
  crystals(b, LEDGE.clone().add(new THREE.Vector3(-2.6, 0, -2.2)), 0.7, R, DM.glowC);
  addCylinder(LEDGE.clone().setY(LEDGE.y - 0.7), 0.7, 4.5);
  // the isle itself: a thick disc of opal rock; underneath, a mossy garden hangs upside-down
  b.add(cyl(ISLE_R, ISLE_R - 0.6, 3, 24, { s: 0.3 }), DM.rock, mat4(ISLE.clone().setY(ISLE.y - 1.5)));
  b.add(cyl(ISLE_R + 0.1, ISLE_R + 0.1, 0.2, 24, { s: 0.4 }), DM.moss, mat4(ISLE.clone().setY(ISLE.y + 0.02)));
  addCylinder(ISLE.clone().setY(ISLE.y - 1.5), 1.5, ISLE_R);
  b.add(sphere(ISLE_R - 0.4, 20, 10), DM.moss, mat4(ISLE.clone().setY(ISLE.y - 3), [0, 0, 0], [1, 0.55, 1]));
  pagoda(b, ISLE.clone().setY(ISLE.y - 8.2), { tiers: 2, w: 5, h: 2.6, flip: true, glows });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * PI * 2 + 0.4, rr = 4 + R() * 3.5, p = ISLE.clone().add(new THREE.Vector3(Math.cos(a) * rr, -4.5, Math.sin(a) * rr)), h = 3 + R() * 3;
    b.add(cyl(0.18, 0.25, h * 0.4, 5), DM.lacquer, mat4([p.x, p.y - h * 0.2, p.z]));
    b.add(cyl(1.3 + R(), 0, h, 7), DM.moss, mat4([p.x, p.y - h * 0.4 - 0.8, p.z]));
    glows.add(p.clone().setY(p.y - h), 0x70f0c0, 2, true);
  }
  for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2, p = ISLE.clone().add(new THREE.Vector3(Math.cos(a) * (ISLE_R - 0.3), -3, Math.sin(a) * (ISLE_R - 0.3))); b.add(cyl(0.08, 0.02, 2 + R() * 4, 4), DM.moss, mat4([p.x, p.y - 1.5, p.z])); }
  // ...and on top, the same pagoda the right way up: its reflection made solid
  const pagTop = pagoda(b, ISLE.clone(), { tiers: 3, w: 6, h: 3.2, glows });
  { let y = ISLE.y + 0.6;
    for (let t = 0; t < 3; t++) { const ww = 6 * (1 - t * 0.2), hh = 3.2 * (1 - t * 0.08); addBox(ISLE.clone().setY(y + hh / 2), new THREE.Vector3(ww / 2, hh / 2, ww / 2)); y += hh; addBox(ISLE.clone().setY(y + 0.55), new THREE.Vector3((ww * 0.78 + 1.8) * 0.5, 0.55, (ww * 0.78 + 1.8) * 0.5), PI / 4); y += 1.1; }
    addBox(ISLE.clone().setY(ISLE.y + 0.3), new THREE.Vector3(3.8, 0.3, 3.8)); }
  // floating lotus pads spiral up round the pagoda to the shard
  const padA = Math.atan2(6.3, -8.15);
  const pads = [];
  for (let i = 0; i < 6; i++) {
    const a = padA + 0.5 + i * 0.75, p = ISLE.clone().add(new THREE.Vector3(Math.cos(a) * 6.4, 1.6 + 2.0 * i, Math.sin(a) * 6.4));
    pads.push(p);
    b.add(cyl(1.5, 1.2, 0.35, 14, { s: 0.6 }), DM.lapis, mat4([p.x, p.y - 0.17, p.z]));
    lotus(b, DM.lotus, DM.gold, p.clone().setY(p.y - 0.2), 1.6, { rings: 1, n: 8, open: 0.35 });
    addCylinder(p.clone().setY(p.y - 0.17), 0.17, 1.5);
  }
  const SHARD3 = ISLE.clone().add(new THREE.Vector3(Math.cos(padA + 0.5 + 6 * 0.75) * 5.2, 1.6 + 2.0 * 6, Math.sin(padA + 0.5 + 6 * 0.75) * 5.2));
  b.add(cyl(2.0, 1.5, 0.4, 16, { s: 0.6 }), DM.lapis, mat4([SHARD3.x, SHARD3.y - 0.2, SHARD3.z]));
  lotus(b, DM.lotus, DM.gold, SHARD3.clone().setY(SHARD3.y - 0.2), 2.2, { rings: 2, n: 10, open: 0.4 });
  addCylinder(SHARD3.clone().setY(SHARD3.y - 0.2), 0.2, 2.0);
  // the glass manta: from the ledge up to the isle's rim and back
  const MA = V(43.6, 11.3, -9.2), MB = V(46.6, 22.3, -11.5);
  {
    const mesh = new THREE.Group();
    const wing = new THREE.Shape(); wing.moveTo(0, 2.2); wing.bezierCurveTo(1.6, 1.6, 3.2, 0.2, 3.6, -0.6); wing.bezierCurveTo(2.2, -0.4, 1.2, -1.6, 0, -1.8); wing.bezierCurveTo(-1.2, -1.6, -2.2, -0.4, -3.6, -0.6); wing.bezierCurveTo(-3.2, 0.2, -1.6, 1.6, 0, 2.2);
    const wg = clean(new THREE.ShapeGeometry(wing, 10).rotateX(-PI / 2)); wg.rotateY(PI);
    const glass = holoMat({ color: 0x7ab0ff, opacity: 0.7, glow: 0.35, map: DT.scale, depthWrite: true });
    const wingM = put(mesh, new THREE.Mesh(wg, glass), 0, 0.2, 0);
    put(mesh, new THREE.Mesh(sphere(1, 12, 8), glass), 0, -0.15, 0.2).scale.set(1.1, 0.35, 1.9);
    put(mesh, new THREE.Mesh(cyl(0.05, 0.12, 3.5, 5), glass), 0, -0.1, -3.2).rotation.x = PI / 2;
    for (const s of [-1, 1]) put(mesh, new THREE.Mesh(cyl(0.05, 0.18, 0.9, 5), DM.mChrome), s * 0.5, 0, 2.3).rotation.x = PI / 2 + 0.3;
    put(mesh, new THREE.Mesh(sphere(0.35, 8, 6), retroMat({ color: 0xff90e0, emit: 1, fog: 0.3 })), 0, -0.1, 0.3);
    mesh.userData.wing = wingM;
    const path = mantaPath(MA, MB, MA.clone().add(new THREE.Vector3(3.7, 4, 3.7)), MB.clone().add(new THREE.Vector3(3.7, 0, 4.7)));
    const mv = P.mover(mesh, new THREE.Vector3(2.6, 0.22, 1.8), (t) => { const s = path(t); s.pos.y -= 0.2; return s; }, group);
    mv.mantaMesh = mesh;
    var manta = mv;
  }

  // ---------------------------------------------------------------- the lagoon's dressing
  for (const [x, z, h, yaw] of [[-24, 30, 11, 0.3], [26, 32, 9, 1.0], [-58, -26, 13, 0.4], [60, 18, 10, 0.2], [-30, -52, 14, 0.9], [34, -58, 12, 0.5], [12, 40, 7, 0.1], [-46, 40, 8, 0.7]]) {
    monolith(b, V(x, 0, z), h, yaw); addBox(V(x, h / 2 + 0.5, z), new THREE.Vector3(1.0, h / 2 + 0.5, 1.0), yaw);
  }
  for (const [x, z, r, yaw] of [[0, 24, 5.5, 0], [-28, 8, 5, PI / 2 + 0.3], [27, 9, 5, PI / 2 - 0.3], [-14, -16, 3.6, 0.6], [44, 40, 4.2, -0.6], [-40, -40, 4.5, 0.8]]) {
    arch(b, V(x, 0, z), r, yaw);
    for (const s of [-1, 1]) addCylinder(V(x + Math.cos(yaw) * s * r, 1.2, z - Math.sin(yaw) * s * r), 1.2, 0.7);
  }
  // Escher staircases: one you can climb (motes on top), two hanging upside-down
  stairs(b, V(-20, 0, 40), 0.9, 10, { w: 2.4 });
  for (let i = 0; i < 10; i++) addBox(V(-20 + Math.sin(0.9) * 0.8 * i, 0.25 + 0.5 * i, 40 + Math.cos(0.9) * 0.8 * i), new THREE.Vector3(1.2, 0.25, 0.4), 0.9);
  const flipStairs = (at, yaw, n) => { const sb = new Batch(); stairs(sb, new THREE.Vector3(), yaw, n, { w: 2.2 }); const g = new THREE.Group(); g.position.copy(at); g.rotation.z = PI; sb.build(g); group.add(g); return g; };
  const floaters = [flipStairs(V(30, 16, 36), 2.2, 9), flipStairs(V(-48, 22, -10), -0.6, 8)];
  // monoliths floating upside-down above their own reflections
  for (const [x, y, z, h] of [[-36, 9, 26, 7], [40, 12, 26, 6], [20, 18, -10, 5]]) {
    const g = new THREE.Group(); g.position.copy(V(x, y, z)); group.add(g);
    put(g, new THREE.Mesh(cyl(0.85, 0.55, h, 4, { flat: true }), DM.mChrome), 0, 0, 0);
    put(g, new THREE.Mesh(cyl(0.55, 0, 0.9, 4, { flat: true }), DM.mGold), 0, -h / 2 - 0.45, 0);
    put(g, new THREE.Mesh(box(2, 0.4, 2), DM.mLapis), 0, h / 2 + 0.2, 0);
    floaters.push(g);
  }
  // lotus lanterns adrift on the glass
  const lanternR = rng(99);
  for (let i = 0; i < 34; i++) {
    const a = lanternR() * PI * 2, rr = 10 + lanternR() * 56, p = V(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    if (p.distanceTo(HEAD) < 22 || p.distanceTo(REEF) < 14 || Math.hypot(p.x - DN.x, p.z - DN.z - 58) < 7 || Math.hypot(p.x - ISLE.x, p.z - ISLE.z) < 11 || Math.hypot(p.x - PILLAR.x, p.z - PILLAR.z) < 5) continue;
    lotus(b, DM.lotus, DM.gold, p.clone().setY(0.05), 0.45 + lanternR() * 0.25, { rings: 2, n: 6, open: 0.8, yaw: lanternR() * 6 });
    glows.add(p.clone().setY(0.6), lanternR() < 0.5 ? 0xff90e0 : 0x90e0ff, 2.2, true);
  }
  // glass marbles the size of houses, weather swirling inside
  const marbles = [];
  for (const [x, y, z, r] of [[-30, 7, 46, 2.4], [36, 9, 44, 3], [-60, 12, -6, 3.5], [62, 8, -36, 2.6], [-8, 30, 30, 3.2]]) {
    const g = new THREE.Group(); g.position.copy(V(x, y, z)); group.add(g);
    put(g, new THREE.Mesh(sphere(r, 20, 14), holoMat({ color: 0x8ab0ff, opacity: 0.45, glow: 0.2, side: THREE.FrontSide })));
    const core = put(g, new THREE.Mesh(sphere(r * 0.6, 14, 10), prismMat({ bright: 0.9 })));
    marbles.push({ g, core, y, ph: R() * 6 });
    glows.add(V(x, y, z), 0xc0a0ff, r * 2.5, true);
  }
  // chrome koi swimming through the air
  const koiMat = retroMat({ map: DT.koi, chrome: 0.35, env: DT.holoEnv, spec: 0.6, shine: 30, rim: 0.3 });
  const finMat = holoMat({ color: 0xffb0e0, opacity: 0.6, glow: 0.4 });
  const koiGeo = fishGeo(1.6, 0.24), tailGeo = clean(new THREE.CircleGeometry(0.45, 6, -0.9, 1.8));
  const schools = [{ c: V(0, 6, 20), rx: 26, rz: 18, y: 4, n: 9, w: 0.12 }, { c: V(-20, 14, -38), rx: 14, rz: 12, y: 3, n: 6, w: -0.16 }, { c: V(40, 16, -2), rx: 12, rz: 16, y: 5, n: 6, w: 0.14 }];
  const koi = [];
  for (const s of schools) for (let i = 0; i < s.n; i++) {
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; group.add(g);
    put(g, new THREE.Mesh(koiGeo, koiMat));
    const tail = new THREE.Group(); tail.position.z = -0.8; g.add(tail);
    put(tail, new THREE.Mesh(tailGeo, finMat), 0, 0, -0.35).rotation.set(0, PI / 2, 0);
    koi.push({ g, tail, s, ph: i / s.n * PI * 2 + R() * 0.3, off: new THREE.Vector3((R() - 0.5) * 3, (R() - 0.5) * 2, (R() - 0.5) * 3), last: new THREE.Vector3() });
  }
  // crystals along the edge of the world
  for (let i = 0; i < 22; i++) { const a = i / 22 * PI * 2 + R() * 0.1, rr = LAGOON_R - 3 - R() * 3; crystals(b, V(Math.cos(a) * rr, 0, Math.sin(a) * rr), 0.8 + R() * 1.4, R, i % 2 ? DM.glowC : DM.glowM); }

  // ---------------------------------------------------------------- the eye of the dream (boss arena; it forms when the Dreamer wakes)
  const arena = new THREE.Group(); arena.position.copy(AR); group.add(arena); arena.visible = false;
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uTime: GU.uTime, uFogColor: GU.uFogColor, uFogNear: GU.uFogNear, uFogFar: GU.uFogFar, uWake: { value: 0 } },
    vertexShader: `uniform float uFogNear, uFogFar; varying vec2 vP; varying float vFog; void main(){ vP = position.xz; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; vFog = clamp((length(mv.xyz) - uFogNear) / (uFogFar - uFogNear), 0., 1.); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uWake; uniform vec3 uFogColor; varying vec2 vP; varying float vFog;
      vec3 dp(float t){ return vec3(.62, .55, .95) + vec3(.38, .4, .25) * cos(6.2831 * (vec3(0., .12, .28) + t)); }
      void main(){
        // stained glass: a mirrored mosaic of small panes, each its own colour, fine gold leading
        float r = length(vP) / ${AR_R.toFixed(1)}, a = atan(vP.y, vP.x) + uTime * .02;
        float N = 16., sw = 6.2831 / N, af = abs(mod(a, sw) - sw * .5) / (sw * .5);
        float rr = r * 10., ri = floor(rr), fr = fract(rr);
        float cols = 2. + floor(ri * .6), ci = floor(af * cols), fc = fract(af * cols);
        float h = fract(sin(ri * 12.9898 + ci * 78.233) * 43758.5453);
        vec3 glass = dp(h * .8 + ri * .05 - uTime * .015);
        float lum = .22 + .16 * h + .08 * sin(uTime * 1.2 + h * 20.);
        vec3 c = glass * lum * (1. + uWake * .3);
        float lead = max(smoothstep(.1, .02, min(fr, 1. - fr)), smoothstep(.1, .02, min(fc, 1. - fc)) * step(.5, ri));
        lead = max(lead, smoothstep(.94, .99, af));
        c = mix(c, vec3(.55, .44, .22), lead * .7);
        c *= .85 + .15 * smoothstep(1., .7, r);
        // the centre: a small glowing eye
        float e = length(vP) / 2.2;
        c = mix(c, dp(.1 + uTime * .05) * 1.2, smoothstep(1., .85, e) * (1. - smoothstep(.35, .3, e) * .7));
        c += vec3(1., .95, 1.) * smoothstep(.3, .0, e) * .6;
        gl_FragColor = vec4(mix(c, uFogColor, vFog * .6), 1.);
      }`,
  });
  put(arena, new THREE.Mesh(clean(new THREE.CircleGeometry(AR_R, 64).rotateX(-PI / 2)), floorMat), 0, 0.01, 0);
  const ab = new Batch();
  ab.add(cyl(AR_R + 0.4, AR_R - 1, 1.6, 48, { s: 0.4 }), DM.mLapis, mat4([0, -0.8, 0]));
  ab.add(clean(new THREE.TorusGeometry(AR_R + 0.3, 0.3, 6, 64)), DM.mGold, mat4([0, 0.05, 0], [PI / 2, 0, 0]));
  ab.add(clean(new THREE.SphereGeometry(AR_R - 1, 24, 8, 0, PI * 2, PI / 2, PI / 2)), DM.mChrome, mat4([0, -1.5, 0], [0, 0, 0], [1, 0.32, 1]));
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * PI * 2; if (Math.abs(((a - PI / 2 + PI) % (PI * 2)) - PI) < 0.35) continue;         // the gap faces south (+z)
    ab.add(petalGeo(3.4, 1.0, 0.35), DM.mLotus, mat4([Math.cos(a) * (AR_R + 0.2), 0, Math.sin(a) * (AR_R + 0.2)], [-0.25, -a + PI / 2, 0]));
  }
  for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2, rr = 3 + (i % 3) * 3; ab.add(cyl(0, 0.6, 3 + (i % 4) * 1.5, 5, { flat: true }), DM.glowC, mat4([Math.cos(a) * rr, -2.6 - (i % 4) * 0.8, Math.sin(a) * rr], [PI, 0, 0])); }
  ab.build(arena);
  const arenaCols = [];
  const buildArenaColliders = () => {
    arenaCols.push(addCylinder(AR.clone().setY(AR.y - 0.8), 0.8, AR_R));
    for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2; if (Math.abs(((a - PI / 2 + PI) % (PI * 2)) - PI) < 0.3) continue; arenaCols.push(addBox(AR.clone().add(new THREE.Vector3(Math.cos(a) * (AR_R + 0.4), 2, Math.sin(a) * (AR_R + 0.4))), new THREE.Vector3(0.4, 2.5, 2), -a)); }
  };
  let seal = null;
  const setSeal = (on) => {
    if (on && !seal) seal = addBox(AR.clone().add(new THREE.Vector3(0, 2, AR_R + 0.4)), new THREE.Vector3(4.5, 2.5, 0.4));
    if (!on && seal) { world.removeCollider(seal, false); seal = null; }
    sealMesh.visible = on;
  };
  const sealMesh = put(arena, new THREE.Mesh(clean(new THREE.PlaneGeometry(9, 4.5)), fallsMat({ dir: 1, speed: 0.8, opacity: 0.6, tint: 0xff90e0 })), 0, 2.25, AR_R + 0.3); sealMesh.visible = false;
  // the pillar of light up from the lagoon
  const pillar = new Updraft(game, PILLAR, 2.4, AR.y + 2.2, group); pillar.group.visible = false; pillar.off = true;
  glows.set(pillar.glow, PILLAR, 0, 0); glows.set(pillar.cap, PILLAR, 0, 0);
  const pillarUpdate = pillar.update.bind(pillar); pillar.update = (dt) => { if (!pillar.off) pillarUpdate(dt); };
  P.add(pillar);

  b.build(group, { name: 'dream' });
  Bake.lights = saved.lights; Bake.ao = saved.ao; Bake.macro = saved.macro; Bake.shadow = saved.shadow;
  Bake.sky.copy(saved.sky); Bake.ground.copy(saved.ground); Bake.sun.copy(saved.sun); Bake.sunDir.copy(saved.sunDir);

  // ================================================================ gameplay
  const st = { hints: new Set(), shards: 0, woke: false, boss: false };
  game.shards = 0;
  const gotShard = () => {
    st.shards++; game.shards = st.shards;
    audio.play('shard'); game.flash(0.45, 0xe0c0ff);
    game.hud.callout(`Dream Shard ${st.shards}/3`);
    if (st.shards >= 3) setTimeout(() => wake(), 1600);
    else game.hud.hint(['', 'One shard… the Dreamer stirs in its sleep.', 'Two shards! One more and the Dreamer wakes.'][st.shards], 4);
  };
  P.add(new Shard(game, CORAL.clone().setY(CORAL_TOP), group, gotShard));
  P.add(new Shard(game, CROWN.clone(), group, gotShard));
  P.add(new Shard(game, SHARD3, group, gotShard));
  // checkpoints
  [[V(4.2, 0.5, 56.5), PI, 'The Mirror'], [REEF.clone().add(new THREE.Vector3(12, 0, 12)), -PI / 2, 'The Jelly Reef'], [V(27, 0, -16), -PI / 2, 'The Colossus'], [TER.clone().add(new THREE.Vector3(1.5, 0, 1.5)), 0, 'The Brow Terrace'],
    [V(30, 0, 4), PI / 2, 'The Rising Falls'], [LEDGE.clone().add(new THREE.Vector3(-1.5, 0, 1.5)), PI / 2, 'The Opal Ledge'], [ISLE.clone().add(new THREE.Vector3(-6.5, 0, 5)), -PI / 2, 'The Hanging Isle']]
    .forEach(([p, yaw, name]) => P.add(new LotusLamp(game, p, yaw, name, group)));
  // bubbles to pop
  const bubbleMat = holoMat({ color: 0x9ad8ff, opacity: 0.6, glow: 0.3 });
  for (const [x, y, z] of [[-6, 0.8, 40], [7, 0.8, 34], [-12, 0.8, 22], [14, 0.8, 18], [-30, 0.8, 18], [-36, 0.8, -6], [26, 0.8, 0], [30, 0.8, -12], [-8, 0.8, 6], [10, 0.8, -4], [-54, 0.8, 22], [48, 0.8, 30], [-18, 0.8, -40], [22, 0.8, -40]]) P.add(new DreamBubble(game, V(x, y, z), group, bubbleMat));
  // star-motes
  P.motesLine(V(0, 0.9, 50), V(0, 0.9, 30), 8); P.motesArc(V(-6, 0.9, 28), V(-30, 0.9, 12), 3, 9); P.motesArc(V(6, 0.9, 28), V(28, 0.9, 6), 3, 9);
  P.motesRing(REEF.clone().setY(0.9), 14, 14); P.motesRing(V(0, 0.9, -12), 10, 12);
  jellyTops.slice(1).forEach(([x, y, z]) => P.motesLine(REEF.clone().add(new THREE.Vector3(x, y + 2.5, z)), REEF.clone().add(new THREE.Vector3(x, y + 4, z)), 2));
  stairPts.forEach((p, i) => { if (i % 2 === 0 && i !== TERRACE) P.mote(p.clone().setY(p.y + 1.1)); });
  P.motesRing(TER.clone().setY(TER.y + 0.9), 2.8, 8);
  P.motesLine(UP1.clone().setY(3), UP1.clone().setY(11), 5);
  pads.forEach(p => P.mote(p.clone().setY(p.y + 1.1)));
  P.motesRing(ISLE.clone().setY(ISLE.y + 0.9), 7.6, 12);
  for (let i = 0; i < 10; i++) P.mote(V(-20 + Math.sin(0.9) * 0.8 * i, 1.4 + 0.5 * i, 40 + Math.cos(0.9) * 0.8 * i));
  // folk of the dream
  const F = (kind, p, o = {}) => spawn(game, kind, p, { parent: group, ...o });
  F('moth', V(-8, 4, 30)); F('moth', V(10, 5, 14));
  F('twin', V(-10, 0, 10), { wake: 7 }); F('twin', V(12, 0, 2), { wake: 7 });
  F('puffer', V(-16, 1.6, -6)); F('puffer', V(18, 1.6, -14), { ring: 6 });
  F('moth', REEF.clone().add(new THREE.Vector3(0, 12, 6)), { span: 6, aggro: 18 }); F('moth', REEF.clone().add(new THREE.Vector3(2, 22, 2)), { span: 5, aggro: 18 });
  F('puffer', REEF.clone().add(new THREE.Vector3(10, 1.6, -6)));
  F('twin', TER.clone(), { wake: 8 }); F('moth', TER.clone().add(new THREE.Vector3(0, 5, 0)), { span: 4 });
  F('twin', V(26, 0, -24), { wake: 6 });
  F('puffer', LEDGE.clone().add(new THREE.Vector3(0.5, 1.6, -1)), { hover: 1.5, ring: 7 });
  F('twin', ISLE.clone().add(new THREE.Vector3(-4, 0, 4)), { wake: 7 }); F('moth', ISLE.clone().add(new THREE.Vector3(0, 9, 0)), { span: 6, aggro: 16 });
  F('puffer', V(28, 1.6, 10)); F('moth', V(-22, 6, -18));

  // the Dreamer wakes
  const sky = createDreamSky(scene);
  const somnia = setupSomnia(game, { group, center: AR.clone(), radius: AR_R, onDefeat: () => game.onDreamVictory?.() });
  let eyeOpen = 0, arenaK = 0;
  function wake(instant = false) {
    if (st.woke) return;
    st.woke = true;
    if (!arenaCols.length) buildArenaColliders();
    arena.visible = true; pillar.group.visible = true; pillar.off = false;
    glows.set(pillar.glow, PILLAR.clone().setY(PILLAR.y + 0.5), 0x90e0ff, 6); glows.set(pillar.cap, PILLAR.clone().setY(AR.y + 3.7), 0xd0b0ff, 7); glows.dirty();
    if (instant) { eyeOpen = 1; arenaK = 1; return; }
    game.cutscene = true;
    audio.play('colossusWake'); game.shake(0.9);
    game.player.cam.focus = HEAD.clone().setY(HEAD.y + 2);
    game.hud.area('The Dreamer Wakes');
    setTimeout(() => { audio.play('lightStair'); game.flash(0.4, 0xffe0ff); }, 2600);
    setTimeout(() => {
      game.cutscene = false; game.player.cam.focus = null;
      game.hud.hint('A pillar of light rises before the Dreamer’s face. Ride it up to the eye of the dream.', 6);
    }, 4600);
  }

  // ---------------------------------------------------------------- zone
  const palette = { fog: 0x1c1268, near: 50, far: 240, sky: 0x8070e8, ground: 0x3a80c8, sun: 0xb8a8ff, rim: 0xff70e0, sunDir: new THREE.Vector3(0.25, 0.9, 0.3).normalize() };
  let savedPal = null, stepT = 0;
  const zone = {
    group, killY: DN.y - 14, st, somnia, mirror, spots: { HEAD, REEF, UP1, LEDGE, ISLE, AR, PILLAR, CROWN, CORAL, TER, MA, MB, SHARD3, CORAL_TOP: CORAL.clone().setY(CORAL_TOP) }, stairPts, jellies, pads, manta, discs, phaseTiles, terrace: TERRACE, DISCS, PHASED,
    ambient: [0x80e8ff, 0xff90e8, 0.3],
    music: () => (somnia.active ? 'somnia' : 'dream'),
    onEnter(g, silent) {
      savedPal = savedPal || { fog: GU.uFogColor.value.clone(), near: GU.uFogNear.value, far: GU.uFogFar.value, sky: GU.uAmbSky.value.clone(), ground: GU.uAmbGround.value.clone(), sun: GU.uSunColor.value.clone(), rim: GU.uRimColor.value.clone(), sunDir: GU.uSunDir.value.clone() };
      GU.uFogColor.value.setHex(palette.fog); GU.uFogNear.value = palette.near; GU.uFogFar.value = palette.far;
      GU.uAmbSky.value.setHex(palette.sky); GU.uAmbGround.value.setHex(palette.ground); GU.uSunColor.value.setHex(palette.sun); GU.uRimColor.value.setHex(palette.rim); GU.uSunDir.value.copy(palette.sunDir);
      g.sky.group.visible = false; sky.group.visible = true;
      if (!somnia.active) { g.hud.boss(null); g.player.cam.focus = null; }
      audio.stopLoop('wind'); audio.startLoop('lagoon', { volume: 0.6 }); audio.startLoop('updraft', { volume: 0 });
      if (!silent) {
        audio.music('dream');
        g.hud.area('The Mirror Sea', 'Book II');
        if (!st.hints.has('intro')) { st.hints.add('intro'); setTimeout(() => g.zone === 'dream' && st.shards < 3 && g.hud.hint('Find three Dream Shards to wake the sleeping Dreamer.', 6), 2800); }
      }
    },
    onLeave(g) {
      if (savedPal) {
        GU.uFogColor.value.copy(savedPal.fog); GU.uFogNear.value = savedPal.near; GU.uFogFar.value = savedPal.far;
        GU.uAmbSky.value.copy(savedPal.sky); GU.uAmbGround.value.copy(savedPal.ground); GU.uSunColor.value.copy(savedPal.sun); GU.uRimColor.value.copy(savedPal.rim); GU.uSunDir.value.copy(savedPal.sunDir);
      }
      g.sky.group.visible = true; sky.group.visible = false;
      for (const l of ['lagoon', 'updraft']) audio.stopLoop(l);
      somnia.reset(); setSeal(false); st.boss = false;
    },
    onRespawn(g) {
      if (somnia.active) { somnia.reset(); setSeal(false); st.boss = false; audio.music('dream'); }
    },
    tick(dt, g) {
      const p = g.player, pp = p.pos;
      sky.update(g.time, g.camera.position);
      mirror.update(dt);
      // footsteps ripple the mirror
      if (p.grounded && pp.y < DN.y + 0.3) {
        const hs = Math.hypot(p.vel.x, p.vel.z);
        stepT -= dt * hs;
        if (stepT <= 0 && hs > 1) { stepT = 2.1; mirror.ripple(pp, 0.75); audio.play('mirrorStep', { volume: 0.5, pitch: 0.9 + R0() * 0.2 }); }
        if (p.landed > 4) mirror.ripple(pp, 1);
      }
      for (const e of g.enemies) if (e.alive && e.kind === 'twin' && e.state === 'stalk' && R0() < dt * 1.5 && e.pos.y < DN.y + 0.3) mirror.ripple(e.pos, 0.5);
      // the halo, the floaters, the marbles, the koi
      halo.rotation.z = g.time * 0.04;
      floaters.forEach((f, i) => { f.rotation.y = g.time * (0.1 + i * 0.03) * (i % 2 ? -1 : 1); f.position.y += Math.sin(g.time * 0.5 + i) * 0.004; });
      for (const m of marbles) { m.g.position.y = DN.y + m.y + Math.sin(g.time * 0.6 + m.ph) * 0.6; m.core.rotation.y = g.time * 0.3; m.core.rotation.x = g.time * 0.17; }
      for (const k of koi) {
        const s = k.s, a = g.time * s.w + k.ph;
        k.last.copy(k.g.position);
        k.g.position.set(s.c.x + Math.cos(a) * s.rx + k.off.x, s.c.y + Math.sin(a * 2) * s.y + k.off.y, s.c.z + Math.sin(a) * s.rz + k.off.z);
        _v.copy(k.g.position).sub(k.last);
        if (_v.lengthSq() > 1e-6) { k.g.rotation.y = Math.atan2(_v.x, _v.z); k.g.rotation.x = -Math.atan2(_v.y, Math.hypot(_v.x, _v.z)); }
        k.tail.rotation.y = Math.sin(g.time * 7 + k.ph * 3) * 0.5;
      }
      const mw = manta.mantaMesh.userData.wing; mw.scale.y = 1; mw.rotation.z = Math.sin(g.time * 2.2) * 0.06;
      // the Dreamer's eyes open, the arena assembles out of light
      if (st.woke) {
        eyeOpen = Math.min(1, eyeOpen + dt * 0.5); arenaK = Math.min(1, arenaK + dt * 0.35);
        for (const e of wakeEyes) e.matrix.copy(e.userData.base).multiply(_m4.makeScale(0.1, 0.001 + 0.05 * THREE.MathUtils.smoothstep(eyeOpen, 0, 1), 0.035));
        for (const l of lashes) l.visible = eyeOpen < 0.3;
        sky.wake = eyeOpen;
        arena.scale.setScalar(Math.max(0.01, THREE.MathUtils.smoothstep(arenaK, 0, 1))); arena.rotation.y = (1 - arenaK) * PI;
        if (arenaK < 1 && R0() < 0.8) g.fx.glow.emit({ pos: _v.copy(AR).add(new THREE.Vector3((R0() - .5) * 28, (R0() - .5) * 3, (R0() - .5) * 28)), vel: new THREE.Vector3(0, 2, 0), life: 1.2, size: 0.6, size1: 0, color: R0() < 0.5 ? 0xff90e0 : 0x90e0ff, alpha: 1 });
        if (R0() < dt * 6) for (const e of wakeEyes) { const ep = _v.setFromMatrixPosition(e.matrix); g.fx.glow.emit({ pos: ep, vel: new THREE.Vector3((R0() - .5), 0.5, 2.5), life: 1.4, size: 0.8, size1: 0, color: 0xffe0a0, alpha: 0.9 }); }
      }
      // updraft hum
      audio.setLoopVolume('updraft', g.updraftVol || 0); g.updraftVol = 0;
      // area banners and hints
      for (const [k, q, r, name, sub] of [['reef', REEF, 16, 'The Jelly Reef', ''], ['colossus', V(20, 0, -24), 9, 'The Sleeping Colossus', ''], ['isle', UP1, 9, 'The Hanging Isle', 'where the falls pour upward'], ['terrace', TER, 5, 'The Brow Terrace', '']]) {
        if (!st.hints.has(k) && pp.distanceTo(q) < r) { st.hints.add(k); g.hud.area(name, sub); }
      }
      const hint = (k, text, secs = 5) => { if (!st.hints.has(k)) { st.hints.add(k); g.hud.hint(text, secs); } };
      if (Math.hypot(pp.x - REEF.x, pp.z - REEF.z) < 13) hint('jelly', `Land on a jelly to bounce — hold ${g.btn('jump')} as you land to bounce higher.`, 6);
      if (pp.distanceTo(V(24, 0, -19)) < 7) hint('stair', 'Climb the Dreamer’s hand. The stair builds itself as you go…', 5);
      if (pp.distanceTo(UP1) < 6) hint('updraft', 'The falls pour upward here. Step in and let them carry you.', 5);
      if (pp.distanceTo(MA) < 5) hint('manta', 'Wait for the glass manta, then ride it up to the isle.', 5);
      if (!st.hints.has('moth') && g.enemies.some(e => e.kind === 'moth' && e.alive && e.state === 'hunt' && e.pos.distanceTo(pp) < 8)) hint('moth', `Eyemoths fly out of reach — jump and press ${g.btn('attack')} to slash in mid-air.`, 6);
      // up the pillar to Somnia
      if (st.woke && !st.boss && !somnia.done && Math.hypot(pp.x - AR.x, pp.z - AR.z) < AR_R - 2 && pp.y > AR.y - 0.5 && pp.y < AR.y + 4) {
        st.boss = true; setSeal(true);
        g.setCheckpoint(AR.clone().add(new THREE.Vector3(0, 0.1, AR_R - 4)), PI, 'The Eye of the Dream');
        somnia.begin();
      }
      somnia.update(dt);
    },
    unsafeAt: (p) => Math.hypot(p.x - DN.x, p.z - DN.z) > LAGOON_R - 5,
  };
  game.zones.dream = zone;

  // ---------------------------------------------------------------- the way in
  game.enterDream = () => {
    if (somnia.active) { somnia.reset(); setSeal(false); st.boss = false; }
    game.enterZone('dream', DREAM_SPAWN, PI);
    game.setCheckpoint(DREAM_SPAWN, PI, 'The Mirror');
  };
  zone.skipTo = (where) => {
    if (where === 'somnia') {
      st.shards = 3; game.shards = 3;
      for (const p of P.list) if (p instanceof Shard && p.alive) { p.alive = false; p.group.removeFromParent(); game.glows.set(p.glow, p.pos, 0, 0); }
      game.glows.dirty();
      wake(true);
      const pos = AR.clone().add(new THREE.Vector3(0, 0.1, AR_R - 4));
      game.player.teleport(pos, PI); game.setCheckpoint(pos, PI, 'The Eye of the Dream');
    }
  };
  return zone;
}
const _m4 = new THREE.Matrix4();
