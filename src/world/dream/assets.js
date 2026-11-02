// The Mirror Sea's own look: hand-pixelled textures (glitter marble, lapis,
// opal rock, glow-moss, lotus petals, eye-spotted moth wings, koi scales,
// blue lacquer, turquoise roof tiles, kaleidoscope glass), a holographic
// chrome matcap, shader materials for glassy creatures, prisms and the
// upward-pouring falls, and the sculpted set pieces: the sleeping colossus's
// head and hands, lotuses, monoliths, half-sunk moon arches and pagodas.
import * as THREE from 'three';
import { make, hash, fbm, ridge, pal, P, hex, mul } from '../../core/tex.js';
import { retroMat, G } from '../../core/retro.js';
import { box, cyl, sphere, clean, mat4 } from '../../core/geo.js';
import { T } from '../../core/tex.js';

const PI = Math.PI;
export const DT = {};
export const DM = {};

// ------------------------------------------------------------------ textures
function sphereMap(fn) {
  return make(64, 64, (x, y, u, v) => {
    const nx = u * 2 - 1, ny = 1 - v * 2, r2 = nx * nx + ny * ny;
    if (r2 > 1) return [0, 0, 0, 255];
    return fn(nx, ny, Math.sqrt(1 - r2), x, y);
  }, { repeat: false, mip: false, nearest: false });
}
const cosPal = (t, k = 1) => [0, 0.33, 0.67].map(o => Math.round(255 * k * (0.5 + 0.5 * Math.cos(6.2831 * (t + o)))));
// the dream's own rainbow: pearl-pink through cyan and blue to violet (no greens or yellows)
const dreamPal = (t, k = 1) => [[0.62, 0.38, 0], [0.55, 0.4, 0.12], [0.95, 0.25, 0.28]].map(([a, b, o]) => Math.round(255 * Math.min(1, k * (a + b * Math.cos(6.2831 * (t + o))))));

export function bakeDreamTextures() {
  if (DT.marble) return;
  // glitter marble: lavender-white, fine ultramarine veins, a rare gold thread and sparkle
  const marblePal = P([0x7070c8, 0x8c8cdc, 0xa8a8ec, 0xc4c4f8, 0xdcdcff, 0xf0eeff]);
  const veinPal = P([0x3a30b0, 0x5a50d8, 0x8a80ec]), goldVein = P([0x8a5a10, 0xe0b040, 0xfff0a0]);
  DT.marble = make(64, 64, (x, y, u, v) => {
    const b = fbm(u, v, 2, 4, 901);
    const r = Math.pow(ridge(u * 1.6 + b * 0.7, v * 1.6 - b * 0.5, 4, 4, 902), 16);
    const r2 = Math.pow(ridge(u * 0.8 - b * 0.3, v * 0.9 + b * 0.5, 3, 4, 905), 24);
    const g = hash(x, y, 903);
    if (g > 0.99) return hex(0xffffff);
    if (g > 0.982) return hex(0xb8f0ff);
    if (r2 > 0.6) return pal(goldVein, (r2 - 0.6) / 0.4, x, y);
    if (r > 0.45) return pal(veinPal, 1 - (r - 0.45) / 0.55, x, y);
    return pal(marblePal, 0.66 + (b - 0.5) * 0.5 + (hash(x, y, 904) - 0.5) * 0.1 - r * 0.25, x, y);
  });
  // lapis lazuli: deep ultramarine with white calcite streaks and pyrite flecks
  const lapisPal = P([0x04043a, 0x0a0a6a, 0x14149a, 0x2028c8, 0x3446ec]);
  DT.lapis = make(64, 64, (x, y, u, v) => {
    const b = fbm(u, v, 4, 4, 911), r = Math.pow(ridge(u + b * 0.5, v * 0.7 - b * 0.4, 3, 4, 912), 10);
    const g = hash(x, y, 913);
    if (g > 0.975) return pal(goldVein, 0.5 + hash(x, y, 914) * 0.5, x, y);
    if (r > 0.6) return pal(P([0x3a4ad0, 0x9aa8f0, 0xe8ecff]), (r - 0.6) / 0.4, x, y);
    return pal(lapisPal, 0.55 + (b - 0.5) * 1.1, x, y);
  });
  // opal rock: indigo stone with flecks of rainbow fire
  const opalPal = P([0x0a0628, 0x160e44, 0x241866, 0x342488, 0x4a36a8]);
  DT.rock = make(64, 64, (x, y, u, v) => {
    const b = fbm(u, v, 3, 4, 921), strata = Math.sin((v + b * 0.4) * PI * 8) * 0.1;
    const fire = Math.pow(ridge(u * 2 + b, v * 2 - b, 5, 3, 922), 10);
    if (fire > 0.4 && hash(x >> 1, y >> 1, 923) > 0.4) return cosPal(u * 1.5 + v + b * 2, 0.9 + fire * 0.1);
    return pal(opalPal, 0.5 + (b - 0.5) * 1.0 + strata + (hash(x, y, 924) - 0.5) * 0.15, x, y);
  });
  // glow-moss for the hanging garden
  const mossPal = P([0x02242a, 0x064844, 0x0a7a62, 0x22b07a, 0x7ae8a0]);
  DT.moss = make(64, 64, (x, y, u, v) => {
    const b = fbm(u, v, 6, 4, 931);
    if (hash(x, y, 932) > 0.985) return hex(0xd0ffe0);
    return pal(mossPal, b * 1.1 + (hash(x, y, 933) - 0.5) * 0.25, x, y);
  });
  // lotus petal: white tip into magenta, fine veins (u across, v base → tip)
  const petalPal = P([0x5a0a6a, 0x9a1a9a, 0xd04ac0, 0xf090e0, 0xffd0f4, 0xffffff]);
  DT.lotus = make(32, 64, (x, y, u, v) => {
    const vein = Math.abs(Math.sin(u * PI * 7)) < 0.18 ? -0.12 : 0;
    return pal(petalPal, 0.12 + v * 0.95 + vein + (fbm(u, v, 3, 3, 941) - 0.5) * 0.2, x, y);
  });
  // moth wing: dusk-blue, veins from the root, one great eye, a scalloped silver margin
  const wingPal = P([0x0a0840, 0x181470, 0x2a20a8, 0x4a2ac8, 0x7a3ad0, 0xb04ac8]);
  DT.wing = make(64, 64, (x, y, u, v) => {
    const ex = u - 0.6, ey = v - 0.5, er = Math.hypot(ex * 1.1, ey);
    if (er < 0.05) return hex(0x020008);
    if (er < 0.065 && ex < 0 && ey < 0) return hex(0xffffff);
    if (er < 0.09) return hex(0x05030c);
    if (er < 0.13) return pal(P([0xa04000, 0xf0a020, 0xfff080]), 1 - (er - 0.09) / 0.04, x, y);
    if (er < 0.165) return pal(P([0x8a0a6a, 0xff40c0]), 1 - (er - 0.13) / 0.035, x, y);
    if (er < 0.19) return hex(0x07051a);
    const a = Math.atan2(v - 0.5, u + 0.05), veins = Math.abs(Math.sin(a * 9 + fbm(u, v, 3, 2, 951) * 2)) < 0.07;
    const edge = u > 0.88 + Math.sin(v * PI * 9) * 0.04;
    if (edge) return (Math.floor(v * 18) & 1) ? hex(0xe8e8ff) : hex(0x8a8ad0);
    if (veins) return hex(0x07051a);
    return pal(wingPal, u * 0.9 + (fbm(u, v, 4, 3, 952) - 0.5) * 0.4 + (ey * ey) * 0.6, x, y);
  });
  // moth fur: pale banded down
  DT.fur = make(32, 32, (x, y, u, v) => {
    const band = Math.floor(v * 6) & 1;
    return pal(band ? P([0x6a5ab0, 0x9a8ad8, 0xd0c8f8]) : P([0x2a1a5a, 0x4a3a8a, 0x7a6ab8]), fbm(u, v, 4, 3, 961) + (hash(x, y, 962) - 0.5) * 0.4, x, y);
  });
  // glass scales: overlapping arcs, cyan to violet
  const scalePal = P([0x10206a, 0x2a50b0, 0x4a90e0, 0x8ad0ff, 0xe0f8ff]);
  DT.scale = make(32, 32, (x, y, u, v) => {
    const sx = u * 6 + (Math.floor(v * 6) & 1) * 0.5, sy = v * 6, fx = sx % 1 - 0.5, fy = sy % 1;
    const d = Math.hypot(fx, fy * 1.1);
    return pal(scalePal, d < 0.5 ? 0.3 + (1 - d * 2) * 0.6 : 0.15, x, y);
  });
  // koi: white with ultramarine and gold patches
  DT.koi = make(64, 32, (x, y, u, v) => {
    const n = fbm(u, v, 3, 3, 971), m = fbm(u, v, 4, 3, 972);
    if (n > 0.6) return pal(P([0x0a0a8a, 0x2030d0]), m, x, y);
    if (m > 0.62) return pal(P([0xc06a10, 0xffb030, 0xffe080]), n, x, y);
    return pal(P([0xb8c0f0, 0xe8ecff, 0xffffff]), 0.6 + (hash(x, y, 973) - 0.5) * 0.4, x, y);
  });
  // blue lacquer with gold bands (pagoda posts and beams)
  DT.lacquer = make(32, 32, (x, y, u, v) => {
    if (y % 16 < 2) return pal(goldVein, y % 16 === 0 ? 0.9 : 0.4, x, y);
    return pal(P([0x06043a, 0x0c0a6a, 0x16129a, 0x2a20c0]), 0.5 + (fbm(u, v, 2, 3, 981) - 0.5) * 0.7 + (x === 0 ? -0.3 : 0), x, y);
  });
  // glazed turquoise roof tiles
  DT.roof = make(32, 32, (x, y, u, v) => {
    const cx = (u * 4) % 1, row = (v * 4) % 1;
    const t = 0.25 + Math.sin(cx * PI) * 0.6 - row * 0.25;
    return pal(P([0x02242e, 0x064a58, 0x0c7a84, 0x26b4b0, 0x8af0e0, 0xffffff]), t + (hash(x, y, 991) - 0.5) * 0.1, x, y);
  });
  // kaleidoscope glass: a twelve-fold rose window with dark leading
  DT.stained = make(128, 128, (x, y, u, v) => {
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
    let a = Math.atan2(dy, dx) / (PI * 2) * 12; a = Math.abs((a % 1 + 1) % 1 - 0.5) * 2;
    const ring = Math.floor(r * 6), fr = (r * 6) % 1;
    if (r > 1) return hex(0x05030f);
    if (fr < 0.08 || Math.abs(a - (ring % 2 ? 0.5 : 0.85)) < 0.06 || a < 0.05) return hex(0x0a0618);
    const cell = ring * 3 + (a > 0.5 ? 1 : 0);
    return dreamPal(cell * 0.137 + 0.55, 0.7 + 0.3 * (1 - fr));
  }, { repeat: false });
  // pearl chrome: a silvery sky with an oil-slick sheen, a dark horizon, a hard white highlight
  DT.holoEnv = sphereMap((nx, ny, nz, x, y) => {
    let c;
    if (ny > 0.06) { const sky = pal(P([0x2a2a7a, 0x5050b0, 0x8a8ad8, 0xc8c8f4, 0xf4f4ff]), ny * 1.1, x, y), sh = dreamPal(ny * 0.8 + nx * 0.3); c = sky.map((v, i) => Math.round(v * 0.7 + sh[i] * 0.3)); }
    else if (ny > -0.06) c = hex(0x06041e);
    else c = mul(dreamPal(-ny * 0.6 + 0.4), 0.4);
    const hl = Math.hypot(nx + 0.35, ny - 0.5);
    if (hl < 0.13) c = [255, 255, 255];
    return mul(c, 0.75 + (1 - nz) * 0.5);
  });
}

// ------------------------------------------------------------------ shader materials
const holoVert = /* glsl */`
uniform float uFogNear, uFogFar, uTime, uWobble;
varying vec3 vN, vW; varying float vFog; varying vec2 vUv;
void main(){
  vec3 p = position;
  p += normal * sin(uTime * 3. + position.y * 4. + position.x * 2.) * uWobble;
  vec4 wp = modelMatrix * vec4(p, 1.);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
  vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv;
  vFog = clamp((length(mv.xyz) - uFogNear) / (uFogFar - uFogNear), 0., 1.);
}`;
// glassy, iridescent and see-through: jellyfish bells, bubbles, glass mantas and pufferfish
export function holoMat({ color = 0x7a9aff, opacity = 0.55, glow = 0.25, additive = false, wobble = 0, side = THREE.DoubleSide, map = null, depthWrite = false } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: holoVert,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uFogColor, uFlashColor; uniform float uOpacity, uGlow, uTime, uFlash, uHasMap; uniform sampler2D map;
      varying vec3 vN, vW; varying float vFog; varying vec2 vUv;
      void main(){
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        float f = pow(1. - abs(dot(n, v)), 2.);
        vec3 irid = vec3(.62, .55, .95) + vec3(.38, .4, .25) * cos(6.2831 * (vec3(0., .12, .28) + f * .9 + uTime * .05 + vW.y * .02));
        vec3 base = uColor; if (uHasMap > .5) base *= texture2D(map, vUv).rgb * 1.4;
        vec3 c = mix(base, irid, f * .75) * (.45 + f * 1.1) + base * uGlow;
        c = mix(c, uFlashColor, uFlash);
        c = mix(c, uFogColor, vFog);
        gl_FragColor = vec4(c, clamp(uOpacity * (.4 + f * .9), 0., 1.));
      }`,
    uniforms: {
      uTime: G.uTime, uFogColor: G.uFogColor, uFogNear: G.uFogNear, uFogFar: G.uFogFar,
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uGlow: { value: glow }, uWobble: { value: wobble },
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, map: { value: map }, uHasMap: { value: map ? 1 : 0 },
    },
    transparent: true, depthWrite, side, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
// prisms: colour that slides through the rainbow with the view angle
export function prismMat({ bright = 1, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: holoVert,
    fragmentShader: /* glsl */`
      uniform float uTime, uBright, uOpacity; uniform vec3 uFogColor; varying vec3 vN, vW; varying float vFog;
      void main(){
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        float d = dot(n, v);
        vec3 c = vec3(.62, .55, .95) + vec3(.38, .4, .25) * cos(6.2831 * (vec3(0., .12, .28) + d * 1.4 + uTime * .25 + dot(n, vec3(.3, .5, .2))));
        c = mix(c, vec3(1.), pow(max(d, 0.), 12.) * .8) * uBright;
        gl_FragColor = vec4(mix(c, uFogColor, vFog * .5), uOpacity);
      }`,
    uniforms: { uTime: G.uTime, uFogColor: G.uFogColor, uFogNear: G.uFogNear, uFogFar: G.uFogFar, uWobble: { value: 0 }, uBright: { value: bright }, uOpacity: { value: opacity } },
    transparent: opacity < 1,
  });
}
// a sheet of prismatic water: streaks pour along v (dir 1 = up, -1 = down)
export function fallsMat({ dir = 1, speed = 0.6, opacity = 0.7, tint = 0x9ad8ff } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: holoVert,
    fragmentShader: /* glsl */`
      uniform float uTime, uDir, uSpeed, uOpacity; uniform vec3 uTint, uFogColor; varying vec2 vUv; varying vec3 vW; varying float vFog;
      float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
      void main(){
        float col = floor(vUv.x * 48.), k = h(col);
        float s = fract(vUv.y * (2. + k * 2.) - uTime * uSpeed * uDir * (.7 + k * .6) + k * 7.);
        float streak = smoothstep(.0, .25, s) * smoothstep(1., .55, s);
        vec3 rb = vec3(.62, .55, .95) + vec3(.38, .4, .25) * cos(6.2831 * (vec3(0., .12, .28) + vUv.y * .8 + col * .03 - uTime * .1));
        vec3 c = mix(uTint, rb, .45) * (.5 + streak);
        float a = uOpacity * (.25 + streak * .75) * (.6 + .4 * h(col + 3.));
        gl_FragColor = vec4(mix(c, uFogColor, vFog * .6), a);
      }`,
    uniforms: { uTime: G.uTime, uFogColor: G.uFogColor, uFogNear: G.uFogNear, uFogFar: G.uFogFar, uWobble: { value: 0 }, uDir: { value: dir }, uSpeed: { value: speed }, uOpacity: { value: opacity }, uTint: { value: new THREE.Color(tint) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

// ------------------------------------------------------------------ materials
export function makeDreamMaterials() {
  if (DM.marble) return;
  bakeDreamTextures();
  const B = (map, o = {}) => retroMat({ map, baked: true, ...o });
  Object.assign(DM, {
    marble: B(DT.marble, { spec: 0.15, shine: 20 }), lapis: B(DT.lapis, { spec: 0.25, shine: 24 }), rock: B(DT.rock), moss: B(DT.moss, { emit: 0.2 }),
    lacquer: B(DT.lacquer, { spec: 0.3 }), roof: B(DT.roof, { spec: 0.4, shine: 20 }), lotus: B(DT.lotus, { side: THREE.DoubleSide, emit: 0.3 }),
    chrome: retroMat({ baked: true, chrome: 0.85, env: DT.holoEnv, color: 0xe8ecff, spec: 0.4 }),
    gold: retroMat({ baked: true, map: T.gold, chrome: 0.6, env: T.goldEnv, spec: 0.3 }),
    stained: retroMat({ map: DT.stained, emit: 0.9, side: THREE.DoubleSide, fog: 0.5 }),
    glowW: retroMat({ color: 0xe8f0ff, emit: 1, fog: 0.35 }), glowC: retroMat({ color: 0x70f0ff, emit: 1, fog: 0.35 }), glowM: retroMat({ color: 0xff70e0, emit: 1, fog: 0.35 }),
    mMarble: retroMat({ map: DT.marble, spec: 0.2, rim: 0.15, edge: 0.25 }), mLapis: retroMat({ map: DT.lapis, spec: 0.3, rim: 0.15 }),
    mChrome: retroMat({ chrome: 0.85, env: DT.holoEnv, color: 0xe8ecff, spec: 0.5, rim: 0.2 }),
    mGold: retroMat({ map: T.gold, chrome: 0.6, env: T.goldEnv, spec: 0.4, emit: 0.1 }),
    mLotus: retroMat({ map: DT.lotus, side: THREE.DoubleSide, emit: 0.35, rim: 0.2 }),
    mRock: retroMat({ map: DT.rock, rim: 0.15 }), mMoss: retroMat({ map: DT.moss, emit: 0.25 }),
    mLacquer: retroMat({ map: DT.lacquer, spec: 0.3, rim: 0.15 }), mRoof: retroMat({ map: DT.roof, spec: 0.5, rim: 0.2 }),
  });
}

// ------------------------------------------------------------------ geometry
const lathe = (pts, seg = 16, us = 2) => {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * us, uv.getY(i));
  return clean(g);
};
export { lathe };

// one lotus petal: a cupped, pointed blade (v runs base → tip)
export function petalGeo(len = 1, wid = 0.45, cup = 0.25) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 6), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
    const w = Math.sin(Math.min(1, v * 1.15) * PI) ** 0.7 * wid * (1 - v * 0.25);
    const x = (u - 0.5) * 2 * w;
    p.setXYZ(i, x, v * len, -cup * (x * x) / (wid * wid) * len + Math.sin(v * PI) * 0.12 * len);
    uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return clean(g);
}
// a lotus bloom: rings of petals around a golden seed-pod (radius r)
export function lotus(b, mat, gold, at, r = 1, { rings = 3, n = 8, open = 0.9, yaw = 0 } = {}) {
  const pg = petalGeo(1, 0.42, 0.3);
  for (let k = 0; k < rings; k++) {
    const len = r * (1 - k * 0.22), tilt = PI / 2 - open * (1.15 - k * 0.42);
    for (let i = 0; i < n; i++) {
      const a = yaw + (i + k * 0.5) / n * PI * 2;
      const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, a, 0, 'YXZ')), new THREE.Vector3(len, len, len));
      b.add(pg, mat, m);
    }
  }
  b.add(cyl(r * 0.22, r * 0.16, r * 0.2, 10), gold, mat4([at.x, at.y + r * 0.1, at.z]));
}

// the sleeping colossus: a long serene face sculpted out of a sphere (+z is the face)
export function colossusHeadGeo() {
  const g = new THREE.SphereGeometry(1, 80, 60), p = g.attributes.position, uv = g.attributes.uv;
  const Gs = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let sx = 0.74, sz = 0.86;
    if (y < 0) sx *= 1 - 0.3 * (-y) ** 1.5;
    if (y < -0.3) sz *= 1 - 0.14 * (-y - 0.3);
    x *= sx; z *= sz;
    const front = Math.max(0, z / 0.86), f = front ** 3;
    let dz = 0;
    dz += 0.08 * Gs(x, y, 0, 0.22, 0.4, 0.06) * f;                                           // brow
    for (const s of [-1, 1]) {
      dz -= 0.12 * Gs(x, y, s * 0.24, 0.1, 0.13, 0.075) * f;                                  // sockets
      dz += 0.07 * Gs(x, y, s * 0.24, 0.085, 0.1, 0.045) * f;                               // closed lids
      dz += 0.06 * Gs(x, y, s * 0.42, -0.12, 0.12, 0.13) * f;                                // cheekbones
      dz -= 0.045 * Gs(x, y, s * 0.6, 0.28, 0.1, 0.2) * front;                               // temples
      dz += 0.025 * Gs(x, y, s * 0.11, -0.3, 0.05, 0.04) * f;                                // nostril wings
    }
    dz += 0.17 * Gs(x, y, 0, -0.06, 0.06, 0.22) * f;                                        // bridge
    dz += 0.09 * Gs(x, y, 0, -0.27, 0.085, 0.06) * f;                                         // tip
    dz += 0.07 * Gs(x, y, 0, -0.44, 0.17, 0.035) * f;                                       // upper lip
    dz += 0.075 * Gs(x, y, 0, -0.53, 0.14, 0.04) * f;                                         // lower lip
    dz -= 0.06 * Gs(x, y, 0, -0.485, 0.17, 0.014) * f;                                      // the mouth's line
    dz += 0.08 * Gs(x, y, 0, -0.74, 0.13, 0.08) * f;                                         // chin
    p.setXYZ(i, x, y, z + dz);
    uv.setXY(i, uv.getX(i) * 18, uv.getY(i) * 11);
  }
  g.computeVertexNormals();
  return clean(g);
}
// a closed eye's lash line, as a thin crescent tube in the face's local space
export function lashGeo(w = 0.2, droop = 0.035, r = 0.012) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, x = (t - 0.5) * w; pts.push(new THREE.Vector3(x, -Math.sin(t * PI) * droop, 0)); }
  return clean(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 5, false));
}

// a great hand rising out of the water: palm up (cupped) or down
export function hand(b, mat, at, s, yaw, { up = true, curl = 0.4 } = {}) {
  const root = new THREE.Object3D(); root.position.copy(at); root.rotation.set(up ? 0 : PI, yaw, 0); root.scale.setScalar(s); root.updateMatrixWorld(true);
  const add = (geo, pos, rot, parent = root) => {
    const o = new THREE.Object3D(); o.position.set(...pos); o.rotation.set(...rot); parent.add(o); o.updateMatrixWorld(true);
    b.add(geo, mat, o.matrixWorld.clone()); return o;
  };
  // forearm sinking under the surface, wrist, palm
  add(cyl(0.42, 0.5, 2.6, 12, { s: 1.5 }), [0, -1.4, -0.9], [-0.45, 0, 0]);
  add(sphere(0.48, 12, 8), [0, -0.15, -0.35], [0, 0, 0]);
  add(box(1.1, 0.34, 1.2, { s: 1.2 }), [0, 0, 0.35], [0, 0, 0]);
  add(sphere(0.62, 12, 8), [0, -0.02, 0.32], [0, 0, 0]).scale.set(1, 0.4, 1);
  // four fingers, three bones each, curling up
  const fl = [0.5, 0.56, 0.52, 0.4];
  for (let f = 0; f < 4; f++) {
    let joint = new THREE.Object3D(); joint.position.set(-0.4 + f * 0.27, 0.02, 0.95); joint.rotation.set(-curl * 0.6, (f - 1.5) * 0.08, 0); root.add(joint); joint.updateMatrixWorld(true);
    for (let k = 0; k < 3; k++) {
      const L = fl[f] * (1 - k * 0.22);
      add(cyl(0.11 - k * 0.012, 0.125 - k * 0.012, L, 8, { s: 2 }), [0, 0, L / 2], [PI / 2, 0, 0], joint);
      add(sphere(0.12 - k * 0.012, 8, 6), [0, 0, 0], [0, 0, 0], joint);
      const nj = new THREE.Object3D(); nj.position.set(0, 0, L); nj.rotation.set(-curl * (0.7 + k * 0.2), 0, 0); joint.add(nj); nj.updateMatrixWorld(true); joint = nj;
    }
  }
  // thumb
  let tj = new THREE.Object3D(); tj.position.set(0.6, 0, 0.1); tj.rotation.set(-curl * 0.4, 0.9, 0.3); root.add(tj); tj.updateMatrixWorld(true);
  for (let k = 0; k < 2; k++) {
    add(cyl(0.13, 0.15, 0.5, 8, { s: 2 }), [0, 0, 0.25], [PI / 2, 0, 0], tj);
    add(sphere(0.14, 8, 6), [0, 0, 0], [0, 0, 0], tj);
    const nj = new THREE.Object3D(); nj.position.set(0, 0, 0.5); nj.rotation.set(-curl * 0.6, 0, 0); tj.add(nj); nj.updateMatrixWorld(true); tj = nj;
  }
  return root;
}

// a chrome monolith on a lapis plinth; may float upside-down above its own reflection
export function monolith(b, at, h, yaw = 0) {
  b.add(box(2.2, 0.5, 2.2, { s: 1 }), DM.lapis, mat4([at.x, at.y + 0.25, at.z], [0, yaw, 0]));
  b.add(cyl(0.55, 0.85, h, 4, { s: 0.5, flat: true }), DM.chrome, mat4([at.x, at.y + 0.5 + h / 2, at.z], [0, yaw + PI / 4, 0]));
  b.add(cyl(0, 0.55, 1.6, 4, { flat: true }), DM.chrome, mat4([at.x, at.y + 0.5 + h + 0.8, at.z], [0, yaw + PI / 4, 0]));
  b.add(clean(new THREE.OctahedronGeometry(0.45, 0)), DM.glowM, mat4([at.x, at.y + 0.5 + h + 2.6, at.z], [0, yaw, 0]));
}
// a moon arch: half a ring standing in the water, so its reflection closes the circle
export function arch(b, at, r, yaw = 0, thick = 0.55) {
  const g = clean(new THREE.TorusGeometry(r, thick, 8, 28, PI));
  b.add(g, DM.marble, mat4([at.x, at.y, at.z], [0, yaw, 0]));
  const rim = clean(new THREE.TorusGeometry(r - thick * 0.9, thick * 0.3, 6, 28, PI));
  b.add(rim, DM.chrome, mat4([at.x, at.y, at.z], [0, yaw, 0]));
  for (const s of [-1, 1]) b.add(sphere(thick * 1.25, 10, 8), DM.gold, mat4([at.x + Math.cos(yaw) * s * r, at.y + 0.1, at.z - Math.sin(yaw) * s * r]));
}
// a pagoda: n tiers of blue lacquer and turquoise tile (flip hangs it upside-down)
export function pagoda(b, at, { tiers = 3, w = 6, h = 3.2, flip = false, glows = null } = {}) {
  const sgn = flip ? -1 : 1;
  const M = (x, y, z, rx = 0, ry = 0, rz = 0) => mat4([at.x + x, at.y + y * sgn, at.z + z], [rx + (flip ? PI : 0), ry, rz]);
  b.add(box(w + 1.6, 0.6, w + 1.6, { s: 1 }), DM.lapis, M(0, 0.3, 0));
  let y = 0.6;
  for (let t = 0; t < tiers; t++) {
    const ww = w * (1 - t * 0.2), hh = h * (1 - t * 0.08);
    b.add(box(ww, hh, ww, { s: 0.7 }), DM.lacquer, M(0, y + hh / 2, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(cyl(0.22, 0.22, hh, 6), DM.gold, M(sx * ww / 2, y + hh / 2, sz * ww / 2));
    for (let s = 0; s < 4; s++) b.add(box(ww * 0.4, hh * 0.5, 0.1), DM.stained, M(Math.sin(s * PI / 2) * (ww / 2 + 0.02), y + hh * 0.55, Math.cos(s * PI / 2) * (ww / 2 + 0.02), 0, s * PI / 2, 0));
    y += hh;
    // a flared roof with turned-up gold corners
    const rw = ww * 0.78 + 1.8;
    b.add(cyl(rw * 0.42, rw * 0.78, 1.1, 4, { s: 0.6, flat: true }), DM.roof, M(0, y + 0.55, 0, 0, PI / 4, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.add(cyl(0.05, 0.2, 0.9, 5), DM.gold, M(sx * rw * 0.53, y + 0.4, sz * rw * 0.53, sz * 0.7, 0, -sx * 0.7));
      if (glows) glows.add(new THREE.Vector3(at.x + sx * rw * 0.5, at.y + (y - 0.1) * sgn, at.z + sz * rw * 0.5), 0x70f0ff, 1.6, true);
    }
    y += 1.1;
  }
  b.add(cyl(0.12, 0.3, 3, 6), DM.gold, M(0, y + 1.5, 0));
  for (let i = 0; i < 4; i++) b.add(clean(new THREE.TorusGeometry(0.45 - i * 0.07, 0.07, 5, 12)), DM.gold, M(0, y + 0.6 + i * 0.6, 0, PI / 2, 0, 0));
  return y;
}
// a glowing crystal cluster
export function crystals(b, at, s, R, mat) {
  for (let k = 0; k < 5; k++) {
    const h = s * (1 + R() * 1.6), a = R() * PI * 2, tilt = (R() - 0.5) * 0.9;
    b.add(cyl(0, s * (0.3 + R() * 0.2), h, 5, { flat: true }), mat, mat4([at.x + Math.cos(a) * s * 0.4, at.y + h * 0.42, at.z + Math.sin(a) * s * 0.4], [tilt, a, tilt * 0.5]));
  }
}
// a staircase to nowhere (Escher would approve)
export function stairs(b, at, yaw, n, { w = 2, rise = 0.5, run = 0.8, mat = DM.marble, rail = true } = {}) {
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3(Math.sin(yaw) * run * i, rise * i, Math.cos(yaw) * run * i).add(at);
    b.add(box(w, rise, run, { s: 1 }), mat, mat4([p.x, p.y + rise / 2, p.z], [0, yaw, 0]));
    if (rail && i % 2 === 0) for (const s of [-1, 1]) b.add(cyl(0.06, 0.06, 1, 4), DM.gold, mat4([p.x + Math.cos(yaw) * s * w / 2, p.y + rise + 0.5, p.z - Math.sin(yaw) * s * w / 2]));
  }
}

// ------------------------------------------------------------------ creatures' bodies (shared by props and foes)
// a jellyfish bell: a soft dome with a scalloped skirt (radius 1, top at y=0)
export function bellGeo(r = 1, seg = 20) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * PI * 0.55; pts.push([Math.sin(a) * r * (1 + 0.08 * t), Math.cos(a) * r * 0.75 - r * 0.75]); }
  pts.push([r * 1.02, -r * 0.8], [r * 0.85, -r * 0.72]);
  const g = lathe(pts, seg, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < -r * 0.6) { const a = Math.atan2(z, x), k = 1 + 0.08 * Math.sin(a * 8); p.setXYZ(i, x * k, y - Math.max(0, Math.sin(a * 8)) * 0.1 * r, z * k); }
  }
  g.computeVertexNormals();
  return g;
}
// a glass koi/manta-friendly fish body, nose at +z (length 1)
export function fishGeo(len = 1, fat = 0.22) {
  const g = new THREE.SphereGeometry(1, 14, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (z + 1) / 2;
    const k = Math.sin(Math.min(1, t * 1.15) * PI) ** 0.8 * (0.35 + 0.65 * t);
    p.setXYZ(i, x * fat * k * len, y * fat * 1.1 * k * len, z * len * 0.5);
  }
  g.computeVertexNormals();
  return clean(g);
}
