// Scripted test bots, run from the browser console on ?autostart&debug:
//   const bot = await import('/test/bot.js'); bot.dragonSetup(); bot.dragonRun(600) ...
import { input } from '../src/core/input.js';
const g = () => window.game;
const held = new Set();
export function step(keys = []) {
  for (const k of keys) if (!held.has(k)) { input.forceDown(k); held.add(k); }
  for (const k of [...held]) if (!keys.includes(k)) { input.forceUp(k); held.delete(k); }
  g().debugStep(1, 1 / 60, []);
}
export const B = { log: [], hits: 0, parries: 0, f: 0, lastState: '' };

export function dragonSetup({ phase = 1, hp = 12 } = {}) {
  const game = g(), z = game.zones.castle;
  if (game.zone !== 'castle') game.enterCastle();
  z.face.open(); game.debugStep(150, 1 / 60, []);
  const A = z.arena, c = A.center;
  game.tp(c.x - A.fwd.x * 8, c.y + 0.5, c.z - A.fwd.z * 8, Math.atan2(A.fwd.x, A.fwd.z));
  game.debugStep(250, 1 / 60, []);
  const d = game.dragon; d.hp = hp; d.phase = phase;
  if (phase === 3) d.set('enrage');
  B.lastHp = game.player.hp;
  const op = game.onParry; game.onParry = (h, pl) => { B.parries++; return op(h, pl); };
}

export function dragonRun(n) {
  const game = g(), p = game.player, c = game.zones.castle.arena.center;
  for (let i = 0; i < n; i++, B.f++) {
    const d = game.dragon;
    if (p.hp < B.lastHp) B.hits++; if (p.hp <= 2) p.hp = 5; B.lastHp = p.hp;
    if (p.dead) return 'dead';
    const keys = [], st = d.state;
    if (st !== B.lastState) { B.lastState = st; B.log.push(`${B.f}:${st}:hp${d.hp}:ph${d.phase}`); }
    const head = d.target.pos;
    const fb = game.projectiles.find(o => o.kind === 'fireball' && !o.reflected && o.gravity === 0 && o.pos.distanceTo(p.pos.clone().setY(p.pos.y + 0.9)) < 1.6 + o.vel.length() * 0.12);
    const ring = game.projectiles.find(o => o.maxR && Math.abs(Math.hypot(p.pos.x - o.c.x, p.pos.z - o.c.z) - o.r) < 1.6);
    const beam = game.projectiles.find(o => o.dur && o.a !== undefined);
    let beamNear = false;
    if (beam) { let da = Math.atan2(p.pos.z - beam.c.z, p.pos.x - beam.c.x) - beam.a; da = Math.atan2(Math.sin(da), Math.cos(da)); beamNear = Math.abs(da) < 0.35; }
    if (fb) { p.yaw = Math.atan2(fb.pos.x - p.pos.x, fb.pos.z - p.pos.z); keys.push('ShiftLeft'); }
    else if ((ring || beamNear) && p.grounded) keys.push('Space');
    else if (st === 'stunned' || st === 'tired') {
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw), dh = Math.hypot(head.x - p.pos.x, head.z - p.pos.z);
      const tgt = dh < 3.5 ? head : { x: head.x + fx * 1.5, z: head.z + fz * 1.5 };
      p.cam.yaw = Math.atan2(tgt.x - p.pos.x, tgt.z - p.pos.z) + Math.PI; p.cam.idle = 0;
      if (dh > 2.3) keys.push('KeyW'); else { p.yaw = Math.atan2(head.x - p.pos.x, head.z - p.pos.z); if (B.f % 10 < 5) keys.push('Mouse0'); }
    } else {
      const dx = p.pos.x - d.pos.x, dz = p.pos.z - d.pos.z, dd = Math.hypot(dx, dz), fromC = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      if (dd < 8 && fromC < 15) { p.cam.yaw = Math.atan2(-dx, -dz) + Math.PI; keys.push('KeyW'); }
      else if (fromC > 14) { p.cam.yaw = Math.atan2(c.x - p.pos.x, c.z - p.pos.z) + Math.PI; keys.push('KeyW'); }
    }
    step(keys);
    if (!d.alive && d.t > 3.5) return 'won';
  }
  return 'running';
}

// ---- input-only movement helpers (camera yaw stands in for the mouse)
const look = (to) => { const p = g().player; p.cam.yaw = Math.atan2(p.pos.x - to.x, p.pos.z - to.z); p.cam.idle = 0; };
export function walkTo(to, maxT = 500) {
  const p = g().player;
  for (let t = 0; t < maxT; t++) { const hd = Math.hypot(to.x - p.pos.x, to.z - p.pos.z); if (hd < 0.6) break; look(to); step(['KeyW']); }
  step([]);
}
// run-up jump toward `to`; double-jumps at the apex if still short
export function jumpTo(toF, { double = 'auto' } = {}) {
  const p = g().player; let phase = 0, t = 0;
  const T = () => typeof toF === 'function' ? toF() : toF;
  for (; t < 260; t++) {
    const to = T(), hd = Math.hypot(to.x - p.pos.x, to.z - p.pos.z);
    look(to);
    const keys = hd > 0.3 ? ['KeyW'] : [];
    if (phase === 0 && t > 1) phase = 1;
    if (phase === 1) { keys.push('Space'); if (double && !p.grounded && p.vel.y < 1.2 && (double === true || to.y - p.pos.y > 0.2 || hd > 2.6)) phase = 2; }
    else if (phase === 2) phase = 3;
    else if (phase === 3) keys.push('Space');
    step(keys);
    if (t > 15 && p.grounded && hd < 1.5) break;
    if (p.pos.y < to.y - 8) break;
  }
  step([]);
  const to = T();
  return { ok: p.pos.distanceTo(to) < 2.2 && p.grounded && p.pos.y > to.y - 0.6, at: p.pos.toArray().map(v => +v.toFixed(1)), dj: phase === 3, hp: p.hp };
}

// ---- the Spiral Spire, as a resumable list of segments (run a few per call)
export function spireSegments() {
  const T3 = g().THREE, p = g().player;
  const P = (a, r, y) => new T3.Vector3(40 + Math.cos(a * Math.PI / 180) * r, y, -782 + Math.sin(a * Math.PI / 180) * r);
  const movers = g().props.list.filter(x => x.pf && x.path);
  const near = (q) => movers.reduce((b, m) => m.mesh.position.distanceTo(q) < b.mesh.position.distanceTo(q) ? m : b);
  const top = (m) => () => m.mesh.position.clone().setY(m.mesh.position.y + 0.25);
  const wait = (fn, max = 600) => { for (let t = 0; t < max && !fn(); t++) step([]); };
  const J = (name, to) => () => { const r = jumpTo(to); return [name, r]; };
  const W = (name, to) => () => { walkTo(to); return [name, { ok: p.pos.distanceTo(to) < 2.5 }]; };
  const segs = [];
  segs.push(() => { g().player.teleport(P(80, 12.5, 0.3), 0); for (let i = 0; i < 10; i++) step([]); return ['start', { ok: true }]; });
  for (const [a, y] of [[48, 1.2], [34, 2.4], [20, 3.6], [6, 4.8], [-9, 5.6]]) segs.push(J('step' + a, P(a, 13.2, y)));
  segs.push(() => { const m = near(P(-37, 13.2, 5.35)); wait(() => m.mesh.position.distanceTo(P(-24, 13.2, 5.35)) < 1); const r = jumpTo(top(m)); if (!r.ok) return ['mover1', r]; wait(() => m.mesh.position.distanceTo(P(-50, 13.2, 5.35)) < 1.2); return ['mover1', r]; });
  segs.push(J('ledge-64', P(-64, 13.2, 5.8)));
  const pendWalk = (name, pendAngles, from, to, y) => () => {
    const pends = g().props.list.filter(x => x.arm);
    const ang = (q) => Math.atan2(q.pivot.z + 782, q.pivot.x - 40) * 180 / Math.PI;
    walkTo(P(from, 13.2, y));
    for (const a of pendAngles) {
      const pd = pends.reduce((b, q) => Math.abs(ang(q) - ((a + 540) % 360 - 180)) < Math.abs(ang(b) - ((a + 540) % 360 - 180)) ? q : b);
      walkTo(P(a + 7, 13.2, y));
      wait(() => Math.abs(Math.sin(pd.t * pd.speed + pd.ph)) > 0.97, 400);
      walkTo(P(a - 6, 13.2, y));
    }
    walkTo(P(to, 13.2, y));
    return [name, { ok: p.pos.y > y - 0.5, hp: p.hp }];
  };
  segs.push(pendWalk('pendulums', [-86, -99, -112], -74, -124, 6));
  for (const [a, y] of [[-134, 6.8], [-146, 7.8], [-158, 8.8], [-170, 9.8], [-184, 10.6]]) segs.push(J('crumble' + a, P(a, 13.2, y)));
  segs.push(W('landingA', P(-226, 11.4, 10.6)));
  segs.push(J('disc1', P(-238, 8.9, 11.45)));
  segs.push(J('disc2', P(-258, 6.6, 12.15)));
  for (const [a, y] of [[-276, 12.6], [-304, 14.2], [-332, 15.8], [-360, 17.4], [-388, 19], [-416, 20.6]]) segs.push(J('pillar' + a, P(a, 4.6, y)));
  segs.push(() => { const m = near(P(-432, 9, 21)); wait(() => m.mesh.position.distanceTo(P(-432, 6.0, 21)) < 0.8); const r = jumpTo(top(m)); if (!r.ok) return ['radial', r]; wait(() => m.mesh.position.distanceTo(P(-432, 12.4, 21)) < 0.8); return ['radial', r]; });
  segs.push(J('padLedge', P(-442, 13.2, 21.6)));
  segs.push(() => { walkTo(P(-442, 13.2, 21.6)); let fired = false; for (let t = 0; t < 140; t++) { const to = fired ? P(-458, 13.2, 28.4) : P(-442, 13.2, 21.6); p.cam.yaw = Math.atan2(p.pos.x - to.x, p.pos.z - to.z); step(Math.hypot(to.x - p.pos.x, to.z - p.pos.z) > 0.4 && (!fired || p.pos.y > 24) ? ['KeyW'] : []); if (p.vel.y > 15) fired = true; if (fired && t > 30 && p.grounded) break; } return ['bounce', { ok: p.pos.y > 27.5 }]; });
  for (const [a, y] of [[-472, 29.4], [-486, 30.4], [-500, 31.4], [-514, 32.4]]) segs.push(J('steps' + a, P(a, 13.2, y)));
  segs.push(W('landingB', P(-556, 12.6, 32.4)));
  for (const a of [-566, -582, -598]) segs.push(() => { const m = near(P(a, 11, 40)); wait(() => { const y = top(m)().y; return y < p.pos.y + 0.6 && y > p.pos.y - 1.5; }, 600); const r = jumpTo(top(m)); if (!r.ok) return ['elev' + a, r]; wait(() => m.mesh.position.y > (a === -598 ? 45.0 : -1) && (a !== -598 || true), a === -598 ? 600 : 1); if (a !== -598) { let up = 0; for (let t = 0; t < 400; t++) { const y0 = m.mesh.position.y; step([]); if (m.mesh.position.y < y0 && t > 10) break; } } return ['elev' + a, r]; });
  segs.push(J('ledge-614', P(-614, 13.2, 45.6)));
  segs.push(pendWalk('pendulums2', [-632, -644], -622, -654, 46));
  for (const [a, y] of [[-664, 47.4], [-678, 48.8], [-692, 50.2], [-706, 51.6], [-716, 52.4]]) segs.push(J('final' + a, P(a, 13.2, y)));
  segs.push(W('door', P(-740, 18, 52.4)));
  return segs;
}

// ---- fight the new dragon with keys only (dodge breath, parry, punish openings)
export function newDragonRun(n) {
  const game = g(), p = game.player, c = game.zones.castle.arena.center;
  const S = (B.nd ||= { f: 0, log: [], hits: 0, last: p.hp, state: '', shield: 0, parries: 0 });
  for (let i = 0; i < n; i++, S.f++) {
    const d = game.dragon; if (!d) { step([]); continue; }
    if (p.hp < S.last) S.hits++; if (p.hp <= 2) p.hp = 5; S.last = p.hp;
    if (d.state !== S.state) { S.state = d.state; S.log.push(`${S.f}:${d.state}:hp${d.hp}`); }
    const keys = [];
    let tti = 9;
    for (const o of game.projectiles) if (o.kind === 'fireball' && !o.reflected && o.gravity === 0) tti = Math.min(tti, o.pos.distanceTo(p.pos.clone().setY(p.pos.y + 0.9)) / Math.max(1, o.vel.length()));
    const toD = p.pos.clone().sub(d.pos).setY(0), dist = toD.length();
    const head = d.target.pos;
    if (S.shield > 0) { S.shield -= 1 / 60; keys.push('Mouse2'); }
    else if (tti < 0.2) { S.shield = 0.35; keys.push('Mouse2'); }
    else if (d.stream.on) {
      // run sideways around the dragon, away from the chasing aim point
      const side = new (game.THREE.Vector3)(-toD.z, 0, toD.x).normalize();
      const aimSide = Math.sign(side.dot(d.aim.clone().sub(p.pos))) || 1;
      const go = p.pos.clone().addScaledVector(side, -aimSide * 5);
      p.cam.yaw = Math.atan2(p.pos.x - go.x, p.pos.z - go.z); p.cam.idle = 0; keys.push('KeyW');
    } else if (d.vulnerable) {
      const dh = Math.hypot(head.x - p.pos.x, head.z - p.pos.z);
      p.cam.yaw = Math.atan2(p.pos.x - head.x, p.pos.z - head.z); p.cam.idle = 0;
      if (dh > 2.4) keys.push('KeyW'); else if (S.f % 10 < 5) keys.push('Mouse0');
    } else if (d.state === 'tail' && d.t > 0.45 && d.t < 1.15 && p.grounded) keys.push('Space');
    else if (d.state === 'strafe') {
      const side = new (game.THREE.Vector3)(-d.runTo.z + d.runFrom.z, 0, d.runTo.x - d.runFrom.x).normalize();
      const go = p.pos.clone().addScaledVector(side, 5); p.cam.yaw = Math.atan2(p.pos.x - go.x, p.pos.z - go.z); keys.push('KeyW');
    } else if (dist < 7 && d.fly < 0.5) { p.cam.yaw = Math.atan2(-toD.x, -toD.z); keys.push('KeyW'); }
    else if (p.pos.distanceTo(c) > 15) { p.cam.yaw = Math.atan2(p.pos.x - c.x, p.pos.z - c.z); keys.push('KeyW'); }
    step(keys);
    if (!d.alive && d.t > 3.5) return 'won';
    if (p.dead) return 'dead';
  }
  return 'running';
}
