// Player controller + follow camera. Tuned for an arcade feel: quick
// acceleration, heavy gravity with a short hop when Jump is released early,
// coyote time and jump buffering, a somersault double jump, a three-hit combo,
// a mid-air plunge, head-stomps that refresh the double jump, and a shield
// whose first moments are a parry.
import * as THREE from 'three';
import { createCharacter, raycast } from '../core/physics.js';
import { input } from '../core/input.js';
import { buildHero, ATTACKS } from './hero.js';
import audio from '../sound.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export const TUNE = {
  speed: 7.4, guardSpeed: 2.4, accel: 62, decel: 46, airAccel: 30,
  gravity: 36, jumpCutGravity: 2.6, jumpV: 12.8, doubleV: 11.2, maxFall: 30,
  coyote: 0.12, buffer: 0.14, parry: 0.3, guardCooldown: 0.12,
};

export class Player {
  constructor(game, pos) {
    this.game = game;
    this.hero = buildHero();
    this.root = this.hero.root;
    game.scene.add(this.root);
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.char = createCharacter(0.36, 0.38, pos);
    this.maxHp = 5; this.hp = 5;
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.jumps = 0; this.jumpHeld = false;
    this.action = null; this.actionT = 0; this.queued = null; this.hitSet = new Set();
    this.guard = 0; this.guardT = 9; this.lastGuard = -9;
    this.invuln = 0; this.dead = false; this.landed = 0; this.airTime = 0; this.fallStartY = pos.y;
    this.safe = pos.clone(); this.safeT = 0; this.platform = null;
    this.stepT = 0; this.locked = false;
    this.trail = game.fx.trail(0x8ab0ff);
    this.flameGlow = game.glows.add(pos, 0x6aa0ff, 1.6);
    this.light = game.Lights.add(pos, 0x5a8aff, 0.9, 6, { dynamic: true });
    // camera
    this.cam = { yaw: 0, pitch: 0.3, dist: 6.6, target: pos.clone().add(new THREE.Vector3(0, 1.3, 0)), idle: 0, shake: 0, focus: null, ty: pos.y };
    this.teleport(pos, Math.PI);
  }

  teleport(p, yaw = this.yaw, nudge = false) {
    this.pos.copy(p); this.char.teleport(p);
    if (nudge) return;
    this.vel.set(0, 0, 0); this.yaw = yaw;
    this.cam.yaw = yaw + Math.PI; this.cam.target.copy(p).add(new THREE.Vector3(0, 1.3, 0)); this.cam.ty = p.y;
    this.safe.copy(p); this.action = null; this.platform = null;
  }

  get forward() { return _c.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // ------------------------------------------------------------- damage in
  // hit: {dmg, from: Vector3, kind, unblockable, source}
  receive(hit) {
    if (this.dead || this.invuln > 0 || this.game.cutscene) return 'ignored';
    const toSrc = _a.copy(hit.from).sub(this.pos).setY(0).normalize();
    const facing = Math.cos(Math.min(Math.PI, Math.abs(angDiff(this.yaw, Math.atan2(toSrc.x, toSrc.z)))));
    // projectiles get a wide shield arc; melee must be in front
    if (this.guard > 0.5 && !hit.unblockable && facing > (hit.kind === 'projectile' ? -0.2 : 0.2)) {
      if (this.guardT < TUNE.parry) {
        this.parryFlash = 0.25;
        this.game.onParry(hit, this);
        return 'parry';
      }
      this.vel.addScaledVector(toSrc, -5);
      audio.play('block');
      this.game.fx.sparks(_b.copy(this.pos).addScaledVector(toSrc, 0.6).setY(this.pos.y + 1), 8, 0xc0d0ff, 4);
      this.game.shake(0.15);
      return 'block';
    }
    this.hp = Math.max(0, this.hp - (hit.dmg || 1));
    this.invuln = 1.3;
    this.action = 'hurt'; this.actionT = 0; this.queued = null; this.guard = 0;
    // traps only nudge you (so a blade doesn't fling you off a ledge); foes knock you back
    const kb = hit.kind === 'hazard' || hit.kind === 'fire' ? 2.5 : 7.5;
    this.vel.copy(toSrc).multiplyScalar(-kb); this.vel.y = hit.kind === 'hazard' || hit.kind === 'fire' ? 4 : 6.5; this.grounded = false;
    audio.play('hurt');
    this.game.hurtFlash();
    this.game.shake(0.45);
    this.game.fx.sparks(_b.copy(this.pos).setY(this.pos.y + 1), 12, 0xff6a50, 5);
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  die() {
    if (this.dead) return;
    this.dead = true; this.action = null; this.vel.set(0, 0, 0);
    audio.play('die');
    this.game.onPlayerDeath();
  }

  revive(p, yaw) { this.dead = false; this.hp = this.maxHp; this.invuln = 2; this.teleport(p, yaw); }

  // ------------------------------------------------------------- main update
  update(dt) {
    const g = this.game, t = TUNE;
    const ctrl = !this.dead && !g.cutscene;
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryFlash = Math.max(0, (this.parryFlash || 0) - dt);
    if (this.action) this.actionT += dt;

    // --- input → wish direction (camera relative)
    let ix = 0, iz = 0;
    if (ctrl) {
      if (input.any('KeyW', 'ArrowUp')) iz += 1;
      if (input.any('KeyS', 'ArrowDown')) iz -= 1;
      if (input.any('KeyA', 'ArrowLeft')) ix -= 1;
      if (input.any('KeyD', 'ArrowRight')) ix += 1;
    }
    const cy = this.cam.yaw;
    const wish = (this._wish ||= new THREE.Vector3()).set(-Math.sin(cy) * iz + Math.cos(cy) * ix, 0, -Math.cos(cy) * iz - Math.sin(cy) * ix);
    const mag = Math.min(1, wish.length());
    if (mag > 0) wish.normalize();

    const jumpPressed = ctrl && input.anyPressed('Space');
    this.jumpHeld = ctrl && input.any('Space');
    const atkPressed = ctrl && input.anyPressed('Mouse0', 'KeyJ', 'KeyF');
    const guardHeld = ctrl && input.any('Mouse2', 'KeyK', 'ShiftLeft', 'ShiftRight');

    // --- guard
    const busy = this.action && this.action !== 'flip';
    if (guardHeld && this.grounded && !busy) {
      if (this.guard === 0) {
        if (g.time - this.lastGuard > t.guardCooldown) { this.guardT = 0; this.lastGuard = g.time; } else this.guardT = 9;
        audio.play('shieldUp', { volume: 0.6 });
      }
      this.guard = 1;
    } else this.guard = 0;
    this.guardT += dt;

    // --- attacks
    if (atkPressed) {
      if (!this.grounded && this.action !== 'plunge' && this.action !== 'hurt') this.startPlunge();
      else if (this.grounded && (!this.action || this.action === 'flip')) this.startAttack('atk1');
      else if (this.action === 'atk1' && this.actionT > 0.08) this.queued = 'atk2';
      else if (this.action === 'atk2' && this.actionT > 0.08) this.queued = 'atk3';
    }
    if (this.action && ATTACKS[this.action]) {
      const A = ATTACKS[this.action];
      if (this.queued && this.actionT > A.hit[1] + 0.02) { const q = this.queued; this.queued = null; this.startAttack(q); }
      else if (this.actionT >= A.dur) { this.action = null; this.queued = null; }
    }
    if (this.action === 'hurt' && this.actionT > 0.4) this.action = null;
    if (this.action === 'flip' && this.actionT > 0.45) this.action = null;
    if (this.action === 'plungeLand' && this.actionT > 0.34) this.action = null;

    // --- horizontal movement
    const attacking = this.action && ATTACKS[this.action];
    let maxS = t.speed * mag;
    if (this.guard) maxS = t.guardSpeed * mag;
    if (attacking || this.action === 'plungeLand' || this.action === 'hurt') maxS = 0;
    const tx = wish.x * maxS, tz = wish.z * maxS;
    // in the air, letting go brakes gently (so platform momentum carries you a bit)
    let acc = this.grounded ? (maxS > 0.1 ? t.accel : t.decel) : (mag > 0.1 ? t.airAccel : 9);
    if (this.action === 'hurt') acc = 4;
    if (attacking && this.grounded) acc = 22;
    if (this.action === 'plunge') acc = 0;
    const dx = tx - this.vel.x, dz = tz - this.vel.z, dl = Math.hypot(dx, dz);
    if (dl > 0) { const s = Math.min(dl, acc * dt) / dl; this.vel.x += dx * s; this.vel.z += dz * s; }
    // facing: with the shield up, snap toward the nearest threat
    const threat = this.guard ? this.threatYaw() : null;
    if (threat !== null) this.yaw += angDiff(this.yaw, threat) * (1 - Math.exp(-dt * 24));
    else if (mag > 0.1 && !attacking && this.action !== 'plunge' && this.action !== 'plungeLand' && this.action !== 'hurt') {
      const target = Math.atan2(wish.x, wish.z);
      this.yaw += angDiff(this.yaw, target) * (1 - Math.exp(-dt * (this.guard ? 6 : 16)));
    }

    // --- vertical
    if (this.grounded) { this.coyote = t.coyote; this.jumps = 0; } else this.coyote -= dt;
    this.jumpBuf = jumpPressed ? t.buffer : this.jumpBuf - dt;
    if (this.jumpBuf > 0 && ctrl && this.action !== 'plunge' && this.action !== 'plungeLand' && this.action !== 'hurt') {
      if (this.coyote > 0) {
        this.vel.y = t.jumpV; this.coyote = 0; this.jumpBuf = 0; this.grounded = false;
        // leaping off a moving platform carries its motion with you
        if (this.platform && dt > 0) {
          const d = this.platform.carry ? this.platform.carry(this.pos) : this.platform.delta;
          this.vel.x += d.x / dt; this.vel.z += d.z / dt; if (d.y > 0) this.vel.y += d.y / dt;
        }
        if (attacking) this.action = null;
        this.guard = 0;
        audio.play('jump');
        g.fx.puff(this.pos, 5, 0x5a5a90, 0.4);
      } else if (this.jumps < 1) {
        this.vel.y = t.doubleV; this.jumps = 1; this.jumpBuf = 0;
        this.action = 'flip'; this.actionT = 0;
        audio.play('doubleJump');
        g.fx.rings.add(this.pos, { color: 0x6a8aff, r0: 0.2, r1: 1.6, life: 0.3, y: 0.1 });
      }
    }
    let grav = t.gravity;
    if (this.vel.y <= 0 || this.grounded) this.noCut = false;
    if (this.vel.y > 0 && !this.jumpHeld && this.action !== 'hurt' && !this.noCut) grav *= t.jumpCutGravity;
    if (this.action === 'plunge') {
      if (this.actionT < 0.16) { this.vel.y = Math.max(this.vel.y * 0.5, 0.5); grav = 0; }
      else { this.vel.y = -34; grav = 0; }
    }
    this.vel.y = Math.max(-t.maxFall - (this.action === 'plunge' ? 6 : 0), this.vel.y - grav * dt);

    // --- moving platforms: carry the rider exactly (slide + spin) ourselves
    let carried = false;
    if (this.platform && this.grounded) {
      const d = this.platform.carry ? this.platform.carry(this.pos) : this.platform.delta;
      this.pos.add(d); this.char.teleport(this.pos); carried = true;
      if (this.platform.yawDelta) { this.yaw += this.platform.yawDelta; this.cam.yaw += this.platform.yawDelta; }
    }

    // --- collide & move
    const wasGrounded = this.grounded, vyBefore = this.vel.y;
    const desired = _b.copy(this.vel).multiplyScalar(dt);
    const wantH = Math.hypot(desired.x, desired.z);
    const r = this.char.move(desired, this.pos);
    if (carried) {
      // Rapier's controller adds its own partial push from moving platforms;
      // keep only the movement we asked for (it may shorten it, never lengthen it)
      const gotH = Math.hypot(r.moved.x, r.moved.z);
      if (gotH > wantH + 1e-4) {
        const k = wantH / gotH;
        this.pos.x -= r.moved.x * (1 - k); this.pos.z -= r.moved.z * (1 - k);
        this.char.teleport(this.pos);
      }
    }
    this.grounded = r.grounded && this.vel.y <= 0.5;
    if (r.hitCeiling && this.vel.y > 0) this.vel.y = 0;
    if (this.grounded) {
      const pg = r.platform || this.char.probeGround(this.pos, 0.3)?.platform || null;
      this.platform = pg;
      if (this.vel.y < 0) this.vel.y = -1;
    } else this.platform = null;
    // actual horizontal velocity after collision (stop sliding into walls)
    if (dt > 0 && r.wall) {
      // walls only ever slow you down (never let a push-out become speed)
      const want = Math.hypot(this.vel.x, this.vel.z) * dt, got = Math.hypot(r.moved.x, r.moved.z);
      if (want > 1e-4 && got < want) { const k = Math.max(0.2, got / want); this.vel.x *= k; this.vel.z *= k; }
    }

    // --- landing
    this.landed = 0;
    if (!wasGrounded && this.grounded) {
      const fall = Math.max(0, -vyBefore);
      this.landed = fall;
      if (this.action === 'plunge') this.plungeImpact();
      else if (fall > 6) { audio.play('land', { volume: Math.min(1, fall / 20) }); g.fx.puff(this.pos, 7, 0x5a5a90, 0.5); }
      if (this.action === 'flip') this.action = null;
    }
    if (!this.grounded) this.airTime += dt; else this.airTime = 0;

    // --- stomps (falling onto small enemies)
    if (!this.grounded && this.vel.y < 0 && !this.dead) {
      for (const e of g.targets) {
        if (!e.alive || !e.stompable) continue;
        const top = e.pos.y + e.height;
        const hd = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (hd < e.radius + 0.35 && this.pos.y < top + 0.35 && this.pos.y > top - 0.7) {
          const plunging = this.action === 'plunge';
          e.onStomp?.(this, plunging ? 2 : 1);
          this.vel.y = this.jumpHeld ? 14 : 10; this.jumps = 0;
          if (plunging) { this.action = null; this.plungeImpact(true); }
          audio.play('bounce', { volume: 0.7 });
          g.fx.rings.add(_b.copy(this.pos), { color: 0xffe080, r0: 0.3, r1: 1.4, life: 0.25 });
          g.hitstop(0.05);
          break;
        }
      }
    }

    // --- melee
    if (attacking) {
      const A = ATTACKS[this.action];
      if (this.actionT >= A.hit[0] && this.actionT <= A.hit[1]) this.meleeScan(this.action === 'atk3');
    }

    // --- safe ground & falling out of the world
    if (this.grounded && !this.platform) {
      this.safeT += dt;
      if (this.safeT > 0.4 && this.isSafeSpot()) { this.safe.copy(this.pos); this.safeT = 0; }
    }
    if (this.pos.y < g.killY() && !this.dead) {
      audio.play('fallVoid');
      this.hp -= 1;
      if (this.hp <= 0) { this.hp = 0; this.die(); }
      else { g.fadeFlash(); this.teleport(this.safe.clone().add(new THREE.Vector3(0, 0.2, 0)), this.yaw); this.invuln = 1.5; }
    }

    // --- footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hs > 2) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) { this.stepT = 2.1; audio.play('step', { volume: 0.35, pitch: 0.9 + Math.random() * 0.2 }); if (Math.random() < 0.5) g.fx.puff(this.pos, 1, 0x4a4a80, 0.3); }
    }

    // --- visuals
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const blink = this.invuln > 0 && !this.dead && Math.floor(this.invuln * 16) % 2 === 0;
    this.root.visible = !blink;
    this.hero.update(dt, {
      speed: this.grounded ? hs : 0, grounded: this.grounded, vy: this.vel.y, action: this.dead ? null : this.action, actionT: this.actionT,
      guard: this.guard, hpFrac: this.hp / this.maxHp, landed: this.landed, dead: this.dead,
    });
    this.hero.rig.setFlash(this.parryFlash > 0 ? this.parryFlash * 3 : 0);
    if (this.guard && this.guardT < t.parry && Math.random() < 0.6) g.fx.twinkle(this.hero.shield.getWorldPosition(_a), 0xfff0a0, 0.7);
    // sword trail + flame glow + carried light
    const tip = this.hero.swordTip(_b), base = this.hero.swordBase(_c);
    this.trail.update(dt, !!attacking && this.actionT < ATTACKS[this.action].hit[1] + 0.05 || this.action === 'plunge', base, tip);
    const fw = this.hero.flameWorld(_a);
    const hpk = this.hp / this.maxHp;
    g.glows.set(this.flameGlow, fw.setY(fw.y + 0.1), hpk > 0.34 ? 0x5a90ff : 0xff7a40, (0.9 + hpk * 0.9) * (this.root.visible ? 1 : 0));
    g.glows.dirty();
    this.light.pos.copy(fw); this.light.intensity = 0.4 + hpk * 0.6;
  }

  // direction of the most pressing threat: an incoming projectile, else the
  // boss the camera is tracking, else the nearest awake enemy
  threatYaw() {
    const g = this.game;
    let best = null, bd = 16;
    for (const o of g.projectiles) {
      if (!o.vel || !o.pos || o.reflected) continue;
      _c.copy(this.pos).setY(this.pos.y + 0.9).sub(o.pos);
      const d = _c.length();
      if (d < bd && _c.dot(o.vel) > 0) { bd = d; best = o.pos; }
    }
    if (!best && this.cam.focus && this.cam.focus.distanceTo(this.pos) < 32) best = this.cam.focus;
    if (!best) {
      let ed = 9;
      for (const e of g.enemies) { if (!e.alive || !e.pos || e.dormant) continue; const d = e.pos.distanceTo(this.pos); if (d < ed) { ed = d; best = e.pos; } }
    }
    return best ? Math.atan2(best.x - this.pos.x, best.z - this.pos.z) : null;
  }

  isSafeSpot() {
    // all four sides must have ground close below (not on an edge)
    for (const [ox, oz] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) {
      const d = raycast(_b.set(this.pos.x + ox, this.pos.y + 0.5, this.pos.z + oz), _c.set(0, -1, 0), 1.2);
      if (d === null) return false;
    }
    return !this.game.unsafeAt?.(this.pos);
  }

  startAttack(name) {
    this.action = name; this.actionT = 0; this.hitSet.clear(); this.guard = 0;
    // auto-aim: snap toward the best target in front
    const g = this.game;
    let best = null, bs = 1e9;
    for (const e of g.targets) {
      if (!e.alive || e.noAim) continue;
      _a.copy(e.pos).sub(this.pos); const d = Math.hypot(_a.x, _a.z);
      if (d > 4.2 || Math.abs(_a.y) > 2.5) continue;
      const ang = Math.abs(angDiff(this.yaw, Math.atan2(_a.x, _a.z)));
      if (ang > 1.9) continue;
      const score = d + ang * 1.5;
      if (score < bs) { bs = score; best = e; }
    }
    if (best) this.yaw = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
    const f = this.forward;
    const lunge = name === 'atk3' ? 4 : 3;
    this.vel.x = f.x * lunge; this.vel.z = f.z * lunge;
    audio.play(name === 'atk3' ? 'spin' : name === 'atk2' ? 'slash2' : 'slash1');
  }

  startPlunge() {
    this.action = 'plunge'; this.actionT = 0; this.hitSet.clear(); this.guard = 0;
    this.vel.x *= 0.2; this.vel.z *= 0.2;
    audio.play('plungeStart');
  }

  plungeImpact(fromStomp = false) {
    const g = this.game;
    this.action = fromStomp ? null : 'plungeLand'; this.actionT = 0;
    audio.play('plungeLand');
    g.shake(0.5);
    g.fx.rings.add(this.pos, { color: 0x8ab0ff, r0: 0.4, r1: 3.6, life: 0.35 });
    g.fx.puff(this.pos, 12, 0x6a6aa0, 0.6);
    g.fx.sparks(_a.copy(this.pos).setY(this.pos.y + 0.2), 10, 0xa0c0ff, 6);
    for (const e of g.targets) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < 3.2 + e.radius && Math.abs(e.pos.y - this.pos.y) < 2) e.onHit?.({ dmg: 2, from: this.pos, kind: 'plunge', dir: _b.copy(e.pos).sub(this.pos).setY(0).normalize() });
    }
    g.onPlunge?.(this.pos);
  }

  meleeScan(spin) {
    const g = this.game, f = this.forward;
    for (const e of g.targets) {
      if (!e.alive || this.hitSet.has(e)) continue;
      _a.copy(e.pos).sub(this.pos);
      const dy = _a.y; _a.y = 0;
      const d = _a.length();
      const reach = (spin ? 2.6 : 2.3) + e.radius;
      if (d > reach || dy > 2.2 || dy < -1.6 - e.height) continue;
      if (!spin && d > 0.5 && _a.normalize().dot(f) < 0.25) continue;
      this.hitSet.add(e);
      const dir = d > 0.01 ? _a.clone().normalize() : f.clone();
      const res = e.onHit?.({ dmg: spin ? 2 : 1, from: this.pos, kind: 'sword', dir, player: this });
      const hp = _b.copy(e.pos).setY(e.pos.y + Math.min(1.2, e.height * 0.6)).addScaledVector(dir, -e.radius * 0.6);
      if (res === 'blocked') { g.fx.sparks(hp, 10, 0xc0d0ff, 5); audio.play('knightClang'); g.hitstop(0.05); this.vel.addScaledVector(dir, -5); }
      else if (res !== 'ignored') { g.fx.hit(hp); g.hitstop(e.big ? 0.07 : 0.055); g.shake(0.18); }
    }
  }

  // ------------------------------------------------------------- camera
  updateCamera(dt, camera) {
    const c = this.cam, g = this.game;
    const [mx, my] = input.mouse();
    const wheel = input.wheel();
    // the mouse always wins; automatic framing only eases in after you let go
    if (mx || my || wheel) c.idle = 0; else c.idle += dt;
    c.yaw -= mx * 0.0026; c.pitch = THREE.MathUtils.clamp(c.pitch + my * 0.002, -0.3, 1.25);
    if (wheel) c.zoom = THREE.MathUtils.clamp((c.zoom ?? 1) + wheel * 0.0012, 0.6, 1.7);
    if (input.any('KeyQ')) { c.yaw += 2.4 * dt; c.idle = 0; }
    if (input.any('KeyE')) { c.yaw -= 2.4 * dt; c.idle = 0; }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const hint = !c.focus && g.zones[g.zone]?.camHint?.(this.pos, c);
    const ease = (k) => 1 - Math.exp(-dt * k);
    if (hint) {
      // level-authored framing (inside the spire: from the middle, looking out)
      if (c.idle > 1.2) { c.yaw += angDiff(c.yaw, hint.yaw) * ease(1.8); c.pitch += (hint.pitch - c.pitch) * ease(1.5); }
    } else if (c.focus) {
      // keep the boss in view, gently, unless you're steering the camera
      const want = Math.atan2(this.pos.x - c.focus.x, this.pos.z - c.focus.z);
      c.yaw += angDiff(c.yaw, want) * ease(c.idle > 0.8 ? 2.2 : 0.25);
    } else if (c.idle > 2.0 && hs > 3 && !this.guard) {
      // lazily swing behind the direction of travel
      const want = Math.atan2(-this.vel.x, -this.vel.z);
      const d = angDiff(c.yaw, want);
      if (Math.abs(d) < 2.4) c.yaw += d * ease(0.7 * hs / TUNE.speed);
    }
    // vertical: follow lazily while airborne so jumps don't bob the camera
    if (this.grounded || this.pos.y < c.ty - 1.5 || this.pos.y > c.ty + 3) c.ty += (this.pos.y - c.ty) * ease(this.grounded ? 8 : 3);
    const tgt = _a.set(this.pos.x, c.ty + 1.35, this.pos.z);
    c.target.lerp(tgt, ease(14));
    let dist = ((hint ? hint.dist : c.dist) + (c.focus ? 1.6 : 0)) * (c.zoom ?? 1);
    const dir = _b.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    // only static walls push the camera in (moving platforms and doors don't)
    const hit = raycast(c.target, dir, dist + 0.3, true);
    if (hit !== null) dist = Math.max(1.0, hit - 0.35);
    c.curDist = c.curDist === undefined ? dist : c.curDist + (dist - c.curDist) * ease(dist < c.curDist ? 22 : 3);
    camera.position.copy(c.target).addScaledVector(dir, c.curDist);
    if (c.shake > 0) {
      c.shake = Math.max(0, c.shake - dt * 2.2);
      const s = c.shake * c.shake * 0.5;
      camera.position.add(_c.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    const look = _c.copy(c.target);
    if (c.focus) look.lerp(c.focus, 0.2);
    camera.lookAt(look);
  }
}
