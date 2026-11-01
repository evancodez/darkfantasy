// Geometry helpers: primitives with world-scaled UVs (textures tile by the
// metre, like a level editor would), vertex-colour light baking, and a batcher
// that merges static pieces into one mesh per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3();

// keep only position/normal/uv and make sure the geometry is indexed
export function clean(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) { const n = g.attributes.position.count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  g.clearGroups();
  return g;
}

// Box with UVs projected from local positions: s = texture repeats per metre.
export function box(w, h, d, { s = 0.5, seg = 3, uo = 0, vo = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / seg)), Math.max(1, Math.ceil(h / seg)), Math.max(1, Math.ceil(d / seg)));
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + h / 2, z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, x * s + uo, z * s + vo);
    else if (ax > 0.5) uv.setXY(i, z * s * Math.sign(n.getX(i)) + uo, y * s + vo);
    else uv.setXY(i, -x * s * Math.sign(n.getZ(i)) + uo, y * s + vo);
  }
  return clean(g);
}

// Cylinder/cone with UVs that tile a whole number of times around.
export function cyl(rt, rb, h, sides = 8, { s = 0.5, open = false, hseg = 1, flat = false, vo = 0 } = {}) {
  const g0 = new THREE.CylinderGeometry(rt, rb, h, sides, hseg, open);
  const g = flat ? g0.toNonIndexed() : g0;
  const circ = Math.max(1, Math.round(Math.PI * 2 * Math.max(rt, rb) * s));
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.99 && (Math.abs(p.getY(i) - h / 2) < 1e-4 || Math.abs(p.getY(i) + h / 2) < 1e-4) && !flat) {
      uv.setXY(i, p.getX(i) * s, p.getZ(i) * s);
    } else uv.setXY(i, uv.getX(i) * circ, (p.getY(i) + h / 2) * s + vo);
  }
  if (flat) g.computeVertexNormals();
  return clean(g);
}

export function sphere(r, w = 8, h = 6, { s = 1, flat = false } = {}) {
  let g = new THREE.SphereGeometry(r, w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r * 6.28 * s)), uv.getY(i) * Math.max(1, Math.round(r * 3.14 * s)));
  if (flat) { g = g.toNonIndexed(); g.computeVertexNormals(); }
  return clean(g);
}

// Flat ribbon along a polyline (for the road): u across, v along (in metres * s)
export function ribbon(pts, width, { s = 0.33, heightFn = null, lift = 0.05, segLen = 1.5 } = {}) {
  // resample
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const len = curve.getLength(), N = Math.max(2, Math.ceil(len / segLen));
  const pos = [], uv = [], idx = [];
  const across = 4;
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (let j = 0; j <= across; j++) {
      const o = (j / across - 0.5) * width;
      const x = p.x + side.x * o, z = p.z + side.z * o;
      const y = (heightFn ? heightFn(x, z, p) : p.y) + lift;
      pos.push(x, y, z); uv.push((j / across) * width * s, t * len * s);
    }
  }
  const W = across + 1;
  for (let i = 0; i < N; i++) for (let j = 0; j < across; j++) {
    const a = i * W + j;
    idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.curve = curve; g.userData.len = len;
  return clean(g);
}

export const mat4 = (pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ'));
  const S = typeof scl === 'number' ? [scl, scl, scl] : scl;
  return m.compose(new THREE.Vector3(...(pos.isVector3 ? pos.toArray() : pos)), q, new THREE.Vector3(...S));
};

// ---------------------------------------------------------------- light baking
export const Bake = {
  sky: new THREE.Color(0x4644b4), ground: new THREE.Color(0x1a1238),
  sunDir: new THREE.Vector3(0.45, 0.75, 0.35).normalize(), sun: new THREE.Color(0x6a70d8),
  lights: [],          // static lights: {pos, color, intensity, range}
  ao: null,            // (p, n) => factor 0..1
  shadow: null,        // (p, n) => factor 0..1 (e.g. a ray toward the moon)
  macro: null,         // (p, n, color) => void — large-scale colour variation
};

export function bakeColors(g, { ao = true, shadow = false, tint = null, gain = 1, macro = false } = {}) {
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  g.computeBoundingSphere();
  const bs = g.boundingSphere;
  const lights = Bake.lights.filter(l => l.pos.distanceTo(bs.center) < bs.radius + l.range);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(n, i);
    const up = _n.y * 0.5 + 0.5;
    c.copy(Bake.ground).lerp(Bake.sky, up);
    let sunK = Math.max(0, _n.dot(Bake.sunDir));
    if (shadow && Bake.shadow && sunK > 0) sunK *= Bake.shadow(_v, _n);
    c.r += Bake.sun.r * sunK; c.g += Bake.sun.g * sunK; c.b += Bake.sun.b * sunK;
    if (ao && Bake.ao) c.multiplyScalar(Bake.ao(_v, _n));
    if (macro && Bake.macro) Bake.macro(_v, _n, c);
    for (const l of lights) {
      _d.copy(l.pos).sub(_v);
      const dist = _d.length();
      if (dist > l.range) continue;
      let att = 1 - dist / l.range; att *= att;
      const k = att * (Math.max(0, _n.dot(_d.divideScalar(Math.max(dist, 1e-3)))) * 0.7 + 0.3) * l.intensity;
      c.r += l.color.r * k; c.g += l.color.g * k; c.b += l.color.b * k;
    }
    if (tint) { c.r *= tint.r; c.g *= tint.g; c.b *= tint.b; }
    col[i * 3] = c.r * gain; col[i * 3 + 1] = c.g * gain; col[i * 3 + 2] = c.b * gain;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------- batching
// add(geometry, material, matrix, opts) — geometry is cloned and transformed;
// build() merges everything sharing a material into one mesh.
export class Batch {
  constructor() { this.groups = new Map(); }
  add(geo, mat, m = null, opts = {}) {
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push({ g, opts });
    return g;
  }
  build(parent, { name = 'batch' } = {}) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      const geos = list.map(({ g, opts }) => {
        if (mat.userData.opts?.baked) bakeColors(g, opts);
        else if (!g.attributes.color && mat.vertexColors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
        return g;
      });
      // split very large batches so frustum culling still helps
      const chunks = [];
      let cur = [], count = 0;
      for (const g of geos) { cur.push(g); count += g.attributes.position.count; if (count > 60000) { chunks.push(cur); cur = []; count = 0; } }
      if (cur.length) chunks.push(cur);
      for (const ch of chunks) {
        const merged = mergeGeometries(ch, false);
        if (!merged) { console.warn('merge failed', mat); continue; }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = name; mesh.matrixAutoUpdate = false;
        parent.add(mesh); meshes.push(mesh);
      }
    }
    this.groups.clear();
    return meshes;
  }
}

// deterministic random
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  const r = () => (s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0, ((s ^ (s >>> 13)) >>> 0) / 4294967296);
  r.range = (a, b) => a + r() * (b - a);
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  return r;
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
