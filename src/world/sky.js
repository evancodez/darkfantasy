// The sky: a gradient dome with drifting nebulae, two layers of pixel stars
// (1px dots and big cross-flare sparkles), a huge slowly-turning spiral galaxy
// hung behind the castle, a second smaller galaxy, and the moon.
import * as THREE from 'three';
import { T } from '../core/tex.js';

export const GALAXY_DIR = new THREE.Vector3(0, 0.42, -1).normalize();
export const MOON_DIR = new THREE.Vector3(-0.85, 0.42, 0.3).normalize();

const NOISE = /* glsl */`
float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
`;

function dome(fogColor) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uFog: { value: fogColor },
      uTop: { value: new THREE.Color(0x01010a) }, uHorizon: { value: new THREE.Color(0x1a1048) },
      uRedDir: { value: new THREE.Vector3(0.9, 0.25, 0.35).normalize() },
      uNeb: { value: 1 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uNeb; uniform vec3 uFog, uTop, uHorizon, uRedDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(-.02, .55, h));
        col = mix(col, uFog, smoothstep(.04, -.12, h));
        float n = fbm3(d * 2.2 + vec3(0., 0., uTime * .004));
        float n2 = fbm3(d * 4.7 + vec3(7.1, 3.3, uTime * .006));
        float up = smoothstep(-.1, .25, h);
        // violet-blue clouds everywhere, a warm red-orange nebula over the cornfield,
        // a teal veil low on the horizon
        col += vec3(.13, .07, .46) * smoothstep(.48, .82, n) * (.4 + n2) * up * uNeb;
        float red = smoothstep(.35, .95, dot(d, uRedDir));
        col += vec3(.55, .12, .04) * smoothstep(.5, .8, n2) * smoothstep(.4, .7, n) * red * up * uNeb;
        col += vec3(.95, .45, .1) * smoothstep(.72, .9, n2) * red * up * .5 * uNeb;
        col += vec3(.02, .16, .15) * smoothstep(.5, .75, n2) * smoothstep(.3, .05, abs(h - .12)) * uNeb;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

function starField(R, rand) {
  // tiny 1–2 px stars
  const N = 2600, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v; do { v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
    v.normalize(); if (v.y < -0.05) v.y = -v.y * 0.5;
    v.multiplyScalar(R * 0.97); pos.set([v.x, v.y, v.z], i * 3);
    const k = rand(), b = 0.45 + rand() * 0.55;
    const c = k < 0.6 ? [0.85, 0.9, 1] : k < 0.85 ? [0.6, 0.7, 1] : k < 0.95 ? [1, 0.9, 0.7] : [1, 0.6, 0.7];
    col.set(c.map(x => x * b), i * 3);
    sz[i] = rand() < 0.88 ? 1 : 2; ph[i] = rand() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, depthWrite: false, vertexColors: true,
    vertexShader: `attribute float aSize, aPh; uniform float uTime; varying vec3 vC;
      void main(){ vC = color * (.75 + .25 * sin(uTime * 2.3 + aPh * 7.)); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; gl_PointSize = aSize; }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.); }`,
  });
  const p = new THREE.Points(g, m); p.renderOrder = -9; p.frustumCulled = false;
  return p;
}

function flareStars(R, rand, count, minS, maxS) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let v; do { v = new THREE.Vector3(rand() * 2 - 1, rand() * 0.95 + 0.05, rand() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.05);
    v.normalize().multiplyScalar(R * 0.95); pos.set([v.x, v.y, v.z], i * 3);
    const k = rand();
    col.set(k < 0.7 ? [1, 1, 1] : k < 0.9 ? [0.7, 0.8, 1] : [1, 0.85, 0.6], i * 3);
    sz[i] = minS + Math.pow(rand(), 3) * (maxS - minS); ph[i] = rand() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, map: { value: T.star4 } }, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize, aPh; uniform float uTime; varying vec3 vC;
      void main(){ float tw = .6 + .4 * sin(uTime * 1.7 + aPh * 5.); vC = color * tw; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; gl_PointSize = aSize * (.8 + .2 * tw); }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC * a, 1.); }`,
  });
  const p = new THREE.Points(g, m); p.renderOrder = -8; p.frustumCulled = false;
  return p;
}

function galaxy(size, opts) {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uRot: { value: opts.rot ?? 0.03 }, uBright: { value: opts.bright ?? 1 }, uWind: { value: opts.wind ?? 3.6 },
      uCore: { value: new THREE.Color(opts.core ?? 0xe0e8ff) }, uInner: { value: new THREE.Color(opts.inner ?? 0x8a90ff) },
      uMid: { value: new THREE.Color(opts.mid ?? 0x3c30e0) }, uOuter: { value: new THREE.Color(opts.outer ?? 0x14b08a) },
      uSeed: { value: opts.seed ?? 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uRot, uBright, uWind, uSeed; uniform vec3 uCore, uInner, uMid, uOuter; varying vec2 vUv;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
      void main(){
        vec2 p = (vUv - .5) * 2.;
        float r = length(p);
        if (r > 1.) discard;
        // differential rotation: the core turns faster than the rim
        float a = atan(p.y, p.x) + uTime * uRot / (r + .25);
        vec2 q = vec2(cos(a), sin(a)) * r;
        float n = fbm3(vec3(q * 2.6, uSeed));
        float n2 = fbm3(vec3(q * 7., uSeed + 4.));
        float n3 = fbm3(vec3(q * 18., uSeed + 9.));
        float s = a - log(r + .015) * uWind + (n - .5) * 1.6;
        float arms = pow(.5 + .5 * cos(3. * s), 2.5);
        float thin = pow(.5 + .5 * cos(3. * s + 1.9), 10.) * .6;
        float fall = smoothstep(1., .12, r);
        float dens = (arms * (.35 + .9 * n2) + thin * n3) * fall * smoothstep(.03, .16, r);
        float dust = smoothstep(.55, .72, n2) * smoothstep(.15, .5, r) * .7;
        vec3 col = mix(uInner, uMid, smoothstep(.08, .4, r));
        col = mix(col, uOuter, smoothstep(.3, .62, r) * smoothstep(.3, .6, n));
        col = mix(col, vec3(.15, .35, 1.), smoothstep(.55, .8, r) * (1. - smoothstep(.4, .7, n)) * .7);
        col = mix(col, uMid * .8, smoothstep(.75, .98, r));
        vec3 c = col * dens * (1. - dust);
        c += col * .12 * fall * n2;
        c += uCore * (exp(-r * 26.) * 1.3 + exp(-r * 7.) * .28);
        // fine star dust along the arms
        vec2 g = floor(q * 160.);
        float st = step(.965, h2(g)) * (arms + .2) * fall;
        c += vec3(.85, .9, 1.) * st * h2(g + 3.);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.renderOrder = -7; m.frustumCulled = false;
  return m;
}

export function createSky(scene, fogColor) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group();
  const d = dome(fogColor);
  group.add(d);
  group.add(starField(440, rand));
  const flares = flareStars(430, rand, 140, 7, 23);
  group.add(flares);

  const R = 400;
  const gal = galaxy(720, { bright: 0.8 });
  gal.position.copy(GALAXY_DIR).multiplyScalar(R); gal.lookAt(0, 0, 0);
  group.add(gal);
  const gal2 = galaxy(150, { inner: 0xb0a0ff, mid: 0x6a40e0, outer: 0x4060ff, rot: 0.05, wind: 3.0, bright: 0.85, seed: 3 });
  gal2.position.set(0.75, 0.62, 0.25).normalize().multiplyScalar(R); gal2.lookAt(0, 0, 0); gal2.rotateZ(1.2);
  group.add(gal2);

  const moonMat = new THREE.MeshBasicMaterial({ map: T.moon, transparent: true, depthWrite: false, fog: false });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), moonMat);
  moon.position.copy(MOON_DIR).multiplyScalar(R); moon.lookAt(0, 0, 0); moon.renderOrder = -6;
  group.add(moon);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), new THREE.MeshBasicMaterial({ map: T.glow, color: 0x4a5ac0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.copy(MOON_DIR).multiplyScalar(R + 2); halo.lookAt(0, 0, 0); halo.renderOrder = -7;
  group.add(halo);

  scene.add(group);
  const mats = [d.material, gal.material, gal2.material, flares.material, group.children[1].material];
  return {
    group, galaxy: gal, galaxy2: gal2, dome: d,
    update(t, camPos) {
      group.position.copy(camPos);
      for (const m of mats) m.uniforms.uTime.value = t;
    },
  };
}
