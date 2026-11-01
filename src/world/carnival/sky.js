// The carnival's sky: a plum-black dome with rose and teal nebulae, a star
// vortex wheeling over the Big Top, the shattered moon (its pieces drifting
// apart, light pouring out of the cracks) and a ringed rose planet low in the
// east. Shares the star layers with the castle sky.
import * as THREE from 'three';
import { NOISE, starField, flareStars, galaxy } from '../sky.js';
import { T } from '../../core/tex.js';

export const SHATTER_DIR = new THREE.Vector3(-0.78, 0.36, -0.52).normalize();
export const VORTEX_DIR = new THREE.Vector3(0.05, 0.62, -1).normalize();
export const PLANET_DIR = new THREE.Vector3(0.92, 0.12, 0.35).normalize();

function dome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uTop: { value: new THREE.Color(0x05010e) }, uHorizon: { value: new THREE.Color(0x2c0a3c) }, uLow: { value: new THREE.Color(0x0a2a38) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime; uniform vec3 uTop, uHorizon, uLow; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(-.02, .6, h));
        col = mix(col, uLow, smoothstep(.02, -.25, h));
        float n = fbm3(d * 2.0 + vec3(0., uTime * .003, 0.));
        float n2 = fbm3(d * 4.3 + vec3(3.1, 7.7, uTime * .005));
        float n3 = fbm3(d * 9.0 + vec3(1.7, 2.9, 5.3));
        // rose clouds with teal edges, a gold rim where they are thin
        float rose = smoothstep(.5, .8, n) * (.5 + n2);
        col += vec3(.42, .06, .28) * rose;
        col += vec3(.04, .30, .30) * smoothstep(.55, .75, n2) * (1. - smoothstep(.55, .85, n)) * smoothstep(-.2, .3, h);
        col += vec3(.5, .3, .08) * smoothstep(.72, .9, n2) * smoothstep(.62, .7, n) * .5;
        // dark dust lanes
        col *= 1. - smoothstep(.6, .8, n3) * .45 * smoothstep(.4, .7, n);
        // a teal glow rising from below the island
        col += vec3(.02, .14, .16) * smoothstep(.1, -.4, h);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// the shattered moon: voronoi plates drifting outward from a glowing core
function shatteredMoon(size) {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, transparent: true,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime; varying vec2 vUv;
      vec2 h22(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      // nearest cell of q (cells on a 5x5 grid over the disc)
      vec3 cell(vec2 q){ vec2 g = floor(q * 2.6), f = q * 2.6 - g; float d1 = 9.; vec2 id = vec2(0.); float d2 = 9.;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(i, j), c = o + h22(g + o) * .8 + .1; float d = length(c - f);
          if (d < d1) { d2 = d1; d1 = d; id = g + o; } else if (d < d2) d2 = d; }
        return vec3(id, d2 - d1); }
      vec2 drift(vec2 id){ vec2 c = (id + .5) / 2.6; float r = length(c); return normalize(c + 1e-4) * (.03 + .1 * smoothstep(.45, 1., r)) * (1. + .25 * sin(uTime * .15 + id.x * 3. + id.y * 5.)); }
      void main(){
        vec2 p = (vUv - .5) * 2.6;
        vec4 outc = vec4(0.);
        // which drifted plate covers this pixel?
        vec2 g = floor(p * 2.6);
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
          vec2 id = g + vec2(i, j), q = p - drift(id);
          if (length(q) > 1.) continue;
          vec3 c = cell(q);
          if (c.xy != id) continue;
          // shade the plate as part of a lit sphere
          vec3 n = vec3(q, sqrt(1. - dot(q, q)));
          float lit = clamp(dot(n, normalize(vec3(-.45, .5, .75))), 0., 1.);
          float cr = fbm3(vec3(q * 3.2, 1.7)), cr2 = fbm3(vec3(q * 9., 4.1));
          vec3 alb = mix(vec3(.55, .5, .72), vec3(.9, .86, .98), smoothstep(.35, .7, cr)) * (.8 + .4 * cr2);
          vec3 col = alb * (.18 + .95 * lit);
          float edge = smoothstep(.09, .0, c.z);
          col += vec3(1., .45, .8) * edge * .9 + vec3(.3, 1., .9) * smoothstep(.05, .0, c.z) * .8;
          outc = vec4(col, 1.);
        }
        if (outc.a < .5) {
          // light pouring out between the plates
          float r = length(p);
          float core = exp(-r * 2.2) * 1.6 + exp(-r * 6.) * 1.5;
          float rays = pow(.5 + .5 * sin(atan(p.y, p.x) * 9. + fbm3(vec3(p * 2., uTime * .05)) * 4.), 6.) * exp(-r * 1.4) * .5;
          vec3 c = mix(vec3(.3, 1., .9), vec3(1., .5, .85), smoothstep(.2, .9, r)) * (core + rays) * smoothstep(1.3, .6, r);
          outc = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0., 1.));
        }
        gl_FragColor = outc;
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.renderOrder = -6; m.frustumCulled = false;
  return m;
}

// a rose gas giant with tilted rings
function ringedPlanet(size) {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, transparent: true,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - .5) * 2.;
        mat2 tilt = mat2(cos(.35), -sin(.35), sin(.35), cos(.35));
        vec2 q = tilt * p;
        float r = length(p * 2.1);
        vec4 c = vec4(0.);
        // rings (behind the planet first)
        float er = length(vec2(q.x, q.y / .22)) * 2.1;
        float band = smoothstep(1.25, 1.32, er) * smoothstep(2.05, 1.95, er) * (.55 + .45 * sin(er * 40.)) * (1. - smoothstep(1.62, 1.66, er) * smoothstep(1.72, 1.68, er));
        vec4 ring = vec4(vec3(.95, .75, .9) * band, band * .85);
        if (q.y > 0. || r > 1.) c = ring;
        if (r < 1.) {
          vec3 n = vec3(p * 2.1, sqrt(1. - r * r));
          float lit = clamp(dot(n, normalize(vec3(-.6, .35, .7))), 0., 1.);
          float b = sin((tilt * p).y * 34. + fbm3(vec3(p * 3., uTime * .02)) * 4.);
          vec3 alb = mix(vec3(.75, .25, .5), vec3(1., .7, .78), .5 + .5 * b);
          alb = mix(alb, vec3(.4, .85, .85), smoothstep(.6, .9, fbm3(vec3(p * 5., 2.))) * .5);
          vec3 col = alb * (.08 + 1.05 * lit) + vec3(.5, .2, .6) * pow(1. - n.z, 3.) * .6;
          c = vec4(col, 1.);
          if (q.y < 0.) c = vec4(mix(c.rgb, ring.rgb, ring.a), 1.);
        }
        gl_FragColor = c;
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.renderOrder = -6; m.frustumCulled = false;
  return m;
}

export function createFairSky(scene) {
  let seed = 31;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group(); group.visible = false;
  const d = dome(); group.add(d);
  const stars = starField(440, rand); group.add(stars);
  const flares = flareStars(430, rand, 260, 7, 26); group.add(flares);
  const R = 400;
  const vortex = galaxy(560, { inner: 0xffb0e0, mid: 0xc02aa0, outer: 0x18c8b0, core: 0xfff0ff, rot: 0.06, wind: 4.2, bright: 0.9, seed: 9 });
  vortex.position.copy(VORTEX_DIR).multiplyScalar(R); vortex.lookAt(0, 0, 0); vortex.rotateZ(0.5);
  group.add(vortex);
  const moon = shatteredMoon(150);
  moon.position.copy(SHATTER_DIR).multiplyScalar(R - 10); moon.lookAt(0, 0, 0);
  group.add(moon);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshBasicMaterial({ map: T.glow, color: 0x8a3a9a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.copy(SHATTER_DIR).multiplyScalar(R); halo.lookAt(0, 0, 0); halo.renderOrder = -7;
  group.add(halo);
  const planet = ringedPlanet(130);
  planet.position.copy(PLANET_DIR).multiplyScalar(R - 20); planet.lookAt(0, 0, 0);
  group.add(planet);
  scene.add(group);
  const mats = [d.material, vortex.material, moon.material, planet.material, flares.material, stars.material];
  return {
    group,
    update(t, camPos) { group.position.copy(camPos); for (const m of mats) m.uniforms.uTime.value = t; },
  };
}
