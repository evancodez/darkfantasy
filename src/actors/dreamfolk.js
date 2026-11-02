// Folk of the Mirror Sea:
//   Eyemoths — big dusk-blue moths with an eye on each wing. They drift in
//     figure-eights, then fold their wings (the tell) and swoop through you.
//     Up in the air they're fair game for aerial slashes.
//   Mirror Twins — your own reflection, climbing up out of the lagoon in dark
//     chrome. It guards like you do; parry its slash, catch it recovering,
//     smash its guard from above or get behind it.
//   Glass pufferfish — drift, swell up spiny (swords bounce off), loose a ring
//     of bubbles, then sag, deflated and open. Parried bubbles fly home.
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat, Lights } from '../core/retro.js';
import { cyl, sphere, clean } from '../core/geo.js';
import { raycast } from '../core/physics.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rig } from './rig.js';
import { Enemy, Orb, ENEMIES } from './enemies.js';
import { BUILDERS } from './models.js';
import { buildHero } from './hero.js';
import { DT, makeDreamMaterials, holoMat, fishGeo } from '../world/dream/assets.js';
import audio from '../sound.js';

const PI = Math.PI, R = Math.random;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const cone = (r, h, seg = 6) => cyl(0, r, h, seg);

// a wing: a rounded blade in the XZ plane reaching along +x (u along the span)
function wingGeo(span, chord, sweep = 0.3, hind = false) {
  const s = new THREE.Shape();
  s.moveTo(0, -chord * 0.18);
  if (hind) { s.bezierCurveTo(span * 0.4, -chord * 0.9, span * 0.95, -chord * 0.8, span * 0.8, -chord * 0.2); s.bezierCurveTo(span * 0.6, chord * 0.2, span * 0.2, chord * 0.2, 0, chord * 0.1); }
  else { s.bezierCurveTo(span * 0.3, chord * 0.55, span * 0.8, chord * (0.6 + sweep), span, chord * 0.35); s.bezierCurveTo(span * 1.02, -chord * 0.25, span * 0.55, -chord * 0.55, 0, -chord * 0.18); }
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    uv.setXY(i, x / span, 0.5 + y / (chord * 1.6));
    p.setXYZ(i, x, Math.sin(x / span * PI) * chord * 0.06, -y);
  }
  g.computeVertexNormals();
  return clean(g);
}

// ================================================================== models
function moth() {
  makeDreamMaterials();
  const m = {
    fur: retroMat({ map: DT.fur, rim: 0.35, edge: 0.3, emit: 0.1 }),
    wing: retroMat({ map: DT.wing, side: THREE.DoubleSide, emit: 0.35, rim: 0.2 }),
    hind: retroMat({ map: DT.wing, color: 0xc0a0ff, side: THREE.DoubleSide, emit: 0.3 }),
    eye: retroMat({ color: 0x70f8ff, emit: 1, fog: 0.3 }),
    chrome: retroMat({ chrome: 0.8, env: DT.holoEnv, color: 0xe8e8ff }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 0.6;
  J('thorax', null, [0, 0, 0]); J('head', 'thorax', [0, 0.05, 0.32]); J('abdomen', 'thorax', [0, -0.02, -0.18]);
  J('wingL', 'thorax', [0.12, 0.12, 0.05]); J('wingR', 'thorax', [-0.12, 0.12, 0.05]);
  J('hindL', 'thorax', [0.1, 0.08, -0.12]); J('hindR', 'thorax', [-0.1, 0.08, -0.12]);
  P('thorax', sphere(0.24, 10, 8), m.fur, [0, 0, 0], [0, 0, 0], [1, 0.95, 1.2]);
  P('abdomen', sphere(0.22, 10, 8), m.fur, [0, -0.02, -0.38], [0, 0, 0], [0.85, 0.8, 1.9]);
  P('head', sphere(0.17, 10, 8), m.fur);
  for (const s of [-1, 1]) {
    P('head', sphere(0.09, 8, 6), m.eye, [s * 0.11, 0.03, 0.08]);
    // feathery antennae: a chrome quill with a comb of little barbs
    const ant = new THREE.Group(); rig.j.head.add(ant); ant.position.set(s * 0.06, 0.12, 0.08); ant.rotation.set(-0.7, 0, s * 0.45);
    rig.part(ant, cyl(0.012, 0.015, 0.55, 4), m.chrome, [0, 0.27, 0]);
    for (let i = 0; i < 6; i++) rig.part(ant, cyl(0.006, 0.006, 0.16 - i * 0.015, 3), m.chrome, [0, 0.12 + i * 0.07, 0], [0, 0, PI / 2]);
  }
  const fw = wingGeo(1.25, 0.9), hw = wingGeo(0.85, 0.7, 0, true);
  P('wingL', fw, m.wing); P('hindL', hw, m.hind);
  const mir = (g) => { const c = g.clone(); c.scale(-1, 1, 1); c.index.array.reverse?.(); c.computeVertexNormals(); return c; };
  P('wingR', mir(fw), m.wing); P('hindR', mir(hw), m.hind);
  return { rig, root: rig.root, m };
}

// the mirror twin wears Wick's own rig in dark chrome and violet
function twin() {
  const hero = buildHero(), m = hero.mats;
  const set = (mat, o) => { const u = mat.uniforms; if (o.color !== undefined) u.uColor.value.setHex(o.color); if (o.env) u.uEnv.value = o.env; if (o.emit !== undefined) u.uEmit.value = o.emit; if (o.rim !== undefined) u.uRim.value = o.rim; };
  set(m.armor, { color: 0x6a6090, env: T.chrome, emit: 0.05, rim: 0.5 });
  set(m.helm, { color: 0x7a70a8, env: T.chrome, rim: 0.5 });
  set(m.dark, { color: 0x2a2040 }); set(m.red, { color: 0x5a2a9a, emit: 0.2 });
  set(m.gold, { color: 0xb0a8ff, env: T.chrome }); set(m.eye, { color: 0xff50e0 });
  set(m.blade, { color: 0xd080ff }); set(m.shield, { color: 0x6a5a9a });
  m.armor.uniforms.uRimColor = { value: new THREE.Color(0xff60e0) };
  return { rig: hero.rig, root: hero.root, m, hero };
}

function puffer() {
  makeDreamMaterials();
  const m = {
    glass: holoMat({ color: 0x6ab0ff, opacity: 0.5, glow: 0.2, map: DT.scale }),
    core: retroMat({ color: 0xff80e0, emit: 1, fog: 0.35 }),
    spine: retroMat({ chrome: 0.8, env: DT.holoEnv, color: 0xe0f0ff }),
    fin: holoMat({ color: 0xa080ff, opacity: 0.6, glow: 0.3 }),
    eye: retroMat({ color: 0x05030c, spec: 1.2, shine: 60 }), shine: retroMat({ color: 0xffffff, emit: 1 }),
  };
  const rig = new Rig(); const J = (...a) => rig.joint(...a), P = (...a) => rig.part(...a);
  rig.body.position.y = 0;
  J('body', null, [0, 0, 0]); J('spines', 'body', [0, 0, 0]); J('tail', 'body', [0, 0, -0.6]); J('finL', 'body', [0.5, 0, 0]); J('finR', 'body', [-0.5, 0, 0]);
  P('body', sphere(0.62, 14, 10), m.glass, [0, 0, 0], [0, 0, 0], [1, 0.92, 1.1]);
  const core = P('body', sphere(0.32, 10, 8), m.core);
  for (const s of [-1, 1]) { P('body', sphere(0.13, 8, 6), m.eye, [s * 0.32, 0.12, 0.44]); P('body', sphere(0.04, 4, 3), m.shine, [s * 0.34, 0.18, 0.55]); }
  P('body', clean(new THREE.TorusGeometry(0.1, 0.035, 5, 10)), m.spine, [0, -0.12, 0.62]);
  // the spines are one mesh: deflated they shrink back inside the body
  const sg = [];
  for (let i = 0; i < 26; i++) {
    const y = 1 - (i + 0.5) / 26 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    sg.push(cone(0.05, 0.36, 4).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(dir.x * 0.6, dir.y * 0.55 + 0, dir.z * 0.66), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1))));
  }
  rig.part('spines', mergeGeometries(sg, false), m.spine);
  const spikes = rig.j.spines;
  P('tail', clean(new THREE.CircleGeometry(0.4, 6, 0, PI)), m.fin, [0, 0, -0.2], [0, PI / 2, PI / 2]);
  P('finL', clean(new THREE.CircleGeometry(0.25, 5, 0, PI)), m.fin, [0.05, 0, 0], [PI / 2, 0, -PI / 2]);
  P('finR', clean(new THREE.CircleGeometry(0.25, 5, 0, PI)), m.fin, [-0.05, 0, 0], [PI / 2, 0, PI / 2]);
  return { rig, root: rig.root, m, core, spikes };
}
Object.assign(BUILDERS, { moth, twin, puffer });

// ================================================================== bubble
const BUBBLE_GEO = sphere(0.34, 12, 9);
let bubbleMat = null;
export class Bubble extends Orb {
  constructor(game, pos, vel, o = {}) {
    super(game, pos, vel, { color: 0x9ad8ff, kind: 'bubble', hitSound: 'bubblePop', kb: 3, life: 4.5, ...o });
    bubbleMat ||= holoMat({ color: 0x9ad8ff, opacity: 0.75, glow: 0.35 });
    this.mesh.geometry = BUBBLE_GEO; this.mesh.material = bubbleMat; this.wob = R() * 6;
    // a volley of bubbles would hog every light slot: they just glow instead
    Lights.remove(this.light); this.light = { pos: new THREE.Vector3(), color: this.light.color };
  }
  onParried(player) { super.onParried(player); this.mesh.material = holoMat({ color: 0xffe070, opacity: 0.85, glow: 0.6 }); }
  update(dt) {
    super.update(dt);
    if (this.removed) return;
    this.wob += dt * 9; this.mesh.scale.set(1 + Math.sin(this.wob) * 0.08, 1 - Math.sin(this.wob) * 0.08, 1);
  }
}

// ================================================================== eyemoth
export class Eyemoth extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'moth', pos, { hp: 2, radius: 0.7, height: 1.0, drops: 4, flying: true, aggro: 15, ...o });
    this.popColor = 0x8ab0ff; this.seed = R() * 10; this.orbit = R() * PI * 2; this.cool = 1.2 + R() * 2; this.shadowSize = 1.6;
    this.aimHeight = 0.6; this.heartChance = 0.15; this.span = o.span ?? 5;
  }
  onHit(hit) {
    const r = super.onHit(hit);
    if (r === 'hit' && this.state !== 'stunned') { this.setState('stunned'); this.stun = 0.9; }
    return r;
  }
  die() { super.die(); audio.play('mothDie'); for (let i = 0; i < 18; i++) this.game.fx.dust.emit({ pos: _a.copy(this.pos).setY(this.pos.y + 0.6), vel: new THREE.Vector3((R() - 0.5) * 5, R() * 4, (R() - 0.5) * 5), life: 1.3, size: 0.16, size1: 0, color: [0x8ab0ff, 0xff70e0, 0xffe080][i % 3], gravity: 2, drag: 1.5 }); }
  think(dt) {
    const p = this.player, d = this.distP(), g = this.game;
    this.windupGlow = 0;
    const damp = (k) => this.vel.multiplyScalar(Math.exp(-dt * k));
    switch (this.state) {
      case 'idle': {
        // a lazy figure-eight round home
        this.orbit += dt * 0.7;
        const want = _a.set(this.home.x + Math.sin(this.orbit) * this.span, this.home.y + Math.sin(this.orbit * 2 + this.seed) * 0.8, this.home.z + Math.sin(this.orbit * 2) * this.span * 0.5);
        this.vel.lerp(want.sub(this.pos).multiplyScalar(1.6), 1 - Math.exp(-dt * 2));
        this.face(Math.atan2(this.vel.x, this.vel.z), dt, 4);
        if (d < this.aggro && !p.dead) { this.setState('hunt'); audio.play('mothFlutter'); }
        break;
      }
      case 'hunt': {
        // circle above your head, just out of reach
        this.orbit += dt * 0.9;
        const want = _a.set(p.pos.x + Math.cos(this.orbit) * 4, p.pos.y + 2.9 + Math.sin(g.time * 2 + this.seed) * 0.35, p.pos.z + Math.sin(this.orbit) * 4);
        this.vel.lerp(want.sub(this.pos).multiplyScalar(2), 1 - Math.exp(-dt * 2.5));
        this.facePlayer(dt, 5);
        this.cool -= dt;
        const busy = g.enemies.some(e => e !== this && e.kind === 'moth' && (e.state === 'aim' || e.state === 'dive'));
        if (this.cool <= 0 && !busy && !p.dead && d < this.aggro) { this.setState('aim'); audio.play('mothFlutter', { pitch: 1.3 }); }
        if (d > this.aggro * 2) this.setState('idle');
        break;
      }
      case 'aim':
        // wings fold up and the eyes flare: the tell
        damp(8); this.facePlayer(dt, 10);
        this.windupGlow = Math.sin(this.t * 36) > 0 ? 0.45 : 0.05;
        if (this.t > 0.8) {
          this.target = _b.copy(p.pos).setY(p.pos.y + 0.9).clone();
          this.vel.copy(this.target).sub(this.pos).normalize().multiplyScalar(13);
          this.setState('dive'); this.hitDone = false; audio.play('mothDive');
        }
        break;
      case 'dive':
        if (!this.hitDone && this.pos.distanceTo(_a.copy(p.pos).setY(p.pos.y + 0.9)) < 1.0) { this.hitDone = true; this.strike(1, { kb: 5 }); }
        // swoop through and on past, then climb back out
        if (this.t > 0.35 && this.pos.y < this.target.y + 0.2) { this.vel.y = Math.max(this.vel.y, 4); }
        if (this.t > 1.0) { this.setState('hunt'); this.cool = 2.4 + R() * 1.6; }
        damp(0.6);
        break;
      case 'stunned':
        // tumble down a little, fluttering
        damp(3); this.vel.y = -1.5;
        if (this.stun <= 0) this.setState('hunt');
        break;
    }
  }
  physics(dt) {
    super.physics(dt);
    const floor = raycast(_a.copy(this.pos).setY(this.pos.y + 0.5), _b.set(0, -1, 0), 30);
    if (floor !== null && floor < 1.3) this.pos.y += 1.3 - floor;
  }
  onStomp(player, dmg) { this.onHit({ dmg: dmg + 1, from: player.pos, kind: 'stomp' }); }
  animate(dt) {
    const s = this.state, t = this.game.time * (s === 'hunt' || s === 'idle' ? 9 : 16) + this.seed;
    const fold = s === 'aim' ? 1.25 : s === 'dive' ? 0.25 : null;
    const w = fold ?? Math.sin(t) * 0.75 + 0.15;
    const j = this.rig.j;
    j.wingL.rotation.z = w; j.wingR.rotation.z = -w;
    j.hindL.rotation.z = (fold ?? Math.sin(t - 0.6) * 0.6 + 0.1) * 0.9; j.hindR.rotation.z = -j.hindL.rotation.z;
    j.wingL.rotation.y = s === 'dive' ? -0.5 : 0; j.wingR.rotation.y = -j.wingL.rotation.y;
    this.rig.body.rotation.x = s === 'dive' ? 0.7 : s === 'stunned' ? Math.sin(this.game.time * 8) * 0.4 : -0.1 + Math.sin(t) * 0.05;
    this.rig.body.position.y = 0.6 + Math.sin(t) * 0.06;
    j.abdomen.rotation.x = Math.sin(this.game.time * 3 + this.seed) * 0.12;
  }
}

// ================================================================== mirror twin
export class MirrorTwin extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'twin', pos, { hp: 4, radius: 0.4, height: 1.7, drops: 7, stompable: false, aggro: o.wake ?? 9, ...o });
    this.popColor = 0xd080ff; this.parryStun = 2.2; this.heartChance = 0.4; this.seed = R() * 10;
    this.state = 'under'; this.root.visible = false; this.noAim = true; this.sink = 2.2; this.slashes = 0; this.act = null; this.actT = 0;
    this.parkedAt = pos.clone(); this.char.teleport(_a.copy(pos).setY(pos.y - 40));
    this.onRise = o.onRise;
  }
  guards(hit) {
    if (this.stun > 0 || this.state !== 'stalk' || hit.kind !== 'sword') return false;
    const d = _b.copy(hit.from).sub(this.pos);
    const front = (d.x * Math.sin(this.yaw) + d.z * Math.cos(this.yaw)) / Math.max(0.01, Math.hypot(d.x, d.z));
    if (front > 0.25) { this.blockT = 0.3; audio.play('block', { pitch: 1.3, volume: 0.6 }); return true; }
    return false;
  }
  onHit(hit) {
    if (this.state === 'under' || this.state === 'rise') return 'ignored';
    const r = super.onHit(hit);
    if (r === 'hit' && this.state === 'stalk' && hit.kind === 'plunge') { this.stun = 1.4; this.setState('stunned'); }
    return r;
  }
  die() {
    super.die(); audio.play('twinShatter');
    const c = _a.copy(this.pos).setY(this.pos.y + 1);
    for (let i = 0; i < 26; i++) this.game.fx.dust.emit({ pos: c, vel: new THREE.Vector3((R() - 0.5) * 9, R() * 7, (R() - 0.5) * 9), life: 1.2, size: 0.2, size1: 0.05, color: [0xe8e0ff, 0xb070ff, 0x70f0ff][i % 3], gravity: 14, floor: this.pos.y + 0.05 });
    this.game.dreamRipple?.(this.pos, 1);
  }
  physics(dt) { if (this.state === 'under' || this.state === 'rise') return; super.physics(dt); }
  think(dt) {
    const p = this.player, d = this.distP(), g = this.game;
    this.windupGlow = 0; this.blockT = Math.max(0, (this.blockT || 0) - dt);
    if (this.act) { this.actT += dt; }
    switch (this.state) {
      case 'under':
        // a dark shimmer under the surface gives it away
        if (R() < dt * 6) g.fx.glow.emit({ pos: _a.copy(this.parkedAt).add(new THREE.Vector3((R() - 0.5) * 1.2, 0.05, (R() - 0.5) * 1.2)), vel: new THREE.Vector3(0, 0.4, 0), life: 0.9, size: 0.35, size1: 0, color: 0xb060ff, alpha: 0.8 });
        if (d < this.aggro && !p.dead) {
          this.setState('rise'); this.root.visible = true; this.facePlayer(1, 99);
          audio.play('twinRise'); g.dreamRipple?.(this.parkedAt, 1); this.onRise?.(this);
        }
        break;
      case 'rise':
        this.sink = 2.2 * (1 - THREE.MathUtils.smoothstep(this.t, 0, 1.1));
        this.facePlayer(dt, 6);
        if (this.t > 1.15) { this.sink = 0; this.noAim = false; this.char.teleport(this.parkedAt); this.pos.copy(this.parkedAt); this.setState('stalk'); }
        break;
      case 'stalk': {
        this.facePlayer(dt, 7);
        const toP = this.toPlayer(_b).setY(0).normalize();
        // close in, then sidestep like a fencer
        const fwd = d > 2.4 ? 3.2 : d < 1.6 ? -2 : 0, side = Math.sin(g.time * 1.3 + this.seed) * 1.6;
        this.steer(toP.x * fwd - toP.z * side, toP.z * fwd + toP.x * side, dt, 16);
        if (d < 2.8 && this.t > 0.7 && !p.dead) { this.setState('windup'); audio.play('knightSwing', { pitch: 1.4, volume: 0.6 }); }
        break;
      }
      case 'windup':
        this.facePlayer(dt, 9); this.steer(0, 0, dt, 20);
        this.windupGlow = Math.sin(this.t * 40) > 0 ? 0.45 : 0.1;
        if (R() < 0.6) g.fx.twinkle(this.model.hero.swordTip(_a), 0xff80f0, 0.7);
        if (this.t > 0.5) {
          this.setState('slash'); this.act = this.slashes % 2 ? 'atk2' : 'atk1'; this.actT = 0; this.hitDone = false; this.slashes++;
          this.vel.x += Math.sin(this.yaw) * 5; this.vel.z += Math.cos(this.yaw) * 5;
          audio.play('twinSlash');
        }
        break;
      case 'slash':
        if (!this.hitDone && this.t > 0.08) { this.hitDone = true; if (this.inFront(0.25, 2.5)) this.strike(1, { kb: 5 }); }
        if (this.t > 0.34) { this.act = null; this.setState(this.slashes % 2 ? 'windup2' : 'recover'); }
        break;
      case 'windup2':
        // a quick second cut
        this.facePlayer(dt, 12); this.steer(0, 0, dt, 20);
        this.windupGlow = 0.3;
        if (this.t > 0.22) { this.setState('windup'); this.t = 0.5; }
        break;
      case 'recover': this.steer(0, 0, dt, 20); if (this.t > 0.85) this.setState('stalk'); break;
      case 'stunned': this.act = null; this.steer(0, 0, dt); if (this.stun <= 0) this.setState('stalk'); break;
    }
  }
  animate(dt) {
    const h = this.model.hero, sp = Math.hypot(this.vel.x, this.vel.z);
    h.update(dt, {
      speed: this.state === 'stalk' ? sp : 0, grounded: true, vy: 0,
      action: this.act || (this.state === 'stunned' ? 'hurt' : null), actionT: this.act ? this.actT : this.t,
      guard: this.state === 'stalk' ? 1 : 0, hpFrac: 1, landed: 0, dead: false, turn: 0, skid: false,
    });
    h.mats.flame.uniforms.uColor.value.setHex(0xff60f0);
    if (this.state === 'windup') h.rig.apply({ shoulderR: [-2.4, 0, -0.4], elbowR: [-0.5, 0, 0], handR: [0.6, 0, 0], spine: [-0.1, -0.5, 0] }, 1 - Math.exp(-dt * 20));
    this.root.position.y -= this.sink;
  }
}

// ================================================================== glass puffer
export class GlassPuffer extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'puffer', pos, { hp: 3, radius: 0.7, height: 1.2, drops: 6, flying: true, aggro: 13, ...o });
    this.popColor = 0x8ad0ff; this.seed = R() * 10; this.puff = 0; this.cool = 1.5 + R(); this.aimHeight = 0.2; this.heartChance = 0.3;
    this.hover = o.hover ?? 1.6; this.ring = o.ring ?? 8;
  }
  guards(hit) {
    if (this.puff < 0.5 || hit.kind === 'reflect' || hit.kind === 'plunge') return false;
    this.flash = 0.3; return true;
  }
  onHit(hit) {
    const r = super.onHit(hit);
    if (r === 'blocked') { const d = _a.copy(this.player.pos).sub(this.pos).setY(0).normalize(); this.player.vel.addScaledVector(d, 4); }
    if (r === 'hit' && hit.kind === 'reflect') { this.stun = 2.2; this.setState('tired'); }
    return r;
  }
  die() { super.die(); audio.play('bubblePop', { pitch: 0.6 }); audio.play('twinShatter', { volume: 0.5, pitch: 1.4 }); }
  think(dt) {
    const p = this.player, d = this.distP(), g = this.game;
    this.windupGlow = 0;
    const floor = raycast(_a.copy(this.pos).setY(this.pos.y + 0.5), _b.set(0, -1, 0), 30);
    const gy = floor === null ? this.home.y : this.pos.y + 0.5 - floor;
    const hoverTo = (h, k = 2) => { this.vel.y += ((gy + h + Math.sin(g.time * 1.5 + this.seed) * 0.2 - this.pos.y) * 3 - this.vel.y) * (1 - Math.exp(-dt * k)); };
    switch (this.state) {
      case 'idle':
        hoverTo(this.hover); this.steer((this.home.x - this.pos.x) * 0.6, (this.home.z - this.pos.z) * 0.6, dt, 4);
        this.face(this.yaw + dt * 0.5, dt, 2);
        if (d < this.aggro && !p.dead) this.setState('drift');
        break;
      case 'drift': {
        hoverTo(this.hover); this.facePlayer(dt, 3);
        const toP = this.toPlayer(_b).setY(0).normalize(), fwd = d > 7 ? 1.4 : d < 4 ? -1.2 : 0;
        this.steer(toP.x * fwd, toP.z * fwd, dt, 4);
        this.cool -= dt;
        if (this.cool <= 0 && !p.dead) { this.setState('inflate'); audio.play('pufferInflate'); }
        if (d > this.aggro * 2) this.setState('idle');
        break;
      }
      case 'inflate':
        hoverTo(this.hover + 0.4); this.steer(0, 0, dt, 6); this.facePlayer(dt, 4);
        this.puff = THREE.MathUtils.smoothstep(this.t, 0, 0.75);
        this.windupGlow = this.t > 0.5 && Math.sin(this.t * 30) > 0 ? 0.3 : 0;
        if (this.t > 0.85) { this.setState('fire'); this.shots = 0; }
        break;
      case 'fire': {
        hoverTo(this.hover + 0.4); this.puff = 1;
        if (this.shots === 0) {
          // a ring of bubbles at chest height (jump it or shield), plus one aimed at you
          const c = _a.set(this.pos.x, Math.min(this.pos.y, gy + 1.0), this.pos.z);
          const off = R() * PI;
          for (let i = 0; i < this.ring; i++) { const a = off + i / this.ring * PI * 2; new Bubble(g, c, new THREE.Vector3(Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2), { owner: this }); }
          const aim = _b.copy(p.pos).setY(p.pos.y + 0.9).sub(c).normalize().multiplyScalar(5.5);
          new Bubble(g, c, aim, { owner: this, homing: 0.6 });
          this.shots = 1; audio.play('bubbleShot'); audio.play('bubbleShot', { pitch: 1.3, volume: 0.6 });
        }
        if (this.t > 0.7) this.setState('deflate');
        break;
      }
      case 'deflate':
        this.puff = 1 - THREE.MathUtils.smoothstep(this.t, 0, 0.4); hoverTo(this.hover);
        if (this.t > 0.45) { this.setState('tired'); this.stun = 0; }
        break;
      case 'tired':
        // sagging low and gasping: strike now
        this.puff = 0; hoverTo(0.75, 3); this.steer(0, 0, dt, 4);
        if (this.t > (this.stun > 0 ? this.stun : 1.9)) { this.setState('drift'); this.cool = 2.2 + R() * 1.2; this.stun = 0; }
        break;
      case 'stunned': this.puff = 0; hoverTo(0.75, 3); if (this.stun <= 0) this.setState('drift'); break;
    }
  }
  onStomp(player, dmg) { if (this.puff > 0.5) { player.receive({ dmg: 1, from: this.pos.clone(), kind: 'hazard' }); return; } this.squash = 1; this.onHit({ dmg: dmg + 1, from: player.pos, kind: 'stomp' }); }
  animate(dt) {
    const k = 1 + this.puff * 0.75, t = this.game.time + this.seed;
    this.rig.body.scale.setScalar(k);
    this.model.spikes.scale.setScalar(0.55 + this.puff * 0.75);
    this.rig.j.tail.rotation.y = Math.sin(t * (this.puff ? 14 : 6)) * 0.5;
    this.rig.j.finL.rotation.z = Math.sin(t * 9) * 0.6; this.rig.j.finR.rotation.z = -Math.sin(t * 9) * 0.6;
    this.model.core.scale.setScalar(0.9 + Math.sin(t * 4) * 0.12 + this.puff * 0.3);
    this.rig.body.rotation.x = this.state === 'tired' ? 0.4 + Math.sin(t * 3) * 0.1 : 0;
    this.stompable = this.puff < 0.3;
    this.height = 1.2 * k; this.radius = 0.7 * k;
  }
}

Object.assign(ENEMIES, { moth: Eyemoth, twin: MirrorTwin, puffer: GlassPuffer });
