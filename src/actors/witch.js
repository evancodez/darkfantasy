// Hexwhisker the Cat-Witch — the mini-boss of the Witch Ring. She circles on
// her broom lobbing potions (green fire puddles) and casting hexes. A parried
// hex knocks her off the broom; while she's dizzy on the ground, strike!
// Three falls and she's done. This fight teaches the parry for the dragon.
import * as THREE from 'three';
import { Lights } from '../core/retro.js';
import { Orb } from './enemies.js';
import * as Models from './models.js';
import audio from '../sound.js';

const PI = Math.PI;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const R = Math.random;

export class Puddle {
  constructor(game, pos, r = 1.7, life = 3.2, hot = false) {
    this.game = game; this.pos = pos.clone(); this.r = r; this.life = life; this.age = 0; this.hot = hot;
    this.light = Lights.add(pos.clone().setY(pos.y + 0.5), hot ? 0xff6020 : 0x40ff60, 1.6, 5, { dynamic: true });
    game.projectiles.push(this);
    game.fx.rings.add(pos, { color: hot ? 0xff7030 : 0x40ff60, r0: 0.3, r1: r, life: 0.3 });
  }
  update(dt) {
    this.age += dt;
    const k = Math.min(1, (this.life - this.age) * 2);
    if (this.age > this.life) { this.removed = true; Lights.remove(this.light); return; }
    for (let i = 0; i < 2; i++) {
      const a = R() * PI * 2, d = Math.sqrt(R()) * this.r;
      this.game.fx.glow.emit({ pos: _a.set(this.pos.x + Math.cos(a) * d, this.pos.y + 0.1, this.pos.z + Math.sin(a) * d), vel: _b.set(0, 1.5 + R() * 1.5, 0), life: 0.45, size: 0.6 * k, size1: 0.05, color: this.hot ? 0xffd060 : 0x80ff60, color1: this.hot ? 0xff2a08 : 0x10a030, alpha: 0.9 });
    }
    this.light.intensity = 1.6 * k;
    const p = this.game.player;
    if (p && !p.dead && p.grounded && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.r * 0.85 && Math.abs(p.pos.y - this.pos.y) < 1)
      p.receive({ dmg: 1, from: this.pos, kind: 'fire', unblockable: true });
  }
}

export function setupWitch(game, center, onDefeat) {
  const W = {
    alive: true, pos: center.clone().add(new THREE.Vector3(0, 30, 0)), yaw: 0, radius: 0.7, height: 1.3, aimHeight: 0.7, noAim: true, stompable: false, big: true,
    state: 'hidden', t: 0, hp: 9, maxHp: 9, phase: 0, orbit: 0, cool: 2, fallDmg: 0, flash: 0, vel: new THREE.Vector3(), started: false, done: false,
  };
  const model = Models.witch();
  model.root.visible = false;
  game.outside.group.add(model.root);
  const rig = model.rig;
  const H = 4.6;
  const set = (s) => { W.state = s; W.t = 0; };
  const target = W;

  const begin = () => {
    const resumed = W.hp < W.maxHp;
    W.started = true; set('intro'); model.root.visible = true;
    if (!resumed) W.pos.copy(center).add(new THREE.Vector3(0, 16, -12));
    if (!game.targets.includes(target)) game.addTarget(target);
    audio.play('witchCackle'); audio.music('witch');
    game.hud.area('Hexwhisker', 'the cat-witch of the ring');
    game.hud.boss('Hexwhisker the Cat-Witch', 1);
    game.player.cam.focus = W.pos;
    setTimeout(() => W.started && game.hud.hint('Raise your SHIELD (Right Click / Shift) just before her purple hex hits — a PARRY sends it back and knocks her off the broom!', 7), 1800);
  };
  const reset = (full) => {
    // you fell: she heals. You wandered off: she keeps her wounds and waits.
    set('hidden'); W.started = false; game.hud.boss(null); game.player.cam.focus = null; audio.music('outside');
    if (full) { W.hp = W.maxHp; W.phase = 0; model.root.visible = false; game.removeTarget(target); }
    else W.pos.copy(center).add(new THREE.Vector3(0, 9, 0));
  };

  target.onHit = (hit) => {
    if (!W.alive) return 'ignored';
    if (W.state === 'dizzy') {
      W.hp -= 1; W.fallDmg += 1; W.flash = 1;
      audio.play('enemyHit');
      game.hud.boss('', W.hp / W.maxHp);
      if (W.hp <= 0) return die(), 'kill';
      if (W.fallDmg >= 3) remount();
      return 'hit';
    }
    if (hit.kind === 'reflect' || (hit.kind === 'sword' && W.state === 'swoop')) { knockDown(); return 'hit'; }
    return 'ignored';
  };
  target.onParried = () => { if (W.state === 'swoop') knockDown(); };

  function knockDown() {
    set('falling'); W.flash = 1; W.vel.set(0, 2, 0); W.fallDmg = 0;
    audio.play('witchFall'); game.shake(0.4); game.hitstop(0.1);
    game.fx.pop(W.pos, 0xa060ff, 16);
    game.hud.callout('Knocked down!', 'small');
    if (!W.hinted) { W.hinted = true; game.hud.hint('She is dizzy — strike now!', 3); }
  }
  function remount() { set('remount'); audio.play('witchCackle', { pitch: 1.15 }); W.phase = Math.min(2, W.phase + 1); W.cool = 1.2; }
  function die() {
    W.alive = false; set('dead'); game.removeTarget(target);
    audio.play('witchFall'); audio.play('enemyPop');
    game.hud.boss(null); game.player.cam.focus = null;
    game.flash(0.6, 0xc080ff); game.shake(0.6);
    game.fx.pop(W.pos.clone().setY(W.pos.y + 0.6), 0x40ff60, 30);
    game.props.burst(W.pos.clone().setY(W.pos.y + 0.8), 18);
    setTimeout(() => { model.root.visible = false; audio.music('outside'); onDefeat?.(); W.done = true; }, 900);
  }

  function castHex() {
    const from = W.pos.clone().add(new THREE.Vector3(Math.sin(W.yaw) * 0.6, 0.9, Math.cos(W.yaw) * 0.6));
    const to = game.player.pos.clone().setY(game.player.pos.y + 0.9);
    new Orb(game, from, to.sub(from).normalize().multiplyScalar(8 + W.phase), { owner: W, homing: 1.6, color: 0xc050ff, life: 6, reflectDmg: 0 });
    audio.play('orbCast');
  }
  function throwPotion(lead) {
    const p = game.player;
    const to = p.pos.clone().addScaledVector(p.vel.clone().setY(0), lead).add(new THREE.Vector3((R() - 0.5) * 2, 0, (R() - 0.5) * 2));
    const from = W.pos.clone().setY(W.pos.y + 0.8);
    const T = 1.0, g = 14;
    const v = to.clone().sub(from).divideScalar(T); v.y = (to.y - from.y) / T + 0.5 * g * T;
    new Orb(game, from, v, { owner: W, gravity: g, color: 0x60ff40, size: 0.8, kind: 'potion', life: 3, reflectDmg: 0,
      onImpact: (o) => new Puddle(game, new THREE.Vector3(o.pos.x, game.outside.groundAt(o.pos.x, o.pos.z), o.pos.z)) });
    audio.play('potionThrow');
  }

  const fight = {
    update(dt) {
      const p = game.player;
      W.flash = Math.max(0, W.flash - dt * 4);
      if (W.done) return;
      const d = Math.hypot(p.pos.x - center.x, p.pos.z - center.z);
      if (!W.started) {
        if (W.hp < W.maxHp && model.root.visible) { model.root.position.copy(W.pos).setY(W.pos.y + Math.sin(game.time * 2) * 0.4); model.root.rotation.y += dt; }
        if (d < 12.5 && !p.dead) { begin(); if (W.hp < W.maxHp) game.hud.boss('Hexwhisker the Cat-Witch', W.hp / W.maxHp); }
        return;
      }
      if (W.alive && (d > 36 || p.dead)) { reset(p.dead); return; }
      W.t += dt;
      const toP = _a.copy(p.pos).sub(W.pos);
      const faceP = Math.atan2(toP.x, toP.z);
      const turn = (y, k = 6) => { let dd = y - W.yaw; while (dd > PI) dd -= PI * 2; while (dd < -PI) dd += PI * 2; W.yaw += dd * (1 - Math.exp(-dt * k)); };
      const orbitPos = (o, h = H) => _b.set(center.x + Math.cos(o) * 9, center.y + h + Math.sin(game.time * 2) * 0.35, center.z + Math.sin(o) * 9);
      switch (W.state) {
        case 'intro': {
          W.pos.lerp(orbitPos(W.orbit), 1 - Math.exp(-dt * 1.6)); turn(faceP);
          if (W.t > 2.2) set('circle');
          break;
        }
        case 'circle': {
          W.orbit += dt * (0.5 + W.phase * 0.15);
          W.pos.lerp(orbitPos(W.orbit), 1 - Math.exp(-dt * 3)); turn(faceP);
          W.cool -= dt;
          if (W.cool <= 0) {
            const roll = R();
            if (W.phase >= 1 && roll < 0.3) set('swoopAim');
            else if (roll < 0.62) set('hexWind');
            else set('potion');
          }
          break;
        }
        case 'hexWind':
          turn(faceP, 10); W.pos.lerp(orbitPos(W.orbit), 1 - Math.exp(-dt * 3));
          if (R() < 0.7) game.fx.glow.emit({ pos: W.pos.clone().setY(W.pos.y + 1.2), life: 0.25, size: 0.5 + W.t, size1: 0.1, color: 0xc050ff });
          if (W.t > 0.75) {
            castHex();
            if (W.phase === 2) setTimeout(() => W.alive && W.state === 'circle' && castHex(), 450);
            W.cool = 2.0 - W.phase * 0.3; set('circle');
          }
          break;
        case 'potion':
          turn(faceP, 10); W.pos.lerp(orbitPos(W.orbit), 1 - Math.exp(-dt * 3));
          if (W.t > 0.45 && !W.thrown) {
            W.thrown = true;
            const n = 1 + W.phase;
            for (let i = 0; i < n; i++) setTimeout(() => W.alive && throwPotion(0.4 + i * 0.25), i * 260);
          }
          if (W.t > 1.0) { W.thrown = false; W.cool = 1.6 - W.phase * 0.2; set('circle'); }
          break;
        case 'swoopAim':
          turn(faceP, 10); W.pos.y += dt * 1.5;
          if (W.t < 0.1) audio.play('witchCackle', { pitch: 1.3 });
          if (W.t > 0.7) { W.swoopFrom = W.pos.clone(); W.swoopTo = p.pos.clone().setY(p.pos.y + 0.9); set('swoop'); W.hit = false; }
          break;
        case 'swoop': {
          const k = Math.min(1, W.t / 0.9);
          const dir = _b.copy(W.swoopTo).sub(W.swoopFrom);
          W.pos.copy(W.swoopFrom).addScaledVector(dir, k * 2);
          W.pos.y = THREE.MathUtils.lerp(W.swoopFrom.y, W.swoopTo.y, Math.sin(k * PI));
          turn(Math.atan2(dir.x, dir.z), 12);
          if (!W.hit && W.pos.distanceTo(_a.copy(p.pos).setY(p.pos.y + 0.9)) < 1.3) { W.hit = true; p.receive({ dmg: 1, from: W.pos.clone(), kind: 'melee', source: target }); }
          if (k >= 1) { W.orbit = Math.atan2(W.pos.z - center.z, W.pos.x - center.x); W.cool = 1.5; set('circle'); }
          break;
        }
        case 'falling':
          W.vel.y -= 20 * dt; W.pos.addScaledVector(W.vel, dt);
          W.pos.x += (center.x + Math.cos(W.orbit) * 5 - W.pos.x) * dt * 2; W.pos.z += (center.z + Math.sin(W.orbit) * 5 - W.pos.z) * dt * 2;
          { const gy = game.outside.groundAt(W.pos.x, W.pos.z); if (W.pos.y <= gy) { W.pos.y = gy; set('dizzy'); game.fx.puff(W.pos, 8, 0x6a5aa0, 0.6); game.shake(0.3);
            // a heart tumbles out of her satchel each time she falls
            if (game.player.hp < game.player.maxHp) game.props.heart(W.pos.clone().add(new THREE.Vector3(R() - 0.5, 0, R() - 0.5).setLength(1.6)));
          } }
          break;
        case 'dizzy':
          if (R() < dt * 14) game.fx.spark.emit({ pos: _a.set(W.pos.x + Math.cos(game.time * 8) * 0.5, W.pos.y + 1.7, W.pos.z + Math.sin(game.time * 8) * 0.5), life: 0.3, size: 0.4, size1: 0, color: 0xffe070 });
          if (W.t > 5.0) remount();
          break;
        case 'remount':
          W.pos.y += dt * 6; turn(faceP);
          if (W.t > 0.8) { W.orbit = Math.atan2(W.pos.z - center.z, W.pos.x - center.x); set('circle'); }
          break;
      }
      // pose
      model.root.position.copy(W.pos);
      model.root.rotation.y = W.yaw;
      const grounded = W.state === 'dizzy';
      rig.j.broom.rotation.x = grounded ? 0.1 : W.state === 'swoop' ? 0.35 : Math.sin(game.time * 2) * 0.06;
      rig.j.broom.rotation.z = grounded ? Math.sin(game.time * 5) * 0.2 : Math.sin(game.time * 1.3) * 0.08;
      rig.j.broom.position.y = grounded ? 0.15 : 0;
      const cast = W.state === 'hexWind' || W.state === 'potion';
      rig.j.armR.rotation.x = cast ? -2.6 : -1.0; rig.j.armL.rotation.x = cast ? -2.2 : -1.0;
      rig.j.tail.rotation.y = Math.sin(game.time * 3) * 0.5; rig.j.tail2.rotation.y = Math.sin(game.time * 3 - 1) * 0.6;
      rig.j.hat.rotation.z = Math.sin(game.time * 2.3) * 0.12 + (grounded ? 0.5 : 0);
      rig.j.head.rotation.z = grounded ? Math.sin(game.time * 6) * 0.3 : 0;
      rig.setFlash(W.flash > 0 ? W.flash : (W.state === 'swoopAim' || W.state === 'hexWind') && Math.sin(W.t * 40) > 0 ? 0.3 : 0);
      W.noAim = W.state !== 'dizzy';
    },
  };
  game.witchFight = fight;
  return fight;
}
