// Effects: pixel particles (dust, sparks, stars, fire), sword swoosh trails,
// shockwave rings and blob shadows under everything that moves.
import * as THREE from 'three';
import { T } from './core/tex.js';
import { G } from './core/retro.js';
import { raycast } from './core/physics.js';

const _v = new THREE.Vector3();

// --------------------------------------------------------------- particles
class ParticlePool {
  constructor(scene, map, cap, { additive = true, order = 8 } = {}) {
    this.cap = cap; this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { map: { value: map }, uPx: { value: 300 }, uFogNear: G.uFogNear, uFogFar: G.uFogFar, uFogColor: G.uFogColor };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float aSize; attribute vec4 aCol; uniform float uPx, uFogNear, uFogFar; varying vec4 vC; varying float vF;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uPx / max(-mv.z, .1), 1., 200.); vC = aCol;
          vF = clamp((length(mv.xyz) - uFogNear) / (uFogFar - uFogNear), 0., 1.); }`,
      fragmentShader: additive
        ? `uniform sampler2D map; varying vec4 vC; varying float vF; void main(){ float a = texture2D(map, gl_PointCoord).a * vC.a; if (a < .02) discard; gl_FragColor = vec4(vC.rgb * a * (1. - vF), 1.); }`
        : `uniform sampler2D map; uniform vec3 uFogColor; varying vec4 vC; varying float vF; void main(){ float a = texture2D(map, gl_PointCoord).a * vC.a; if (a < .5) discard; gl_FragColor = vec4(mix(vC.rgb, uFogColor, vF), 1.); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = order;
    scene.add(this.points);
  }
  // o: {pos, vel, life, size, size1, color, color1, alpha, gravity, drag, spin}
  emit(o) {
    if (this.list.length >= this.cap) this.list.shift();
    const p = {
      pos: o.pos.clone(), vel: o.vel ? o.vel.clone() : new THREE.Vector3(), life: o.life ?? 0.6, age: 0,
      s0: o.size ?? 0.3, s1: o.size1 ?? 0, c0: new THREE.Color(o.color ?? 0xffffff), c1: new THREE.Color(o.color1 ?? o.color ?? 0xffffff),
      a0: o.alpha ?? 1, a1: o.alpha1 ?? 0, g: o.gravity ?? 0, drag: o.drag ?? 0, floor: o.floor ?? -1e9,
    };
    this.list.push(p);
    return p;
  }
  update(dt) {
    const L = this.list;
    let n = 0;
    const c = new THREE.Color();
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vel.y -= p.g * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) { p.pos.y = p.floor; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; }
      const t = p.age / p.life;
      c.copy(p.c0).lerp(p.c1, t);
      this.pos[n * 3] = p.pos.x; this.pos[n * 3 + 1] = p.pos.y; this.pos[n * 3 + 2] = p.pos.z;
      this.col[n * 4] = c.r; this.col[n * 4 + 1] = c.g; this.col[n * 4 + 2] = c.b; this.col[n * 4 + 3] = p.a0 + (p.a1 - p.a0) * t;
      this.size[n] = p.s0 + (p.s1 - p.s0) * t;
      L[n++] = p;
    }
    L.length = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}

// --------------------------------------------------------------- sword trail
class Trail {
  constructor(scene, color = 0xa0c0ff, n = 14) {
    this.n = n; this.base = []; this.tip = []; this.age = []; this.active = false;
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(n * 2 * 3); this.uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv;
        void main(){ float a = pow(vUv.x, 1.5) * smoothstep(0., .5, vUv.y) * uA;
          vec3 c = mix(uColor, vec3(1.), smoothstep(.75, 1., vUv.y) * vUv.x);
          if (a < .03) discard; gl_FragColor = vec4(c * a, 1.); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    scene.add(this.mesh);
    this.fade = 0;
  }
  push(base, tip) {
    this.base.unshift(base.clone()); this.tip.unshift(tip.clone());
    if (this.base.length > this.n) { this.base.pop(); this.tip.pop(); }
  }
  update(dt, on, base, tip) {
    if (on) { this.push(base, tip); this.fade = 1; }
    else { this.fade = Math.max(0, this.fade - dt * 7); if (this.base.length && this.fade > 0) { this.base.pop(); this.tip.pop(); } }
    if (this.fade <= 0) this.base.length = this.tip.length = 0;
    const m = this.base.length;
    this.mesh.visible = m > 1;
    if (m < 2) return;
    for (let i = 0; i < this.n; i++) {
      const k = Math.min(i, m - 1);
      const b = this.base[k], t = this.tip[k];
      this.posA.set([b.x, b.y, b.z, t.x, t.y, t.z], i * 6);
      const u = 1 - i / (m - 1 || 1);
      this.uv.set([Math.max(0, u), 0, Math.max(0, u), 1], i * 4);
    }
    this.mesh.geometry.attributes.position.needsUpdate = this.mesh.geometry.attributes.uv.needsUpdate = true;
    this.mat.uniforms.uA.value = this.fade;
  }
}

// --------------------------------------------------------------- rings
class Rings {
  constructor(scene) {
    this.list = []; this.scene = scene;
    this.geo = new THREE.RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2);
  }
  add(pos, { color = 0xa0c0ff, r0 = 0.3, r1 = 3, life = 0.35, y = 0.08, vertical = false, quat = null } = {}) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.copy(pos); m.position.y += y;
    if (vertical) m.rotation.x = Math.PI / 2;
    if (quat) m.quaternion.copy(quat);
    m.renderOrder = 9;
    this.scene.add(m);
    this.list.push({ m, r0, r1, life, age: 0, c: new THREE.Color(color) });
  }
  update(dt) {
    this.list = this.list.filter(r => {
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) { this.scene.remove(r.m); r.m.material.dispose(); return false; }
      const s = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 2.5));
      r.m.scale.set(s, s, s);
      r.m.material.color.copy(r.c).multiplyScalar(1 - t);
      return true;
    });
  }
}

// --------------------------------------------------------------- blob shadows
class Shadows {
  constructor(scene, cap = 48) {
    this.cap = cap;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: T.shadow, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), cap);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.down = new THREE.Vector3(0, -1, 0);
  }
  begin() { this.n = 0; }
  // cast a blob below p; size shrinks with height
  cast(p, size = 1, maxDist = 30) {
    if (this.n >= this.cap) return null;
    _v.set(p.x, p.y + 0.3, p.z);
    const d = raycast(_v, this.down, maxDist);
    if (d === null) return null;
    const h = d - 0.3, gy = p.y + 0.3 - d;
    const s = size * Math.max(0.35, 1 - h * 0.08);
    this.m.makeScale(s, 1, s).setPosition(p.x, gy + 0.04, p.z);
    this.mesh.setMatrixAt(this.n++, this.m);
    return gy;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
}

// --------------------------------------------------------------- facade
export function createFX(scene) {
  const glow = new ParticlePool(scene, T.glow, 1500);
  const spark = new ParticlePool(scene, T.star4, 400, { order: 9 });
  const dust = new ParticlePool(scene, T.fire, 600, { additive: false, order: 7 });
  const rings = new Rings(scene);
  const shadows = new Shadows(scene);
  const R = Math.random;
  const rv = (s = 1) => new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).multiplyScalar(s);
  const fx = {
    glow, spark, dust, rings, shadows,
    trail: (color) => new Trail(scene, color),
    setPx(px) { for (const p of [glow, spark, dust]) p.uniforms.uPx.value = px; },
    update(dt) { glow.update(dt); spark.update(dt); dust.update(dt); rings.update(dt); },

    puff(pos, n = 6, color = 0x6a6aa0, size = 0.45) {
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2;
        dust.emit({ pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3)), vel: new THREE.Vector3(Math.cos(a) * (1 + R() * 2), 0.6 + R(), Math.sin(a) * (1 + R() * 2)),
          life: 0.35 + R() * 0.25, size, size1: size * 0.2, color, drag: 4 });
      }
    },
    sparks(pos, n = 10, color = 0xffe0a0, speed = 6) {
      for (let i = 0; i < n; i++) spark.emit({ pos, vel: rv(speed).add(new THREE.Vector3(0, speed * 0.3, 0)), life: 0.25 + R() * 0.25, size: 0.5, size1: 0.05, color, gravity: 14, drag: 2 });
      glow.emit({ pos, life: 0.15, size: 2.2, size1: 0.5, color, alpha: 0.9 });
    },
    hit(pos, color = 0xffffff) {
      spark.emit({ pos, life: 0.18, size: 2.4, size1: 0.6, color });
      for (let i = 0; i < 8; i++) spark.emit({ pos, vel: rv(7), life: 0.25, size: 0.45, size1: 0.05, color: 0xfff0c0, drag: 5 });
    },
    pop(pos, color = 0xc0a0ff, n = 18) {
      glow.emit({ pos, life: 0.3, size: 4, size1: 0.5, color, alpha: 1 });
      for (let i = 0; i < n; i++) {
        const v = rv(1).normalize().multiplyScalar(3 + R() * 4);
        spark.emit({ pos, vel: v, life: 0.4 + R() * 0.3, size: 0.6, size1: 0.05, color: i % 3 ? color : 0xffffff, drag: 3 });
      }
      rings.add(pos.clone().setY(pos.y - 0.6), { color, r0: 0.3, r1: 2.6, life: 0.35 });
    },
    fire(pos, n = 1, scale = 1, vel = null) {
      for (let i = 0; i < n; i++) glow.emit({ pos: pos.clone().add(rv(0.15 * scale)), vel: (vel ? vel.clone() : new THREE.Vector3()).add(new THREE.Vector3((R() - 0.5) * scale, (1.5 + R()) * scale, (R() - 0.5) * scale)),
        life: 0.35 + R() * 0.3, size: 0.7 * scale, size1: 0.1, color: 0xffd060, color1: 0xff2a08, alpha: 1, alpha1: 0.2 });
    },
    twinkle(pos, color = 0xffffff, size = 0.8) { spark.emit({ pos, life: 0.4, size, size1: 0, color }); },
  };
  return fx;
}
