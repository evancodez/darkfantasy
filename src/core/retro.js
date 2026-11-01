// Retro renderer: the scene is drawn into a small render target (≈300 px tall),
// then a final pass adds a soft glow, grades the colour, quantises it with a
// 4x4 ordered dither and the canvas is scaled up with crisp, integer pixels.
// Every surface uses RetroMaterial: per-vertex (Gouraud) lighting, optional
// baked vertex lighting, sphere-mapped chrome, per-vertex linear fog and a
// little vertex snapping — the way late-90s consoles drew things.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

// ---------------------------------------------------------------- shared uniforms
const v4s = n => Array.from({ length: n }, () => new THREE.Vector4());
export const G = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0x140c3c) },
  uFogNear: { value: 24 }, uFogFar: { value: 150 },
  uSnap: { value: new THREE.Vector2(240, 135) },
  uAmbSky: { value: new THREE.Color(0x4a46b8) },
  uAmbGround: { value: new THREE.Color(0x1a1238) },
  uSunDir: { value: new THREE.Vector3(0.45, 0.75, 0.35).normalize() },
  uSunColor: { value: new THREE.Color(0x8c94ff) },
  uRimColor: { value: new THREE.Color(0x9a70ff) },
  uLP: { value: v4s(8) }, uLC: { value: v4s(8) },
};

let WHITE;
function white() {
  if (!WHITE) { WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); WHITE.needsUpdate = true; }
  return WHITE;
}

const VERT = /* glsl */`
uniform float uTime, uFogNear, uFogFar, uFogAmt, uSpec, uShine, uRim, uWind, uLit, uEdge;
uniform vec2 uSnap, uScroll;
uniform vec3 uAmbSky, uAmbGround, uSunDir, uSunColor, uRimColor;
uniform vec4 uLP[8]; uniform vec4 uLC[8];
varying vec2 vUv; varying vec3 vLight; varying vec3 vAdd; varying float vFog; varying vec2 vEnv; varying float vEdge;
void main(){
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
  M = M * instanceMatrix;
  #endif
  vec4 wp = M * vec4(position, 1.);
  #ifdef WIND
  float h = max(position.y, 0.);
  wp.x += sin(uTime * 1.6 + wp.x * .31 + wp.z * .17) * uWind * h;
  wp.z += cos(uTime * 1.2 + wp.x * .19 + wp.z * .29) * uWind * h * .6;
  #endif
  vec3 n = normalize(mat3(M) * normal);
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  #ifdef SNAP
  if (clip.w > 0.) { vec2 s = clip.xy / clip.w; s = floor(s * uSnap + .5) / uSnap; clip.xy = s * clip.w; }
  #endif
  gl_Position = clip;
  vUv = uv + uScroll * uTime;
  vec3 V = normalize(cameraPosition - wp.xyz);
  vec3 L;
  #ifdef BAKED
  L = color;
  #else
  L = mix(uAmbGround, uAmbSky, n.y * .5 + .5) + uSunColor * max(dot(n, uSunDir), 0.);
  #ifdef USE_COLOR
  L *= color;
  #endif
  #endif
  for (int i = 0; i < 8; i++) {
    vec4 lc = uLC[i];
    if (lc.w <= 0.) continue;
    #ifdef BAKED
    if (uLP[i].w < .5) continue;
    #endif
    vec3 d = uLP[i].xyz - wp.xyz; float dist = length(d);
    float att = clamp(1. - dist / lc.w, 0., 1.); att *= att;
    L += lc.rgb * att * (max(dot(n, d / max(dist, .001)), 0.) * .7 + .3);
  }
  vLight = mix(vec3(1.), L, uLit);
  vEdge = mix(1., pow(max(dot(n, V), 0.), .75), uEdge);
  vec3 H = normalize(uSunDir + V);
  vAdd = (uSunColor * pow(max(dot(n, H), 0.), uShine) * uSpec + uRimColor * pow(1. - max(dot(n, V), 0.), 2.5) * uRim) * uLit;
  vec3 vn = normalize(mat3(viewMatrix) * n);
  vEnv = vn.xy * .48 + .5;
  vFog = clamp((length(mv.xyz) - uFogNear) / (uFogFar - uFogNear), 0., 1.) * uFogAmt;
}`;

const FRAG = /* glsl */`
uniform sampler2D map; uniform sampler2D uEnv;
uniform vec3 uColor, uFogColor, uFlashColor, uEmissive;
uniform float uEmit, uChrome, uAlphaTest, uOpacity, uFlash;
varying vec2 vUv; varying vec3 vLight; varying vec3 vAdd; varying float vFog; varying vec2 vEnv; varying float vEdge;
void main(){
  vec4 t = texture2D(map, vUv);
  t.rgb *= uColor;
  if (t.a < uAlphaTest) discard;
  vec3 c = t.rgb * mix(vLight, vec3(1.), uEmit);
  #ifdef CHROME
  vec3 e = texture2D(uEnv, vEnv).rgb;
  c = mix(c, e * uColor * (vLight * .55 + .45), uChrome);
  #endif
  c *= vEdge;
  c += vAdd + uEmissive;
  c = mix(c, uFlashColor, uFlash);
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, t.a * uOpacity);
}`;

// opts: map, color, baked, emit, spec, shine, rim, chrome, env, scroll, fog,
//       alphaTest, transparent, opacity, side, wind, additive, depthWrite, snap, lit
export function retroMat(o = {}) {
  const defines = {};
  if (o.baked) defines.BAKED = '';
  if (o.chrome) defines.CHROME = '';
  if (o.wind) defines.WIND = '';
  if (o.snap !== false) defines.SNAP = '';
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, defines,
    uniforms: {
      ...G,
      map: { value: o.map || white() },
      uEnv: { value: o.env || white() },
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
      uEmit: { value: o.emit ?? 0 },
      uLit: { value: o.lit ?? 1 },
      uSpec: { value: o.spec ?? 0 }, uShine: { value: o.shine ?? 18 },
      uRim: { value: o.rim ?? 0 }, uEdge: { value: o.edge ?? 0 },
      uChrome: { value: o.chrome ?? 0 },
      uScroll: { value: new THREE.Vector2(...(o.scroll || [0, 0])) },
      uFogAmt: { value: o.fog ?? 1 },
      uAlphaTest: { value: o.alphaTest ?? 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uWind: { value: o.wind ?? 0 },
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) },
    },
    vertexColors: !!(o.baked || o.vcol),
    transparent: !!(o.transparent || o.additive),
    side: o.side ?? THREE.FrontSide,
    depthWrite: o.depthWrite ?? !o.additive,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  m.userData.opts = o;
  return m;
}
// a fresh copy that still shares the global uniforms (ShaderMaterial.clone would copy them)
export const cloneMat = (m, over = {}) => retroMat({ ...m.userData.opts, ...over });

// ---------------------------------------------------------------- lights
// Static lights are baked into level vertex colours and also lit actors
// passing by; dynamic lights (fireballs, sparks) light everything.
export const Lights = {
  list: [],
  add(pos, color, intensity = 1, range = 10, { dynamic = false, flicker = 0 } = {}) {
    const l = { pos: pos.clone(), color: new THREE.Color(color), intensity, range, dynamic, flicker, on: true, seed: Math.random() * 100 };
    this.list.push(l); return l;
  },
  remove(l) { const i = this.list.indexOf(l); if (i >= 0) this.list.splice(i, 1); },
  update(t, focus) {
    const cand = [];
    for (const l of this.list) {
      if (!l.on || l.intensity <= 0) continue;
      const d = l.pos.distanceTo(focus) - l.range;
      if (d > 30) continue;
      cand.push([l.dynamic ? d - 1000 : d, l]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const P = G.uLP.value, C = G.uLC.value;
    for (let i = 0; i < 8; i++) {
      const l = cand[i]?.[1];
      if (!l) { C[i].set(0, 0, 0, 0); continue; }
      const f = l.flicker ? 1 - l.flicker * (0.5 + 0.3 * Math.sin(t * 11 + l.seed) + 0.2 * Math.sin(t * 27 + l.seed * 2)) * 0.5 : 1;
      P[i].set(l.pos.x, l.pos.y, l.pos.z, l.dynamic ? 1 : 0);
      C[i].set(l.color.r * l.intensity * f, l.color.g * l.intensity * f, l.color.b * l.intensity * f, l.range);
    }
  },
};

// ---------------------------------------------------------------- renderer + post
const QUAD_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const BRIGHT_F = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
void main(){ vec3 s = vec3(0.);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec3 c = texture2D(tSrc, vUv + (vec2(x, y) - 1.5) * uTexel).rgb;
    float l = max(c.r, max(c.g, c.b));
    s += c * smoothstep(uThr, uThr + .25, l);
  }
  gl_FragColor = vec4(s / 16., 1.); }`;

const BLUR_F = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 s = texture2D(tSrc, vUv).rgb * .2270;
  s += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * .3162;
  s += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * .0703;
  gl_FragColor = vec4(s, 1.); }`;

const FINAL_F = `uniform sampler2D tScene, tBloom; uniform vec2 uRes;
uniform float uBloom, uLevels, uDither, uSat, uVig, uTime, uFlash, uHurt, uFade, uWarp, uContrast;
uniform vec3 uFlashCol, uLift;
varying vec2 vUv;
const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
void main(){
  vec2 uv = vUv;
  if (uWarp > 0.) { vec2 q = uv - .5; float r = length(q); float a = uWarp * 3. * (1. - smoothstep(0., .7, r));
    uv = .5 + mat2(cos(a), -sin(a), sin(a), cos(a)) * q; }
  vec3 c = texture2D(tScene, uv).rgb;
  c += texture2D(tBloom, uv).rgb * uBloom;
  float l = dot(c, vec3(.299, .587, .114));
  c = mix(vec3(l), c, uSat);
  c = mix(c, c * c * (3. - 2. * c), uContrast);
  c += uLift * (1. - smoothstep(0., .35, l));
  vec2 q = vUv - .5; c *= 1. - dot(q, q) * uVig;
  c = mix(c, vec3(.6, 0., .08), uHurt * smoothstep(.1, .7, length(q)));
  c += uFlashCol * uFlash;
  c *= 1. - uFade;
  ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.));
  float d = (B[p.y * 4 + p.x] + .5) / 16. - .5;
  c = floor(clamp(c, 0., 1.) * uLevels + .5 + d * uDither) / uLevels;
  gl_FragColor = vec4(c, 1.);
}`;

export function createRetro({ targetH = 300 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  const canvas = renderer.domElement;
  canvas.style.imageRendering = 'pixelated';
  document.getElementById('game').appendChild(canvas);

  const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true };
  const linear = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtScene = new THREE.WebGLRenderTarget(4, 4, nearest);
  const rtA = new THREE.WebGLRenderTarget(4, 4, linear), rtB = new THREE.WebGLRenderTarget(4, 4, linear);

  const quadScene = new THREE.Scene(), quadCam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; quadScene.add(quad);
  const mk = (f, u) => new THREE.ShaderMaterial({ vertexShader: QUAD_V, fragmentShader: f, uniforms: u, depthTest: false, depthWrite: false });
  const bright = mk(BRIGHT_F, { tSrc: { value: rtScene.texture }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0.62 } });
  const blur = mk(BLUR_F, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const post = {
    tScene: { value: rtScene.texture }, tBloom: { value: rtA.texture }, uRes: { value: new THREE.Vector2() },
    uBloom: { value: 0.85 }, uLevels: { value: 24 }, uDither: { value: 1 }, uSat: { value: 1.12 }, uVig: { value: 0.9 },
    uContrast: { value: 0.18 }, uLift: { value: new THREE.Color(0.012, 0.0, 0.04) },
    uTime: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uHurt: { value: 0 }, uFade: { value: 0 }, uWarp: { value: 0 },
  };
  const final = mk(FINAL_F, post);

  const R = { renderer, canvas, post, W: 4, H: 4, scale: 1, pxScale: 1, targetH };
  R.resize = (camera) => {
    const s = Math.max(1, Math.round(innerHeight / R.targetH));
    R.scale = s; R.W = Math.max(8, Math.ceil(innerWidth / s)); R.H = Math.max(8, Math.ceil(innerHeight / s));
    renderer.setSize(R.W, R.H, false);
    canvas.style.width = R.W * s + 'px'; canvas.style.height = R.H * s + 'px';
    rtScene.setSize(R.W, R.H);
    const bw = Math.ceil(R.W / 4), bh = Math.ceil(R.H / 4);
    rtA.setSize(bw, bh); rtB.setSize(bw, bh);
    bright.uniforms.uTexel.value.set(1 / R.W, 1 / R.H);
    post.uRes.value.set(R.W, R.H);
    G.uSnap.value.set(R.W / 2, R.H / 2);
    if (camera) {
      camera.aspect = R.W / R.H; camera.updateProjectionMatrix();
      R.pxScale = R.H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }
  };
  R.render = (scene, camera) => {
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    if (post.uBloom.value > 0) {
      quad.material = bright; renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam);
      for (let i = 0; i < 2; i++) {
        quad.material = blur; blur.uniforms.tSrc.value = rtA.texture; blur.uniforms.uDir.value.set(1 / rtA.width, 0);
        renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam);
        blur.uniforms.tSrc.value = rtB.texture; blur.uniforms.uDir.value.set(0, 1 / rtA.height);
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam);
      }
    }
    quad.material = final; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
  };
  return R;
}
