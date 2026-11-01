// Turntable for characters: test.html?who=hero&act=atk1&t=0.15&yaw=0.6&d=3.2&h=1&spin
import * as THREE from 'three';
import { createRetro, G, Lights } from './core/retro.js';
import { bakeTextures, T } from './core/tex.js';
import { makeMaterials, M } from './world/kit.js';
import { createSky } from './world/sky.js';
import { box } from './core/geo.js';

const q = new URLSearchParams(location.search);
const R = createRetro({ targetH: +q.get('res') || 300 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1000);
R.resize(camera); addEventListener('resize', () => R.resize(camera));
bakeTextures(); makeMaterials();
const sky = createSky(scene, G.uFogColor.value);
const floor = new THREE.Mesh(box(12, 0.2, 12, { s: 0.5 }), M.checker.clone ? M.checker : M.checker);
floor.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(floor.geometry.attributes.position.count * 3).fill(0.9), 3));
floor.position.y = -0.1; scene.add(floor);
Lights.add(new THREE.Vector3(2, 2, 2), 0xff9040, 1.2, 8);
Lights.add(new THREE.Vector3(-2, 1.5, -1), 0x4a7aff, 1.2, 8);

const who = q.get('who') || 'hero';
let actor;
if (who === 'hero') { const { buildHero } = await import('./actors/hero.js'); actor = buildHero(); }
else if (who === 'dragon') { const { preview } = await import('./actors/dragon.js'); actor = preview(); }
else { const mod = await import('./actors/models.js'); actor = mod.build(who); }
scene.add(actor.root);
const act = q.get('act'), at = +q.get('t') || 0;
const s = { dragon: q.has('dp') ? JSON.parse(q.get('dp')) : {}, speed: +q.get('speed') || 0, grounded: !q.has('air'), vy: +q.get('vy') || 0, action: act, actionT: at, guard: +q.get('guard') || 0, hpFrac: q.has('hp') ? +q.get('hp') : 1 };
const yaw0 = +q.get('yaw') || 0.5, dist = +q.get('d') || 3.2, h = +q.get('h') || 1.0;
const clock = new THREE.Clock();
window.dbg = { actor, s, camera };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  G.uTime.value = t;
  const yaw = yaw0 + (q.has('spin') ? t * 0.6 : 0);
  camera.position.set(Math.sin(yaw) * dist, h + dist * 0.15, Math.cos(yaw) * dist);
  camera.lookAt(0, h * 0.8, 0);
  if (q.has('anim')) { s.actionT = (t % 1.2) * (act ? 1 : 0); }
  for (let i = 0; i < (q.has('anim') ? 1 : 30); i++) actor.update(q.has('anim') ? dt : 1 / 30, s);
  sky.update(t, camera.position);
  Lights.update(t, new THREE.Vector3());
  R.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
