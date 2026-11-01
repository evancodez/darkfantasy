// Rigid-part rig in the PS1 style: each limb is its own mesh hanging off a
// joint; poses are joint rotations blended toward a target every frame.
import * as THREE from 'three';

export class Rig {
  constructor() {
    this.root = new THREE.Group();     // placed/rotated by the actor
    this.body = new THREE.Group();     // squash, flips and bob live here
    this.root.add(this.body);
    this.j = {}; this.rest = {};
    this.meshes = [];
  }
  joint(name, parent, pos = [0, 0, 0]) {
    const o = new THREE.Group();
    o.position.set(...pos);
    (parent ? this.j[parent] : this.body).add(o);
    this.j[name] = o; this.rest[name] = o.position.clone();
    return o;
  }
  part(joint, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.rotation.set(...rot);
    if (typeof scl === 'number') m.scale.setScalar(scl); else m.scale.set(...scl);
    (typeof joint === 'string' ? this.j[joint] : joint).add(m);
    this.meshes.push(m);
    return m;
  }
  // blend joint rotations toward a pose; k = 1 snaps
  apply(pose, k) {
    for (const name in pose) {
      const o = this.j[name];
      if (!o) continue;
      const r = pose[name];
      o.rotation.x += (r[0] - o.rotation.x) * k;
      o.rotation.y += (r[1] - o.rotation.y) * k;
      o.rotation.z += (r[2] - o.rotation.z) * k;
    }
  }
  setFlash(v) { for (const m of this.meshes) if (m.material.uniforms?.uFlash) m.material.uniforms.uFlash.value = v; }
}

// merge two sparse poses: b over a, with weight w
export function mixPose(a, b, w) {
  const out = {};
  for (const k in a) out[k] = a[k].slice();
  for (const k in b) {
    const x = out[k] || [0, 0, 0], y = b[k];
    out[k] = [x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w];
  }
  return out;
}

// sample keyframes [[t, pose], ...] at time t (smoothstep between keys)
export function sampleKeys(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
    if (t <= t1) {
      let u = (t - t0) / (t1 - t0); u = u * u * (3 - 2 * u);
      return mixPose(p0, p1, u);
    }
  }
  return keys[keys.length - 1][1];
}
