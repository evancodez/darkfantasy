// The dreaming sky over the Mirror Sea: a kaleidoscope mandala turning slowly
// at the zenith, acid aurora curtains along the horizon, a starry abyss below
// the lagoon's edge, a black-hole sun ringed in prismatic fire, glass-marble
// planets with weather swirling inside, and islands hanging upside-down far
// off, their waterfalls pouring up into the sky.
import * as THREE from 'three';
import { NOISE, starField, flareStars } from '../sky.js';
import { T } from '../../core/tex.js';

export const SUN_DIR = new THREE.Vector3(0.42, 0.3, -0.86).normalize();

function dome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uWake: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uWake; varying vec3 vDir;
      vec3 pal(float t){ return .5 + .5 * cos(6.2831 * (vec3(0., .33, .67) + t)); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        // ultramarine dusk: violet-black overhead, a luminous blue-magenta horizon, the abyss below
        vec3 col = mix(vec3(.10, .05, .38), vec3(.015, .01, .09), smoothstep(.0, .75, h));
        col += vec3(.28, .06, .32) * exp(-abs(h) * 9.);
        col = mix(col, vec3(.01, .005, .05), smoothstep(-.02, -.35, h));
        // nebula: domain-warped clouds in acid cyan and magenta
        vec3 w = d * 2.2 + vec3(0., uTime * .004, 0.);
        float n = fbm3(w + fbm3(w * 1.7 + 4.) * 1.3);
        float n2 = fbm3(d * 5. + vec3(2.1, uTime * .006, 7.3));
        col += vec3(.36, .04, .40) * smoothstep(.52, .82, n) * (.4 + n2);
        col += vec3(.0, .30, .36) * smoothstep(.6, .8, n2) * (1. - smoothstep(.5, .8, n)) * .8;
        col *= 1. - smoothstep(.62, .82, fbm3(d * 8. + 3.)) * .35;
        // aurora curtains just above the horizon
        float az = atan(d.z, d.x);
        float cur = fbm3(vec3(az * 3.5, uTime * .05, 1.7)) ;
        float band = smoothstep(.05, .14, h) * smoothstep(.5, .16, h + cur * .18);
        float rays = .5 + .5 * sin(az * 90. + cur * 30. + uTime * .3);
        col += mix(vec3(.15, 1., .55), vec3(.9, .2, 1.), smoothstep(.1, .4, h)) * band * rays * smoothstep(.45, .7, cur) * .55;
        // the kaleidoscope at the zenith: twelve mirrored sectors, rings breathing outward
        vec2 q = d.xz / (1.3 + d.y);
        float r = length(q), a = atan(q.y, q.x) + uTime * .015;
        float N = 12.; a = abs(mod(a, 6.2831 / N) - 3.14159 / N);
        vec2 k = vec2(cos(a), sin(a)) * r;
        float pat = sin(k.x * 38. - uTime * .35) * sin(k.y * 52. + k.x * 9.) + sin(r * 60. - uTime * .6) * .6;
        float petal = smoothstep(.2, .9, sin(a * 18. + r * 30. - uTime * .4) * .5 + .5);
        float mand = smoothstep(.25, 1.3, pat + petal) * smoothstep(.62, .0, r);
        float lines = smoothstep(.06, 0., abs(fract(r * 9. - uTime * .03) - .5) - .44) * smoothstep(.6, .1, r);
        vec3 mc = pal(r * 1.6 - uTime * .02 + .55);
        col += mc * (mand * .5 + lines * .35) * (.55 + uWake * .8);
        col += vec3(1., .9, 1.) * exp(-r * 22.) * (.5 + uWake);
        // starlit abyss under the edge of the world: a slow galaxy swirl below
        if (h < 0.) {
          vec2 g = d.xz / (1.2 - d.y); float gr = length(g), ga = atan(g.y, g.x);
          float arms = .5 + .5 * sin(ga * 2. - log(gr + .02) * 4.5 + uTime * .02);
          col += vec3(.25, .15, .6) * pow(arms, 3.) * smoothstep(.9, .1, gr) * smoothstep(-.02, -.3, h) * (.6 + fbm3(d * 9.) * .8);
          col += vec3(.7, .6, 1.) * exp(-gr * 9.) * smoothstep(-.1, -.6, h) * .6;
        }
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(450, 40, 24), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// stars below the horizon too (you can look off the edge of the lagoon)
function abyssStars(R, rand) {
  const N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let v; do { v = new THREE.Vector3(rand() * 2 - 1, -rand(), rand() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.05);
    v.normalize().multiplyScalar(R); pos.set([v.x, v.y, v.z], i * 3);
    const k = rand(); col.set(k < 0.6 ? [0.8, 0.85, 1] : k < 0.85 ? [0.7, 0.6, 1] : [1, 0.7, 0.9], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, depthWrite: false, vertexColors: true,
    vertexShader: `uniform float uTime; varying vec3 vC; void main(){ vC = color * (.6 + .4 * sin(uTime * 1.7 + position.x * 3.1)); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; gl_PointSize = 1.; }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.); }`,
  }));
  m.renderOrder = -9; m.frustumCulled = false;
  return m;
}

// a black hole for a sun: the dark disc, a thin photon ring and a tilted
// accretion disc in prismatic fire, brighter on the side spinning toward you
function blackSun(size) {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      vec3 pal(float t){ return .55 + .45 * cos(6.2831 * (vec3(0., .33, .67) + t)); }
      void main(){
        vec2 p = (vUv - .5) * 2.; float r = length(p);
        // accretion disc: an ellipse (tilted ring), lensed over the top as an arc
        vec2 e = vec2(p.x, p.y * 3.2 + .05); float er = length(e);
        float disc = smoothstep(.95, .6, er) * smoothstep(.28, .42, er);
        float sw = .5 + .5 * sin(atan(e.y, e.x) * 3. - er * 12. + uTime * 1.2);
        float dop = .6 + .7 * smoothstep(-.8, .8, -p.x);
        vec3 c = pal(er * .9 - uTime * .05) * disc * (.5 + sw * .8) * dop;
        float arc = smoothstep(.06, 0., abs(r - .36)) * step(0., p.y) * .9;
        c += pal(.1 + p.x * .3 + uTime * .03) * arc;
        c += vec3(1., .9, 1.) * smoothstep(.025, 0., abs(r - .3)) * 1.4;
        float hole = smoothstep(.27, .3, r);
        c *= hole * (p.y < 0. || r > .3 ? 1. : 1.);
        c += vec3(.4, .2, .8) * exp(-r * 3.) * .35 * hole;
        float a = clamp(max(max(c.r, c.g), c.b), 0., 1.);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.renderOrder = -6; m.frustumCulled = false;
  // the hole itself is opaque: it hides the stars behind it
  const hole = new THREE.Mesh(new THREE.CircleGeometry(size * 0.15, 32), new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false, fog: false }));
  hole.renderOrder = -7; hole.frustumCulled = false; hole.position.z = -0.5;
  m.add(hole);
  return m;
}

// a glass marble the size of a moon, weather swirling inside
function marblePlanet(r, seed, hue) {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uHue: { value: hue } },
    vertexShader: `varying vec3 vN, vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uSeed, uHue; varying vec3 vN, vP;
      vec3 pal(float t){ return .5 + .5 * cos(6.2831 * (vec3(0., .33, .67) + t)); }
      void main(){
        vec3 p = normalize(vP);
        float s = fbm3(p * 2.5 + vec3(uSeed, uTime * .01, 0.) + fbm3(p * 4. + uSeed) * 1.8);
        float band = sin(p.y * 9. + s * 8. + uTime * .05);
        vec3 c = pal(uHue + s * .5 + band * .08) * (.25 + .75 * smoothstep(-.4, 1., band));
        float f = pow(1. - abs(vN.z), 2.5);
        c = c * (.35 + .65 * max(vN.x * .5 + vN.y * .6 + .3, 0.)) + vec3(.8, .9, 1.) * f * .8;
        c += vec3(1.) * pow(max(dot(vN, normalize(vec3(-.4, .5, .8))), 0.), 40.) * .9;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat);
  m.renderOrder = -6; m.frustumCulled = false;
  return m;
}

// an island hanging upside-down, falls pouring up off its rim
function upsideIsland(rand, s) {
  const g = new THREE.Group();
  const rockM = new THREE.MeshBasicMaterial({ color: 0x1a0e4a, fog: false });
  const grassM = new THREE.MeshBasicMaterial({ color: 0x2a6aa0, fog: false });
  const falls = new THREE.MeshBasicMaterial({ color: 0x9ae0ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.8, 7), rockM); cone.position.y = s * 0.9; g.add(cone);   // points up
  const top = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.02, s * 0.9, s * 0.25, 7), grassM); top.position.y = -0.05 * s; g.add(top);
  for (let i = 0; i < 5; i++) {
    const tr = new THREE.Mesh(new THREE.ConeGeometry(s * 0.14, s * 0.6, 5), grassM);
    const a = rand() * 6.28, rr = rand() * s * 0.7; tr.position.set(Math.cos(a) * rr, -s * 0.35, Math.sin(a) * rr); tr.rotation.x = Math.PI; g.add(tr);
  }
  for (let i = 0; i < 2; i++) {
    const a = rand() * 6.28, fl = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.25, s * 4), falls);
    fl.position.set(Math.cos(a) * s, s * 2, Math.sin(a) * s); fl.lookAt(0, s * 2, 0); g.add(fl);
  }
  for (const c of g.children) { c.renderOrder = -5; c.frustumCulled = false; }
  return g;
}

export function createDreamSky(scene) {
  let seed = 61;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group(); group.visible = false;
  const d = dome(); group.add(d);
  const stars = starField(440, rand); group.add(stars);
  const deep = abyssStars(440, rand); group.add(deep);
  const flares = flareStars(430, rand, 300, 7, 28); group.add(flares);
  const R = 400;
  const sun = blackSun(170); sun.position.copy(SUN_DIR).multiplyScalar(R); sun.lookAt(0, 0, 0); sun.rotateZ(-0.35); group.add(sun);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), new THREE.MeshBasicMaterial({ map: T.glow, color: 0x5a2aa0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.copy(SUN_DIR).multiplyScalar(R + 5); halo.lookAt(0, 0, 0); halo.renderOrder = -8; group.add(halo);
  const planets = [[new THREE.Vector3(-0.8, 0.42, -0.4), 34, 1.3, 0.62], [new THREE.Vector3(0.7, 0.16, 0.66), 20, 4.1, 0.15], [new THREE.Vector3(-0.3, 0.72, 0.62), 12, 7.7, 0.85]]
    .map(([dir, r, sd, hue]) => { const m = marblePlanet(r, sd, hue); m.position.copy(dir.normalize()).multiplyScalar(R - 30); group.add(m); return m; });
  const isles = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + rand() * 0.5, el = 0.06 + rand() * 0.22;
    const isl = upsideIsland(rand, 7 + rand() * 9);
    isl.position.set(Math.cos(a) * 330, Math.sin(el) * 330 + 30, Math.sin(a) * 330); isl.rotation.y = rand() * 6;
    group.add(isl); isles.push(isl);
  }
  scene.add(group);
  const mats = [d.material, deep.material, sun.material, flares.material, stars.material, ...planets.map(p => p.material)];
  return {
    group, dome: d,
    set wake(v) { d.material.uniforms.uWake.value = v; },
    update(t, camPos) {
      group.position.copy(camPos);
      for (const m of mats) m.uniforms.uTime.value = t;
      planets.forEach((p, i) => { p.rotation.y = t * (0.01 + i * 0.006); });
      isles.forEach((s, i) => { s.position.y += Math.sin(t * 0.2 + i) * 0.01; });
    },
  };
}
