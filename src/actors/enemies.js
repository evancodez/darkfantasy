// Enemy behaviour. Every attack is telegraphed (a wind-up pose, a sound and a
// flash) so it can be read, blocked or parried; parried enemies are dazed and
// take double damage; defeated enemies pop into a burst of star-motes.
import * as THREE from 'three';
import { createCharacter, raycast } from '../core/physics.js';
import { Lights, retroMat } from '../core/retro.js';
import { sphere } from '../core/geo.js';
import { mixPose } from './rig.js';
import * as Models from './models.js';
import audio from '../sound.js';

const PI = Math.PI;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2; return d; };
const R = Math.random;

// ================================================================== projectile
const ORB_GEO = sphere(0.22, 8, 6);
export class Orb {
  constructor(game, pos, vel, o = {}) {
    this.game = game; this.pos = pos.clone(); this.vel = vel.clone(); this.owner = o.owner; this.dmg = o.dmg ?? 1;
    this.homing = o.homing ?? 0; this.life = o.life ?? 6; this.age = 0; this.reflectDmg = o.reflectDmg ?? 3;
    this.color = new THREE.Color(o.color ?? 0x40ff70); this.size = o.size ?? 1; this.gravity = o.gravity ?? 0; this.kind = o.kind || 'orb';
    this.onImpact = o.onImpact; this.unparryable = o.unparryable;
    this.mesh = new THREE.Mesh(ORB_GEO, retroMat({ color: this.color, emit: 1, fog: 0.3 }));
    this.mesh.scale.setScalar(this.size);
    game.scene.add(this.mesh);
    this.light = Lights.add(this.pos, this.color, 1.6, 6, { dynamic: true });
    this.glow = game.fx.glow;
    game.projectiles.push(this);
  }
  remove() { this.removed = true; this.mesh.removeFromParent(); Lights.remove(this.light); }
  explode(color = this.color) {
    this.game.fx.pop(this.pos, color.getHex(), 10);
    audio.play(this.kind === 'fireball' ? 'fireballHit' : this.kind === 'potion' ? 'potionSmash' : 'orbHit', { volume: 0.8 });
    this.onImpact?.(this);
    this.remove();
  }
  onParried(player) {
    this.reflected = true; this.age = 0; this.homing = 0;
    const tgt = this.owner && this.owner.alive ? _a.copy(this.owner.pos).setY(this.owner.pos.y + (this.owner.aimHeight ?? this.owner.height * 0.6)) : _a.copy(this.pos).add(player.forward.clone().multiplyScalar(10));
    this.vel.copy(tgt).sub(this.pos).normalize().multiplyScalar(Math.max(16, this.vel.length() * 1.8));
    this.gravity = 0;
    this.color.setHex(0xffe070); this.mesh.material.uniforms.uColor.value.setHex(0xffe070); this.light.color.setHex(0xffd060);
    audio.play('orbReflect');
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.age += dt;
    if (this.age > this.life) return this.explode();
    if (this.homing && !this.reflected && p) {
      _a.copy(p.pos).setY(p.pos.y + 0.9).sub(this.pos).normalize().multiplyScalar(this.vel.length());
      this.vel.lerp(_a, 1 - Math.exp(-dt * this.homing));
    }
    if (this.reflected && this.owner?.alive) {
      _a.copy(this.owner.pos).setY(this.owner.pos.y + (this.owner.aimHeight ?? this.owner.height * 0.6)).sub(this.pos);
      this.vel.lerp(_a.normalize().multiplyScalar(this.vel.length()), 1 - Math.exp(-dt * 6));
    }
    this.vel.y -= this.gravity * dt;
    const step = this.vel.length() * dt;
    const hit = raycast(this.pos, _b.copy(this.vel).normalize(), step + 0.1);
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    const pulse = 1 + Math.sin(this.age * 30) * 0.12;
    this.mesh.scale.setScalar(this.size * pulse);
    this.light.pos.copy(this.pos);
    if (R() < 0.8) this.glow.emit({ pos: this.pos, vel: _b.set((R() - 0.5), (R() - 0.5), (R() - 0.5)), life: 0.3, size: 0.6 * this.size, size1: 0.05, color: this.color.getHex(), alpha: 0.8 });
    if (hit !== null && this.age > 0.05) return this.explode();
    if (!this.reflected && p && !p.dead) {
      if (this.pos.distanceTo(_a.copy(p.pos).setY(p.pos.y + 0.85)) < 0.55 + 0.25 * this.size) {
        const r = p.receive({ dmg: this.dmg, from: this.pos.clone().sub(this.vel.clone().normalize()), kind: 'projectile', source: this, unblockable: this.unparryable && false });
        if (r === 'hit' || r === 'block') return this.explode(r === 'block' ? new THREE.Color(0xa0c0ff) : this.color);
      }
    }
    if (this.reflected) {
      for (const e of g.targets) {
        if (!e.alive || e === p) continue;
        const h = e.aimHeight ?? e.height * 0.6;
        if (this.pos.distanceTo(_a.copy(e.pos).setY(e.pos.y + h)) < e.radius + 0.6) {
          e.onHit({ dmg: this.reflectDmg, from: this.pos, kind: 'reflect', dir: this.vel.clone().setY(0).normalize() });
          g.hitstop(0.08); g.shake(0.3);
          return this.explode(new THREE.Color(0xffe070));
        }
      }
    }
  }
}

// ================================================================== base enemy
export class Enemy {
  constructor(game, kind, pos, o = {}) {
    this.game = game; this.kind = kind;
    this.pos = pos.clone(); this.home = pos.clone(); this.vel = new THREE.Vector3(); this.yaw = o.yaw ?? 0;
    this.alive = true; this.state = 'idle'; this.t = 0; this.stun = 0; this.flash = 0; this.squash = 0; this.dying = -1;
    this.hp = this.maxHp = o.hp ?? 2; this.radius = o.radius ?? 0.5; this.height = o.height ?? 1.8;
    this.stompable = o.stompable ?? true; this.drops = o.drops ?? 4; this.big = o.big ?? false;
    this.aggro = o.aggro ?? 12; this.flying = o.flying ?? false; this.gravity = 30;
    this.parent = o.parent || game.scene;
    this.model = Models.build(kind);
    this.root = this.model.root; this.rig = this.model.rig;
    this.parent.add(this.root);
    if (!this.flying) this.char = createCharacter(Math.min(this.radius, 0.5), Math.max(0.1, this.height / 2 - this.radius), pos);
    this.grounded = false;
    this.onDeath = o.onDeath;
    this.dormant = o.dormant ?? false;
    game.addTarget(this); game.enemies.push(this);
    this.pose = {}; this.stars = [];
  }
  get player() { return this.game.player; }
  toPlayer(out = _a) { return out.copy(this.player.pos).sub(this.pos); }
  // distance to the player; height differences count extra so foes on other
  // floors (a ledge above or below) don't react as if you were next to them
  distP() { const p = this.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) + Math.max(0, Math.abs(p.y - this.pos.y) - (this.flying ? 4 : 1.6)) * 4; }
  face(yaw, dt, rate = 8) { this.yaw += angDiff(this.yaw, yaw) * (1 - Math.exp(-dt * rate)); }
  facePlayer(dt, rate = 8) { const d = this.toPlayer(); this.face(Math.atan2(d.x, d.z), dt, rate); }
  inFront(arc = 0.5, range = 2) {
    const d = this.toPlayer(); const dist = Math.hypot(d.x, d.z);
    if (dist > range + 0.4 || Math.abs(d.y) > 1.8) return false;
    return (d.x * Math.sin(this.yaw) + d.z * Math.cos(this.yaw)) / Math.max(dist, 0.01) > arc;
  }
  setState(s) { this.state = s; this.t = 0; }
  strike(dmg = 1, o = {}) { return this.player.receive({ dmg, from: this.pos.clone(), kind: 'melee', source: this, ...o }); }

  onHit(hit) {
    if (!this.alive || this.dormant) return 'ignored';
    if (this.guards?.(hit)) return 'blocked';
    const dmg = hit.dmg * (this.stun > 0 ? 2 : 1);
    this.hp -= dmg; this.flash = 1;
    audio.play('enemyHit', { pitch: 0.9 + R() * 0.2 });
    if (hit.dir && !this.heavy) { this.vel.x += hit.dir.x * (this.big ? 3 : 7); this.vel.z += hit.dir.z * (this.big ? 3 : 7); if (!this.flying) this.vel.y = Math.max(this.vel.y, 3); }
    if (this.hp <= 0) { this.die(); return 'kill'; }
    this.onHurt?.(hit);
    return 'hit';
  }
  onStomp(player, dmg) { this.squash = 1; this.onHit({ dmg, from: player.pos, kind: 'stomp' }); if (this.alive) { this.stun = Math.max(this.stun, 0.8); this.setState('stunned'); } }
  onParried() {
    this.stun = this.parryStun ?? 1.8; this.setState('stunned'); this.flash = 0.6;
    this.vel.addScaledVector(this.toPlayer().setY(0).normalize(), -4);
  }
  die() {
    this.alive = false; this.dying = 0;
    this.game.removeTarget(this);
    audio.play('enemyPop');
    const c = _a.copy(this.pos).setY(this.pos.y + this.height * 0.5);
    this.game.fx.pop(c, this.popColor ?? 0xc0a0ff, 22);
    this.game.props.burst(c.clone(), this.drops);
    if (R() < (this.heartChance ?? 0.12)) this.game.props.heart(this.pos);
    this.game.hitstop(0.08);
    this.onDeath?.(this);
  }
  physics(dt) {
    if (this.flying) { this.pos.addScaledVector(this.vel, dt); return; }
    this.vel.y = Math.max(-30, this.vel.y - this.gravity * dt);
    const r = this.char.move(_b.copy(this.vel).multiplyScalar(dt), this.pos);
    this.grounded = r.grounded;
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    // friction on knockback
    const f = Math.exp(-dt * (this.grounded ? 9 : 1));
    this.vel.x *= f; this.vel.z *= f;
    if (this.pos.y < this.game.killY()) { this.hp = 0; this.die(); }
  }
  // move toward a horizontal velocity target
  steer(tx, tz, dt, acc = 30) {
    const dx = tx - this.vel.x, dz = tz - this.vel.z, l = Math.hypot(dx, dz);
    if (l > 0) { const s = Math.min(l, acc * dt) / l; this.vel.x += dx * s; this.vel.z += dz * s; }
  }
  dizzy(dt) {
    // little orbiting stars while stunned
    if (R() < dt * 14) {
      const a = this.game.time * 8;
      this.game.fx.spark.emit({ pos: _a.set(this.pos.x + Math.cos(a) * 0.4, this.pos.y + this.height + 0.15, this.pos.z + Math.sin(a) * 0.4), life: 0.3, size: 0.35, size1: 0, color: 0xffe070 });
    }
  }
  update(dt) {
    if (this.dying >= 0) {
      this.dying += dt;
      const s = Math.max(0.01, 1 - this.dying / 0.25);
      this.root.scale.set(1 + (1 - s) * 0.6, s, 1 + (1 - s) * 0.6);
      if (this.dying > 0.25) { this.removed = true; this.root.removeFromParent(); if (this.char) this.char.teleport(new THREE.Vector3(0, -900, 0)); }
      return;
    }
    this.t += dt;
    this.stun = Math.max(0, this.stun - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.squash = Math.max(0, this.squash - dt * 4);
    if (!this.dormant) this.think(dt);
    this.physics(dt);
    if (this.stun > 0) this.dizzy(dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.scale.set(1 + this.squash * 0.4, 1 - this.squash * 0.5, 1 + this.squash * 0.4);
    this.rig.setFlash(this.flash > 0 ? 0.3 + this.flash * 0.6 : (this.windupGlow || 0));
    this.animate(dt);
  }
  think() {}
  animate() {}
}

// ================================================================== scarecrow
export class Scarecrow extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'scarecrow', pos, { hp: 3, radius: 0.5, height: 2.1, drops: 5, ...o });
    this.perched = o.perched ?? true; this.popColor = 0xff8a30;
    if (this.perched) { this.setState('perched'); this.pos.y += 0.6; this.char.teleport(this.pos); }
    this.hop = 0; this.seed = R() * 10;
  }
  think(dt) {
    const d = this.distP(), p = this.player;
    this.windupGlow = 0;
    switch (this.state) {
      case 'perched':
        this.vel.set(0, 0, 0); this.gravity = 0;
        if (d < 10 && !p.dead) { this.setState('wake'); audio.play('scarecrowGroan'); this.vel.y = 6; this.gravity = 30; this.game.fx.puff(this.pos, 6, 0xb08040, 0.5); }
        break;
      case 'wake':
        this.facePlayer(dt, 6);
        if (this.t > 0.6) this.setState('chase');
        break;
      case 'stunned':
        this.steer(0, 0, dt, 20);
        if (this.stun <= 0) this.setState('chase');
        break;
      case 'chase': {
        this.facePlayer(dt, 5);
        // shambling hops
        this.hop += dt * 2.2;
        const go = Math.sin(this.hop * PI) > 0 ? 3.6 : 0.6;
        this.steer(Math.sin(this.yaw) * go, Math.cos(this.yaw) * go, dt, 25);
        if (d < 2.4 && this.t > 0.4 && !p.dead) { this.setState('windup'); audio.play('scarecrowGroan', { pitch: 1.2 }); }
        if (d > this.aggro * 2) this.setState('return');
        break;
      }
      case 'return': {
        const h = _b.copy(this.home).sub(this.pos); this.face(Math.atan2(h.x, h.z), dt, 4);
        this.steer(Math.sin(this.yaw) * 2.5, Math.cos(this.yaw) * 2.5, dt);
        if (this.distP() < this.aggro) this.setState('chase');
        break;
      }
      case 'windup':
        this.facePlayer(dt, 6); this.steer(0, 0, dt, 30);
        this.windupGlow = 0.25 * (Math.sin(this.t * 40) > 0 ? 1 : 0.3);
        if (this.t > 0.55) { this.setState('swipe'); audio.play('scarecrowLunge'); this.vel.x += Math.sin(this.yaw) * 8; this.vel.z += Math.cos(this.yaw) * 8; this.hitDone = false; }
        break;
      case 'swipe':
        if (!this.hitDone && this.t > 0.06 && this.inFront(0.3, 2.3)) { this.hitDone = true; this.strike(1); }
        if (this.t > 0.3) this.setState('recover');
        break;
      case 'recover':
        this.steer(0, 0, dt, 20);
        if (this.t > 0.8) this.setState('chase');
        break;
    }
  }
  animate(dt) {
    const t = this.game.time + this.seed, s = this.state;
    let pose;
    if (s === 'perched') pose = { shoulderL: [0, 0, 1.5], shoulderR: [0, 0, -1.5], elbowL: [0, 0, 0.1], elbowR: [0, 0, -0.1], head: [0.35, 0, 0.25 + Math.sin(t) * 0.05], legL: [0, 0, 0.05], legR: [0, 0, -0.05], spine: [0, 0, 0] };
    else if (s === 'windup') pose = { spine: [-0.35, 0, 0], head: [-0.4, 0, Math.sin(t * 40) * 0.1], shoulderL: [-2.4, 0, 0.5], shoulderR: [-2.4, 0, -0.5], elbowL: [-0.6, 0, 0], elbowR: [-0.6, 0, 0], legL: [-0.3, 0, 0], legR: [0.3, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0] };
    else if (s === 'swipe') pose = { spine: [0.6, 0, 0], head: [0.3, 0, 0], shoulderL: [-0.6, 0, 0.2], shoulderR: [-0.6, 0, -0.2], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], legL: [-0.6, 0, 0], legR: [0.4, 0, 0], kneeL: [0.2, 0, 0], kneeR: [0.6, 0, 0] };
    else if (s === 'stunned') pose = { spine: [-0.2, 0, Math.sin(t * 6) * 0.2], head: [0.2, 0, Math.sin(t * 6) * 0.4], shoulderL: [0.2, 0, 0.4], shoulderR: [0.2, 0, -0.4], elbowL: [0, 0, 0], elbowR: [0, 0, 0], legL: [0, 0, 0.1], legR: [0, 0, -0.1] };
    else {
      const a = Math.sin(this.hop * PI), w = this.state === 'chase' ? 1 : 0.3;
      pose = { spine: [0.25 * w, 0, a * 0.15], head: [0.1, Math.sin(t * 2) * 0.3, a * 0.3], shoulderL: [-0.9 * w + a * 0.4, 0, 0.7], shoulderR: [-0.9 * w - a * 0.4, 0, -0.7], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], legL: [-a * 0.5, 0, 0.1], legR: [a * 0.5, 0, -0.1], kneeL: [Math.max(0, a) * 0.6, 0, 0], kneeR: [Math.max(0, -a) * 0.6, 0, 0] };
    }
    this.rig.apply(pose, 1 - Math.exp(-dt * (s === 'swipe' ? 30 : 12)));
    this.rig.body.position.y = 1.05 + (s === 'chase' ? Math.abs(Math.sin(this.hop * PI)) * 0.18 : 0);
  }
}

// ================================================================== cultist
export class Cultist extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'cultist', pos, { hp: 2, radius: 0.45, height: 2.0, drops: 4, ...o });
    this.popColor = 0xff3040; this.cast = 1 + R() * 2; this.seed = R() * 10;
    this.march = o.march || null;   // {dir: Vector3, speed} — procession mode
    this.keep = o.keep ?? 7; this.stay = o.stay ?? false;
  }
  think(dt) {
    const d = this.distP(), p = this.player;
    this.windupGlow = 0;
    if (this.state === 'idle' && (d < this.aggro || this.march)) this.setState('active');
    if (this.state === 'stunned') { this.steer(0, 0, dt); if (this.stun <= 0) this.setState('active'); return; }
    if (this.state === 'active') {
      this.facePlayer(dt, 5);
      if (this.stay) this.steer(0, 0, dt, 10);
      else if (this.march) {
        const s = d > 3 ? this.march.speed : 0, toP = this.toPlayer(_b).setY(0).normalize();
        this.steer(toP.x * s, toP.z * s, dt, 10);
      } else {
        // keep a casting distance and circle a little
        const toP = this.toPlayer(_b).setY(0).normalize();
        const want = d > this.keep + 1 ? 2.2 : d < this.keep - 2 ? -2.6 : 0;
        const side = Math.sin(this.game.time * 0.7 + this.seed) * 1.6;
        this.steer(toP.x * want - toP.z * side, toP.z * want + toP.x * side, dt, 8);
      }
      this.cast -= dt;
      if (this.cast <= 0 && d < 16 && !p.dead) { this.setState('charge'); audio.play('cultistChant', { volume: 0.7 }); }
      if (d < 2.2 && !p.dead && this.t > 0.5 && Math.abs(this.player.pos.y - this.pos.y) < 1.5) this.setState('shove');
    } else if (this.state === 'charge') {
      this.facePlayer(dt, 8); this.steer(0, 0, dt);
      this.windupGlow = 0.15 + Math.sin(this.t * 30) * 0.1;
      if (R() < 0.6) this.game.fx.glow.emit({ pos: this.handPos(), life: 0.25, size: 0.5 + this.t * 0.6, size1: 0.1, color: 0x40ff70, alpha: 0.8 });
      if (this.t > 0.7) {
        const from = this.handPos();
        const to = _b.copy(p.pos).setY(p.pos.y + 0.9);
        new Orb(this.game, from, to.sub(from).normalize().multiplyScalar(7.5), { owner: this, homing: 1.3, color: 0x40ff70, life: 5, reflectDmg: 3 });
        audio.play('orbCast');
        this.cast = 2.6 + R() * 1.8;
        this.setState('active');
      }
    } else if (this.state === 'shove') {
      this.facePlayer(dt, 10); this.steer(0, 0, dt);
      this.windupGlow = Math.sin(this.t * 40) > 0 ? 0.3 : 0;
      if (this.t > 0.45 && !this.hitDone) { this.hitDone = true; if (this.inFront(0.3, 2.3)) this.strike(1); this.vel.addScaledVector(this.toPlayer(_b).setY(0).normalize(), 5); }
      if (this.t > 0.8) { this.hitDone = false; this.setState('active'); }
    }
  }
  handPos() { return _a.set(Math.sin(this.yaw) * 0.6, 1.25, Math.cos(this.yaw) * 0.6).add(this.pos).clone(); }
  physics(dt) { super.physics(dt); }
  animate(dt) {
    const t = this.game.time + this.seed, s = this.state;
    let pose;
    if (s === 'charge') pose = { shoulderL: [-1.6, 0, -0.35], shoulderR: [-1.6, 0, 0.35], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], spine: [-0.15, 0, 0], head: [-0.1, 0, 0] };
    else if (s === 'shove') pose = this.t < 0.45 ? { shoulderL: [-2.6, 0, 0.2], shoulderR: [-2.6, 0, -0.2], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], spine: [-0.3, 0, 0] } : { shoulderL: [-1.3, 0, -0.2], shoulderR: [-1.3, 0, 0.2], elbowL: [0, 0, 0], elbowR: [0, 0, 0], spine: [0.4, 0, 0] };
    else if (s === 'stunned') pose = { spine: [-0.3, 0, Math.sin(t * 7) * 0.2], head: [0.3, 0, Math.sin(t * 7) * 0.3], shoulderL: [0, 0, 0.5], shoulderR: [0, 0, -0.5] };
    else pose = { spine: [0.05, Math.sin(t * 1.3) * 0.1, Math.sin(t * 1.1) * 0.05], head: [0.05, Math.sin(t * 0.9) * 0.2, 0], shoulderL: [-0.9, 0.3, -0.25], shoulderR: [-0.9, -0.3, 0.25], elbowL: [-1.1, 0, 0], elbowR: [-1.1, 0, 0] };
    this.rig.apply(pose, 1 - Math.exp(-dt * 12));
    this.rig.body.position.y = 0.06 + Math.sin(t * 2.4) * 0.05;
  }
}

// ================================================================== skull crawler
export class Skull extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'skull', pos, { hp: 1, radius: 0.42, height: 0.75, drops: 2, aggro: 11, ...o });
    this.popColor = 0xd0c8ff; this.seed = R() * 10; this.dash = 0;
  }
  think(dt) {
    const d = this.distP(), p = this.player;
    if (this.state === 'idle') { this.steer(0, 0, dt); if (d < this.aggro && !p.dead) { this.setState('chase'); audio.play('skullChatter'); } return; }
    if (this.state === 'stunned') { this.steer(0, 0, dt); if (this.stun <= 0) this.setState('chase'); return; }
    if (this.state === 'chase') {
      this.dash -= dt;
      if (this.dash <= 0) {
        // zig-zag bursts toward the player
        const toP = this.toPlayer(_b).setY(0).normalize(), side = (R() - 0.5) * 1.6;
        const yaw = Math.atan2(toP.x, toP.z) + side * 0.6;
        this.yaw = yaw; this.dash = 0.4 + R() * 0.3;
        if (R() < 0.3) audio.play('skullChatter', { volume: 0.4, pitch: 0.9 + R() * 0.3 });
      }
      this.steer(Math.sin(this.yaw) * 5.2, Math.cos(this.yaw) * 5.2, dt, 30);
      if (d < 3.2 && this.t > 0.6 && this.grounded && !p.dead) this.setState('crouch');
      if (d > this.aggro * 2.2) this.setState('idle');
    } else if (this.state === 'crouch') {
      this.facePlayer(dt, 12); this.steer(0, 0, dt, 40);
      this.windupGlow = Math.sin(this.t * 50) > 0 ? 0.35 : 0;
      if (this.t > 0.38) {
        const toP = this.toPlayer(_b); const hd = Math.hypot(toP.x, toP.z);
        this.vel.set(toP.x / hd * 8.5, 7.5, toP.z / hd * 8.5);
        audio.play('skullLeap'); this.setState('leap'); this.hitDone = false;
      }
    } else if (this.state === 'leap') {
      if (!this.hitDone && this.pos.distanceTo(_a.copy(p.pos).setY(p.pos.y + 0.5)) < 1.0) { this.hitDone = true; this.strike(1); }
      if (this.grounded && this.t > 0.2) this.setState('chase');
    }
  }
  animate(dt) {
    const t = this.game.time * 22 + this.seed;
    const moving = this.state === 'chase';
    for (let i = 0; i < 4; i++) {
      const sx = i < 2 ? 1 : -1, ph = t + (i % 2) * PI + (i < 2 ? 0 : PI / 2);
      const L = this.rig.j['leg' + i];
      L.rotation.z = sx * (this.state === 'crouch' ? 0.1 : this.state === 'leap' ? 1.0 : 0.5 + (moving ? Math.sin(ph) * 0.35 : 0));
      L.rotation.x = moving ? Math.cos(ph) * 0.5 : 0;
    }
    this.rig.j.jaw.rotation.x = 0.25 + Math.sin(this.game.time * (this.state === 'idle' ? 6 : 30)) * 0.25;
    this.rig.body.position.y = this.state === 'crouch' ? 0.28 : 0.42 + (moving ? Math.abs(Math.sin(t)) * 0.05 : 0);
    this.rig.body.rotation.x = this.state === 'leap' ? -0.4 : this.state === 'stunned' ? Math.sin(this.game.time * 10) * 0.3 : 0;
  }
}

// ================================================================== bat
export class Bat extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'bat', pos, { hp: 1, radius: 0.5, height: 0.6, drops: 2, flying: true, aggro: 12, stompable: true, ...o });
    this.popColor = 0xb070ff; this.seed = R() * 10; this.orbit = R() * PI * 2; this.shadowSize = 0.7;
    this.cool = 1.5 + R() * 2;
  }
  think(dt) {
    const p = this.player, d = this.distP();
    const tp = _b.copy(p.pos);
    this.windupGlow = 0;
    if (this.state === 'stunned') { this.vel.multiplyScalar(Math.exp(-dt * 4)); this.vel.y = -2; if (this.stun <= 0) this.setState('idle'); return; }
    if (this.state === 'idle') {
      // lazy circles around the player (or home), just above head height
      const c = d < this.aggro && !p.dead ? tp : this.home;
      this.orbit += dt * 1.1;
      const want = _a.set(c.x + Math.cos(this.orbit) * 4.5, c.y + 2.6 + Math.sin(this.game.time * 2 + this.seed) * 0.3, c.z + Math.sin(this.orbit) * 4.5);
      this.vel.lerp(want.sub(this.pos).multiplyScalar(2), 1 - Math.exp(-dt * 3));
      this.face(Math.atan2(this.vel.x, this.vel.z), dt, 6);
      this.cool -= dt;
      // only one bat dives at a time
      const busy = this.game.enemies.some(e => e !== this && e.kind === 'bat' && (e.state === 'aim' || e.state === 'dive'));
      if (d < this.aggro && this.cool <= 0 && !p.dead && !busy) { this.setState('aim'); audio.play('batScreech'); }
    } else if (this.state === 'aim') {
      // hang in the air, shaking and flashing — the tell
      this.vel.multiplyScalar(Math.exp(-dt * 8)); this.facePlayer(dt, 12);
      this.windupGlow = Math.sin(this.t * 40) > 0 ? 0.4 : 0;
      if (this.t > 0.75) { this.dive = tp.clone().setY(tp.y + 1.0); this.vel.copy(this.dive).sub(this.pos).normalize().multiplyScalar(10); this.setState('dive'); this.hitDone = false; }
    } else if (this.state === 'dive') {
      if (!this.hitDone && this.pos.distanceTo(_a.copy(p.pos).setY(p.pos.y + 0.9)) < 0.85) { this.hitDone = true; this.strike(1); }
      // pull up at chest height and hover there for a moment (your chance to strike)
      if (this.pos.y < p.pos.y + 1.3 || this.t > 0.9) { this.setState('linger'); this.vel.multiplyScalar(0.25); this.vel.y = 0; }
    } else if (this.state === 'linger') {
      this.vel.multiplyScalar(Math.exp(-dt * 5));
      this.pos.y += (p.pos.y + 1.2 - this.pos.y) * (1 - Math.exp(-dt * 4));
      if (this.t > 1.1) { this.setState('idle'); this.cool = 2.2 + R() * 1.5; }
    }
  }
  physics(dt) {
    super.physics(dt);
    const floor = raycast(_a.copy(this.pos).setY(this.pos.y + 0.5), _b.set(0, -1, 0), 30);
    if (floor !== null && floor < 1.0) this.pos.y += 1.0 - floor;
  }
  onStomp(player, dmg) { this.onHit({ dmg: 9, from: player.pos }); }
  animate(dt) {
    const f = Math.sin(this.game.time * (this.state === 'dive' ? 8 : 18) + this.seed);
    const w = this.state === 'dive' ? 0.9 : f * 0.9;
    this.rig.j.wingL.rotation.z = w; this.rig.j.wingR.rotation.z = -w;
    this.rig.body.rotation.x = this.state === 'dive' ? 0.8 : 0.15;
  }
}

// ================================================================== black knight
export class Knight extends Enemy {
  constructor(game, pos, o = {}) {
    super(game, 'knight', pos, { hp: 5, radius: 0.6, height: 2.3, drops: 8, big: true, stompable: false, aggro: 12, ...o });
    this.popColor = 0x8a6aff; this.parryStun = 2.6; this.heavy = false; this.seed = R() * 10; this.heartChance = 0.5;
  }
  guards(hit) {
    if (this.stun > 0 || this.state === 'recover' || this.state === 'slam' || hit.kind === 'reflect' || hit.kind === 'plunge') return false;
    const d = _b.copy(hit.from).sub(this.pos);
    const front = (d.x * Math.sin(this.yaw) + d.z * Math.cos(this.yaw)) / Math.max(0.01, Math.hypot(d.x, d.z));
    if (front > 0.3) { this.flash = 0.2; this.blockT = 0.25; return true; }
    return false;
  }
  onHurt() { if (this.state !== 'stunned' && this.state !== 'recover') this.setState('chase'); }
  think(dt) {
    const d = this.distP(), p = this.player;
    this.windupGlow = 0; this.blockT = Math.max(0, (this.blockT || 0) - dt);
    switch (this.state) {
      case 'idle': if (d < this.aggro && !p.dead) this.setState('chase'); break;
      case 'stunned': this.steer(0, 0, dt); if (this.stun <= 0) this.setState('chase'); break;
      case 'chase': {
        this.facePlayer(dt, 3.5);
        const s = d > 2.6 ? 2.6 : 0;
        this.steer(Math.sin(this.yaw) * s, Math.cos(this.yaw) * s, dt, 12);
        if (d < 3.0 && this.t > 0.8 && !p.dead) { this.setState('raise'); audio.play('knightSwing', { pitch: 0.8 }); }
        break;
      }
      case 'raise':
        this.facePlayer(dt, 4); this.steer(0, 0, dt, 20);
        this.windupGlow = this.t > 0.5 ? (Math.sin(this.t * 40) > 0 ? 0.4 : 0.1) : 0;
        if (this.t > 0.85) { this.setState('slam'); this.hitDone = false; this.vel.x += Math.sin(this.yaw) * 4; this.vel.z += Math.cos(this.yaw) * 4; }
        break;
      case 'slam':
        if (!this.hitDone && this.t > 0.1) {
          this.hitDone = true;
          const fx = _a.set(Math.sin(this.yaw) * 2, 0, Math.cos(this.yaw) * 2).add(this.pos);
          this.game.fx.rings.add(fx, { color: 0xb090ff, r0: 0.3, r1: 2.2, life: 0.3 });
          this.game.fx.puff(fx, 8, 0x6a5aa0, 0.6); this.game.shake(0.35); audio.play('plungeLand', { pitch: 0.7 });
          if (this.inFront(0.2, 2.9)) this.strike(2);
        }
        if (this.t > 0.3) this.setState('recover');
        break;
      case 'recover': this.steer(0, 0, dt, 20); if (this.t > 1.1) this.setState('chase'); break;
    }
  }
  animate(dt) {
    const t = this.game.time + this.seed, s = this.state;
    let pose;
    const guard = { shoulderL: [-1.15, 0, -0.1], elbowL: [-0.4, 0, 0], shoulderR: [-0.3, 0, -0.3], elbowR: [-0.8, 0, 0], handR: [1.2, 0, 0] };
    if (s === 'raise') pose = { ...guard, shoulderR: [-3.0, 0, -0.2], elbowR: [-0.3, 0, 0], handR: [0.8, 0, 0], spine: [-0.25, 0.3, 0], legL: [-0.3, 0, 0], legR: [0.3, 0, 0] };
    else if (s === 'slam') pose = { ...guard, shoulderR: [-1.2, 0, 0.1], elbowR: [0, 0, 0], handR: [0.5, 0, 0], spine: [0.5, -0.2, 0], legL: [-0.6, 0, 0], kneeL: [0.6, 0, 0], legR: [0.4, 0, 0] };
    else if (s === 'recover') pose = { shoulderR: [-1.0, 0, 0.1], elbowR: [0, 0, 0], handR: [0.6, 0, 0], spine: [0.55, -0.2, 0], shoulderL: [-0.3, 0, 0.4], elbowL: [-0.3, 0, 0], legL: [-0.5, 0, 0], kneeL: [0.6, 0, 0] };
    else if (s === 'stunned') pose = { spine: [-0.3, 0, Math.sin(t * 5) * 0.15], shoulderL: [0, 0, 0.5], shoulderR: [0, 0, -0.5], elbowL: [0, 0, 0], elbowR: [0, 0, 0], head: [0.3, 0, Math.sin(t * 5) * 0.2] };
    else {
      const sp = Math.hypot(this.vel.x, this.vel.z), a = Math.sin(t * 6) * Math.min(1, sp / 2);
      pose = { ...guard, spine: [0.1, 0, 0], legL: [-a * 0.5, 0, 0], legR: [a * 0.5, 0, 0], kneeL: [Math.max(0, a) * 0.5, 0, 0], kneeR: [Math.max(0, -a) * 0.5, 0, 0] };
      if (this.blockT > 0) pose.shoulderL = [-1.4, 0, -0.2];
    }
    this.rig.apply(pose, 1 - Math.exp(-dt * (s === 'slam' ? 30 : 10)));
  }
}

export const ENEMIES = { scarecrow: Scarecrow, cultist: Cultist, skull: Skull, bat: Bat, knight: Knight };
export function spawn(game, kind, pos, o) { return new ENEMIES[kind](game, pos, o); }
