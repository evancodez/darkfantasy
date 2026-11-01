// Input-only bots for the Midnight Carnival (run through tools/shot.mjs or the console):
//   const f = await import('/test/fairbot.js'); f.carousel(); f.wheel(); f.highWire(); f.queen(5000)
import { step, walkTo, jumpTo } from './bot.js';
const g = () => window.game;
const V = (x, y, z) => new (g().THREE.Vector3)(x, y, z);
const wait = (fn, max = 900) => { let t = 0; for (; t < max && !fn(); t++) step([]); return t < max; };
const top = (m) => () => m.mesh.position.clone().setY(m.mesh.position.y + 0.15);
const near = (list, q) => list.reduce((b, m) => m.mesh.position.distanceTo(q) < b.mesh.position.distanceTo(q) ? m : b);

export function carousel() {
  const game = g(), p = game.player, z = game.zones.carnival, R = z.rides, H = z.spots.HUB, log = [];
  game.startAt('carnival');
  p.teleport(V(H.x + 12.5, 0.2, H.z), -Math.PI / 2); for (let i = 0; i < 20; i++) step([]);
  log.push(['onto T1', jumpTo(() => V(H.x + 8.4, 0.42, H.z).sub(H).setY(0).normalize().multiplyScalar(8.4).add(H).setY(0.42)).ok]);
  const tops = [0.42, 3.9, 7.4];
  for (let ti = 0, tries = 0; ti < 3; ti++) {
    const horses = R.horses[ti], base = tops[ti];
    // walk next to a horse on this deck, wait for it to dip, hop on, ride it up
    const h = near(horses, p.pos);
    let ok = false;
    for (let tries = 0; tries < 3 && !ok; tries++) {
      wait(() => top(h)().y < base + 1.3, 400);
      const r = jumpTo(top(h), { double: false });
      ok = r.ok && p.platform === h.pf;
      log.push([`horse T${ti + 1}`, ok, r.at]);
    }
    if (!ok) return log;
    wait(() => top(h)().y > base + 2.3, 400);
    const next = ti < 2 ? { r: [6.4, 4.25][ti], y: tops[ti + 1] } : { r: 2.1, y: 11.0 };
    const dest = () => { const d = p.pos.clone().sub(H).setY(0).normalize(); return H.clone().addScaledVector(d, next.r - 1.3).setY(next.y); };
    const r = jumpTo(dest);
    log.push([ti < 2 ? `deck T${ti + 2}` : 'crown', r.ok, r.at, r.dj]);
    // missed: if we're still on this deck, catch another horse and try again
    if (!r.ok) { if (++tries > 4 || Math.abs(p.pos.y - base) > 0.4) return log; ti--; }
  }
  for (let i = 0; i < 30; i++) step([]);
  log.push(['tickets', game.tickets]);
  return log;
}

export function wheel() {
  const game = g(), p = game.player, z = game.zones.carnival, R = z.rides, FW = z.spots.FW, log = [];
  game.startAt('carnival');
  p.teleport(V(FW.x + 0.5, 0.5, FW.z + 4.2), Math.PI); for (let i = 0; i < 20; i++) step([]);
  // a gondola sweeping in along the bottom (they travel +x down there)
  let gnd = null;
  wait(() => { gnd = R.gondolas.find(m => m.mesh.position.y < 1.6 && m.mesh.position.x > FW.x - 4 && m.mesh.position.x < FW.x - 1.5); return !!gnd; }, 2400);
  if (!gnd) return [['no gondola']];
  const r = jumpTo(top(gnd), { double: false });
  log.push(['board', r.ok && p.platform === gnd.pf, r.at]);
  if (p.platform !== gnd.pf) return log;
  wait(() => gnd.mesh.position.y > FW.y + 16 - 2.4 - 0.25 && gnd.mesh.position.x > FW.x - 1.2, 2400);
  const r2 = jumpTo(V(FW.x, 32.4, -22.9));
  log.push(['perch', r2.ok, r2.at, r2.dj]);
  for (let i = 0; i < 30; i++) step([]);
  log.push(['tickets', game.tickets]);
  return log;
}

export function highWire() {
  const game = g(), p = game.player, z = game.zones.carnival, R = z.rides, S = z.spots, HS = S.HS, log = [];
  game.startAt('carnival');
  p.teleport(V(HS.x - 8, 0.3, HS.z + 1), Math.PI / 2); for (let i = 0; i < 20; i++) step([]);
  walkTo(V(HS.x - 3.8, 0, HS.z + 0.5));
  for (let i = 1; i <= 36; i++) { const t = i / 36, a = Math.PI + t * 3 * Math.PI; walkTo(V(HS.x + Math.cos(a) * 3.8, 0, HS.z + Math.sin(a) * 3.8), 120); }
  log.push(['ramp top', +p.pos.y.toFixed(1)]);
  walkTo(V(45.4 + 900, 15, -8)); walkTo(V(S.P1.x, 15, S.P1.z), 300);
  log.push(['rope1 → P1', p.pos.y > 14.5 && p.pos.distanceTo(S.P1) < 1.6]);
  const tr = R.trapeze;
  for (const [k, raft] of R.rafts.entries()) {
    if (k === 2) wait(() => tr.mesh.position.x > 75.5 + 900, 600);       // leave for the last raft as the trapeze swings away
    const r = jumpTo(top(raft)); log.push([`raft${k + 1}`, r.ok, r.at]); if (!r.ok) return log;
  }
  wait(() => tr.mesh.position.x < 69.2 + 900, 600);
  const r = jumpTo(top(tr), { double: 'auto' });
  log.push(['trapeze', r.ok && p.platform === tr.pf, r.at]);
  if (p.platform !== tr.pf) return log;
  wait(() => tr.mesh.position.x > 75.8 + 900, 600);
  const r2 = jumpTo(V(S.P2.x, S.P2.y, S.P2.z));
  log.push(['P2', r2.ok, r2.at]);
  if (!r2.ok) return log;
  walkTo(V(S.P2.x, 17.2, 12.8)); walkTo(V(S.P3.x, 18, 23.6), 300);
  // the jack guards the perch: shield its pop, then cut it down
  const jack = game.enemies.find(e => e.kind === 'jack' && e.pos.distanceTo(S.P3) < 6);
  for (let t = 0; t < 600 && jack?.alive; t++) {
    const keys = [];
    const d = Math.hypot(jack.pos.x - p.pos.x, jack.pos.z - p.pos.z);
    p.cam.yaw = Math.atan2(p.pos.x - jack.pos.x, p.pos.z - jack.pos.z);
    if (jack.state === 'windup') keys.push('ShiftLeft');
    else if (jack.state === 'out' || jack.state === 'stunned') { if (d > 2.0) keys.push('KeyW'); else if (t % 12 < 6) keys.push('Mouse0'); }
    else if (d > 3.0) keys.push('KeyW');
    step(keys);
  }
  log.push(['jack', !jack?.alive, p.hp]);
  walkTo(V(82.4 + 900, 18, 27.6));
  for (let i = 0; i < 20; i++) step([]);
  log.push(['tickets', game.tickets]);
  for (let t = 0; t < 300 && !p.frozen; t++) { const L = z.cannon.load; p.cam.yaw = Math.atan2(p.pos.x - L.x, p.pos.z - L.z); step(['KeyW']); }
  log.push(['loaded', !!p.frozen || z.cannon.state !== 'idle']);
  wait(() => !p.frozen, 200);
  wait(() => p.grounded && p.vel.y <= 0 && p.pos.y < 2, 400);
  log.push(['landed', p.pos.toArray().map(v => +v.toFixed(1)), 'motes', game.motes]);
  return log;
}

// fight the Marionette Queen: parry stars, punish stuck hands and the planted crown, dodge the rest
export function queen(n = 6000) {
  const game = g(), p = game.player, z = game.zones.carnival, Q = z.queen, BT = z.spots.BT;
  const S = (g().__qb ||= { f: 0, log: [], hits: 0, last: p.hp, state: '', shield: 0, parries: 0 });
  if (!S.started) {
    S.started = true; game.startAt('queen'); for (let i = 0; i < 20; i++) step([]);
    walkTo(V(BT.x, 0, BT.z + 9), 400);
    const op = game.onParry; game.onParry = (h, pl) => { S.parries++; return op(h, pl); };
  }
  const go = (q, keys, stop = 0.8) => { p.cam.yaw = Math.atan2(p.pos.x - q.x, p.pos.z - q.z); p.cam.idle = 0; if (Math.hypot(q.x - p.pos.x, q.z - p.pos.z) > stop) keys.push('KeyW'); };
  const away = (q, keys, dist) => { const d = p.pos.clone().sub(q).setY(0); if (d.length() < dist) { const to = p.pos.clone().add(d.normalize().multiplyScalar(4)); const c = BT.clone(); if (to.distanceTo(c) > 12) to.lerp(c, 0.5); go(to, keys, 0.1); } };
  for (let i = 0; i < n; i++, S.f++) {
    if (p.hp < S.last) S.hits++; if (p.hp <= 1) p.hp = 5; S.last = p.hp;
    if (Q.state !== S.state) { S.state = Q.state; S.log.push(`${S.f}:${Q.state}:${(Q.arms.map(a => a.cut ? 'x' : a.hp).join('/'))}/${Q.headCut ? 'x' : Q.headHp}`); }
    const keys = [];
    let tti = 9;
    for (const o of game.projectiles) if (!o.reflected && o.vel) tti = Math.min(tti, o.pos.distanceTo(p.pos.clone().setY(p.pos.y + 0.9)) / Math.max(1, o.vel.length()));
    const stuckArm = Q.arms.find(a => !a.cut && (a.stuck > 0.2 || Q.state === 'stunned'));
    const foe = game.enemies.find(e => e.alive && e.kind === 'tin' && e.pos.distanceTo(p.pos) < 4);
    if (S.shield > 0) { S.shield -= 1 / 60; keys.push('ShiftLeft'); }
    else if (tti < 0.22) { S.shield = 0.3; keys.push('ShiftLeft'); }
    else if (Q.state === 'slamRaise' && Q.aim && Math.hypot(Q.aim.x - p.pos.x, Q.aim.z - p.pos.z) < 3.2) away(Q.aim, keys, 3.4);
    else if (Q.state === 'diveRise' && Q.aim) away(Q.aim, keys, 4);
    else if (Q.state === 'spin') away(Q.pos, keys, 6);
    else if ((Q.state === 'sweep' || Q.state === 'sweepWind') && Q.arm && Q.arm.H.distanceTo(p.pos) < 3.2 && p.grounded) keys.push('Space');
    else if (stuckArm) { const k = stuckArm.target.pos; go(k, keys, 1.6); if (Math.hypot(k.x - p.pos.x, k.z - p.pos.z) < 2.4 && S.f % 12 < 6) keys.push('Mouse0'); }
    else if (Q.phase === 2 && (Q.state === 'stuck' || Q.state === 'stunned')) { const k = Q.crownT.pos; go(k, keys, 1.6); if (Math.hypot(k.x - p.pos.x, k.z - p.pos.z) < 2.6 && S.f % 12 < 6) keys.push('Mouse0'); }
    else if (foe) { go(foe.pos, keys, 1.8); if (foe.pos.distanceTo(p.pos) < 2.6 && S.f % 12 < 6) keys.push('Mouse0'); }
    else { const d = Math.hypot(Q.pos.x - p.pos.x, Q.pos.z - p.pos.z); if (d < 5) away(Q.pos, keys, 5.5); }
    step(keys);
    if (Q.done || game.won) return { result: 'won', f: S.f, secs: +(S.f / 60).toFixed(1), hits: S.hits, parries: S.parries, log: S.log.slice(-40) };
    if (p.dead) return { result: 'dead', f: S.f, log: S.log.slice(-20) };
  }
  return { result: 'running', f: S.f, hits: S.hits, parries: S.parries, state: Q.state, log: S.log.slice(-25) };
}
