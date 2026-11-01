// Skorvath, the Star-Eater — the dragon in Grimhold's hoard.
// Phase 1 (ground): fireball volleys (parry one back to stun it), rings of
//   fire that race across the floor (jump them), claw swipes and tail spins.
// Phase 2 (air): circles the arena raining fire and diving; when it hovers to
//   charge a great fireball, parry it to knock the dragon out of the sky.
// Phase 3 (enraged): a sweeping beam of fire rotates around the arena (jump
//   it as it passes); after two sweeps it tires and leaves its head open.
// Whenever it's stunned, its head lies on the floor: strike it!
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat, Lights } from '../core/retro.js';
import { box, cyl, sphere, clean } from '../core/geo.js';
import { addPlatform, raycast } from '../core/physics.js';
import { Orb } from './enemies.js';
import { Puddle } from './witch.js';
import audio from '../sound.js';

const PI = Math.PI;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();
const R = Math.random;
const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2; return d; };
const ease = t => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- model
function buildModel() {
  const m = {
    scale: retroMat({ map: T.scales, chrome: 0.18, env: T.redEnv, spec: 0.9, shine: 14, rim: 0.12, emit: 0.22, edge: 0.8 }),
    belly: retroMat({ map: T.belly, spec: 0.5, rim: 0.1, emit: 0.2, edge: 0.7 }),
    horn: retroMat({ map: T.horn, spec: 0.9, shine: 20, rim: 0.3, edge: 0.4 }),
    wing: retroMat({ map: T.membrane, side: THREE.DoubleSide, rim: 0.1, spec: 0.2, emit: 0.18 }),
    bone: retroMat({ map: T.bone, spec: 0.8, rim: 0.3 }),
    eye: retroMat({ map: T.flame, emit: 1, scroll: [0.1, -1.0], fog: 0.3 }),
    mouth: retroMat({ color: 0x400008, emit: 0.4 }),
  };
  const mats = Object.values(m);
  const eyes = [];
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = BODY_Y; root.add(body);
  const add = (parent, g, mat, p = [0, 0, 0], r = [0, 0, 0], s = 1) => { const me = new THREE.Mesh(g, mat); me.position.set(...p); me.rotation.set(...r); if (typeof s === 'number') me.scale.setScalar(s); else me.scale.set(...s); parent.add(me); return me; };
  const J = (parent, p = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...p); parent.add(g); return g; };
  // torso: barrel body, deep chest, belly plates, a ridge of spines
  add(body, sphere(1, 12, 9, { s: 0.5 }), m.scale, [0, 0, -0.2], [0, 0, 0], [1.5, 1.3, 2.4]);
  add(body, sphere(1, 10, 7), m.belly, [0, -0.45, 0.2], [0, 0, 0], [1.2, 0.95, 2.0]);
  add(body, sphere(1.3, 10, 8, { s: 0.5 }), m.scale, [0, 0.3, 1.5], [0, 0, 0], [1.08, 1.05, 1]);
  add(body, sphere(1.0, 8, 6), m.belly, [0, -0.15, 2.1], [0, 0, 0], [0.9, 1.0, 0.7]);
  for (let i = 0; i < 8; i++) add(body, cyl(0, 0.36, 1.0 - Math.abs(i - 3) * 0.08, 4, { flat: true }), m.horn, [0, 1.42 - Math.abs(i - 3) * 0.06, 1.8 - i * 0.62], [-0.5, PI / 4, 0]);
  // neck chain (an S-curve is applied in pose())
  const neck = []; let par = J(body, [0, 0.9, 2.3]);
  for (let i = 0; i < 4; i++) {
    const j = J(par, i ? [0, 0, 0.78] : [0, 0, 0]); neck.push(j);
    const r = 0.86 - i * 0.09;
    add(j, cyl(r * 0.88, r, 1.05, 10, { s: 0.5 }), m.scale, [0, 0, 0.4], [PI / 2, 0, 0]);
    add(j, sphere(r * 0.92, 8, 6), m.belly, [0, -0.28, 0.4], [0, 0, 0], [0.8, 0.6, 0.85]);
    add(j, cyl(0, 0.26, 0.7, 4, { flat: true }), m.horn, [0, r + 0.18, 0.3], [-0.6, PI / 4, 0]);
    par = j;
  }
  // head
  const head = J(par, [0, 0, 0.85]);
  add(head, sphere(0.95, 10, 8, { s: 0.6 }), m.scale, [0, 0.2, 0.15], [0, 0, 0], [1.05, 0.88, 1.05]);
  add(head, box(1.35, 0.72, 1.9, { s: 1.5 }), m.scale, [0, 0.02, 1.25], [0.06, 0, 0]);
  add(head, box(1.05, 0.34, 0.5, { s: 2 }), m.scale, [0, 0.28, 2.05], [0.25, 0, 0]);
  for (const s of [-1, 1]) {
    add(head, box(0.62, 0.26, 1.1, { s: 2 }), m.scale, [s * 0.44, 0.66, 0.6], [0.3, -s * 0.22, s * 0.3]);           // brow ridge
    eyes.push(add(head, sphere(0.24, 8, 6), m.eye, [s * 0.5, 0.42, 0.85], [0, 0, 0], [1.1, 0.65, 1.2]));
    add(head, sphere(0.07, 5, 4), m.eye, [s * 0.26, 0.2, 2.2]);                                                         // nostrils
    let hp = J(head, [s * 0.52, 0.72, -0.25]); hp.rotation.set(-0.85, 0, -s * 0.55);
    for (let i = 0; i < 8; i++) {
      const seg = J(hp, i ? [0, 0.6, 0] : [0, 0, 0]); seg.rotation.set(-0.2, 0, s * 0.1);
      add(seg, cyl(0.29 - i * 0.034, 0.33 - i * 0.034, 0.66, 7, { s: 1 }), m.horn, [0, 0.3, 0]);
      hp = seg;
    }
    for (let i = 0; i < 3; i++) add(head, cyl(0, 0.13, 0.55, 4), m.horn, [s * (0.78 - i * 0.1), -0.05 - i * 0.1, 0.1 - i * 0.35], [-1.2, 0, -s * 0.9]);   // cheek frills
    for (let i = 0; i < 6; i++) add(head, cyl(0, 0.07, i === 0 ? 0.5 : 0.26, 4), m.bone, [s * (0.58 - i * 0.03), -0.36, 1.95 - i * 0.27], [PI, 0, 0]);  // upper fangs
  }
  add(head, box(1.2, 0.1, 1.7, { s: 2 }), m.mouth, [0, -0.36, 1.25]);
  const jaw = J(head, [0, -0.38, 0.3]);
  add(jaw, box(1.2, 0.34, 1.85, { s: 1.5 }), m.scale, [0, -0.14, 0.9], [-0.05, 0, 0]);
  add(jaw, box(1.0, 0.06, 1.55, { s: 2 }), m.mouth, [0, 0.04, 0.9]);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) add(jaw, cyl(0, 0.065, i === 0 ? 0.4 : 0.24, 4), m.bone, [s * (0.5 - i * 0.03), 0.14, 1.72 - i * 0.3]);
  // tail
  const tail = []; par = J(body, [0, -0.05, -2.4]);
  for (let i = 0; i < 8; i++) {
    const j = J(par, i ? [0, 0, -0.95] : [0, 0, 0]); tail.push(j);
    const r = 0.85 - i * 0.095;
    add(j, cyl(r, r * 0.85, 1.12, 8, { s: 0.5 }), m.scale, [0, 0, -0.45], [PI / 2, 0, 0]);
    add(j, cyl(0, 0.22 - i * 0.02, 0.6, 4, { flat: true }), m.horn, [0, r + 0.12, -0.4], [-0.7, PI / 4, 0]);
    par = j;
  }
  add(par, cyl(0, 0.65, 1.0, 4, { flat: true }), m.horn, [0, 0, -1.15], [-PI / 2, 0, 0], [1, 1, 0.3]);
  // stocky legs
  const legs = [];
  for (const [s, front] of [[1, 1], [-1, 1], [1, 0], [-1, 0]]) {
    const hip = J(body, front ? [s * 1.2, -0.45, 1.45] : [s * 1.25, -0.25, -1.25]);
    add(hip, sphere(front ? 0.62 : 0.9, 8, 6), m.scale, [0, 0, 0]);
    add(hip, cyl(front ? 0.5 : 0.62, front ? 0.38 : 0.44, 1.0, 8, { s: 1 }), m.scale, [0, -0.5, 0]);
    const knee = J(hip, [0, -0.95, 0]);
    add(knee, sphere(front ? 0.36 : 0.42, 7, 5), m.scale, [0, 0, 0]);
    add(knee, cyl(0.36, 0.3, 0.9, 8, { s: 1 }), m.scale, [0, -0.42, 0]);
    const foot = J(knee, [0, -0.85, 0]);
    add(foot, box(0.85, 0.36, 1.0, { s: 2 }), m.scale, [0, -0.02, 0.25]);
    for (const k of [-1, 0, 1]) add(foot, cyl(0, 0.1, 0.45, 4), m.horn, [k * 0.26, -0.12, 0.85], [PI / 2, 0, 0]);
    legs.push({ hip, knee, foot, s, front });
  }
  // wings
  const wingShape = (pts) => { const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); const g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2); const uv = g.attributes.uv; const ps = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) * 0.3, ps.getZ(i) * 0.3); return clean(g); };
  const inner = wingShape([[0, -0.2], [3.4, 0.05], [3.4, 2.4], [2.6, 1.6], [1.8, 2.7], [0.9, 1.9], [0, 2.9]]);
  const outer = wingShape([[0, 0], [4.8, 0.8], [4.0, -1.0], [3.0, -0.75], [2.3, -2.4], [1.2, -1.5], [0, -2.3]].map(([x, y]) => [x, -y]));
  const wings = [];
  for (const s of [1, -1]) {
    const w = J(body, [s * 1.0, 1.05, 0.7]); w.scale.x = s;
    add(w, inner, m.wing);
    add(w, cyl(0.15, 0.2, 3.4, 6), m.scale, [1.7, 0, 0], [0, 0, PI / 2]);
    const e = J(w, [3.4, 0, 0]);
    add(e, outer, m.wing);
    add(e, cyl(0.07, 0.15, 4.8, 6), m.scale, [2.4, 0, -0.38], [0, 0.16, PI / 2]);
    add(e, cyl(0, 0.14, 0.7, 4), m.horn, [0, 0.25, 0]);
    wings.push({ w, e, s });
  }
  root.scale.setScalar(1.25);
  return { root, body, neck, head, jaw, tail, legs, wings, mats, eyes };
}
const BODY_Y = 2.35;
const NECK_S = [-0.3, -0.05, 0.16, 0.26];

export function preview() {
  const fake = { M: buildModel(), p: { neckPitch: -0.15, neckYaw: 0, jaw: 0.3, headPitch: 0.15, spread: 0.5, flap: 0, crouch: 0, bodyPitch: 0, roll: 0, walk: 0, tailYaw: 0, legPhase: 0, lookYaw: 0, lookPitch: 0, stride: 0 }, pos: new THREE.Vector3(), yaw: 0, fly: 0, turnRate: 0, speed: 0, state: 'idle', game: { time: 0 } };
  fake.root = fake.M.root;
  return { root: fake.M.root, update(dt, s) { fake.game.time += dt; Object.assign(fake.p, s.dragon || {}); Dragon.prototype.pose.call(fake, dt); } };
}

// ---------------------------------------------------------------- hazards
class Marker {
  // a shrinking red ring on the floor showing where falling fire will land
  constructor(game, pos, t) {
    this.game = game; this.t = t; this.age = 0;
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 20).rotateX(-PI / 2), retroMat({ color: 0xff3010, emit: 1, additive: true, side: THREE.DoubleSide }));
    this.mesh.position.copy(pos).setY(pos.y + 0.08); game.scene.add(this.mesh); game.projectiles.push(this);
  }
  update(dt) { this.age += dt; const k = 1 - this.age / this.t; this.mesh.scale.setScalar(0.5 + k * 1.6); if (k <= 0) { this.removed = true; this.mesh.removeFromParent(); } }
}

// A roaring stream of fire from the mouth toward an aim point. Walls and
// pillars stop it, the shield blocks it, and it sets the floor alight where it
// licks the ground — so the burning trail chases you as the head sweeps.
class FireStream {
  constructor(dragon) {
    this.d = dragon; this.on = false; this.len = 0; this.scorchT = 0; this.blockT = 0;
    this.light = Lights.add(new THREE.Vector3(), 0xff7a20, 0, 18, { dynamic: true });
    this.splashLight = Lights.add(new THREE.Vector3(), 0xff5a10, 0, 9, { dynamic: true });
    // the jet: two nested flame cones whose texture streams outward
    const cone = (r0, r1) => { const g = new THREE.CylinderGeometry(r1, r0, 1, 14, 6, true); g.translate(0, 0.5, 0); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3); return g; };
    this.group = new THREE.Group(); this.group.visible = false; dragon.game.scene.add(this.group);
    this.outer = new THREE.Mesh(cone(0.35, 2.3), retroMat({ map: T.flame, color: 0xff6a18, emit: 1, additive: true, opacity: 0.6, side: THREE.DoubleSide, scroll: [0.6, -4.5], fog: 0.25, snap: false }));
    this.inner = new THREE.Mesh(cone(0.18, 1.0), retroMat({ map: T.flame, color: 0xffb040, emit: 1, additive: true, opacity: 0.55, side: THREE.DoubleSide, scroll: [-0.4, -6.5], fog: 0.25, snap: false }));
    this.outer.renderOrder = this.inner.renderOrder = 9;
    this.group.add(this.outer, this.inner);
  }
  start() { if (!this.on) { this.on = true; this.len = 0; this.group.visible = true; audio.startLoop('fireBreath', { volume: 1 }); } }
  stop() { if (this.on) { this.on = false; this.group.visible = false; audio.stopLoop('fireBreath'); this.light.intensity = 0; this.splashLight.intensity = 0; } }
  update(dt, from, dir, maxLen = 22) {
    if (!this.on) return;
    const g = this.d.game, fx = g.fx;
    this.len = Math.min(maxLen, this.len + dt * 55);
    const hit = raycast(from, dir, this.len, true);
    const L = hit !== null ? Math.max(0.5, hit) : this.len;
    // jet meshes
    this.group.position.copy(from);
    this.group.quaternion.setFromUnitVectors(_a.set(0, 1, 0), dir);
    const fl = 1 + Math.sin(g.time * 37) * 0.08 + Math.sin(g.time * 23) * 0.06;
    this.outer.scale.set(fl, L, fl); this.inner.scale.set(fl * 0.95, L * 0.92, fl * 0.95);
    // licks of flame and embers along the jet
    for (let i = 0; i < 6; i++) {
      const k = R(), q = _a.copy(from).addScaledVector(dir, k * L);
      fx.glow.emit({ pos: q, vel: _c.copy(dir).multiplyScalar(6 + R() * 6).add(_b.set((R() - 0.5) * 3, 1 + R() * 2, (R() - 0.5) * 3)), life: 0.35 + R() * 0.3, size: 0.6 + k * 1.6, size1: 0.2, color: R() < 0.3 ? 0xfff0b0 : 0xffa030, color1: 0xa01000, alpha: 0.8, alpha1: 0 });
    }
    // the splash where the stream lands
    const end = _c.copy(from).addScaledVector(dir, L);
    for (let i = 0; i < 4; i++) fx.glow.emit({ pos: end, vel: _b.set((R() - 0.5) * 7, 2 + R() * 5, (R() - 0.5) * 7), life: 0.45 + R() * 0.3, size: 1.2, size1: 0.3, color: 0xffc050, color1: 0xb01400, alpha: 0.9, alpha1: 0 });
    if (R() < 0.5) fx.spark.emit({ pos: end, vel: _b.set((R() - 0.5) * 8, 4 + R() * 6, (R() - 0.5) * 8), life: 0.6, size: 0.4, size1: 0, color: 0xffd080, gravity: 12 });
    this.light.pos.copy(from).addScaledVector(dir, L * 0.4); this.light.intensity = 2.6;
    this.splashLight.pos.copy(end).setY(end.y + 1); this.splashLight.intensity = 2.2;
    // burn whoever stands in the jet
    const p = g.player;
    this.blockT = Math.max(0, this.blockT - dt);
    const rel = _a.copy(p.pos).setY(p.pos.y + 0.8).sub(from), along = rel.dot(dir);
    if (along > 0 && along < L + 0.6 && this.blockT <= 0) {
      const radial = rel.addScaledVector(dir, -along).length();
      if (radial < 0.5 + along / L * 1.9) { const r = p.receive({ dmg: 1, from: from.clone(), kind: 'fire', source: this }); if (r === 'block' || r === 'parry') this.blockT = 0.35; }
    }
    // the floor catches fire where the stream touches it
    this.scorchT -= dt;
    if (this.scorchT <= 0 && end.y < this.d.floorY + 1.2) { this.scorchT = 0.14; new Puddle(g, end.clone().setY(this.d.floorY), 1.3, 1.6, true); }
  }
}

// ---------------------------------------------------------------- the dragon
const ROAM = 9;     // the dragon keeps its body within this radius of the arena centre
export class Dragon {
  constructor(game, arena) {
    this.game = game; this.arena = arena;
    this.M = buildModel();
    this.root = this.M.root; game.zones.castle.group.add(this.root);
    const C = arena.center;
    this.pos = C.clone().addScaledVector(arena.fwd, 9); this.floorY = C.y;
    this.yaw = arena.yaw + PI; this.state = 'sleep'; this.t = 0;
    this.hp = this.maxHp = 20; this.phase = 1; this.hits = 0; this.flash = 0; this.cool = 2;
    this.fly = 0; this.orbit = 0; this.alive = true; this.turnRate = 0; this.speed = 0; this.strafes = 0;
    this.aim = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.p = { neckPitch: 0.9, neckYaw: 0, jaw: 0, headPitch: 0.3, spread: 0, flap: 0, crouch: -1.2, bodyPitch: 0.15, roll: 0, walk: 0, tailYaw: 0, legPhase: 0, lookYaw: 0, lookPitch: 0, stride: 0 };
    this.light = Lights.add(this.pos, 0xff7a30, 0, 10, { dynamic: true });
    this.stream = new FireStream(this);
    const self = this;
    this.target = {
      pos: new THREE.Vector3(), radius: 1.5, height: 1.4, aimHeight: 0.6, alive: true, big: true, noAim: true, stompable: false,
      onHit(hit) { return self.onHeadHit(hit); },
      onParried() {},
    };
    game.addTarget(this.target);
    this.bodyMesh = new THREE.Object3D(); this.bodyMesh.position.copy(this.pos);
    this.bodyCol = addPlatform(new THREE.Vector3(1.8, 1.6, 2.9), this.bodyMesh);
    this.update(0);
  }

  set(s) { this.state = s; this.t = 0; this.fired = 0; }
  get player() { return this.game.player; }
  headPos(out = _a) { return this.M.head.getWorldPosition(out); }
  mouthPos(out = _b) { return this.M.jaw.localToWorld(out.set(0, 0.1, 1.6)); }
  get vulnerable() { return ['stunned', 'pant', 'recover'].includes(this.state); }

  wake() {
    if (this.state !== 'sleep') return;
    this.set('intro');
    const g = this.game;
    g.hud.hint(null); g.hud.prompt(null);
    audio.play('bossIntro'); audio.music('boss');
    g.player.cam.focus = this.pos;
    setTimeout(() => { audio.play('dragonRoar'); g.shake(1.0); g.hud.boss('Skorvath, the Star-Eater', 1); g.hud.area('Skorvath', 'the Star-Eater'); }, 1100);
  }

  onHeadHit(hit) {
    const g = this.game;
    if (!this.alive) return 'ignored';
    if (hit.kind === 'reflect') { this.stun(); return 'hit'; }
    if (!this.vulnerable) return 'blocked';
    const cap = this.state === 'stunned' ? 3 : 2;
    if (this.hits >= cap) return 'blocked';
    const dmg = hit.kind === 'plunge' ? 2 : 1;
    this.hp -= dmg; this.hits += dmg; this.flash = 1; this.flinch = 1;
    audio.play('dragonHurt', { volume: 0.7, pitch: 0.9 + R() * 0.2 });
    g.hud.boss('', this.hp / this.maxHp);
    g.fx.sparks(this.headPos(_c), 14, 0xffa040, 6);
    if (this.hp <= 0) { this.die(); return 'kill'; }
    if (this.phase === 1 && this.hp <= 13) { this.nextPhase(); return 'hit'; }
    if (this.phase === 2 && this.hp <= 6) { this.nextPhase(); return 'hit'; }
    if (this.hits >= cap) this.recover();
    return 'hit';
  }

  stun() {
    const g = this.game;
    this.hits = 0; this.stream.stop();
    this.set(this.fly > 0.5 ? 'falling' : 'stunned');
    audio.play('dragonHurt'); g.shake(0.6); g.hitstop(0.12); g.flash(0.4, 0xffd080);
    g.hud.callout('Stunned!', 'small');
    if (!this.hinted) { this.hinted = true; g.hud.hint('Its head is down — strike it!', 3); }
  }
  recover() {
    this.stream.stop();
    this.set('roarBack');
    audio.play('dragonRoar', { volume: 0.7 });
    const p = this.player;
    _a.copy(p.pos).sub(this.pos).setY(0);
    if (_a.length() < 8) { p.vel.addScaledVector(_a.normalize(), 11); p.vel.y = 6; p.grounded = false; }
    this.game.fx.rings.add(this.pos.clone().setY(this.floorY), { color: 0xffa040, r0: 1, r1: 8, life: 0.4 });
    this.game.shake(0.6);
  }
  nextPhase() {
    this.phase++; this.hits = 0; this.stream.stop();
    this.set(this.phase === 2 ? 'takeoff' : 'enrage');
    audio.play('dragonRoar'); this.game.shake(0.8);
    this.game.hud.callout(this.phase === 2 ? 'It takes to the sky!' : 'Skorvath is enraged!', 'small');
    if (this.phase === 2) this.game.hud.hint('Dodge its fiery strafing runs — and PARRY the great fireball to bring it down!', 5);
  }
  die() {
    const g = this.game;
    this.alive = false; this.target.alive = false; this.stream.stop(); this.set('dying');
    audio.play('dragonDie'); audio.music(null);
    g.removeTarget(this.target); g.hud.boss(null);
    g.timeScale = 0.35; setTimeout(() => { g.timeScale = 1; }, 1600);
  }

  fireball(big = false) {
    const g = this.game, p = this.player, from = this.mouthPos(_c).clone();
    const lead = big ? 0 : 0.35;
    const to = _a.copy(p.pos).addScaledVector(p.vel.clone().setY(0), lead).setY(p.pos.y + 0.9);
    new Orb(g, from, to.sub(from).normalize().multiplyScalar(big ? 11 : 14), {
      owner: this.target, homing: big ? 1.3 : 0.4, color: big ? 0xff4010 : 0xff7020, size: big ? 2.6 : 1.4, kind: 'fireball', life: 5, dmg: big ? 2 : 1, reflectDmg: 0,
      onImpact: (o) => { if (Math.abs(o.pos.y - this.floorY) < 1.6) new Puddle(g, new THREE.Vector3(o.pos.x, this.floorY, o.pos.z), 1.3, 2.0, true); },
    });
    audio.play('fireball');
  }

  // move the body toward a point at a given speed, turning to face where it walks
  walkTo(q, speed, dt, face = null) {
    const C = this.arena.center;
    const off = _a.copy(q).sub(C).setY(0); if (off.length() > ROAM) q = _b.copy(C).add(off.setLength(ROAM));
    const step = _c.copy(q).sub(this.pos).setY(0), l = step.length();
    const v = l > 0.3 ? Math.min(speed, l * 2.5) : 0;
    if (v > 0) this.pos.addScaledVector(step.normalize(), v * dt);
    this.speed += (v - this.speed) * (1 - Math.exp(-dt * 6));
    if (face !== null) this.turn(face, 1.8, dt);
  }
  turn(yaw, rate, dt) {
    const d = angDiff(this.yaw, yaw), w = THREE.MathUtils.clamp(d * 3, -rate, rate);
    this.turnRate += (w - this.turnRate) * (1 - Math.exp(-dt * 5));
    this.yaw += this.turnRate * dt;
  }

  update(dt) {
    const g = this.game, p = this.player, P = this.p, A = this.arena, C = A.center;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 4);
    const toP = _c.copy(p.pos).sub(this.pos); const dP = Math.hypot(toP.x, toP.z);
    const faceP = Math.atan2(toP.x, toP.z), rel = angDiff(this.yaw, faceP);
    const p3 = this.phase === 3;
    let tgt = { neckPitch: 0.1, jaw: 0.12, headPitch: 0.05, spread: 0.45, crouch: -0.15, bodyPitch: 0, roll: 0, _k: 4 };
    this.look.copy(p.pos).setY(p.pos.y + 1);
    let breathing = false;
    if (this.state !== 'stalk' && this.state !== 'breath') this.speed *= Math.exp(-dt * 5);

    switch (this.state) {
      case 'sleep':
        tgt = { neckPitch: 1.0, jaw: 0, headPitch: 0.4, spread: 0, crouch: -1.3, bodyPitch: 0.1, _k: 3 };
        this.look.copy(this.pos).add(new THREE.Vector3(Math.sin(this.yaw) * 6, 0, Math.cos(this.yaw) * 6));
        if (R() < dt * 2) g.fx.glow.emit({ pos: this.mouthPos().clone(), vel: _a.set(0, 0.6, 0), life: 1.2, size: 0.5, size1: 1.4, color: 0x502010, alpha: 0.5 });
        if (dP < 14) this.wake();
        break;
      case 'intro':
        this.turn(faceP, 1.5, dt);
        tgt = this.t < 1.1 ? { neckPitch: 0.4, jaw: 0.1, headPitch: 0.3, spread: 0.4, crouch: -0.6, _k: 3 } : { neckPitch: -0.5, jaw: 1.2, headPitch: -0.3, spread: 1.0, crouch: 0.35, bodyPitch: -0.5, _k: 5 };
        if (this.t > 1.1) this.look.y += 2.5;
        if (this.t > 3.2) { this.set('stalk'); this.cool = 1.0; }
        break;

      // ---------------------------------------------------------- ground
      case 'stalk': {
        // pick a new spot every couple of seconds — keep a breathing distance,
        // sidestep, close in — and watch you the whole time
        if (!this.spot || this.t > this.spotT) {
          const want = p3 ? 8 + R() * 4 : 11 + R() * 4, a = Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x) + (R() - 0.5) * 1.4;
          this.spot = new THREE.Vector3(p.pos.x + Math.cos(a) * want, this.floorY, p.pos.z + Math.sin(a) * want);
          this.spotT = this.t + 1.6 + R() * 1.4;
        }
        const far = this.spot.distanceTo(this.pos) > 5;
        this.walkTo(this.spot, p3 ? 5.5 : 4, dt, far && Math.abs(angDiff(this.yaw, Math.atan2(this.spot.x - this.pos.x, this.spot.z - this.pos.z))) < 1.2 ? Math.atan2(this.spot.x - this.pos.x, this.spot.z - this.pos.z) : faceP);
        tgt = { neckPitch: 0.15, jaw: 0.15 + Math.max(0, Math.sin(g.time * 2.3)) * 0.25, headPitch: 0.05, spread: 0.45 + Math.sin(g.time * 0.8) * 0.1, crouch: -0.2 - this.speed * 0.03, bodyPitch: 0.04, _k: 4 };
        // snort smoke now and then
        if (R() < dt * 0.5) this.snort();
        this.cool -= dt;
        if (this.cool <= 0) { if (!p3 && R() < 0.12) { this.set('roar'); this.cool = 1; } else this.choose(dP, rel); }
        break;
      }
      case 'roar':
        // rear up on the hind legs, wings wide, and bellow
        this.turn(faceP, 1.5, dt);
        tgt = { neckPitch: -0.5, jaw: this.t > 0.35 ? 1.2 : 0.3, headPitch: -0.3, spread: 1, crouch: 0.35, bodyPitch: -0.5, _k: 5 };
        this.look.y += 2.5;
        if (this.t > 0.35 && !this.fired) { this.fired = 1; audio.play('dragonRoar'); g.shake(0.7); g.fx.rings.add(this.pos.clone().setY(this.floorY), { color: 0xff8a40, r0: 2, r1: 12, life: 0.6 }); }
        if (this.t > 2.0) { this.set('stalk'); this.cool = 0.4; }
        break;
      case 'breath': {
        const wind = 0.75, dur = p3 ? 3.6 : 3.0;
        if (this.t < wind) {
          // rear back and draw breath (embers gather at the jaws)
          this.turn(faceP, 2.5, dt);
          tgt = { neckPitch: -0.8, jaw: 0.6, headPitch: -0.35, spread: 0.9, crouch: 0.25, bodyPitch: -0.25, _k: 6 };
          this.look.y += 3;
          for (let i = 0; i < 3; i++) { const m = this.mouthPos(_a).clone(); g.fx.glow.emit({ pos: m.add(_b.set((R() - 0.5) * 3, (R() - 0.5) * 3, (R() - 0.5) * 3)), vel: _b.multiplyScalar(-4), life: 0.25, size: 0.5, size1: 0.1, color: 0xffa040 }); }
          if (this.t < 0.05) {
            this.sweep = R() < 0.45; this.side = R() < 0.5 ? 1 : -1;
            audio.play('dragonRoar', { volume: 0.55, pitch: 1.25 });
            this.sweepR = THREE.MathUtils.clamp(dP, 7, 15);
          }
          this.aim.copy(p.pos).add(_b.set(Math.cos(faceP) * 5 * this.side, 0, -Math.sin(faceP) * 5 * this.side));
        } else if (this.t < wind + dur) {
          const u = (this.t - wind) / dur;
          if (this.sweep) {
            // a wide arc of fire across the floor, side to side
            const a = this.yawAtStart ?? (this.yawAtStart = faceP);
            const sw = a + this.side * (-1.15 + u * 2.3);
            this.aim.set(this.pos.x + Math.sin(sw) * this.sweepR, this.floorY, this.pos.z + Math.cos(sw) * this.sweepR);
          } else {
            // the aim hunts you at a speed you can only just outrun
            const speed = p3 ? 7.2 : 6.0;
            const ad = _b.copy(p.pos).sub(this.aim).setY(0), adl = ad.length();
            if (adl > 0.01) this.aim.addScaledVector(ad, Math.min(adl, speed * dt) / adl);
            this.aim.y = this.floorY;
          }
          const aimYaw = Math.atan2(this.aim.x - this.pos.x, this.aim.z - this.pos.z);
          this.turn(aimYaw, 1.4, dt);
          if (dP > 17) this.walkTo(p.pos, 2.5, dt);
          this.look.copy(this.aim);
          tgt = { neckPitch: 0.25, jaw: 1.2, headPitch: 0.2, spread: 0.95, crouch: 0.1, bodyPitch: -0.08, _k: 10 };
          breathing = true;
        } else { this.yawAtStart = undefined; this.set('pant'); }
        break;
      }
      case 'pant':
        // spent: head low, panting smoke — an opening
        tgt = { neckPitch: 0.95, jaw: 0.55 + Math.sin(this.t * 14) * 0.15, headPitch: 0.45, spread: 0.2, crouch: -0.9, bodyPitch: 0.15, _k: 5 };
        this.look.copy(this.pos).add(_b.set(Math.sin(this.yaw) * 5, -2, Math.cos(this.yaw) * 5));
        if (R() < dt * 10) g.fx.dust.emit({ pos: this.mouthPos(_a), vel: _b.set(0, 1.5, 0), life: 0.8, size: 0.6, size1: 1.2, color: 0x3a3048 });
        if (this.t > (p3 ? 1.1 : 1.5)) this.endAttack();
        break;
      case 'volley': {
        this.turn(faceP, 2.2, dt);
        const n = p3 ? 5 : 3, gap = p3 ? 0.38 : 0.5;
        tgt = { neckPitch: -0.3, jaw: 0.35, headPitch: 0, spread: 0.6, _k: 8 };
        const k = Math.floor((this.t - 0.45) / gap);
        if (this.t > 0.45 && k < n && k >= this.fired) { this.fired = k + 1; this.fireball(); this.snap = 0.16; }
        if ((this.snap = Math.max(0, (this.snap || 0) - dt)) > 0) tgt = { ...tgt, neckPitch: 0.2, jaw: 1.1, headPitch: 0.3, _k: 22 };
        if (this.t < 0.45) g.fx.fire(this.mouthPos(_a), 1, 0.5);
        if (this.t > 0.45 + n * gap + 0.4) this.endAttack();
        break;
      }
      case 'bite': {
        // coil back, then lunge across the floor with snapping jaws
        if (this.t < 0.55) {
          this.turn(faceP, 3, dt);
          tgt = { neckPitch: -0.75, jaw: 0.9, headPitch: -0.2, spread: 0.7, crouch: 0.3, bodyPitch: -0.25, _k: 8 };
          if (this.t < 0.05) audio.play('dragonRoar', { volume: 0.45, pitch: 1.5 });
        } else if (this.t < 0.9) {
          const fwd = _b.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          if (dP > 3.2) { this.pos.addScaledVector(fwd, 17 * dt); this.speed = 10; }
          tgt = { neckPitch: 0.55, jaw: this.t < 0.75 ? 1.2 : 0, headPitch: 0.2, spread: 0.5, crouch: -0.2, bodyPitch: 0.2, _k: 24 };
          const m = this.mouthPos(_a);
          if (!this.fired && this.t > 0.7 && m.distanceTo(_c.copy(p.pos).setY(p.pos.y + 0.8)) < 3.2) {
            this.fired = 1; audio.play('knightSwing', { pitch: 0.5 }); g.shake(0.4);
            p.receive({ dmg: 2, from: m.clone(), kind: 'melee', source: { onParried: () => this.stun() } });
          }
          if (this.t > 0.75 && !this.snapped) { this.snapped = true; audio.play('enemyHit', { pitch: 0.5 }); }
        } else { this.snapped = false; this.set('recover'); }
        break;
      }
      case 'recover':
        // jaws slammed shut on the floor: a moment to strike the head
        tgt = { neckPitch: 1.0, jaw: 0.1, headPitch: 0.5, spread: 0.3, crouch: -0.8, bodyPitch: 0.25, _k: 7 };
        this.look.copy(this.pos).add(_b.set(Math.sin(this.yaw) * 5, -2, Math.cos(this.yaw) * 5));
        if (this.t > (p3 ? 0.8 : 1.1)) this.endAttack();
        break;
      case 'tail': {
        // pivot round and sweep the tail low across the floor — jump it
        tgt = { neckPitch: -0.1, jaw: 0.3, spread: 0.7, crouch: -0.2, _k: 8 };
        if (this.t < 0.45) { this.yaw -= dt * this.spinDir * 1.0; P.tailYaw = -0.8 * this.spinDir * (this.t / 0.45); }
        else if (this.t < 1.15) {
          const prev = this.spin || 0; this.spin = ease((this.t - 0.45) / 0.7) * PI * 1.6; this.yaw += (this.spin - prev) * this.spinDir; P.tailYaw = 0.7 * this.spinDir;
          if (!this.fired && this.t > 0.55) { this.fired = 1; audio.play('knightSwing', { pitch: 0.45 }); }
          if (dP > 2.5 && dP < 10.5 && p.pos.y < this.floorY + 1.1) {
            if (Math.abs(angDiff(this.yaw + PI, Math.atan2(toP.x, toP.z))) < 0.5) p.receive({ dmg: 1, from: this.pos.clone(), kind: 'melee', unblockable: true });
          }
        } else { this.spin = 0; }
        if (this.t > 1.5) this.endAttack();
        break;
      }
      case 'gust': {
        // two great wingbeats that blast you away (sets up the next attack)
        this.turn(faceP, 2, dt);
        tgt = { neckPitch: -0.4, jaw: 0.6, headPitch: -0.2, spread: 1, crouch: 0.2, _k: 8 };
        P.flap += dt * 9;
        for (const beat of [0.35, 0.8]) if (this.t > beat && this.fired < (beat === 0.35 ? 1 : 2)) {
          this.fired++; audio.play('wingFlap'); g.shake(0.35);
          if (dP < 12) { const away = _b.copy(toP).setY(0).normalize(); p.vel.addScaledVector(away, 13 * (1 - dP / 14)); p.vel.y = Math.max(p.vel.y, 5); p.grounded = false; }
          for (let i = 0; i < 18; i++) g.fx.dust.emit({ pos: this.pos.clone().add(_a.set((R() - 0.5) * 6, 0.4, (R() - 0.5) * 6)), vel: toP.clone().setY(0).normalize().multiplyScalar(10 + R() * 6).add(_a.set(0, 1, 0)), life: 0.7, size: 0.7, size1: 0.2, color: 0x6a5070, drag: 1.5 });
        }
        if (this.t > 1.1) { this.set(R() < 0.6 ? 'volley' : 'breath'); }
        break;
      }
      case 'charge': {
        // enraged: lower the horns and thunder across the hoard
        if (this.t < 0.65) {
          this.turn(faceP, 3, dt);
          tgt = { neckPitch: 0.2, jaw: 0.8, headPitch: 0.2, spread: 0.8, crouch: 0.25, bodyPitch: 0.15, _k: 8 };
          if (this.t < 0.05) { audio.play('dragonRoar', { pitch: 0.9 }); this.chargeTo = p.pos.clone(); }
          if (R() < 0.4) g.fx.puff(this.pos, 1, 0x6a5070, 0.6);
        } else if (this.t < 1.9) {
          const fwd = _b.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          this.pos.addScaledVector(fwd, 15 * dt); this.speed = 15;
          tgt = { neckPitch: 0.3, jaw: 0.6, headPitch: 0.15, spread: 0.6, crouch: -0.1, bodyPitch: 0.2, _k: 10 };
          if (R() < 0.6) g.fx.puff(this.pos, 2, 0x6a5070, 0.7);
          if (!this.fired && dP < 3.6 && Math.abs(p.pos.y - this.pos.y) < 2.5) { this.fired = 1; p.receive({ dmg: 2, from: this.pos.clone(), kind: 'melee', unblockable: true }); }
          if (_a.copy(this.pos).sub(C).setY(0).length() > ROAM + 1) { g.shake(0.6); audio.play('dragonStep'); this.set('pant'); }
        } else this.set('pant');
        break;
      }
      case 'stunned':
        tgt = { neckPitch: 1.15, jaw: 0.5, headPitch: 0.55, spread: 0.1, crouch: -1.45, bodyPitch: 0.22, _k: 7 };
        this.look.copy(this.pos).add(_b.set(Math.sin(this.yaw) * 5, -3, Math.cos(this.yaw) * 5));
        if (R() < dt * 12) { const hp = this.headPos(_a); g.fx.spark.emit({ pos: _b.set(hp.x + Math.cos(this.t * 7) * 0.9, hp.y + 1.3, hp.z + Math.sin(this.t * 7) * 0.9), life: 0.35, size: 0.5, size1: 0, color: 0xffe070 }); }
        if (this.t > 4.5) this.recover();
        break;
      case 'roarBack':
        tgt = { neckPitch: -0.5, jaw: 1.2, headPitch: -0.3, spread: 1, crouch: 0.35, bodyPitch: -0.5, _k: 7 };
        this.look.y += 2.5;
        if (this.t > 1.1) { this.hits = 0; this.set(this.phase === 2 ? 'takeoff' : 'stalk'); this.cool = 0.6; }
        break;

      // ---------------------------------------------------------- air
      case 'takeoff':
        tgt = { neckPitch: -0.3, jaw: 0.3, spread: 1, crouch: 0.3, bodyPitch: -0.3, _k: 6 };
        this.fly = Math.min(1, this.fly + dt * 0.7);
        this.pos.y = this.floorY + ease(this.fly) * 10;
        if (this.fly >= 1) { this.set('circle'); this.orbit = Math.atan2(this.pos.z - C.z, this.pos.x - C.x); this.cool = 1.5; }
        break;
      case 'circle': {
        this.orbit += dt * 0.45;
        const want = _b.set(C.x + Math.cos(this.orbit) * 15, C.y + 10 + Math.sin(this.t * 1.3) * 0.6, C.z + Math.sin(this.orbit) * 15);
        this.pos.lerp(want, 1 - Math.exp(-dt * 1.6));
        this.turn(Math.atan2(-Math.sin(this.orbit), Math.cos(this.orbit)), 2, dt);
        tgt = { neckPitch: 0.35, jaw: 0.25, headPitch: 0.3, spread: 1, bodyPitch: 0.05, roll: -0.25, _k: 5 };
        this.cool -= dt;
        if (this.cool <= 0) {
          if (this.strafes < 2) { this.set('strafe'); this.strafes++; } else { this.set('greatball'); this.strafes = 0; }
          if (this.state === 'strafe') {
            // a straight run over where you stand, breathing fire along the way
            const dir = _b.copy(p.pos).sub(this.pos).setY(0).normalize();
            this.runFrom = this.pos.clone(); this.runTo = p.pos.clone().addScaledVector(dir, 14); this.runTo.y = this.floorY + 5;
            const off = _a.copy(this.runTo).sub(C).setY(0); if (off.length() > 18) this.runTo.copy(C).add(off.setLength(18)).setY(this.floorY + 5);
          }
        }
        break;
      }
      case 'strafe': {
        const dir = _b.copy(this.runTo).sub(this.pos); const l = dir.length();
        this.turn(Math.atan2(dir.x, dir.z), 3, dt);
        if (this.t < 0.7) { this.pos.y += (this.floorY + 5 - this.pos.y) * (1 - Math.exp(-dt * 3)); this.pos.addScaledVector(dir.setY(0).normalize(), 6 * dt); if (this.t < 0.05) audio.play('dragonRoar', { volume: 0.6, pitch: 1.2 }); }
        else {
          this.pos.addScaledVector(dir.normalize(), Math.min(l, 13 * dt));
          const fwd = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          this.aim.copy(this.pos).addScaledVector(fwd, 6).setY(this.floorY);
          this.look.copy(this.aim); breathing = true;
          if (l < 1.5 || this.t > 4) { this.set('circle'); this.cool = 1.2; }
        }
        tgt = { neckPitch: 0.6, jaw: breathing ? 1.15 : 0.5, headPitch: 0.4, spread: 1, bodyPitch: 0.15, _k: 8 };
        break;
      }
      case 'greatball': {
        this.turn(faceP, 3, dt);
        this.pos.lerp(_b.copy(this.pos).setY(this.floorY + 8), 1 - Math.exp(-dt * 2));
        tgt = { neckPitch: this.t < 1.3 ? -0.3 : 0.4, jaw: this.t < 1.3 ? 0.9 : 1.1, headPitch: 0.3, spread: 1, bodyPitch: -0.2, _k: 8 };
        if (this.t < 1.3) for (let i = 0; i < 3; i++) g.fx.glow.emit({ pos: this.mouthPos(_a).clone(), vel: _b.set((R() - 0.5) * 3, (R() - 0.5) * 3, (R() - 0.5) * 3), life: 0.25, size: 0.6 + this.t, size1: 0.2, color: 0xff6020 });
        if (this.t > 1.3 && !this.fired) { this.fired = 1; this.fireball(true); if (!this.ballHint) { this.ballHint = true; g.hud.hint('PARRY the great fireball!', 2.5); } }
        if (this.t > 2.8) { this.set('circle'); this.cool = 1.6; }
        break;
      }
      case 'falling':
        this.fly = Math.max(0, this.fly - dt * 1.2);
        this.pos.y += (this.floorY - this.pos.y) * (1 - Math.exp(-dt * 4));
        { const off = _a.copy(this.pos).sub(C).setY(0); if (off.length() > ROAM) this.pos.addScaledVector(off.normalize(), -dt * 8); }
        tgt = { neckPitch: 0.8, jaw: 0.6, spread: 0.3, bodyPitch: 0.4, roll: Math.sin(this.t * 9) * 0.3, _k: 6 };
        if (this.pos.y < this.floorY + 0.3) { this.pos.y = this.floorY; this.fly = 0; this.set('stunned'); g.shake(1.0); audio.play('dragonStep'); g.fx.puff(this.pos, 20, 0x8a6a6a, 1.4); }
        break;
      case 'enrage':
        this.fly = Math.max(0, this.fly - dt);
        this.pos.lerp(_b.copy(C).setY(this.floorY), 1 - Math.exp(-dt * 1.5));
        tgt = { neckPitch: -1.0, jaw: 1.1, headPitch: -0.5, spread: 1, crouch: 0.3, bodyPitch: -0.3, _k: 5 };
        this.look.y += 6;
        if (R() < dt * 20) g.fx.fire(this.pos.clone().add(_a.set((R() - 0.5) * 4, 2 + R() * 2, (R() - 0.5) * 4)), 1, 0.8);
        if (this.t > 2.0) { this.pos.y = this.floorY; this.set('stalk'); this.cool = 0.5; }
        break;
      case 'dying': {
        tgt = { neckPitch: -1.1 + Math.sin(this.t * 14) * 0.2, jaw: 1.2, headPitch: -0.6, spread: 1, bodyPitch: -0.2, roll: Math.sin(this.t * 11) * 0.15, _k: 8 };
        this.look.y += 6;
        if (R() < dt * 30) g.fx.pop(this.pos.clone().add(new THREE.Vector3((R() - 0.5) * 6, 2 + R() * 4, (R() - 0.5) * 6)), R() < 0.5 ? 0xffa040 : 0xc0a0ff, 8);
        g.shake(0.3);
        if (this.t > 3.2 && !this.fired) {
          this.fired = 1;
          g.flash(1.0, 0xffffff); g.shake(1.2);
          const c = this.pos.clone().setY(this.floorY + 3);
          for (let i = 0; i < 4; i++) g.fx.pop(c.clone().add(new THREE.Vector3((R() - 0.5) * 4, R() * 3, (R() - 0.5) * 4)), 0xffe080, 30);
          g.props.burst(c, 40);
          this.root.visible = false;
          this.bodyCol.setPose(new THREE.Vector3(0, -900, 0));
          g.onVictory?.();
        }
        break;
      }
    }

    // fire breath
    if (breathing && this.alive) {
      this.stream.start();
      const from = this.mouthPos(_a).clone();
      const dir = _b.copy(this.aim).sub(from).normalize();
      this.stream.update(dt, from, dir, this.fly > 0 ? 14 : 17);
    } else this.stream.stop();

    // head tracking: the neck turns toward whatever the dragon is looking at
    {
      const lx = this.look.x - this.pos.x, lz = this.look.z - this.pos.z;
      const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
      const localX = lx * c + lz * s, localZ = -lx * s + lz * c;
      const yawL = THREE.MathUtils.clamp(Math.atan2(localX, Math.max(0.5, localZ)), -1.15, 1.15);
      const headY = this.pos.y + 5.2, horiz = Math.max(2, Math.hypot(lx, lz) - 4);
      const pitchL = THREE.MathUtils.clamp(Math.atan2(headY - this.look.y, horiz), -0.7, 0.9);
      P.lookYaw += (yawL - P.lookYaw) * (1 - Math.exp(-dt * 6));
      P.lookPitch += (pitchL * 0.7 - P.lookPitch) * (1 - Math.exp(-dt * 6));
    }
    const k = 1 - Math.exp(-dt * (tgt._k || 5));
    for (const key in tgt) if (key !== '_k') P[key] += (tgt[key] - P[key]) * k;
    if (this.fly > 0 || this.state === 'gust') {
      const prev = P.flap; P.flap += dt * (this.state === 'gust' ? 0 : 7);
      if (this.fly > 0 && Math.floor(prev / (PI * 2)) !== Math.floor(P.flap / (PI * 2))) audio.play('wingFlap', { volume: 0.6 });
    }
    if (this.state !== 'tail') P.tailYaw *= Math.exp(-dt * 3);
    P.walk = this.speed > 0.4 ? 1 : 0; P.stride = Math.min(1, this.speed / 5);
    const prevPhase = P.legPhase;
    this.pose(dt);
    if (this.fly < 0.3 && P.stride > 0.15 && Math.floor(prevPhase / PI) !== Math.floor(P.legPhase / PI)) {
      // a foot comes down: thud, dust, and a little shake if you're close
      const front = Math.floor(P.legPhase / PI) % 2 === 0, side = Math.floor(P.legPhase / PI / 2) % 2 ? 1 : -1;
      const foot = _a.set(side * 1.5, 0, front ? 1.8 : -1.5).applyAxisAngle(_b.set(0, 1, 0), this.yaw).add(this.pos).setY(this.floorY);
      g.fx.puff(foot, 4, 0x5a4a60, 0.7);
      audio.play('dragonStep', { volume: 0.3 + P.stride * 0.35 });
      if (dP < 14) g.shake(0.12 * P.stride);
    }
    if (this.wasFlying && this.fly < 0.05 && this.pos.y < this.floorY + 0.5) { g.fx.rings.add(this.pos.clone().setY(this.floorY), { color: 0xc0a080, r0: 2, r1: 10, life: 0.5 }); g.fx.puff(this.pos, 24, 0x6a5a70, 1.4); g.shake(0.9); audio.play('dragonStep'); }
    this.wasFlying = this.fly > 0.3;

    // body collider + hittable head + glow light
    this.bodyMesh.position.copy(this.pos).setY(this.pos.y + 2.9 + P.crouch * 0.9);
    _q.setFromAxisAngle(_a.set(0, 1, 0), this.yaw);
    if (this.alive) this.bodyCol.setPose(this.fly > 0.3 ? _b.set(0, -900, 0) : this.bodyMesh.position, _q);
    if (this.alive && this.fly < 0.3 && !p.dead) {
      // never let the body swallow the player: shove them out of the box
      const bc = this.bodyMesh.position, dx = p.pos.x - bc.x, dz = p.pos.z - bc.z;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      let lx = dx * c - dz * s, lz = dx * s + dz * c;
      const hx = 1.8 + 0.45, hz = 2.9 + 0.45;
      if (Math.abs(lx) < hx && Math.abs(lz) < hz && p.pos.y < bc.y + 1.6 && p.pos.y > bc.y - 3.5) {
        if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = Math.sign(lx || 1) * (hx + 0.05); else lz = Math.sign(lz || 1) * (hz + 0.05);
        const nx = bc.x + lx * c + lz * s, nz = bc.z - lx * s + lz * c;
        _a.set(nx - p.pos.x, 0, nz - p.pos.z);
        p.teleport(_b.set(nx, p.pos.y + 0.05, nz), p.yaw, true);
        p.vel.addScaledVector(_a.normalize(), 4);
      }
    }
    this.headPos(this.target.pos); this.target.pos.y -= 0.6;
    this.target.noAim = !this.vulnerable;
    this.light.pos.copy(this.mouthPos(_a)); this.light.intensity = breathing || this.state === 'volley' || this.state === 'greatball' ? 2.4 : 0.7;
    for (const m of this.M.mats) m.uniforms.uFlash.value = this.flash * 0.7 + (this.vulnerable ? 0.12 + Math.sin(this.game.time * 10) * 0.08 : 0);
  }

  // pick the next move from where the player is
  choose(dP, rel) {
    const r = R(), p3 = this.phase === 3, behind = Math.abs(rel) > 1.7;
    this.cool = (p3 ? 0.5 : 0.9) + R() * 0.6;
    if (behind && dP < 10) { this.spinDir = rel > 0 ? -1 : 1; return this.set('tail'); }
    if (dP < 6.5) return this.set(r < 0.5 ? 'bite' : 'gust');
    if (p3) return this.set(r < 0.3 ? 'charge' : r < 0.7 ? 'breath' : r < 0.85 ? 'bite' : 'volley');
    if (dP < 11 && r < 0.3) return this.set('bite');
    return this.set(r < 0.62 ? 'breath' : 'volley');
  }
  endAttack() { this.hits = 0; this.set('stalk'); this.spot = null; }
  snort() {
    const g = this.game, nose = this.M.head.localToWorld(_a.set(0, 0.25, 2.2));
    for (let i = 0; i < 8; i++) g.fx.dust.emit({ pos: nose, vel: _b.set((R() - 0.5) * 1.5, 0.8 + R(), (R() - 0.5) * 1.5), life: 1.0, size: 0.35, size1: 1.0, color: 0x2a2030, drag: 1 });
    for (let i = 0; i < 4; i++) g.fx.spark.emit({ pos: nose, vel: _b.set((R() - 0.5) * 3, 1 + R() * 2, (R() - 0.5) * 3), life: 0.5, size: 0.3, size1: 0, color: 0xffa040 });
    audio.play('fireball', { volume: 0.25, pitch: 0.55 });
  }

  pose(dt) {
    const M = this.M, P = this.p, t = this.game.time;
    const turn = this.turnRate || 0, stride = P.stride || 0;
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    // breathing bob, a heavy sway while walking, lean into turns
    P.legPhase += dt * (P.walk ? 4 + (this.speed || 0) * 1.2 : 0);
    const gait = Math.sin(P.legPhase * 2);
    const rear = Math.max(0, -P.bodyPitch - 0.15);           // rearing up on the hind legs
    M.body.position.y = BODY_Y + P.crouch * 0.7 + Math.sin(t * 1.6) * 0.07 + Math.abs(gait) * 0.12 * stride + rear * 2.4;
    M.body.position.z = -rear * 1.6;
    const bank = this.fly ? -turn * 0.45 * this.fly : 0;
    M.body.rotation.set(P.bodyPitch + Math.sin(t * 1.6) * 0.025, Math.sin(P.legPhase) * 0.06 * stride, P.roll - turn * 0.12 + bank + Math.sin(P.legPhase) * 0.04 * stride);
    M.body.scale.set(1 + Math.sin(t * 1.6) * 0.012, 1, 1 + Math.sin(t * 1.6) * 0.012);
    // blink every few seconds; jerk the head back when struck
    this.blinkT = (this.blinkT ?? 2) - dt;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3;
    if (M.eyes) for (const e of M.eyes) e.scale.y = this.blinkT < 0.12 ? 0.08 : 0.65;
    this.flinch = Math.max(0, (this.flinch || 0) - dt * 4);
    for (let i = 0; i < M.neck.length; i++) {
      const wave = Math.sin(t * 1.4 - i * 0.6) * 0.04 + Math.sin(t * 0.7 + i) * 0.02;
      M.neck[i].rotation.set(P.neckPitch / 4 + NECK_S[i] + P.lookPitch / 5 + wave, (P.neckYaw + P.lookYaw) / 4 - turn * 0.04, Math.sin(t * 0.9 - i) * 0.02);
    }
    M.head.rotation.set(P.headPitch + P.lookPitch * 0.25 - this.flinch * 0.6, P.lookYaw * 0.12 + Math.sin(t * 40) * this.flinch * 0.25, Math.sin(t * 1.1) * 0.04);
    M.jaw.rotation.x = P.jaw * 0.7;
    // the tail lags behind turns and swishes
    for (let i = 0; i < M.tail.length; i++) M.tail[i].rotation.set(0.06 - (i === 0 ? 0.1 : 0) + Math.sin(t * 1.3 - i * 0.4) * 0.03, Math.sin(t * 1.8 - i * 0.55) * (0.1 + Math.abs(turn) * 0.08) + P.tailYaw / 4 + turn * 0.09 * (i + 1) / 4, 0);
    // legs: a proper walk cycle scaled by speed
    for (const L of M.legs) {
      const ph = P.legPhase + (L.front ? 0 : PI) + (L.s > 0 ? 0 : PI);
      const sw = Math.sin(ph) * 0.45 * stride;
      const legComp = -P.crouch * 0.6;
      L.hip.rotation.set(sw - P.bodyPitch + (L.front ? -legComp : legComp) * 0.5 - (L.front ? rear * 2.0 : 0), 0, 0);
      L.knee.rotation.set((L.front ? -1 : 1) * Math.min(1.4, Math.max(0, -P.crouch) * 0.9) + Math.max(0, Math.cos(ph)) * 0.5 * stride, 0, 0);
      L.foot.rotation.x = -L.hip.rotation.x - L.knee.rotation.x;
    }
    // wings: spread, beat in flight, twitch and stretch on the ground
    for (const W of M.wings) {
      const flap = this.fly > 0 || this.state === 'gust' ? Math.sin(P.flap) * 0.75 * Math.max(this.fly, this.state === 'gust' ? 1 : 0) : Math.sin(t * 1.1 + W.s) * 0.06 + Math.max(0, Math.sin(t * 0.37)) ** 8 * 0.4;
      W.w.rotation.set(-0.25 - P.spread * 0.75, (0.35 - P.spread * 0.55) * W.s, (0.5 + P.spread * 0.45 + flap) * W.s);
      W.e.rotation.set(-0.15 * P.spread, -0.6 + P.spread * 0.5, -1.9 + P.spread * 1.6 + flap * 0.4);
    }
  }
}

export function setupDragon(game) {
  game.startDragon = (arena) => {
    if (game.dragon) { game.dragon.wake(); return; }
    const d = new Dragon(game, arena);
    game.dragon = d;
    game.enemies.push({ update: (dt) => d.update(dt), alive: true, shadow: false, pos: d.pos, radius: 3 });
  };
}
