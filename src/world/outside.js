// The grounds outside Grimhold: the Starway road, the crossroads plaza, the
// cornfield (west), the graveyard (east), the witch's hill (south-east) and
// the chasm with the castle floating on its island beyond.
import * as THREE from 'three';
import { G, Lights } from '../core/retro.js';
import { Bake, rng, lerp, smooth, clamp, clean } from '../core/geo.js';
import { addTrimesh, addBox } from '../core/physics.js';
import { buildCornfield, buildGraveyard, buildWitchRing, buildSeal } from './grounds.js';
export { populateOutside } from './grounds.js';
import { M, Batch, box, cyl, sphere, ribbon, mat4, terrainPatch, cliffSkirt, wallSeg, lanternPost, pine, tower, keepBlock, archway, tuft, rock } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const ROADS = {
  main: [V(0, 0, 60), V(0, 0, 30), V(0, 0, 11)],
  north: [V(0, 0, -11), V(0, 0, -30), V(0, 0, -50)],
  west: [V(-11, 0, 0), V(-24, 0, -1), V(-36, 0, 2)],
  east: [V(11, 0, 0), V(24, 0, 1), V(36, 0, -1)],
  witch: [V(4, 0, 32), V(18, 0, 34), V(30, 0, 36)],
};
export const CORN = V(-62, 0, -2), GRAVE = V(62, 0, -2), WITCH = V(46, 0, 42), SEAL = V(0, 0, -49);
export const ISLAND = V(0, 0, -112);
export const CHASM_Z = -52;
export const SPAWN = V(0, 0, 52);

// distance from (x,z) to a polyline
function segDist(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}
export const roadDist = (x, z) => Math.min(...Object.values(ROADS).map(r => segDist(x, z, r)));
const n2 = (x, z) => Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.063 - 0.7) * 0.6 + Math.sin(x * 0.13 - z * 0.11) * 0.3 + Math.sin(x * 0.29 + z * 0.23) * 0.1;
export const edgeZ = x => CHASM_Z + 2.5 * Math.sin(x * 0.09) + 1.6 * Math.sin(x * 0.23 + 1);

export function groundAt(x, z) {
  let h = n2(x, z) * 0.9;
  h += smooth(68, 112, Math.hypot(x * 0.8, z - 25)) * (16 + n2(z * 1.7, x * 1.3) * 7);
  h = lerp(h, 0, smooth(10, 5, roadDist(x, z)));
  h = lerp(h, 0, smooth(17, 12, Math.hypot(x, z)));
  // cornfield and graveyard floors are nearly flat
  h = lerp(h, n2(x * 2, z * 2) * 0.25, smooth(30, 22, Math.max(Math.abs(x + 62) * 0.95, Math.abs(z + 2))));
  h = lerp(h, n2(x * 2, z * 2) * 0.35, smooth(30, 22, Math.max(Math.abs(x - 62) * 0.95, Math.abs(z + 2))));
  h = lerp(h, n2(x * 2, z * 2) * 0.3, smooth(22, 15, Math.hypot(x - WITCH.x, z - WITCH.z)));
  // the lip of the chasm rises a little
  h += smooth(12, 0, z - edgeZ(x)) * 1.2 * smooth(6, 10, Math.abs(x));
  return h;
}

const islandR = (x, z) => 36 + Math.sin(Math.atan2(z - ISLAND.z, x) * 5) * 2.5 + Math.sin(Math.atan2(z - ISLAND.z, x) * 11 + 1) * 1.2;
const islandH = (x, z) => n2(x * 1.5, z * 1.5) * 0.25 + smooth(8, 0, islandR(x, z) - Math.hypot(x, z - ISLAND.z)) * 0.4;

export function buildOutside({ scene, glows }) {
  const b = new Batch();
  const R = rng(42);
  const group = new THREE.Group(); scene.add(group);

  // ------------------------------------------------ lights (static, baked)
  Bake.lights = [];
  const L = (p, c, i, r, o) => { const l = Lights.add(p, c, i, r, o); Bake.lights.push(l); return l; };
  Bake.ao = (p, n) => {
    if (n.y > 0.6) return 1;
    const g = p.z < CHASM_Z - 10 ? 0 : groundAt(p.x, p.z);
    return 0.5 + 0.5 * smooth(0, 2.2, p.y - g);
  };
  // big soft patches of colour across the grass, like painted vertex colours
  Bake.macro = (p, n, c) => {
    const a = n2(p.x * 0.6 + 40, p.z * 0.6), b2 = n2(p.z * 0.35 - 20, p.x * 0.35);
    c.multiplyScalar(0.8 + a * 0.35);
    c.r += Math.max(0, b2) * 0.05; c.g += Math.max(0, -b2) * 0.12; c.b += Math.max(0, b2) * 0.12;
  };

  // ------------------------------------------------ the road network
  const roadH = (x, z) => groundAt(x, z);
  const roadGeos = [];
  for (const [k, pts] of Object.entries(ROADS)) {
    const g = ribbon(pts, 7, { s: 0.3, heightFn: roadH, lift: 0.06 });
    roadGeos.push(g);
  }
  // walls + lanterns along the roads (gaps at the ends)
  const lanternSpots = [];
  const lineWalls = (pts, from, to, every = 10, gaps = []) => {
    const gapAt = q => gaps.some(g => Math.hypot(q.x - g.x, q.z - g.z) < 5.2);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const step = 2.5;
    for (const side of [-1, 1]) {
      let prev = null, acc = 0;
      for (let d = from; d <= len - to + 1e-3; d += step) {
        const t = Math.min(1, d / len), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        const sx = -tan.z * side, sz = tan.x * side;
        const q = V(p.x + sx * 4.1, 0, p.z + sz * 4.1);
        q.y = groundAt(q.x, q.z);
        if (prev && (gapAt(prev) || gapAt(q))) { prev = q; acc = 0; continue; }
        if (prev) {
          const ws = wallSeg(b, prev, q, { h: 0.9, ground: Math.min(prev.y, q.y) });
          // the collider is exactly the visible segment
          addBox(V(ws.mid[0], Math.min(prev.y, q.y) + 0.5, ws.mid[2]), V(0.4, 0.62, ws.len / 2 + 0.06), ws.yaw);
          acc += step;
          if (acc >= every - 1e-3) { acc = 0; lanternSpots.push(q.clone()); }
        }
        prev = q;
      }
    }
  };
  lineWalls(ROADS.main, 0, 1.5, 10, [V(4.1, 0, 32.5)]);
  lineWalls(ROADS.witch, 5.5, 3, 8);
  lineWalls(ROADS.north, 1.5, 1);
  lineWalls(ROADS.west, 1.5, 3, 8);
  lineWalls(ROADS.east, 1.5, 3, 8);
  for (const q of lanternSpots) {
    const y = q.y + 1.08;
    const lp = lanternPost(b, glows, V(q.x, y, q.z), { height: 1.1, light: false });
    L(lp, 0x4a7aff, 1.5, 9);
  }

  // ------------------------------------------------ plaza
  const plaza = clean2(new THREE.CircleGeometry(12, 28).rotateX(-Math.PI / 2), 0.3);
  b.add(plaza, M.cobble, mat4([0, 0.07, 0]));
  const ring = clean2(new THREE.RingGeometry(11.6, 12.4, 28).rotateX(-Math.PI / 2), 0.5);
  b.add(ring, M.wall, mat4([0, 0.09, 0]));
  // plaza rim walls between the four road mouths
  for (let q = 0; q < 4; q++) {
    const a0 = q * Math.PI / 2 + 0.36, a1 = (q + 1) * Math.PI / 2 - 0.36, n = 4;
    for (let i = 0; i < n; i++) {
      const aa = lerp(a0, a1, i / n), ab = lerp(a0, a1, (i + 1) / n);
      wallSeg(b, V(Math.sin(aa) * 12.6, 0, Math.cos(aa) * 12.6), V(Math.sin(ab) * 12.6, 0, Math.cos(ab) * 12.6), { h: 0.9 });
    }
    const am = (a0 + a1) / 2;
    // one collider per visible rim segment (tangent to the circle)
    for (let i = 0; i < 4; i++) { const aa = lerp(a0, a1, (i + 0.5) / 4); addBox(V(Math.sin(aa) * 12.6, 0.55, Math.cos(aa) * 12.6), V(0.4, 0.62, 12.6 * (a1 - a0) / 8 + 0.1), aa + Math.PI / 2); }
    for (const a of [a0, a1]) {
      const lp = lanternPost(b, glows, V(Math.sin(a) * 12.6, 0, Math.cos(a) * 12.6), { height: 2.2, light: false });
      L(lp, 0x4a7aff, 1.6, 10);
    }
  }

  // ------------------------------------------------ mainland terrain + cliff
  const inside = (x, z) => z > edgeZ(x) - 1.2;
  const land = terrainPatch({ x0: -150, z0: -60, x1: 150, z1: 140, cell: 2.5, heightAt: groundAt, inside,
    snap: (x, z) => z < edgeZ(x) + 3 ? [x, edgeZ(x)] : [x, z], s: 0.22 });
  b.add(land.geo, M.grass, null, { shadow: true, macro: true });
  addTrimesh(land.geo);
  const skirt = cliffSkirt(land, p => V(p.x, -46, p.z - 6 - Math.sin(p.x * 0.3) * 3), { rows: 6, jitter: 1.8, seed: 5 });
  b.add(skirt, M.rock);
  for (const g of roadGeos) { b.add(g, M.cosmic); addTrimesh(g); }

  // ------------------------------------------------ the castle island
  const isle = terrainPatch({ x0: -44, z0: ISLAND.z - 44, x1: 44, z1: ISLAND.z + 44, cell: 2, heightAt: islandH,
    inside: (x, z) => Math.hypot(x, z - ISLAND.z) < islandR(x, z) + 1.5,
    snap: (x, z) => { const a = Math.atan2(z - ISLAND.z, x), r = islandR(Math.cos(a) * 30, ISLAND.z + Math.sin(a) * 30); return [Math.cos(a) * r, ISLAND.z + Math.sin(a) * r]; }, s: 0.22 });
  b.add(isle.geo, M.grass, null, { shadow: true, macro: true });
  addTrimesh(isle.geo);
  b.add(cliffSkirt(isle, p => V(lerp(p.x, 0, 0.8), -75 - R() * 10, lerp(p.z, ISLAND.z, 0.8)), { rows: 7, jitter: 2.2, seed: 6 }), M.rock);
  // courtyard paving in front of the gate
  b.add(ribbon([V(0, 0, -77), V(0, 0, -88)], 7, { s: 0.3, heightFn: islandH, lift: 0.06 }), M.cosmic);

  // the bridge across the chasm (hidden until the seal opens)
  const bridge = new Batch();
  const bz0 = -49, bz1 = -80;
  bridge.add(ribbon([V(0, 0, bz0), V(0, 0, bz1)], 7, { s: 0.3, lift: 0.06 }), M.cosmic);
  bridge.add(box(8.6, 1.4, Math.abs(bz1 - bz0), { s: 0.5 }), M.wall, mat4([0, -0.7, (bz0 + bz1) / 2]));
  for (let z = bz0 - 4; z > bz1 + 2; z -= 7.5) {
    bridge.add(box(2.4, 18, 2.4, { s: 0.5 }), M.wall, mat4([0, -9.7, z]));
    bridge.add(cyl(1.2, 0.01, 6, 6, { s: 0.5, flat: true }), M.rock, mat4([0, -21.6, z], [Math.PI, 0, 0]));
  }
  const bridgeLanterns = [];
  for (const side of [-1, 1]) {
    for (let z = bz0; z > bz1; z -= 3.1) wallSeg(bridge, V(side * 4.0, 0, z), V(side * 4.0, 0, Math.max(bz1, z - 3.1)), { h: 0.9 });
    for (let z = bz0 - 5; z > bz1; z -= 10) bridgeLanterns.push(V(side * 4.0, 1.08, z));
  }

  // ------------------------------------------------ Grimhold itself
  const cg = new Batch();
  const C = (x, z) => V(x, islandH(x, z), z);
  // curtain wall with gate towers
  const fz = -90;
  for (const side of [-1, 1]) {
    cg.add(box(13, 10, 3, { s: 0.5 }), M.castle, mat4([side * 10.5, 5, fz]));
    const n = 7;
    for (let i = 0; i < n; i++) cg.add(box(0.9, 0.9, 0.6, { s: 1 }), M.castle, mat4([side * (4.6 + i * 1.8 + 0.45), 10.45, fz + 1.2]));
    tower(cg, glows, C(side * 4.6, fz), 2.6, 15, { roofH: 7, sides: 10, windows: 3, seed: 11 + side });
    tower(cg, glows, C(side * 17.5, fz - 1), 3.2, 17, { roofH: 9, sides: 10, windows: 4, seed: 13 + side });
  }
  cg.add(box(6.4, 3.4, 3, { s: 0.5 }), M.castle, mat4([0, 8.3, fz]));
  archway(cg, V(0, 0, fz), 4.2, 4.5, 3.2, 0);
  // keep
  keepBlock(cg, glows, V(0, 0, -106), 22, 18, 14, { rows: 3, cols: 5, seed: 21 });
  for (const [x, z, r, h, rh] of [[-11, -100, 2.7, 25, 9], [11, -100, 2.7, 25, 9], [-11, -113, 2.5, 22, 8], [11, -113, 2.5, 22, 8], [-6, -96, 1.6, 21, 6], [6, -96, 1.6, 21, 6]])
    tower(cg, glows, C(x, z), r, h, { roofH: rh, windows: 4, seed: x * 7 + z });
  tower(cg, glows, C(0, -110), 4.2, 40, { roofH: 15, sides: 12, windows: 4, seed: 31 });
  tower(cg, glows, C(0, -110), 2.2, 52, { roofH: 9, sides: 8, windows: 3, crown: false, seed: 32 });
  // back walls & side buildings to fill the silhouette
  for (const side of [-1, 1]) {
    keepBlock(cg, glows, V(side * 20, 0, -104), 8, 11, 18, { rows: 2, cols: 2, seed: 40 + side });
    tower(cg, glows, C(side * 25, -96), 2.4, 14, { roofH: 7, seed: 50 + side });
    tower(cg, glows, C(side * 25, -116), 2.6, 18, { roofH: 8, seed: 52 + side });
  }
  // castle colliders: walls and tower bases
  for (const side of [-1, 1]) {
    addBox(V(side * 10.5, 5, fz), V(6.5, 5, 1.5));
    addBox(V(side * 4.6, 7, fz), V(2.4, 7, 2.4));
    addBox(V(side * 17.5, 8, fz - 1), V(3, 8, 3));
  }
  addBox(V(0, 9, -106), V(16, 9, 7.5));
  // warm light spilling from the gate
  L(V(0, 2.5, fz + 2.2), 0xff8a30, 1.4, 10);

  // ------------------------------------------------ pine forest
  const forest = new Batch();
  for (let i = 0; i < 900 && forest.groups.size >= 0; i++) {
    const x = R.range(-140, 140), z = R.range(-48, 135);
    if (z < edgeZ(x) + 4) continue;
    if (roadDist(x, z) < 8 || Math.hypot(x, z) < 18) continue;
    if (Math.max(Math.abs(x + 62), Math.abs(z + 2)) < 30) continue;
    if (Math.max(Math.abs(x - 62), Math.abs(z + 2)) < 30) continue;
    if (Math.hypot(x - WITCH.x, z - WITCH.z) < 19) continue;
    const rim = smooth(40, 90, Math.hypot(x * 0.8, z - 25));
    if (R() > 0.25 + rim * 0.75) continue;
    pine(forest, V(x, groundAt(x, z) - 0.3, z), R.range(5.5, 10) * (0.8 + rim * 0.5), R);
  }

  // ------------------------------------------------ grass tufts, flowers, rocks
  const deco = new Batch();
  for (let i = 0; i < 5200; i++) {
    const x = R.range(-110, 110), z = R.range(-50, 110);
    if (z < edgeZ(x) + 1.5) continue;
    const rd = roadDist(x, z);
    if (rd < 4.8 || Math.hypot(x, z) < 13) continue;
    if (Math.max(Math.abs(x + 62), Math.abs(z + 2)) < 27) continue;
    if (Math.max(Math.abs(x - 62), Math.abs(z + 2)) < 24.5 && R() < 0.6) continue;
    const near = 1 - smooth(6, 30, rd);
    if (R() > 0.2 + near * 0.8) continue;
    const y = groundAt(x, z);
    if (R() < 0.06) deco.add(clean(new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2 + 0.3)), M.flower, mat4([x, y + 0.25, z], [0, R() * 6, 0]));
    else tuft(deco, V(x, y, z), R.range(0.7, 1.4), R() * 6);
    if (R() < 0.04) rock(deco, V(x, y, z), R.range(0.4, 1.1), R);
  }
  deco.build(group, { name: 'deco' });

  // ------------------------------------------------ the four areas
  const areas = {
    corn: buildCornfield(b, glows, L),
    grave: buildGraveyard(b, glows, L),
    witch: buildWitchRing(b, glows, L),
    seal: buildSeal(b, glows, L),
  };

  // ------------------------------------------------ the cosmic sea far below
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1).rotateX(-Math.PI / 2), seaMaterial());
  sea.position.y = -70; sea.renderOrder = -5;
  group.add(sea);

  b.build(group, { name: 'outside' });
  forest.build(group, { name: 'forest' });
  cg.build(group, { name: 'castle' });
  const bridgeGroup = new THREE.Group(); group.add(bridgeGroup);
  bridge.build(bridgeGroup, { name: 'bridge' });

  return {
    group, glows, bridgeGroup, bridgeLanterns, groundAt, islandH, areas, killY: -26,
    update(t) { sea.material.uniforms.uTime.value = t; },
  };
}

function clean2(g, s) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s);
  return g;
}

// swirling starry void: two layers of the cosmic texture drifting in opposite
// directions plus a slow spiral warp
function seaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, map: { value: null }, uFogColor: G.uFogColor },
    vertexShader: `varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mv = viewMatrix * w; vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D map; uniform vec3 uFogColor; varying vec3 vW; varying float vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * .02;
        float r = length(vW.xz - vec2(0., -80.)) * .01;
        float a = atan(vW.z + 80., vW.x) + uTime * .03 + r * 1.5;
        vec2 q = vec2(cos(a), sin(a)) * r * 3.;
        float f = n(q * 3. + uTime * .05) * .6 + n(q * 7. - uTime * .07) * .3 + n(p * 14.) * .2;
        float arms = pow(.5 + .5 * sin(a * 2. - r * 9.), 3.);
        vec3 c = mix(vec3(.02, .01, .1), vec3(.12, .14, .7), f * .8 + arms * .3);
        c += vec3(.4, .1, .5) * smoothstep(.7, .95, f) * .6;
        c += vec3(.0, .4, .35) * smoothstep(.65, .9, n(q * 5. + 9.)) * .3;
        float st = step(.992, h(floor(vW.xz * .9)));
        c += vec3(.9, .9, 1.) * st;
        c = mix(c, uFogColor, smoothstep(60., 420., vD) * .8);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
}
