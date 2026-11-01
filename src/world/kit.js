// Level kit: the material library, glow sprites, and the static pieces the
// level is assembled from (terrain, road, walls, lanterns, trees, castle...).
import * as THREE from 'three';
import { T } from '../core/tex.js';
import { retroMat, G, Lights } from '../core/retro.js';
import { box, cyl, sphere, ribbon, mat4, Batch, rng, clean } from '../core/geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const M = {};
export function makeMaterials() {
  const B = (map, o = {}) => retroMat({ map, baked: true, ...o });
  Object.assign(M, {
    cosmic: B(T.cosmic, { emit: 0.22 }),
    wall: B(T.wall), castle: B(T.castle, { fog: 0.55 }), slate: B(T.slate, { fog: 0.55 }),
    darkStone: B(T.darkStone), cobble: B(T.cobble), plaster: B(T.plaster), granite: B(T.granite),
    checker: B(T.checker), checkerBlue: B(T.checkerBlue),
    grass: B(T.grass), dirt: B(T.dirt), cornField: B(T.cornField),
    bark: B(T.bark), pine: B(T.pine), wood: B(T.wood), straw: B(T.straw),
    iron: B(T.iron), gold: B(T.gold), coins: B(T.coins, { emit: 0.15 }), bone: B(T.bone),
    corn: B(T.corn, { alphaTest: 0.5, side: THREE.DoubleSide, wind: 0.035 }),
    tuft: B(T.tuft, { alphaTest: 0.5, side: THREE.DoubleSide, wind: 0.06 }),
    flower: retroMat({ map: T.flower, alphaTest: 0.5, side: THREE.DoubleSide, emit: 0.6 }),
    window: retroMat({ map: T.window, emit: 1, fog: 0.25 }),
    lantern: retroMat({ map: T.lanternGlass, emit: 1, fog: 0.5 }),
    rock: B(T.darkStone, { fog: 0.6 }),
    castleFar: B(T.castle, { fog: 0.4 }),
  });
  return M;
}

// ---------------------------------------------------------------- glow sprites
// Additive point sprites sized in world units: halos around lights, sparkles.
export class Sprites {
  constructor(map, cap = 2048, { fog = 0.7, order = 5 } = {}) {
    this.cap = cap; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.ph = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aPh', new THREE.BufferAttribute(this.ph, 1));
    g.setDrawRange(0, 0);
    this.uniforms = { map: { value: map }, uPx: { value: 300 }, uTime: G.uTime, uFogNear: G.uFogNear, uFogFar: G.uFogFar, uFogK: { value: fog } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize, aPh; attribute vec3 aCol; uniform float uPx, uTime, uFogNear, uFogFar, uFogK; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
          float fl = aPh > 0. ? .82 + .1 * sin(uTime * 9. + aPh) + .08 * sin(uTime * 23. + aPh * 2.) : 1.;
          gl_PointSize = min(aSize * uPx / max(-mv.z, .1) * fl, 256.);
          float f = clamp((length(mv.xyz) - uFogNear) / (uFogFar - uFogNear), 0., 1.) * uFogK;
          vC = aCol * (1. - f) * fl; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).a; if (a < .01) discard; gl_FragColor = vec4(vC * a, 1.); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = order;
    this.geo = g;
  }
  add(p, color, size, flicker = false) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.set(i, p, color, size);
    this.ph[i] = flicker ? 1 + Math.random() * 50 : 0;
    this.geo.setDrawRange(0, this.n);
    this.dirty();
    return i;
  }
  set(i, p, color, size) {
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    if (color !== undefined && color !== null) { const c = color.isColor ? color : new THREE.Color(color); this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; }
    if (size !== undefined) this.size[i] = size;
  }
  dirty() { for (const k of ['position', 'aCol', 'aSize', 'aPh']) this.geo.attributes[k].needsUpdate = true; }
}

// ---------------------------------------------------------------- terrain
// Heightfield patch. Cells are kept only when all corners are inside(x,z);
// snap(x,z) may move boundary vertices onto a smooth edge. The open boundary
// can then be extruded into a rocky cliff skirt.
export function terrainPatch({ x0, z0, x1, z1, cell = 2, heightAt, inside = null, snap = null, s = 0.25 }) {
  const nx = Math.round((x1 - x0) / cell), nz = Math.round((z1 - z0) / cell), W = nx + 1;
  const pos = new Float32Array(W * (nz + 1) * 3), uv = new Float32Array(W * (nz + 1) * 2);
  const ins = new Uint8Array(W * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = x0 + i * cell, z = z0 + j * cell;
    const k = j * W + i;
    ins[k] = !inside || inside(x, z) ? 1 : 0;
    pos[k * 3] = x; pos[k * 3 + 2] = z;
  }
  const idx = [];
  const used = new Uint8Array(W * (nz + 1));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = a + W + 1;
    if (!(ins[a] && ins[b] && ins[c] && ins[d])) continue;
    if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    used[a] = used[b] = used[c] = used[d] = 1;
  }
  // boundary edges (appear in exactly one triangle)
  const edges = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + (e + 1) % 3], key = a < b ? a * 1e7 + b : b * 1e7 + a;
    const ex = edges.get(key);
    if (ex) ex.n++; else edges.set(key, { a, b, c: idx[t + (e + 2) % 3], n: 1 });
  }
  const boundary = [...edges.values()].filter(e => e.n === 1);
  const onEdge = new Set(); for (const e of boundary) { onEdge.add(e.a); onEdge.add(e.b); }
  for (let k = 0; k < W * (nz + 1); k++) {
    if (!used[k]) continue;
    let x = pos[k * 3], z = pos[k * 3 + 2];
    if (snap && onEdge.has(k)) { const q = snap(x, z); x = q[0]; z = q[1]; }
    pos[k * 3] = x; pos[k * 3 + 2] = z; pos[k * 3 + 1] = heightAt(x, z);
    uv[k * 2] = x * s; uv[k * 2 + 1] = z * s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  clean(g);
  return { geo: g, boundary, pos };
}

// Rocky skirt hanging from a terrain patch's open boundary. bottom(p) gives the
// lowest point for a rim vertex (straight down for cliffs, toward a point for
// a floating island).
export function cliffSkirt(patch, bottom, { rows = 5, s = 0.25, jitter = 1.2, seed = 9 } = {}) {
  const { boundary, pos } = patch;
  const ring = new Map();
  const R = rng(seed);
  const P = k => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const col = k => {
    if (ring.has(k)) return ring.get(k);
    const top = P(k), bot = bottom(top), out = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, v = top.clone().lerp(bot, Math.pow(t, 0.8));
      if (r > 0) { const j = jitter * (r < rows ? 1 : 0.3); v.x += (R() - 0.5) * j; v.z += (R() - 0.5) * j; v.y += (R() - 0.5) * j * 0.6; }
      if (r === 1) v.y = top.y - 0.35 - R() * 0.4;
      out.push(v);
    }
    ring.set(k, out); return out;
  };
  const p = [], uv = [], idx = [];
  for (const e of boundary) {
    const A = col(e.a), B = col(e.b), C = P(e.c);
    const mid = P(e.a).add(P(e.b)).multiplyScalar(0.5), outward = mid.clone().sub(C); outward.y = 0;
    const edge = P(e.b).sub(P(e.a));
    const nrm = new THREE.Vector3(0, -1, 0).cross(edge);
    let [L, Rr] = nrm.dot(outward) > 0 ? [A, B] : [B, A];
    const base = p.length / 3;
    for (let r = 0; r <= rows; r++) for (const v of [L[r], Rr[r]]) { p.push(v.x, v.y, v.z); uv.push((v.x + v.z) * s, v.y * s); }
    for (let r = 0; r < rows; r++) { const a = base + r * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return clean(g);
}

// ---------------------------------------------------------------- pieces
const TMP = new THREE.Vector3();

// a low stone wall with a capstone between two points
export function wallSeg(b, a, c, { h = 1.0, t = 0.7, mat = M.wall, cap = true, ground = 0 } = {}) {
  const dx = c.x - a.x, dz = c.z - a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const mid = [(a.x + c.x) / 2, ground, (a.z + c.z) / 2];
  b.add(box(t, h + 0.6, len + 0.02, { s: 0.5 }), mat, mat4([mid[0], ground - 0.6 + (h + 0.6) / 2, mid[2]], [0, yaw, 0]));
  if (cap) b.add(box(t + 0.16, 0.18, len + 0.1, { s: 0.5 }), mat, mat4([mid[0], ground + h + 0.09, mid[2]], [0, yaw, 0]));
  return { mid, yaw, len, h, t };
}

// lantern on a stone post: blue glass, iron cap, glow halo and a baked light
export function lanternPost(b, glows, p, { color = 0x5a8aff, height = 1.5, mat = M.wall, light = true, intensity = 1.6, range = 8 } = {}) {
  b.add(box(0.5, height, 0.5, { s: 0.5 }), mat, mat4([p.x, p.y + height / 2, p.z]));
  b.add(box(0.62, 0.14, 0.62, { s: 1 }), mat, mat4([p.x, p.y + height + 0.07, p.z]));
  const y = p.y + height + 0.14;
  b.add(box(0.5, 0.06, 0.5, { s: 2 }), M.iron, mat4([p.x, y + 0.03, p.z]));
  b.add(box(0.38, 0.5, 0.38, { s: 2 }), M.lantern, mat4([p.x, y + 0.31, p.z]));
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(box(0.06, 0.52, 0.06, { s: 4 }), M.iron, mat4([p.x + ox * 0.21, y + 0.31, p.z + oz * 0.21]));
  b.add(cyl(0, 0.42, 0.34, 4, { s: 2, flat: true }), M.iron, mat4([p.x, y + 0.73, p.z], [0, Math.PI / 4, 0]));
  b.add(sphere(0.06, 5, 4), M.iron, mat4([p.x, y + 0.93, p.z]));
  const lp = new THREE.Vector3(p.x, y + 0.31, p.z);
  glows.add(lp, new THREE.Color(color).multiplyScalar(0.9), 2.6, true);
  if (light) Lights.add(lp, color, intensity, range);
  return lp;
}

// faceted pine: trunk + three stacked cones
export function pine(b, p, h = 7, r0 = rng(1)) {
  const w = h * 0.36, rot = r0() * 6;
  b.add(cyl(0.14, 0.24, h * 0.3, 5, { s: 1 }), M.bark, mat4([p.x, p.y + h * 0.13, p.z], [0, rot, 0]));
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const th = h * (0.5 - i * 0.08), tr = w * (1 - i * 0.24), ty = p.y + h * 0.2 + i * h * 0.24 + th / 2;
    b.add(cyl(0, tr, th, 7, { s: 0.5, flat: true }), M.pine, mat4([p.x, ty, p.z], [0, rot + i, 0]));
  }
}

// crossed-quad grass tuft
const TUFT = (() => {
  const a = new THREE.PlaneGeometry(1, 0.7); a.translate(0, 0.35, 0);
  const c = a.clone().rotateY(Math.PI / 2);
  const g = clean(mergeGeometries([clean(a), clean(c)]));
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
})();
export function tuft(b, p, s = 1, rot = 0, mat = M.tuft) { b.add(TUFT, mat, mat4([p.x, p.y - 0.05, p.z], [0, rot, 0], [s, s, s])); }
export function rock(b, p, s = 1, r0 = Math.random) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pp = g.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) * (0.8 + r0() * 0.4), pp.getY(i) * (0.55 + r0() * 0.3), pp.getZ(i) * (0.8 + r0() * 0.4));
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) * 0.5 + pp.getZ(i) * 0.3, pp.getY(i) * 0.5);
  b.add(clean(g), M.darkStone, mat4([p.x, p.y + s * 0.2, p.z], [0, r0() * 6, 0], s));
}

// a castle tower: cylinder body, corbelled ring, conical slate roof, windows
export function tower(b, glows, p, r, h, { roofH = r * 2.6, sides = 10, windows = 3, mat = M.castle, roofMat = M.slate, crown = true, seed = 1 } = {}) {
  const R = rng(seed);
  b.add(cyl(r, r * 1.04, h, sides, { s: 0.5, hseg: Math.ceil(h / 3) }), mat, mat4([p.x, p.y + h / 2, p.z]));
  if (crown) {
    b.add(cyl(r * 1.18, r * 1.0, 0.8, sides, { s: 0.5 }), mat, mat4([p.x, p.y + h + 0.1, p.z]));
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      b.add(box(0.5, 0.7, 0.4, { s: 1 }), mat, mat4([p.x + Math.sin(a) * r * 1.12, p.y + h + 0.85, p.z + Math.cos(a) * r * 1.12], [0, a, 0]));
    }
  }
  const rh = p.y + h + (crown ? 0.5 : 0);
  b.add(cyl(0, r * 1.25, roofH, sides, { s: 0.6, flat: true }), roofMat, mat4([p.x, rh + roofH / 2, p.z]));
  b.add(cyl(0.05, 0.05, 1.6, 4, { s: 1 }), M.iron, mat4([p.x, rh + roofH + 0.6, p.z]));
  // windows: rows of lit arches facing out
  const rows = Math.max(1, Math.floor(h / 4.2));
  for (let row = 0; row < rows; row++) for (let k = 0; k < windows; k++) {
    if (R() < 0.3) continue;
    const a = (k / windows) * Math.PI * 2 + row * 0.6 + R() * 0.3;
    const y = p.y + 2.4 + row * 4.2;
    const wx = p.x + Math.sin(a) * (r + 0.03), wz = p.z + Math.cos(a) * (r + 0.03);
    b.add(clean(new THREE.PlaneGeometry(0.7, 1.4)), M.window, mat4([wx, y, wz], [0, a, 0]));
    glows.add(TMP.set(wx + Math.sin(a) * 0.3, y, wz + Math.cos(a) * 0.3), new THREE.Color(0xffa030).multiplyScalar(0.55), 2.6);
  }
}

// a flat-faced wall section of the keep with rows of windows and battlements
export function keepBlock(b, glows, c, w, h, d, { mat = M.castle, rows = 3, cols = 4, battlements = true, roof = true, roofMat = M.slate, seed = 3 } = {}) {
  const R = rng(seed);
  b.add(box(w, h, d, { s: 0.5 }), mat, mat4([c.x, c.y + h / 2, c.z]));
  if (battlements) {
    const n = Math.round(w / 1.2);
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      b.add(box(0.7, 0.8, 0.5, { s: 1 }), mat, mat4([c.x - w / 2 + (i + 0.5) * (w / n), c.y + h + 0.4, c.z + side * (d / 2 - 0.25)]));
    }
  }
  if (roof) {
    // steep gabled roof
    const rh = Math.min(w, d) * 0.7;
    const g = new THREE.CylinderGeometry(0, 1, 1, 4, 1, false, Math.PI / 4);
    const geo = clean(g.toNonIndexed()); geo.computeVertexNormals();
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
    b.add(geo, roofMat, mat4([c.x, c.y + h + rh / 2 + 0.2, c.z], [0, 0, 0], [w * 0.62, rh, d * 0.62]));
  }
  for (const side of [1]) for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if (R() < 0.2) continue;
    const x = c.x - w / 2 + (k + 0.5) * (w / cols), y = c.y + 2.6 + r * (h - 3) / rows;
    const z = c.z + side * (d / 2 + 0.03);
    b.add(clean(new THREE.PlaneGeometry(0.9, 1.8)), M.window, mat4([x, y, z], [0, side > 0 ? 0 : Math.PI, 0]));
    glows.add(TMP.set(x, y, z + side * 0.35), new THREE.Color(0xffa030).multiplyScalar(0.55), 3.2);
  }
}

// an arched gateway frame (two piers and a ring of voussoir blocks)
export function archway(b, c, w, h, d, yaw = 0, { mat = M.castle, pier = 1.2 } = {}) {
  const base = mat4([c.x, c.y, c.z], [0, yaw, 0]);
  const add = (g, x, y, z, rz = 0) => b.add(g, mat, new THREE.Matrix4().multiplyMatrices(base, mat4([x, y, z], [0, 0, rz])));
  add(box(pier, h, d, { s: 0.5 }), -w / 2 - pier / 2, h / 2, 0);
  add(box(pier, h, d, { s: 0.5 }), w / 2 + pier / 2, h / 2, 0);
  const segs = 7, rr = w / 2 + pier / 2;
  for (let i = 0; i < segs; i++) {
    const am = Math.PI * (i + 0.5) / segs;
    add(box(pier, rr * Math.PI / segs + 0.12, d, { s: 0.5 }), Math.cos(am) * rr, h + Math.sin(am) * rr, 0, am);
  }
}

export { Batch, box, cyl, sphere, ribbon, mat4, rng, clean };
