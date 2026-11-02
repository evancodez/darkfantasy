// Gameplay trailer recorder. Runs in the page (driven by tools/trailer.mjs in
// headless Chrome): plays scripted clips with real inputs, renders every frame
// deterministically, logs the game's sounds, then plays the frames back in real
// time while recording the canvas + the game's own audio with MediaRecorder.
import { input } from '../src/core/input.js';
import audio from '../src/sound.js';
import { Lights } from '../src/core/retro.js';
import { spawn } from '../src/actors/enemies.js';

const FPS = 30;
const g = () => window.game;
let T3, p;

// ---------------------------------------------------------------- input
const held = new Set();
function step(keys) {
  for (const k of keys) if (!held.has(k)) { input.forceDown(k); held.add(k); }
  for (const k of [...held]) if (!keys.includes(k)) { input.forceUp(k); held.delete(k); }
  g().debugStep(1, 1 / 60, []);
}
// steer: point the (input) camera at a target so W walks toward it
const steer = (to) => { p.cam.yaw = Math.atan2(p.pos.x - to.x, p.pos.z - to.z); p.cam.idle = 0; };
const P = (a, r, y) => new T3.Vector3(40 + Math.cos(a * Math.PI / 180) * r, y, -782 + Math.sin(a * Math.PI / 180) * r);

function* wait(n, keys = []) { for (let i = 0; i < n; i++) yield keys; }
function* walk(to, maxF = 120) { for (let i = 0; i < maxF; i++) { if (Math.hypot(to.x - p.pos.x, to.z - p.pos.z) < 0.7) return; steer(to); yield ['KeyW']; } }
function* jump(toF, { flip = 'auto', maxF = 70 } = {}) {
  const T = () => (typeof toF === 'function' ? toF() : toF);
  let phase = 0;
  for (let i = 0; i < maxF; i++) {
    const to = T(), hd = Math.hypot(to.x - p.pos.x, to.z - p.pos.z);
    steer(to);
    const keys = hd > 0.3 ? ['KeyW'] : [];
    if (phase === 0 && i > 0) phase = 1;
    if (phase === 1) { keys.push('Space'); if (!p.grounded && p.vel.y < (flip === true ? 4 : 1.2) && (flip === true || to.y - p.pos.y > 0.2 || hd > 2.6)) phase = 2; }
    else if (phase === 2) phase = 3;
    else if (phase === 3) keys.push('Space');
    yield keys;
    if (i > 8 && p.grounded && hd < 1.5) return;
  }
}
function* attack(targetF, n = 30) {
  for (let i = 0; i < n; i++) { const t = targetF(); if (!t) { yield []; continue; } steer(t); const d = Math.hypot(t.x - p.pos.x, t.z - p.pos.z); yield d > 2.0 ? ['KeyW'] : (i % 8 < 3 ? ['Mouse0'] : []); }
}
const nearest = (kind, r = 30) => g().enemies.filter(e => e.alive && e.kind === kind && e.pos.distanceTo(p.pos) < r).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];

// ---------------------------------------------------------------- camera
// a smoothed cinematic camera, independent of the steering camera
const cam = { pos: null, look: null, want: null };
function camFollow({ yaw = null, dist = 7, height = 2.6, lookUp = 1.2, lookAhead = 0 } = {}) {
  return () => {
    const y = yaw === null ? p.yaw + Math.PI : (typeof yaw === 'function' ? yaw() : yaw);
    const pos = new T3.Vector3(p.pos.x + Math.sin(y) * dist, p.pos.y + height, p.pos.z + Math.cos(y) * dist);
    const look = p.pos.clone().setY(p.pos.y + lookUp).add(new T3.Vector3(-Math.sin(y) * lookAhead, 0, -Math.cos(y) * lookAhead));
    return { pos, look };
  };
}
function camSpire(inner = false, dist = 9, height = 3.4) {
  return () => {
    const c = new T3.Vector3(40, 0, -782), d = p.pos.clone().sub(c).setY(0).normalize();
    const pos = inner ? p.pos.clone().addScaledVector(d, dist) : p.pos.clone().addScaledVector(d, -dist);
    pos.y = p.pos.y + height;
    return { pos, look: p.pos.clone().setY(p.pos.y + 1) };
  };
}
function camBoss(dist = 9, height = 3.2) {
  return () => {
    const d = g().dragon, target = d.headPos(new T3.Vector3());
    const dir = p.pos.clone().sub(d.pos).setY(0).normalize();
    const side = new T3.Vector3(-dir.z, 0, dir.x);
    const pos = p.pos.clone().addScaledVector(dir, dist).addScaledVector(side, 2.5); pos.y = p.pos.y + height;
    return { pos, look: p.pos.clone().setY(p.pos.y + 1.4).lerp(target, 0.45) };
  };
}
function installCamHook() {
  g().camHook = (camera, dt) => {
    if (!cam.want) return;
    const w = cam.want();
    if (!cam.pos) { cam.pos = w.pos.clone(); cam.look = w.look.clone(); }
    cam.pos.lerp(w.pos, 1 - Math.exp(-dt * 5)); cam.look.lerp(w.look, 1 - Math.exp(-dt * 7));
    camera.position.copy(cam.pos);
    if (cam.shake) camera.position.add(new T3.Vector3((Math.random() - 0.5) * cam.shake, (Math.random() - 0.5) * cam.shake, 0));
    camera.lookAt(cam.look);
  };
}

// ---------------------------------------------------------------- scene helpers
function clearProjectiles() {
  const game = g();
  for (const o of game.projectiles) { o.removed = true; o.mesh?.removeFromParent(); if (o.light) Lights.remove(o.light); }
  game.projectiles.length = 0;
  game.dragon?.stream.stop();
}
function settle(n = 20) { for (let i = 0; i < n; i++) step([]); }
const immune = (on) => { window.__immune = on; };
const witchT = () => g().targets.find(t => t.aimHeight === 0.7);
const ensureOutside = () => { if (g().zone !== 'outside') g().startAt('grounds'); };
const toArena = () => { g().startAt('dragon'); for (let i = 0; i < 6; i++) step([]); };

// ---------------------------------------------------------------- the clips
// each: { name, dur, setup(), script*() }
function clips() {
  const game = g();
  return [
    // ---- platforming inside the castle
    { name: 'spire-pillar', dur: 3.0, setup() {
        game.startAt('spire'); for (const e of game.enemies) { e.dormant = e.kind !== 'bat'; if (e.kind === 'bat') e.cool = 99; }
        game.player.teleport(P(-276, 4.6, 13.0), 0); settle(30); cam.want = camSpire(true, 7, 2.6);
      },
      *script() { for (const [a, y] of [[-304, 14.2], [-332, 15.8], [-360, 17.4], [-388, 19], [-416, 20.6]]) yield* jump(P(a, 4.6, y), { flip: true }); } },
    { name: 'spire-pendulums', dur: 3.0, setup() {
        game.startAt('spire'); for (const e of game.enemies) e.dormant = true;
        game.player.teleport(P(-76, 13.2, 6.3), 0); settle(20); cam.want = camFollow({ yaw: null, dist: 5.5, height: 2.0, lookUp: 1.3, lookAhead: 3 });
        const pends = game.props.list.filter(x => x.arm).slice(0, 3);
        this.pends = pends;
      },
      *script() {
        const ang = (q) => Math.atan2(q.pivot.z + 782, q.pivot.x - 40) * 180 / Math.PI;
        for (const a of [-86, -99, -112]) {
          const pd = this.pends.reduce((b, q) => Math.abs(ang(q) - a) < Math.abs(ang(b) - a) ? q : b);
          yield* walk(P(a + 6, 13.2, 6));
          for (let i = 0; i < 60 && Math.abs(Math.sin(pd.t * pd.speed + pd.ph)) < 0.93; i++) yield [];
          yield* walk(P(a - 6, 13.2, 6));
        }
        yield* walk(P(-124, 13.2, 6));
      } },
    // ---- the grounds
    { name: 'starway', dur: 3.0, setup() {
        game.startAt('grounds'); game.player.teleport(new T3.Vector3(0, 0.2, 44), Math.PI); settle(10);
        cam.want = camFollow({ yaw: () => 0.15, dist: 6.5, height: 1.6, lookUp: 3.2, lookAhead: 10 });
      },
      *script() { for (let i = 0; i < 100; i++) { steer(new T3.Vector3(Math.sin(i * 0.08) * 1.8, 0, p.pos.z - 10)); yield ['KeyW']; } } },
    { name: 'cornfield', dur: 4.2, setup() {
        ensureOutside();
        const pole = (x, z) => game.enemies.find(e => e.kind === 'scarecrow' && Math.hypot(e.home.x - x, e.home.z - z) < 1.5);
        this.sc = pole(-46, -6); const other = pole(-52, -14);
        game.player.teleport(new T3.Vector3(-46, 0.3, 5), Math.PI);
        for (const e of [this.sc, other]) if (e && e.alive) { e.dormant = false; e.setState('wake'); e.vel.y = 6; e.gravity = 30; }
        // over Wick's shoulder, high enough to see down the corn-lined path
        cam.want = () => { const sc = this.sc, dir = sc.pos.clone().sub(p.pos).setY(0).normalize(); return { pos: p.pos.clone().addScaledVector(dir, -5).add(new T3.Vector3(-dir.z * 1.6, 3.4, dir.x * 1.6)), look: p.pos.clone().lerp(sc.pos, 0.55).setY(p.pos.y + 1.3) }; };
      },
      *script() {
        const sc = this.sc; let shield = 0;
        for (let i = 0; i < 140; i++) {
          if (!sc.alive) { yield []; continue; }
          steer(sc.pos);
          const d = Math.hypot(sc.pos.x - p.pos.x, sc.pos.z - p.pos.z);
          if (shield > 0) { shield--; yield ['Mouse2']; continue; }
          if (sc.state === 'windup' && sc.t > 0.4) { shield = 12; yield ['Mouse2']; continue; }   // parry the swipe
          if (sc.state === 'stunned' || sc.state === 'recover') { yield d > 2.0 ? ['KeyW'] : (i % 8 < 3 ? ['Mouse0'] : []); continue; }
          yield d > 3.2 ? ['KeyW'] : [];
        }
      } },
    { name: 'graveyard', dur: 3.0, setup() {
        ensureOutside(); game.player.teleport(new T3.Vector3(52, 0.3, 4), 1.2); settle(10);
        for (const e of game.enemies) if (e.kind === 'skull' && e.pos.distanceTo(game.player.pos) < 16) { e.dormant = false; e.setState('chase'); }
        cam.want = camFollow({ yaw: null, dist: 7.5, height: 3 });
      },
      *script() {
        yield* wait(14);
        const sk = () => nearest('skull', 16)?.pos;
        if (sk()) yield* jump(() => sk() || p.pos, { flip: false, maxF: 10 });
        for (let i = 0; i < 25 && !p.grounded; i++) yield i === 4 ? ['KeyC'] : [];
        yield* attack(sk, 50);
      } },
    { name: 'witch', dur: 4.0, setup() {
        ensureOutside(); const W = game.outside.areas.witch.center;
        game.player.teleport(new T3.Vector3(W.x - 3, W.y + 0.3, W.z - 2), 0); immune(true);
        for (let i = 0; i < 200; i++) step([]);
        const w = witchT(); if (w) { w.state = 'hexWind'; w.t = 0; }
        cam.want = () => { const w = witchT(), dir = p.pos.clone().sub(w.pos).setY(0).normalize(); const pos = p.pos.clone().addScaledVector(dir, 4.2).add(new T3.Vector3(-dir.z * 1.6, 1.5, dir.x * 1.6)); return { pos, look: p.pos.clone().setY(p.pos.y + 1.4).lerp(w.pos, 0.72) }; };
      },
      *script() {
        let shield = 0;
        for (let i = 0; i < 120; i++) {
          const w = witchT(); const chest = p.pos.clone().setY(p.pos.y + 0.9);
          let tti = 9; for (const o of g().projectiles) if (o.kind === 'orb' && !o.reflected) tti = Math.min(tti, o.pos.distanceTo(chest) / Math.max(1, o.vel.length()));
          if (shield > 0) { shield--; yield ['Mouse2']; continue; }
          if (tti < 0.25) { shield = 10; yield ['Mouse2']; continue; }
          if (w && w.state === 'dizzy') { steer(w.pos); yield Math.hypot(w.pos.x - p.pos.x, w.pos.z - p.pos.z) > 2 ? ['KeyW'] : (i % 8 < 3 ? ['Mouse0'] : []); continue; }
          yield [];
        }
      } },
    // ---- the dragon
    { name: 'dragon-breath', dur: 3.2, setup() {
        immune(true); game.startAt('dragon'); settle(5);
        const A = game.zones.castle.arena; for (let i = 0; i < 200; i++) { steer(A.center); step(Math.hypot(A.center.x - p.pos.x, A.center.z - p.pos.z) > 12 ? ['KeyW'] : []); }
        for (let i = 0; i < 260; i++) step([]);
        const d = game.dragon; d.set('breath'); d.sweep = false;
        cam.want = () => {
          const mid = p.pos.clone().lerp(d.pos, 0.45), dir = d.pos.clone().sub(p.pos).setY(0).normalize(), side = new T3.Vector3(-dir.z, 0, dir.x);
          return { pos: mid.clone().addScaledVector(side, 12).setY(d.floorY + 3.2), look: mid.setY(d.floorY + 1.8) };
        };
      },
      *script() {
        const d = g().dragon;
        for (let i = 0; i < 130; i++) {
          // run across the dragon's line of fire, staying ahead of the flames
          const toD = p.pos.clone().sub(d.pos).setY(0).normalize(), side = new T3.Vector3(-toD.z, 0, toD.x);
          const s = Math.sign(side.dot(d.aim.clone().sub(p.pos))) || 1;
          steer(p.pos.clone().addScaledVector(side, -s * 5).addScaledVector(toD, p.pos.distanceTo(d.pos) < 10 ? 2 : 0));
          yield ['KeyW'];
        }
      } },
    { name: 'dragon-strafe', dur: 3.4, setup() {
        clearProjectiles(); toArena(); const d = game.dragon, A = game.zones.castle.arena;
        game.player.teleport(A.center.clone().add(new T3.Vector3(3, 0.3, 2)), 0);
        d.phase = 2; d.fly = 1; d.pos.copy(A.center).add(new T3.Vector3(Math.cos(1) * 15, 10, Math.sin(1) * 15)); d.set('circle'); d.cool = 0.1; d.strafes = 0;
        settle(4);
        cam.want = () => { const dir = p.pos.clone().sub(d.pos).setY(0).normalize(); return { pos: p.pos.clone().addScaledVector(dir, 7).add(new T3.Vector3(0, 1.4, 0)), look: p.pos.clone().setY(p.pos.y + 1).lerp(d.pos, 0.55) }; };
      },
      *script() {
        const d = g().dragon;
        for (let i = 0; i < 110; i++) {
          if (d.state === 'strafe' && d.runTo) { const dir = d.runTo.clone().sub(d.runFrom).setY(0).normalize(); steer(p.pos.clone().add(new T3.Vector3(-dir.z * 5, 0, dir.x * 5))); yield i > 20 ? ['KeyW'] : []; }
          else yield [];
        }
      } },
    { name: 'dragon-stun', dur: 3.8, setup() {
        clearProjectiles(); toArena(); const d = game.dragon, A = game.zones.castle.arena;
        immune(true); d.fly = 0; d.phase = 1; d.pos.copy(A.center).add(A.fwd.clone().multiplyScalar(5)); d.pos.y = A.center.y; d.yaw = A.yaw + Math.PI; d.set('volley'); d.hp = 18;
        game.player.teleport(A.center.clone().add(A.fwd.clone().multiplyScalar(-6)).setY(A.center.y + 0.3), A.yaw); settle(4);
        cam.want = camBoss(8, 3.2);
      },
      *script() {
        const d = g().dragon; let shield = 0;
        for (let i = 0; i < 130; i++) {
          const chest = p.pos.clone().setY(p.pos.y + 0.9);
          let tti = 9; for (const o of g().projectiles) if (o.kind === 'fireball' && !o.reflected && !o.gravity) tti = Math.min(tti, o.pos.distanceTo(chest) / Math.max(1, o.vel.length()));
          if (shield > 0) { shield--; yield ['Mouse2']; continue; }
          if (tti < 0.22) { shield = 9; yield ['Mouse2']; continue; }
          if (d.vulnerable) { const h = d.target.pos; steer(h); yield Math.hypot(h.x - p.pos.x, h.z - p.pos.z) > 2.3 ? ['KeyW'] : (i % 9 < 3 ? ['Mouse0'] : []); continue; }
          yield [];
        }
      } },
    // ---- more of the castle
    { name: 'hall-ambush', dur: 2.7, setup() {
        immune(true); game.startAt('hall'); settle(5);
        game.player.teleport(new T3.Vector3(1.5, 0.2, -722), Math.PI); settle(40);
        cam.want = camFollow({ yaw: null, dist: 7, height: 3 });
        this.spawns = [[6, 'cultist', [2.2, -733]], [10, 'skull', [0.5, -729]], [14, 'cultist', [5.5, -738]], [18, 'skull', [3.5, -731]]];
      },
      *script() {
        let shield = 0;
        for (let i = 0; i < 110; i++) {
          for (const sp of this.spawns) if (sp[0] === i) { const q = new T3.Vector3(sp[2][0], 0.3, sp[2][1]); const e = spawn(g(), sp[1], q, { parent: g().zones.castle.group, aggro: 40 }); if (e.cast !== undefined) e.cast = 0.6; g().fx.pop(q.clone().setY(1.2), 0xb070ff, 16); audio.play('orbCast', { volume: 0.6 }); }
          const chest = p.pos.clone().setY(p.pos.y + 0.9);
          let tti = 9; for (const o of g().projectiles) if (o.kind === 'orb' && !o.reflected) tti = Math.min(tti, o.pos.distanceTo(chest) / Math.max(1, o.vel.length()));
          if (shield > 0) { shield--; yield ['Mouse2']; continue; }
          if (tti < 0.22) { shield = 9; yield ['Mouse2']; continue; }
          const e = nearest('cultist', 16) || nearest('skull', 16);
          if (e) { steer(e.pos); yield Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 2 ? ['KeyW'] : (i % 8 < 3 ? ['Mouse0'] : []); } else yield ['KeyW'];
        }
      } },
    { name: 'demon-gate', dur: 2.6, setup() {
        game.startAt('gate'); for (const e of game.enemies) if (e.kind === 'knight') e.dormant = true;
        const face = game.zones.castle.face, root = face.root;
        const fpos = root.position.clone(), fwd = new T3.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
        game.player.teleport(fpos.clone().addScaledVector(fwd, 13).setY(fpos.y + 0.3), Math.atan2(-fwd.x, -fwd.z)); settle(10);
        this.fpos = fpos; this.fwd = fwd; face.open();
        cam.want = () => ({ pos: p.pos.clone().addScaledVector(fwd, 6).add(new T3.Vector3(0, 1.2, 0)), look: fpos.clone().setY(fpos.y + 6) });
      },
      *script() { yield* wait(30); for (let i = 0; i < 60; i++) { steer(this.fpos); yield p.pos.distanceTo(this.fpos) > 9 ? ['KeyW'] : []; } } },
  ];
}

// ---------------------------------------------------------------- capture
const state = { frames: [], sounds: [], log: [], t: 0 };
window.__trailer = state;

function hookSounds() {
  for (const k of ['play', 'startLoop', 'stopLoop', 'setLoopVolume']) {
    const orig = audio[k].bind(audio);
    audio[k] = (...args) => { state.sounds.push({ t: state.t, k, args: JSON.parse(JSON.stringify(args)) }); return orig(...args); };
  }
}

export async function capture({ only = null, every = 1, seed = 7 } = {}) {
  const game = g(); T3 = game.THREE; p = game.player;
  // deterministic randomness for the whole shoot
  let sd = seed >>> 0; Math.random = () => ((sd = (sd + 0x6D2B79F5) >>> 0, sd = Math.imul(sd ^ (sd >>> 15), sd | 1), sd ^= sd + Math.imul(sd ^ (sd >>> 7), sd | 61), ((sd ^ (sd >>> 14)) >>> 0) / 4294967296));
  game.debugNoPause = true;
  if (!game.started) game.begin();
  const recv = p.receive.bind(p);
  p.receive = (h) => (window.__immune ? (p.guard ? recv(h) : 'ignored') : recv(h));
  installCamHook(); hookSounds();
  const glc = game.R.canvas;
  const snap = document.createElement('canvas'); snap.width = glc.width; snap.height = glc.height;
  const sctx = snap.getContext('2d');
  const ORDER = ['starway', 'dragon-breath', 'spire-pendulums', 'cornfield', 'dragon-strafe', 'spire-pillar', 'witch', 'hall-ambush', 'graveyard', 'dragon-stun', 'demon-gate'];
  const all = clips();
  const list = (only || ORDER).map(n => all.find(c => c.name === n)).filter(Boolean);
  for (const c of list) {
    cam.pos = null; window.__immune = true;
    c.setup();
    for (let i = 0; i < 40; i++) step([]);
    game.R.post.uFade.value = 0;
    p.hp = p.maxHp; p.invuln = 0;
    const gen = c.script.call(c), n = Math.round(c.dur * FPS);
    state.log.push(`${c.name}: start frame ${state.frames.length}`);
    for (let f = 0; f < n; f++) {
      const r = gen.next(); const keys = r.done ? [] : r.value;
      step(keys); state.t += 0.5 / FPS; step(keys); state.t += 0.5 / FPS;
      game.R.post.uHurt.value = 0;
      if (f % every === 0) {
        sctx.drawImage(glc, 0, 0);
        state.frames.push(await new Promise(res => snap.toBlob(res, 'image/png')));
      }
    }
  }
  // the last frame lingers a moment
  return { frames: state.frames.length, sounds: state.sounds.length, log: state.log };
}

// frame i as base64 png (for review stills)
export async function frameB64(i) {
  const b = state.frames[i]; const buf = new Uint8Array(await b.arrayBuffer());
  let s = ''; for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------- record
export async function record({ track = 'boss', scale = 2, fadeOut = 2.0 } = {}) {
  const W = g().R.canvas.width * scale, H = g().R.canvas.height * scale;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; document.body.appendChild(cv);
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99';
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  // silence everything from the shoot, then start the trailer music
  audio.music(null); for (const n of ['wind', 'crickets', 'brazier', 'chant', 'fireBreath']) audio.stopLoop(n);
  await new Promise(r => setTimeout(r, 2600));
  audio.setMusicVolume?.(1);
  const recDest = window.__recDest;
  const stream = new MediaStream([...cv.captureStream(FPS).getVideoTracks(), ...recDest.stream.getAudioTracks()]);
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12e6, audioBitsPerSecond: 192e3 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const N = state.frames.length, dur = N / FPS;
  // decode frames slightly ahead of playback
  const bitmaps = new Map(); let next = 0;
  const pump = async () => { while (next < N && next < (window.__playFrame || 0) + 45) { const i = next++; bitmaps.set(i, await createImageBitmap(state.frames[i])); } };
  await pump();
  ctx.drawImage(bitmaps.get(0), 0, 0, W, H);
  rec.start(250);
  const sounds = state.sounds.slice(); let si = 0;
  audio.music(track);
  const t0 = performance.now();
  await new Promise(resolve => {
    let last = -1, faded = false;
    const tick = () => {
      const el = (performance.now() - t0) / 1000;
      const i = Math.min(N - 1, Math.floor(el * FPS));
      window.__playFrame = i; pump();
      if (i !== last && bitmaps.has(i)) { ctx.drawImage(bitmaps.get(i), 0, 0, W, H); for (const k of [...bitmaps.keys()]) if (k < i - 2) { bitmaps.get(k).close(); bitmaps.delete(k); } last = i; }
      while (si < sounds.length && sounds[si].t <= el) { const s = sounds[si++]; try { audio[s.k](...s.args); } catch (e) { /* ignore */ } }
      if (!faded && el > dur - fadeOut) { faded = true; audio.music(null); }
      if (el < dur + 0.4) setTimeout(tick, 8); else resolve();
    };
    tick();
  });
  rec.stop();
  await new Promise(r => { rec.onstop = r; });
  const blob = new Blob(chunks, { type: mime });
  state.video = blob; state.mime = mime;
  return { mime, bytes: blob.size, seconds: dur };
}

export async function videoChunk(i, size = 4 << 20) {
  const b = state.video.slice(i * size, (i + 1) * size); const buf = new Uint8Array(await b.arrayBuffer());
  let s = ''; for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
  return { b64: btoa(s), done: (i + 1) * size >= state.video.size };
}
