// Grimhold — boot, game state, zones and the main loop.
import * as THREE from 'three';
import { createRetro, G, Lights } from './core/retro.js';
import { bakeTextures, T } from './core/tex.js';
import { initPhysics, world } from './core/physics.js';
import { input } from './core/input.js';
import { makeMaterials, Sprites } from './world/kit.js';
import { createSky } from './world/sky.js';
import { buildOutside, populateOutside, SPAWN } from './world/outside.js';
import { createFX } from './fx.js';
import { Player } from './actors/player.js';
import { Props } from './world/props.js';
import { HUD, BTN } from './ui/hud.js';
import { buildCastle } from './world/castle.js';
import { setupDragon } from './actors/dragon.js';
import { buildCarnival } from './world/carnival/carnival.js';
import { buildDream } from './world/dream/dream.js';
import audio from './sound.js';

const params = new URLSearchParams(location.search);
if (params.has('mute')) audio.setMasterVolume(0);
const R = createRetro({ targetH: +params.get('res') || 450 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 1000);
R.resize(camera);
addEventListener('resize', () => R.resize(camera));

const hud = new HUD();
hud.loading('Painting the night sky…');
await new Promise(r => setTimeout(r, 30));
await initPhysics();
bakeTextures(); makeMaterials();

const game = {
  scene, camera, R, G, Lights, hud, audio, THREE,
  time: 0, timeScale: 1, hitstopT: 0, cutscene: false, started: false, paused: false,
  targets: [], enemies: [], projectiles: [],
  zone: 'outside', motes: 0, totalMotes: 0, sigils: 0, deaths: 0, startTime: 0,
  checkpoint: { pos: SPAWN.clone(), yaw: Math.PI, zone: 'outside' },
  flags: {},
};
window.game = game;

game.sky = createSky(scene, G.uFogColor.value);
game.glows = new Sprites(T.glow, 6000); scene.add(game.glows.points);
game.fx = createFX(scene);
game.props = new Props(game);

// ------------------------------------------------------------- zones
game.outside = buildOutside({ scene, glows: game.glows });
game.zones = { outside: game.outside };
game.killY = () => game.zones[game.zone]?.killY ?? -30;
game.unsafeAt = p => game.zones[game.zone]?.unsafeAt?.(p);

game.player = new Player(game, SPAWN);

// ------------------------------------------------------------- game API used by actors/props
game.hitstop = (t) => { game.hitstopT = Math.max(game.hitstopT, t); };
game.shake = (s) => { game.player.cam.shake = Math.max(game.player.cam.shake, s); input.rumble(s * 1.2, s * 1.6, 70 + s * 260); };
game.flash = (v = 0.6, color = 0xffffff) => { R.post.uFlash.value = Math.max(R.post.uFlash.value, v); R.post.uFlashCol.value.setHex(color); };
game.hurtFlash = () => { R.post.uHurt.value = 1; };
game.fadeFlash = () => { R.post.uFade.value = 1; };
game.addTarget = (t) => { game.targets.push(t); return t; };
game.removeTarget = (t) => { const i = game.targets.indexOf(t); if (i >= 0) game.targets.splice(i, 1); };

game.onParry = (hit, player) => {
  audio.play('parry');
  game.hitstop(0.14);
  game.flash(0.35, 0xc0d8ff);
  game.shake(0.25);
  const p = player.pos.clone().add(player.forward.clone().multiplyScalar(0.7)).setY(player.pos.y + 1.0);
  game.fx.sparks(p, 18, 0xfff0a0, 7);
  game.fx.rings.add(p, { color: 0xffe080, r0: 0.2, r1: 2.2, life: 0.3, y: 0, quat: player.root.quaternion });
  hud.callout('PARRY!');
  input.rumble(0.25, 1, 150);
  hit.source?.onParried?.(player);
};

game.addMotes = (n) => {
  game.motes += n;
  if (Math.floor((game.motes - n) / 100) < Math.floor(game.motes / 100)) {
    game.player.maxHp = Math.min(8, game.player.maxHp + 1); game.player.heal(99);
    audio.play('heartUp'); hud.callout('+1 HEART');
  }
};

game.setCheckpoint = (pos, yaw, name) => {
  game.checkpoint = { pos: pos.clone(), yaw, zone: game.zone };
  game.player.heal(99);
};

game.onPlayerDeath = () => {
  game.deaths++;
  hud.death(true);
  audio.music(null);
  audio.play('death');
  setTimeout(() => {
    R.post.uFade.value = 1;
    const cp = game.checkpoint;
    if (cp.zone !== game.zone) game.enterZone(cp.zone, cp.pos, cp.yaw, true);
    game.player.revive(cp.pos, cp.yaw);
    game.zones[game.zone].onRespawn?.(game);
    hud.death(false);
    audio.music(game.zones[game.zone].music?.(game) || 'outside');
  }, 2600);
};

game.enterZone = (name, pos, yaw, silent = false) => {
  if (game.zone !== name) game.zones[game.zone]?.onLeave?.(game);
  for (const [k, z] of Object.entries(game.zones)) z.group.visible = k === name;
  game.zone = name;
  game.zones[name].onEnter?.(game, silent);
  game.player.teleport(pos, yaw);
  R.post.uFade.value = 1;
};

populateOutside(game);
buildCastle(game);
setupDragon(game);
hud.loading('Raising the Midnight Carnival…');
buildCarnival(game);
hud.loading('Dreaming the Mirror Sea…');
await new Promise(r => setTimeout(r, 30));
buildDream(game);
for (const [k, z] of Object.entries(game.zones)) z.group.visible = k === 'outside';

// the Star-Eater falls: a moon gate opens in the hoard, onward to the carnival
game.onVictory = () => {
  game.cutscene = true;
  audio.play('victory');
  setTimeout(() => audio.music('victory'), 2500);
  game.player.action = 'victory'; game.player.actionT = 0; game.player.cam.focus = null;
  hud.boss(null);
  setTimeout(() => hud.callout('The Star-Eater is slain!'), 1200);
  setTimeout(() => { game.cutscene = false; game.player.action = null; game.openMoonGate(); }, 4600);
};
// the Marionette Queen falls: the end
game.onFinalVictory = () => {
  game.won = true; game.cutscene = true;
  audio.play('victory');
  setTimeout(() => audio.music('victory'), 2500);
  game.player.action = 'victory'; game.player.actionT = 0;
  setTimeout(() => {
    hud.win(statsLine(), 'The Queen\u2019s strings are cut. The carnival sleeps beneath the stars.', {
      label: 'Continue: Book II \u00b7 The Mirror Sea \u25b8',
      go: () => { hud.unwin(); game.won = false; game.cutscene = false; game.player.action = null; audio.play('dreamPortal'); game.enterDream(); input.lock(); },
    });
    input.unlock();
  }, 4200);
};
const statsLine = () => {
  const t = Math.round(game.time - game.startTime), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  return `Time ${mm}:${ss}<br>Star-motes ${game.motes}<br>Falls ${game.deaths}`;
};
// Somnia dissolves into light: the end of Book II
game.onDreamVictory = () => {
  game.won = true; game.cutscene = true;
  audio.play('victory');
  setTimeout(() => audio.music('victory'), 2500);
  game.player.action = 'victory'; game.player.actionT = 0; game.player.cam.focus = null;
  game.flash(0.8, 0xffe0ff);
  setTimeout(() => hud.callout('The dream is still.'), 900);
  setTimeout(() => { hud.win(statsLine(), 'Somnia sleeps. The Dreamer smiles, closes its eyes, and the Mirror Sea lies still.'); input.unlock(); }, 4600);
};

// ------------------------------------------------------------- input / screens
input.init(R.canvas);
input.onDevice(d => hud.setDevice(d));
// the button name for an action, for hints ("CLICK" or "□")
game.btn = (a) => BTN[input.device === 'pad' ? 'pad' : 'kbm'][a];
// browsers only let sound start after a click or key press (a pad button
// doesn't count), so wake it on the first one
const wake = () => { if (game.started) audio.init(); };
addEventListener('pointerdown', wake); addEventListener('keydown', wake);
let lastFrame = performance.now();
function begin() {
  if (game.started) return;
  game.started = true;
  input.consume('Space', 'Enter', 'PadCross');
  audio.init();
  hud.title(false);
  hud.show(true);
  R.post.uFade.value = 1;
  game.startTime = game.time;
  game.player.teleport(SPAWN, Math.PI);
  audio.music('outside');
  audio.startLoop('wind', { volume: 0.5 });
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) setTimeout(() => hud.hint('Click once (or press any key) to wake the sound.', 5), 300);
  // opening titles (skipped if you jump ahead with the chapter select)
  game.introTimers = [
    setTimeout(() => game.zone === 'outside' && hud.area('The Starway', 'Grimhold Grounds'), 600),
    setTimeout(() => game.zone === 'outside' && hud.hint('Find the three Moon Sigils to raise the bridge to Grimhold.', 6), 2800),
  ];
  input.lock();
}
R.canvas.addEventListener('click', () => { if (game.started && !game.paused) input.lock(); });
addEventListener('keydown', e => {
  if (!game.started && hud.ready && (e.code === 'Enter' || e.code === 'Space')) begin();
  if (game.started && (e.code === 'Escape' || e.code === 'KeyP')) togglePause();
});
document.addEventListener('pointerlockchange', () => { if (!input.locked && game.started && !game.paused && !game.debugNoPause && !game.won) togglePause(true); });
hud.onStart = begin;
// chapter select (title or pause screen): jump straight to a section
game.startAt = (ch) => {
  if (!game.started) begin();
  if (game.paused) togglePause(false);
  if (game.won) { hud.unwin(); game.won = false; game.cutscene = false; game.player.action = null; }
  audio.play('confirm');
  for (const t of game.introTimers || []) clearTimeout(t);
  hud.hint(null); hud.prompt(null);
  if (ch === 'grounds') { if (game.zone !== 'outside') game.enterZone('outside', SPAWN, Math.PI); else game.player.teleport(SPAWN, Math.PI); game.setCheckpoint(SPAWN, Math.PI); return; }
  if (ch === 'dream' || ch === 'somnia') {
    game.enterDream();
    if (ch === 'somnia') game.zones.dream.skipTo('somnia');
    R.post.uFade.value = 1;
    return;
  }
  game.sigils = 3;
  if (ch === 'carnival' || ch === 'queen') {
    game.enterFair();
    if (ch === 'queen') game.zones.carnival.skipTo('queen');
    R.post.uFade.value = 1;
    return;
  }
  if (game.zone !== 'castle') game.enterCastle();
  if (ch !== 'hall') game.zones.castle.skipTo(ch);
  R.post.uFade.value = 1;
};
hud.onChapter = (ch) => game.startAt(ch);
hud.onResume = () => togglePause(false);
// gamepad: OPTIONS pauses; on the title and pause screens the d-pad or left
// stick walks a highlight over the chapters, Cross picks, Circle backs out
function padMenus() {
  if (game.won && hud.onNext && input.anyPressed('PadCross', 'PadOptions')) { input.consume('PadCross', 'PadOptions'); hud.onNext(); return; }
  if (game.started && !game.paused && !game.won && input.anyPressed('PadOptions')) { togglePause(true); return; }
  const scr = !game.started ? (hud.ready && !hud.titleS.classList.contains('hidden') ? hud.titleS : null) : game.paused ? hud.pauseS : null;
  if (!scr) return;
  const dx = input.anyPressed('PadRight', 'NavRight') ? 1 : input.anyPressed('PadLeft', 'NavLeft') ? -1 : 0;
  const dy = input.anyPressed('PadDown', 'NavDown') ? 1 : input.anyPressed('PadUp', 'NavUp') ? -1 : 0;
  if ((dx || dy) && hud.menuMove(scr, dx, dy)) audio.play('select');
  const f = hud.menuFocused(scr);
  if (input.anyPressed('PadCross')) { if (f) { hud.menuFocus(scr, null); game.startAt(f.dataset.ch); } else if (!game.started) begin(); else togglePause(false); }
  else if (input.anyPressed('PadOptions')) { if (!game.started) begin(); else togglePause(false); }
  else if (input.anyPressed('PadCircle')) { if (f) hud.menuFocus(scr, null); else if (game.paused) togglePause(false); }
  input.consume('PadCross', 'PadCircle', 'PadOptions');
}
function togglePause(force) {
  game.paused = force ?? !game.paused;
  hud.pause(game.paused);
  audio.play(game.paused ? 'pause' : 'unpause');
  if (!game.paused) input.lock();
}

// ------------------------------------------------------------- loop
const clock = new THREE.Clock();
const titleCam = { t: 0 };
function frame(dt) {
  const g = game;
  input.poll(dt);
  padMenus();
  if (g.paused) { input.mouse(); input.endFrame(); return; }
  g.time += dt;
  G.uTime.value = g.time;
  R.post.uTime.value = g.time;

  let sdt = dt * g.timeScale;
  if (g.hitstopT > 0) { g.hitstopT -= dt; sdt = 0; }
  if (!g.started) sdt = dt;

  if (sdt > 0) {
    g.props.update(sdt);
    world.timestep = Math.max(sdt, 1 / 240);
    world.step();
    if (g.started) g.player.update(sdt);
    const pp = g.player.pos;
    for (const e of g.enemies) if (!e.pos || e.pos.distanceToSquared(pp) < 9000 || e.dying >= 0) e.update(sdt);
    g.enemies = g.enemies.filter(e => !e.removed);
    for (const p of g.projectiles) p.update(sdt);
    g.projectiles = g.projectiles.filter(p => !p.removed);
    g.zones[g.zone].tick?.(sdt, g);
    g.hoardGateTick?.(sdt);
  }
  g.outside.update(g.time);

  if (g.started) g.player.updateCamera(dt, camera);
  else titleCamera(dt);
  if (g.camHook) g.camHook(camera, dt);
  // atmosphere: fireflies over the grounds, drifting star-dust in the castle
  if (sdt > 0) {
    const out = g.zone === 'outside', amb = g.zones[g.zone].ambient;
    for (let i = 0; i < 2; i++) {
      if (Math.random() > 0.75) continue;
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 16;
      const q = new THREE.Vector3(camera.position.x + Math.cos(a) * r, camera.position.y - 1.5 + Math.random() * 5, camera.position.z + Math.sin(a) * r);
      g.fx.glow.emit({ pos: q, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, amb ? amb[2] : out ? 0.15 : 0.35, (Math.random() - 0.5) * 0.6), life: 2.5 + Math.random() * 2,
        size: 0.18 + Math.random() * 0.14, size1: 0.02, color: amb ? amb[Math.random() < 0.5 ? 0 : 1] : out ? (Math.random() < 0.5 ? 0xb0ff80 : 0xffd070) : (Math.random() < 0.5 ? 0xa080ff : 0x80b0ff), alpha: 0.9, alpha1: 0 });
    }
  }

  g.fx.update(sdt);
  g.fx.setPx(R.pxScale);
  g.glows.uniforms.uPx.value = R.pxScale;
  // blob shadows for everything that moves
  g.fx.shadows.begin();
  if (g.started && !g.player.dead) g.fx.shadows.cast(g.player.pos, 0.95);
  for (const e of g.enemies) if (e.alive && e.shadow !== false) g.fx.shadows.cast(e.pos, e.shadowSize || e.radius * 2.2);
  g.props.castShadows?.(g.fx.shadows);
  g.fx.shadows.end();

  g.sky.update(g.time, camera.position);
  Lights.update(g.time, g.started ? g.player.pos : camera.position);
  // post fades
  R.post.uFlash.value = Math.max(0, R.post.uFlash.value - dt * 3);
  R.post.uHurt.value = Math.max(0, R.post.uHurt.value - dt * 1.6);
  R.post.uFade.value = Math.max(0, R.post.uFade.value - dt * 1.8);
  hud.update(dt, g);
  R.render(scene, camera);
  input.endFrame();
}

function titleCamera(dt) {
  titleCam.t += dt;
  const t = titleCam.t;
  const z = 58 - Math.min(18, t * 0.8);
  camera.position.set(Math.sin(t * 0.15) * 1.5, 2.6 + Math.sin(t * 0.3) * 0.3, z);
  camera.lookAt(0, 9.5, -60);
}

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 1 / 20);
  lastFrame = now;
  if (game.manual) return;
  frame(dt);
}

// synchronous stepping for automated tests (works in a hidden tab)
game.debugStep = (frames = 60, dt = 1 / 60, keys = []) => {
  game.manual = true;
  for (let i = 0; i < frames; i++) { for (const k of keys) input.forceDown(k); frame(dt); }
  for (const k of keys) input.forceUp(k);
};
game.tp = (x, y, z, yaw = 0) => game.player.teleport(new THREE.Vector3(x, y, z), yaw);
game.begin = begin;

hud.loading(null);
hud.title(true);
audio.music('title');
if (params.has('autostart')) { game.debugNoPause = true; begin(); }
loop();
