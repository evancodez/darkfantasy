// Interactive props: star-motes, hearts, breakable urns, lantern checkpoints,
// Moon Sigils, moving / turning / crumbling platforms, bounce pads, pendulum
// blades, levers and doors.
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat, Lights } from '../core/retro.js';
import { box, cyl, sphere, clean, mat4 } from '../core/geo.js';
import { addPlatform, addBox, world } from '../core/physics.js';
import audio from '../sound.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
// add a mesh to a parent at a position (Object3D.add returns the parent, not the child)
const put = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

function starGeo(R = 0.3, r = 0.1, d = 0.08) {
  const pos = [], idx = [];
  pos.push(0, 0, d, 0, 0, -d);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 2, rr = i % 2 ? r : R; pos.push(Math.cos(a) * rr, Math.sin(a) * rr, 0); }
  for (let i = 0; i < 8; i++) { const a = 2 + i, b = 2 + (i + 1) % 8; idx.push(0, a, b, 1, b, a); }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g = g.toNonIndexed(); g.computeVertexNormals();
  return clean(g);
}
function heartGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3); s.bezierCurveTo(-0.05, -0.2, -0.32, -0.05, -0.3, 0.1); s.bezierCurveTo(-0.28, 0.28, -0.05, 0.3, 0, 0.14);
  s.bezierCurveTo(0.05, 0.3, 0.28, 0.28, 0.3, 0.1); s.bezierCurveTo(0.32, -0.05, 0.05, -0.2, 0, -0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1, curveSegments: 5 });
  g.translate(0, 0, -0.05);
  return clean(g);
}
function potGeo() {
  const pts = [[0, 0], [0.22, 0], [0.32, 0.12], [0.36, 0.3], [0.3, 0.48], [0.18, 0.58], [0.16, 0.66], [0.22, 0.72], [0.2, 0.75]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 8);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i));
  return clean(g);
}

export const PM = {};
export { Prop, Mover, put, starGeo };
function mats() {
  if (PM.gold) return;
  Object.assign(PM, {
    gold: retroMat({ map: T.gold, chrome: 0.6, env: T.goldEnv, emit: 0.75, spec: 0.5 }),
    mote: retroMat({ color: 0xffe070, chrome: 0.45, env: T.goldEnv, emit: 1, spec: 0.8, fog: 0.5 }),
    heart: retroMat({ color: 0xff3050, chrome: 0.5, env: T.redEnv, emit: 0.55, spec: 0.8 }),
    pot: retroMat({ map: T.pot, spec: 0.7, shine: 20, rim: 0.3 }),
    stone: retroMat({ map: T.wall, rim: 0.15 }), dark: retroMat({ map: T.darkStone }),
    checker: retroMat({ map: T.checker, rim: 0.1 }), checkerBlue: retroMat({ map: T.checkerBlue }),
    iron: retroMat({ map: T.iron, spec: 0.4 }), wood: retroMat({ map: T.wood }),
    blade: retroMat({ map: T.metal, chrome: 0.8, env: T.chrome, spec: 1, rim: 0.4 }),
    lantern: retroMat({ map: T.lanternGlass, emit: 1 }), lanternOff: retroMat({ map: T.lanternGlass, color: 0x202040 }),
    rune: retroMat({ map: T.rune, emit: 1, alphaTest: 0.5 }),
    sigil: retroMat({ color: 0xc8dcff, chrome: 0.7, env: T.silver, emit: 0.8, spec: 1 }),
    beam: retroMat({ color: 0x4a70ff, emit: 1, additive: true, opacity: 0.35, side: THREE.DoubleSide, fog: 0.3 }),
    crumble: retroMat({ map: T.cobble, rim: 0.1 }),
  });
}

// ------------------------------------------------------------------ base
class Prop { constructor(game) { this.game = game; this.alive = true; } update() {} }

// collectible star mote (rendered through one InstancedMesh)
class Mote extends Prop {
  constructor(game, pos, mgr, i) { super(game); this.pos = pos.clone(); this.home = pos.clone(); this.mgr = mgr; this.i = i; this.ph = Math.random() * 6; this.vel = new THREE.Vector3(); this.pull = false; this.age = 0; }
  update(dt) {
    const p = this.game.player; if (!p) return;
    this.age += dt;
    const target = _v.copy(p.pos).setY(p.pos.y + 0.8);
    const d = this.pos.distanceTo(target);
    if (!this.pull && d < 2.6 && !p.dead && this.age > 0.25) this.pull = true;
    if (this.pull) {
      _w.copy(target).sub(this.pos).normalize().multiplyScalar(Math.min(30, 8 + this.age * 4));
      this.vel.lerp(_w, 1 - Math.exp(-dt * 10));
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.distanceTo(target) < 0.55) this.collect();
    } else if (this.vel.lengthSq() > 0.01) {
      // burst out of a defeated enemy / broken pot, then settle
      this.vel.y -= 18 * dt; this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < this.home.y) { this.pos.y = this.home.y; this.vel.set(0, 0, 0); }
    }
  }
  collect() {
    this.alive = false;
    const g = this.game, m = this.mgr;
    const now = g.time;
    m.chain = now - m.lastT < 0.7 ? Math.min(m.chain + 1, 16) : 0; m.lastT = now;
    audio.play('mote', { pitch: 1 + m.chain * 0.065, volume: 0.6 });
    g.fx.twinkle(this.pos, 0xffe080, 1.1);
    g.addMotes(1);
  }
}

class Heart extends Prop {
  constructor(game, pos, mesh) { super(game); this.pos = pos.clone(); this.mesh = mesh; this.t = Math.random() * 6; }
  update(dt) {
    this.t += dt;
    this.mesh.position.copy(this.pos).setY(this.pos.y + 0.5 + Math.sin(this.t * 3) * 0.12);
    this.mesh.rotation.y = this.t * 2.4;
    const p = this.game.player;
    if (p && !p.dead && p.pos.distanceTo(_v.copy(this.pos).setY(this.pos.y - 0.4)) < 1.2) {
      this.alive = false; this.mesh.removeFromParent();
      p.heal(1); audio.play('heal'); this.game.fx.pop(this.mesh.position, 0xff5070, 10);
    }
  }
}

class Pot extends Prop {
  constructor(game, pos, mesh, opts) {
    super(game); this.pos = pos.clone(); this.mesh = mesh; this.radius = 0.4; this.height = 0.8; this.noAim = true; this.drops = opts.drops ?? 3; this.heart = opts.heart ?? 0.2;
    this.target = game.addTarget(this);
  }
  onHit() { this.break(); return 'hit'; }
  break() {
    if (!this.alive) return;
    this.alive = false; this.game.removeTarget(this); this.mesh.removeFromParent();
    const g = this.game, c = _v.copy(this.pos).setY(this.pos.y + 0.4);
    audio.play('potBreak');
    for (let i = 0; i < 10; i++) g.fx.dust.emit({ pos: c, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6), life: 0.7, size: 0.22, size1: 0.12, color: 0x5a3ac0, gravity: 18, floor: this.pos.y + 0.05 });
    g.fx.puff(this.pos, 4, 0x6a5aa0, 0.4);
    g.props.burst(c, this.drops);
    if (Math.random() < this.heart) g.props.heart(this.pos);
  }
}

class Checkpoint extends Prop {
  constructor(game, pos, yaw, name, parent) {
    super(game); this.pos = pos.clone(); this.yaw = yaw; this.name = name; this.lit = false;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g);
    const add = (geo, m, p, r = [0, 0, 0]) => { const me = new THREE.Mesh(geo, m); me.position.set(...p); me.rotation.set(...r); g.add(me); return me; };
    add(box(1.2, 0.3, 1.2, { s: 1 }), PM.stone, [0, 0.15, 0]);
    add(box(0.5, 1.4, 0.5, { s: 1 }), PM.stone, [0, 1.0, 0]);
    add(box(0.7, 0.12, 0.7, { s: 2 }), PM.iron, [0, 1.76, 0]);
    this.glass = add(box(0.5, 0.6, 0.5, { s: 2 }), PM.lanternOff, [0, 2.12, 0]);
    add(cyl(0, 0.5, 0.4, 4, { s: 2, flat: true }), PM.iron, [0, 2.62, 0], [0, Math.PI / 4, 0]);
    this.flameP = pos.clone().add(new THREE.Vector3(0, 2.12, 0));
    this.glow = game.glows.add(this.flameP, 0x000000, 3.2, true);
    this.light = Lights.add(this.flameP, 0x5a8aff, 0, 9);
    addBox(pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0.3, 1, 0.3));
  }
  update(dt) {
    const p = this.game.player;
    if (this.lit) { if (Math.random() < dt * 6) this.game.fx.glow.emit({ pos: this.flameP.clone().add(new THREE.Vector3((Math.random() - .5) * .2, 0, (Math.random() - .5) * .2)), vel: new THREE.Vector3(0, 1.2, 0), life: 0.6, size: 0.3, size1: 0, color: 0x7ab0ff }); return; }
    if (p && !p.dead && p.pos.distanceTo(this.pos) < 2.2) this.light_();
  }
  light_(silent = false) {
    this.lit = true;
    this.glass.material = PM.lantern;
    this.game.glows.set(this.glow, this.flameP, 0x6a9aff, 3.2); this.game.glows.dirty();
    this.light.intensity = 1.6;
    this.game.setCheckpoint(this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 1.6, 0.1, Math.cos(this.yaw) * 1.6)), this.yaw, this.name);
    if (!silent) {
      audio.play('checkpoint');
      this.game.fx.pop(this.flameP, 0x6a9aff, 14);
      this.game.hud.callout('Checkpoint', 'small');
    }
  }
}

class Sigil extends Prop {
  constructor(game, pos, parent, onGet) {
    super(game); this.pos = pos.clone(); this.onGet = onGet; this.t = 0;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g); this.group = g;
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.62, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0.24, 0.12, 0.5, 0, Math.PI * 2, true); s.holes.push(hole);
    const geo = clean(new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 14 }));
    this.moon = new THREE.Mesh(geo, PM.sigil); this.moon.position.y = 1.6; g.add(this.moon);
    const beam = new THREE.Mesh(cyl(0.5, 0.9, 40, 8, { open: true }), PM.beam); beam.position.y = 20; g.add(beam); this.beam = beam;
    this.glow = game.glows.add(pos.clone().setY(pos.y + 1.6), 0x6a8aff, 5, true);
  }
  update(dt) {
    this.t += dt;
    this.moon.rotation.y = this.t * 1.8;
    this.moon.position.y = 1.6 + Math.sin(this.t * 2) * 0.15;
    if (Math.random() < dt * 10) this.game.fx.spark.emit({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 1.4, 0.8 + Math.random() * 1.6, (Math.random() - .5) * 1.4)), vel: new THREE.Vector3(0, 1, 0), life: 0.8, size: 0.4, size1: 0, color: 0xa0c0ff });
    const p = this.game.player;
    if (p && !p.dead && p.pos.distanceTo(this.pos) < 1.6) {
      this.alive = false; this.group.removeFromParent();
      this.game.glows.set(this.glow, this.pos, 0x000000, 0); this.game.glows.dirty();
      this.game.fx.pop(this.pos.clone().setY(this.pos.y + 1.6), 0x8ab0ff, 30);
      this.onGet?.();
    }
  }
}

// kinematic platform following a function of time: path(t) -> {pos, yaw}
class Mover extends Prop {
  constructor(game, mesh, half, path, parent, opts) {
    super(game); this.mesh = mesh; this.path = path; this.t = 0; parent.add(mesh);
    const st = path(0); mesh.position.copy(st.pos); mesh.rotation.y = st.yaw || 0;
    this.pf = addPlatform(half, mesh, opts);
    this.pf.yawDelta = 0; this.lastYaw = st.yaw || 0;
    this.center = new THREE.Vector3();
    const self = this;
    this.pf.carry = (p) => {
      if (!self.pf.yawDelta) return self.pf.delta;
      // rotate the rider around the platform centre
      _w.copy(p).sub(self.pf.prev);
      const c = Math.cos(self.pf.yawDelta), s = Math.sin(self.pf.yawDelta);
      const x = _w.x * c + _w.z * s, z = -_w.x * s + _w.z * c;
      return _v.set(x - _w.x, 0, z - _w.z).add(self.pf.delta);
    };
  }
  update(dt) {
    this.t += dt;
    const st = this.path(this.t);
    const yaw = st.yaw || 0;
    _q.setFromAxisAngle(UP, yaw);
    this.pf.setPose(st.pos, _q);
    this.pf.yawDelta = yaw - this.lastYaw; this.lastYaw = yaw;
  }
}

class Crumble extends Prop {
  constructor(game, pos, size, parent) {
    super(game); this.home = pos.clone(); this.size = size; this.state = 'idle'; this.t = 0;
    this.mesh = new THREE.Mesh(box(size.x, size.y, size.z, { s: 0.5 }), PM.crumble); this.mesh.position.copy(pos); parent.add(this.mesh);
    this.pf = addPlatform(new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2), this.mesh);
    this.pf.setPose(pos);
  }
  update(dt) {
    const p = this.game.player;
    this.t += dt;
    if (this.state === 'idle') {
      if (p && p.grounded && p.platform === this.pf) { this.state = 'shake'; this.t = 0; audio.play('crumble', { volume: 0.5 }); }
      this.pf.setPose(this.home);
    } else if (this.state === 'shake') {
      _v.copy(this.home).add(_w.set((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08));
      this.pf.setPose(_v);
      if (this.t > 0.8) { this.state = 'fall'; this.t = 0; this.vy = 0; this.game.fx.puff(this.home, 6, 0x6a5aa0, 0.6); }
    } else if (this.state === 'fall') {
      this.vy -= 30 * dt;
      _v.copy(this.mesh.position); _v.y += this.vy * dt;
      this.pf.setPose(_v);
      if (this.t > 1.2) { this.state = 'gone'; this.t = 0; this.mesh.visible = false; this.pf.setPose(_v.set(0, -500, 0)); }
    } else if (this.state === 'gone' && this.t > 2.6) {
      this.state = 'idle'; this.mesh.visible = true; this.pf.setPose(this.home); this.game.fx.pop(this.home, 0x8a7aff, 8);
    }
  }
}

class Bouncer extends Prop {
  constructor(game, pos, power, parent) {
    super(game); this.pos = pos.clone(); this.power = power; this.t = 0;
    const g = new THREE.Group(); g.position.copy(pos); parent.add(g);
    // a flush rune disc (no lip to trip over)
    put(g, new THREE.Mesh(cyl(1.05, 1.1, 0.06, 12, { s: 1 }), PM.stone), 0, 0.03, 0);
    this.pad = new THREE.Mesh(clean(new THREE.CircleGeometry(0.95, 16).rotateX(-Math.PI / 2)), PM.rune); this.pad.position.y = 0.07; g.add(this.pad);
    this.glow = game.glows.add(pos.clone().setY(pos.y + 0.5), 0x3a5aff, 2.6, true);
  }
  update(dt) {
    this.t += dt;
    this.pad.rotation.y = this.t * 0.8;
    this.pad.scale.setScalar(1 + Math.max(0, 0.3 - (this.game.time - (this.fired || -9))) * 0.8);
    const p = this.game.player;
    if (p && !p.dead && p.grounded && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 1.1 && Math.abs(p.pos.y - this.pos.y) < 0.45) {
      p.vel.y = this.power; p.grounded = false; p.jumps = 0; p.action = 'flip'; p.actionT = 0; p.noCut = true;
      this.fired = this.game.time;
      audio.play('bounce');
      this.game.fx.rings.add(this.pos.clone().setY(this.pos.y + 0.1), { color: 0x8ab0ff, r0: 0.5, r1: 2.4, life: 0.35 });
      for (let i = 0; i < 8; i++) this.game.fx.spark.emit({ pos: this.pos.clone().setY(this.pos.y + 0.4), vel: new THREE.Vector3((Math.random() - .5) * 2, 6 + Math.random() * 6, (Math.random() - .5) * 2), life: 0.6, size: 0.4, size1: 0, color: 0xa0c0ff });
    }
  }
}

// swinging blade: pivot high above, swings along an axis
class Pendulum extends Prop {
  constructor(game, pivot, len, yaw, parent, { speed = 1.6, amp = 1.1, phase = 0 } = {}) {
    super(game); this.pivot = pivot.clone(); this.len = len; this.yaw = yaw; this.speed = speed; this.amp = amp; this.ph = phase; this.t = 0;
    const g = new THREE.Group(); g.position.copy(pivot); g.rotation.y = yaw; parent.add(g); this.group = g;
    const arm = new THREE.Group(); g.add(arm); this.arm = arm;
    put(g, new THREE.Mesh(box(0.7, 0.5, 0.7, { s: 2 }), PM.iron));
    put(arm, new THREE.Mesh(cyl(0.07, 0.07, len, 5, { s: 2 }), PM.iron), 0, -len / 2, 0);
    // a big crescent axe-head, centred on the end of the arm
    const s = new THREE.Shape(); s.moveTo(-1.25, 0.25); s.quadraticCurveTo(0, -1.05, 1.25, 0.25); s.quadraticCurveTo(0, -0.35, -1.25, 0.25);
    const bg = clean(new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false, curveSegments: 8 }));
    put(arm, new THREE.Mesh(bg, PM.blade), 0, -len + 0.15, -0.05);
    put(arm, new THREE.Mesh(sphere(0.2, 6, 5), PM.iron), 0, -len + 0.1, 0);
    this.tip = new THREE.Vector3(); this.n = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, yaw);
  }
  update(dt) {
    this.t += dt;
    const a = Math.sin(this.t * this.speed + this.ph) * this.amp;
    this.arm.rotation.z = a;
    // centre of the blade's cutting edge in world space
    const r = this.len - 0.25;
    this.tip.set(Math.sin(a) * r, -Math.cos(a) * r, 0).applyAxisAngle(UP, this.yaw).add(this.pivot);
    const p = this.game.player;
    if (p && !p.dead && p.invuln <= 0) {
      _w.copy(p.pos).setY(p.pos.y + 0.8).sub(this.tip);
      const off = Math.abs(_w.dot(this.n));
      _w.addScaledVector(this.n, -_w.dot(this.n));
      if (off < 0.55 && _w.length() < 1.15) p.receive({ dmg: 1, from: this.tip.clone(), kind: 'hazard', unblockable: true });
    }
  }
}

class Lever extends Prop {
  constructor(game, pos, yaw, parent, onPull) {
    super(game); this.pos = pos.clone(); this.radius = 0.7; this.height = 1.8; this.noAim = false; this.onPull = onPull; this.pulled = false; this.t = 0;
    const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = yaw; parent.add(g);
    put(g, new THREE.Mesh(box(1.3, 0.9, 0.9, { s: 1 }), PM.stone), 0, 0.45, 0);
    put(g, new THREE.Mesh(box(1.5, 0.15, 1.1, { s: 2 }), PM.iron), 0, 0.95, 0);
    this.handle = new THREE.Group(); this.handle.position.y = 0.95; g.add(this.handle);
    put(this.handle, new THREE.Mesh(cyl(0.08, 0.08, 1.7, 6), PM.iron), 0, 0.85, 0);
    this.knob = put(this.handle, new THREE.Mesh(sphere(0.24, 8, 6), PM.gold), 0, 1.75, 0);
    this.handle.rotation.x = -0.7;
    this.beam = put(g, new THREE.Mesh(cyl(0.35, 0.6, 12, 8, { open: true }), retroMat({ color: 0xffb040, emit: 1, additive: true, opacity: 0.3, side: THREE.DoubleSide, fog: 0.3 })), 0, 7, 0);
    this.glow = game.glows.add(pos.clone().setY(pos.y + 2.3), 0xffb040, 2.4, true);
    addBox(pos.clone().setY(pos.y + 0.45), new THREE.Vector3(0.65, 0.45, 0.45), yaw);
    game.addTarget(this);
  }
  onHit() {
    if (this.pulled) return 'ignored';
    this.pulled = true; this.alive = false; this.game.removeTarget(this);
    audio.play('switch');
    this.beam.visible = false;
    this.game.glows.set(this.glow, this.pos, 0x000000, 0); this.game.glows.dirty();
    this.game.fx.sparks(this.pos.clone().setY(this.pos.y + 1.6), 14, 0xffd080, 5);
    this.game.shake(0.3);
    this.onPull?.();
    return 'hit';
  }
  update(dt) {
    this.t += dt;
    this.handle.rotation.x += ((this.pulled ? 0.8 : -0.7) - this.handle.rotation.x) * (1 - Math.exp(-dt * 10));
    if (!this.pulled) this.knob.scale.setScalar(1 + Math.sin(this.t * 6) * 0.12);
    const p = this.game.player;
    const near = !this.pulled && !!p && p.pos.distanceTo(this.pos) < 4.5;
    if (near !== !!this.wasNear) { this.game.hud.prompt(near ? 'Strike the lever!' : null); this.wasNear = near; }
  }
}

// a door/gate that slides up (or down into the floor) when opened
class Door extends Prop {
  constructor(game, mesh, half, parent, { lift = 6, speed = 2, quat = null, sound = 'doorOpen' } = {}) {
    super(game); this.mesh = mesh; this.home = mesh.position.clone(); this.lift = lift; this.speed = speed; this.open = false; this.k = 0; this.quat = quat; this.sound = sound;
    parent.add(mesh);
    this.pf = addPlatform(half, mesh); this.pf.setPose(this.home, quat);
  }
  openUp() { if (!this.open) { this.open = true; audio.play(this.sound); this.game.shake(0.3); } }
  update(dt) {
    if (!this.open || this.k >= 1) return;
    this.k = Math.min(1, this.k + dt * this.speed / Math.abs(this.lift));
    this.pf.setPose(_v.copy(this.home).setY(this.home.y + this.k * this.lift), this.quat);
    if (this.k >= 1 && this.lift < 0) this.mesh.visible = false;
    if (Math.random() < 0.3) this.game.fx.puff(_w.copy(this.home).setY(this.home.y - 0.2), 1, 0x5a5a80, 0.5);
  }
}

// ------------------------------------------------------------------ manager
export class Props {
  constructor(game) {
    mats();
    this.game = game; this.list = [];
    this.root = new THREE.Group(); game.scene.add(this.root);
    // star motes share one instanced mesh
    this.moteMesh = new THREE.InstancedMesh(starGeo(), PM.mote, 1200);
    this.moteMesh.count = 0; this.moteMesh.frustumCulled = false;
    this.root.add(this.moteMesh);
    this.motes = []; this.chain = 0; this.lastT = -9;
    this.heartGeo = heartGeo(); this.potGeo = potGeo();
  }
  add(p) { this.list.push(p); return p; }
  mote(pos, parent) { const m = new Mote(this.game, pos, this, this.motes.length); this.motes.push(m); this.game.totalMotes++; return m; }
  motesLine(a, b, n) { for (let i = 0; i < n; i++) this.mote(_v.copy(a).lerp(b, n === 1 ? 0.5 : i / (n - 1)).clone()); }
  motesRing(c, r, n, y = 0) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this.mote(new THREE.Vector3(c.x + Math.cos(a) * r, c.y + y, c.z + Math.sin(a) * r)); } }
  motesArc(a, b, h, n) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); const p = _v.copy(a).lerp(b, t).clone(); p.y += Math.sin(t * Math.PI) * h; this.mote(p); } }
  // motes spraying out (enemy defeat, pot break) that home in on the player
  burst(pos, n) {
    for (let i = 0; i < n; i++) {
      const m = this.mote(pos.clone()); this.game.totalMotes--;
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
      m.vel.set(Math.cos(a) * s, 5 + Math.random() * 4, Math.sin(a) * s);
      m.home.y = pos.y - 0.3; m.age = -0.15;
    }
  }
  heart(pos, parent = this.root) { const mesh = new THREE.Mesh(this.heartGeo, PM.heart); parent.add(mesh); return this.add(new Heart(this.game, pos.clone(), mesh)); }
  pot(pos, parent = this.root, opts = {}) {
    const mesh = new THREE.Mesh(this.potGeo, PM.pot); mesh.position.copy(pos); mesh.rotation.y = Math.random() * 6; mesh.scale.setScalar(opts.scale || 1);
    parent.add(mesh); return this.add(new Pot(this.game, pos, mesh, opts));
  }
  checkpoint(pos, yaw, name, parent = this.root) { return this.add(new Checkpoint(this.game, pos, yaw, name, parent)); }
  sigil(pos, parent, onGet) { return this.add(new Sigil(this.game, pos, parent || this.root, onGet)); }
  mover(mesh, half, path, parent = this.root, opts) { return this.add(new Mover(this.game, mesh, half, path, parent, opts)); }
  crumble(pos, size, parent = this.root) { return this.add(new Crumble(this.game, pos, size, parent)); }
  bouncer(pos, power = 21, parent = this.root) { return this.add(new Bouncer(this.game, pos, power, parent)); }
  pendulum(pivot, len, yaw, parent = this.root, o) { return this.add(new Pendulum(this.game, pivot, len, yaw, parent, o)); }
  lever(pos, yaw, parent, onPull) { return this.add(new Lever(this.game, pos, yaw, parent || this.root, onPull)); }
  door(mesh, half, parent, o) { return this.add(new Door(this.game, mesh, half, parent || this.root, o)); }

  update(dt) {
    for (const p of this.list) if (p.alive || p instanceof Mover || p instanceof Crumble || p instanceof Door || p instanceof Lever) p.update(dt);
    this.list = this.list.filter(p => p.alive || p instanceof Mover || p instanceof Crumble || p instanceof Door || p instanceof Lever);
    // motes
    const t = this.game.time;
    let n = 0;
    for (const m of this.motes) {
      if (!m.alive) continue;
      m.update(dt);
      if (!m.alive) continue;
      // cull far motes from the instance list
      if (this.game.camera.position.distanceToSquared(m.pos) > 110 * 110) continue;
      _q.setFromAxisAngle(UP, t * 3 + m.ph);
      _v.copy(m.pos); if (!m.pull) _v.y += Math.sin(t * 2.5 + m.ph) * 0.1;
      _m.compose(_v, _q, _w.set(1, 1, 1));
      this.moteMesh.setMatrixAt(n++, _m);
    }
    this.motes = this.motes.filter(m => m.alive);
    this.moteMesh.count = n;
    this.moteMesh.instanceMatrix.needsUpdate = true;
  }
}
