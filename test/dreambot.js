// Input-only bots for the Mirror Sea (run through tools/shot.mjs or the console):
//   const d = await import('/test/dreambot.js'); d.reef(); d.stair(); d.isle(); d.somnia(6000)
// Route bots keep Wick invulnerable (they test the climbing, not the fighting);
// the boss bot fights for real.
import { step, walkTo, jumpTo } from './bot.js';
const g = () => window.game;
const V = (x, y, z) => new (g().THREE.Vector3)(x, y, z);
const wait = (fn, max = 900) => { let t = 0; for (; t < max && !fn(); t++) step([]); return t < max; };
const look = (to) => { const p = g().player; p.cam.yaw = Math.atan2(p.pos.x - to.x, p.pos.z - to.z); p.cam.idle = 0; };
const godMode = () => { const p = g().player; p.invuln = 99; };

// bounce from jelly to jelly up to the coral crown: aim for the next one each
// time a bounce fires, hold JUMP for the big bounce, somersault if falling short
export function reef() {
  const game = g(), p = game.player, z = game.zones.dream, log = [];
  game.startAt('dream'); for (let i = 0; i < 10; i++) step([]);
  const J = z.jellies, top = (j) => j.pf.mesh.position.clone().setY(j.pf.mesh.position.y + 0.25);
  const targets = [...J.map(j => () => top(j)), () => z.spots.CORAL_TOP.clone()];
  p.teleport(top(J[0]).clone().add(V(4.5, 0, 3)).setY(0.2), 0); for (let i = 0; i < 10; i++) step([]);
  let idx = 0, dj = 0, prevVy = 0, t = 0;
  for (; t < 2400; t++) {
    godMode();
    const to = targets[idx](), hd = Math.hypot(to.x - p.pos.x, to.z - p.pos.z);
    look(to);
    const keys = hd > 0.35 ? ['KeyW'] : [];
    if (p.grounded && idx === 0 && t > 2 && t < 6) keys.length = 0;
    if (dj === 1) { dj = 2; }                                   // let go for a frame…
    else if (dj === 2) { dj = 3; keys.push('Space'); }          // …then somersault
    else keys.push('Space');
    if (!dj && !p.grounded && p.vel.y < -1 && (p.pos.y < to.y + 1.5) && hd > 1.2) dj = 1;
    step(keys);
    if (prevVy < 3 && p.vel.y > 15) {
      // a bounce: if it came off the jelly we were aiming at, aim for the next
      const on = J.findIndex(j => Math.hypot(j.home.x - p.pos.x, j.home.z - p.pos.z) < j.r + 0.8 && Math.abs(j.home.y - p.pos.y) < 2.5);
      if (on === idx) { log.push([`bounce ${idx}`, +p.pos.y.toFixed(1)]); idx++; }
      dj = 0;
    }
    if (p.grounded && !p.platform) dj = 0;
    prevVy = p.vel.y;
    if (window.__trace && idx >= 5 && t % 8 === 0 && log.length < 80) log.push([t, idx, p.pos.toArray().map(v => +v.toFixed(1)), +p.vel.y.toFixed(1), +hd.toFixed(1), dj, +to.y.toFixed(1)]);
    if (idx === targets.length - 1 && p.grounded && Math.abs(p.pos.y - to.y) < 0.6 && hd < 3) { log.push(['crown', true, p.pos.toArray().map(v => +v.toFixed(1))]); break; }
    if (p.pos.y < 0.3 && p.grounded && idx > 0) { log.push(['fell', idx, p.pos.toArray().map(v => +v.toFixed(1))]); break; }
  }
  for (let i = 0; i < 40; i++) step([]);
  log.push(['shards', game.shards, 'secs', +(t / 60).toFixed(1)]);
  return log;
}

// the lily pads, the hand, the dream-stair round the head, the crown
export function stair() {
  const game = g(), p = game.player, z = game.zones.dream, S = z.stairPts, log = [];
  game.startAt('dream'); for (let i = 0; i < 10; i++) step([]);
  p.teleport(V(-900 + 22, 0.2, -16), Math.PI); for (let i = 0; i < 10; i++) step([]);
  godMode();
  for (const q of [V(-900 + 20.5, 1.3, -20.8), V(-900 + 19.2, 2.8, -24.9), V(-900 + 19.6, 4.45, -30)]) { const r = jumpTo(q); log.push(['pad/palm', r.ok, r.at]); if (!r.ok) return log; }
  for (let i = 0; i < S.length; i++) {
    godMode();
    const q = S[i];
    if (z.PHASED.includes(i)) {
      const tile = z.phaseTiles.find(t => t.pos.distanceTo(q) < 0.5);
      wait(() => { godMode(); const t = (game.time / 3.2 + tile.phase) % 1; return t > 0.02 && t < 0.18; }, 400);
    }
    let r = jumpTo(() => q.clone());
    if (!r.ok && p.pos.y > q.y - 3) r = jumpTo(() => q.clone());
    log.push([`step ${i}`, r.ok, r.at]);
    if (!r.ok) return log;
    if (i === z.terrace) for (let t = 0; t < 30; t++) { godMode(); step([]); }
  }
  const r = jumpTo(z.spots.CROWN.clone());
  log.push(['crown', r.ok, r.at]);
  for (let i = 0; i < 40; i++) step([]);
  log.push(['shards', game.shards]);
  return log;
}

// up the falls, across the ledge, ride the manta, climb the pads round the pagoda
export function isle() {
  const game = g(), p = game.player, z = game.zones.dream, D = z.spots, log = [];
  game.startAt('dream'); for (let i = 0; i < 10; i++) step([]);
  p.teleport(D.UP1.clone().add(V(0, 0.2, 6)), Math.PI); for (let i = 0; i < 10; i++) step([]);
  godMode();
  walkTo(D.UP1, 300);
  const rose = wait(() => { godMode(); return p.pos.y > 12; }, 600);
  log.push(['updraft', rose, +p.pos.y.toFixed(1)]);
  for (let t = 0; t < 200; t++) { godMode(); look(D.LEDGE); step(['KeyW']); if (p.grounded && Math.hypot(p.pos.x - D.LEDGE.x, p.pos.z - D.LEDGE.z) < 3.5) break; }
  log.push(['ledge', p.grounded && Math.abs(p.pos.y - D.LEDGE.y) < 0.5, p.pos.toArray().map(v => +v.toFixed(1))]);
  walkTo(D.MA.clone().lerp(D.LEDGE, 0.45), 200);
  // the manta waits at the ledge for a moment: hop on then
  const m = z.manta, mtop = () => m.mesh.position.clone().setY(m.mesh.position.y + 0.22);
  wait(() => { godMode(); return mtop().distanceTo(D.MA) < 0.3; }, 1400);
  for (let i = 0; i < 20; i++) step([]);
  const r = jumpTo(mtop, { double: false });
  log.push(['board', r.ok && p.platform === m.pf, r.at]);
  if (p.platform !== m.pf) return log;
  const rode = wait(() => { godMode(); look(D.ISLE); return mtop().distanceTo(D.MB) < 0.3; }, 1400);
  log.push(['rode', rode, p.pos.toArray().map(v => +v.toFixed(1))]);
  for (let t = 0; t < 120; t++) { godMode(); look(D.ISLE); step(['KeyW']); if (p.grounded && !p.platform && Math.hypot(p.pos.x - D.ISLE.x, p.pos.z - D.ISLE.z) < 8) break; }
  log.push(['plateau', p.grounded && Math.abs(p.pos.y - D.ISLE.y) < 0.6, p.pos.toArray().map(v => +v.toFixed(1))]);
  // round the pagoda to the first pad's foot, then up
  walkTo(D.ISLE.clone().add(z.pads[0].clone().sub(D.ISLE).setY(0).normalize().multiplyScalar(5.6)), 300);
  for (const [i, q] of z.pads.entries()) { godMode(); const rr = jumpTo(q.clone()); log.push([`pad ${i}`, rr.ok, rr.at]); if (!rr.ok) return log; }
  const rr = jumpTo(D.SHARD3.clone()); log.push(['shard pad', rr.ok, rr.at]);
  for (let i = 0; i < 40; i++) step([]);
  log.push(['shards', game.shards]);
  return log;
}

// fight Somnia: parry the eye-orbs back into her, jump her dust rings, sidestep
// the swoop, and cut the eyes on her wings while she's down
export function somnia(n = 6000) {
  const game = g(), p = game.player, z = game.zones.dream, Q = z.somnia, A = z.spots.AR;
  const S = (g().__sb ||= { f: 0, log: [], hits: 0, last: p.hp, state: '', shield: 0, parries: 0, airslash: 0 });
  if (!S.started) {
    S.started = true; game.startAt('somnia'); for (let i = 0; i < 20; i++) step([]);
    walkTo(A.clone().add(V(0, 0, 6)), 400);
    const op = game.onParry; game.onParry = (h, pl) => { S.parries++; return op(h, pl); };
  }
  const go = (q, keys, stop = 0.8) => { look(q); if (Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > stop) keys.push('KeyW'); };
  for (let i = 0; i < n; i++, S.f++) {
    if (p.hp < S.last) S.hits++; if (p.hp <= 1) p.hp = 5; S.last = p.hp;
    if (Q.state !== S.state) { S.state = Q.state; S.log.push(`${S.f}:${Q.state}:${Q.eyes.map(e => e.hp).join('/')}`); }
    const keys = [];
    let tti = 9;
    for (const o of game.projectiles) if (!o.reflected && o.vel) tti = Math.min(tti, o.pos.distanceTo(p.pos.clone().setY(p.pos.y + 0.9)) / Math.max(1, o.vel.length()));
    const pd = Math.hypot(p.pos.x - A.x, p.pos.z - A.z);
    const ring = Q.rings.find(r => r.t >= 0 && r.r < pd + 0.2 && r.r > pd - 2.2);
    const moth = game.enemies.find(e => e.alive && e.kind === 'moth' && e.pos.distanceTo(p.pos) < 4.5);
    const eye = Q.state === 'grounded' && Q.eyes.filter(e => e.hp > 0).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
    if (S.shield > 0) { S.shield -= 1 / 60; keys.push('ShiftLeft'); }
    else if (tti < 0.22) { S.shield = 0.3; keys.push('ShiftLeft'); }
    else if (ring && p.grounded) keys.push('Space');
    else if (Q.state === 'swoop' && Q.pathLine.visible) {
      // step sideways out of the marked path
      const d = Q.swoopTo.clone().sub(Q.swoopFrom).setY(0).normalize(), off = p.pos.clone().sub(Q.swoopFrom).setY(0);
      const side = off.x * -d.z + off.z * d.x, to = p.pos.clone().add(V(-d.z, 0, d.x).multiplyScalar(side >= 0 ? 4 : -4));
      if (to.distanceTo(A) > 11) to.lerp(A, 0.6);
      if (Math.abs(side) < 4.5) go(to, keys, 0.2);
    }
    else if (eye) { go(eye.pos, keys, 1.4); if (eye.pos.distanceTo(p.pos) < 3 && S.f % 12 < 6) keys.push('Mouse0'); }
    else if (moth) { go(moth.pos, keys, 1.5); if (moth.pos.y > p.pos.y + 1.6) { if (p.grounded && S.f % 30 === 0) keys.push('Space'); else if (!p.grounded && S.f % 10 < 5) { keys.push('Mouse0'); S.airslash++; } } else if (S.f % 12 < 6) keys.push('Mouse0'); }
    else if (pd > 7) go(A, keys, 6);
    step(keys);
    if (Q.done || game.won) return { result: 'won', f: S.f, secs: +(S.f / 60).toFixed(1), hits: S.hits, parries: S.parries, airslash: S.airslash, log: S.log.slice(-40) };
    if (p.dead) return { result: 'dead', f: S.f, log: S.log.slice(-20) };
  }
  return { result: 'running', f: S.f, hits: S.hits, parries: S.parries, state: Q.state, eyes: Q.eyes.map(e => e.hp), log: S.log.slice(-25) };
}
