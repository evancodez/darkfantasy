// Hand-pixelled textures, painted procedurally at load time. Each texture uses
// a small palette and an ordered dither between palette steps, so it reads
// like a 64x64 texture an artist drew for a 1998 console.
import * as THREE from 'three';

// ---------------------------------------------------------------- noise
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const wrap = (a, p) => ((a % p) + p) % p;
// tileable value noise: x,y in cell units, p = period in cells
function vnoise(x, y, p, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(wrap(xi, p), wrap(yi, p), s), b = hash(wrap(xi + 1, p), wrap(yi, p), s);
  const c = hash(wrap(xi, p), wrap(yi + 1, p), s), d = hash(wrap(xi + 1, p), wrap(yi + 1, p), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// u,v in 0..1 over the texture; p = base period (cells across the texture)
function fbm(u, v, p, oct = 4, s = 0) {
  let sum = 0, amp = 0.5, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise(u * p * f, v * p * f, p * f, s + i * 31); n += amp; amp *= 0.5; f *= 2; }
  return sum / n;
}
const ridge = (u, v, p, oct, s) => 1 - Math.abs(fbm(u, v, p, oct, s) * 2 - 1);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// dithered palette lookup: t in 0..1 picks between palette entries
function pal(colors, t, x, y, dither = 1) {
  const n = colors.length - 1;
  const f = clamp01(t) * n + (bayer(x, y) - 0.5) * dither;
  return colors[Math.max(0, Math.min(n, Math.round(f)))];
}
const P = arr => arr.map(hex);

// ---------------------------------------------------------------- texture factory
function make(w, h, fn, { repeat = true, mip = true, nearest = true } = {}) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y, (x + 0.5) / w, (y + 0.5) / h);
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3] ?? 255;
  }
  const t = new THREE.DataTexture(data, w, h);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : (nearest ? THREE.NearestFilter : THREE.LinearFilter);
  t.generateMipmaps = mip;
  t.needsUpdate = true;
  t.userData.data = data; t.userData.w = w; t.userData.h = h;
  return t;
}
const withA = (c, a) => [c[0], c[1], c[2], a];
const mul = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), c[3] ?? 255];

// ---------------------------------------------------------------- generators
// Bricks / blocks with a hand-pixelled bevel (light top-left, dark bottom-right).
function blocks(size, rows, cols, palette, mortar, s, { jitter = 0.18, rough = 1, offset = 0.5, moss = null } = {}) {
  const bh = size / rows, bw = size / cols;
  return make(size, size, (x, y, u, v) => {
    const r = Math.floor(y / bh), off = (r % 2) * offset * bw;
    const xx = wrap(x + off, size), c = Math.floor(xx / bw);
    const lx = xx - c * bw, ly = y - r * bh;
    if (lx < 1 || ly < 1) return mortar;
    const id = hash(c, r, s);
    let t = 0.42 + (id - 0.5) * jitter * 2 + (fbm(u, v, 8, 3, s + 5) - 0.5) * 0.5 * rough + (hash(x, y, s + 9) - 0.5) * 0.18 * rough;
    if (ly < 2) t += 0.28; else if (lx < 2) t += 0.16;
    if (ly > bh - 2) t -= 0.25; else if (lx > bw - 2) t -= 0.15;
    if (hash(c * 7 + 3, r, s) > 0.86 && fbm(u, v, 16, 2, s + c) > 0.55) t -= 0.3; // chipped / stained
    if (moss && ly > bh * 0.55 && fbm(u, v, 10, 3, s + 77) > 0.58) return pal(moss, fbm(u, v, 20, 2, s) , x, y);
    return pal(palette, t, x, y);
  });
}

// Marble: smooth base with ridged veins.
function marble(size, base, vein, s, { scale = 3, veinPow = 7, star = 0 } = {}) {
  return make(size, size, (x, y, u, v) => {
    const b = fbm(u, v, scale, 5, s);
    const r = Math.pow(ridge(u + b * 0.35, v - b * 0.2, scale + 1, 4, s + 3), veinPow);
    let t = b * 0.6 + r * 0.9;
    if (star && hash(x, y, s + 101) > 1 - star) return [255, 255, 255, 255];
    return pal(r > 0.35 ? vein : base, r > 0.35 ? (r - 0.35) / 0.65 : t, x, y);
  });
}

export const T = {};

export function bakeTextures() {
  // --- the cosmic marble road (dark navy, glowing blue swirls, specks of stars)
  const cosmicPal = P([0x02021a, 0x060640, 0x0c0c72, 0x1418a8, 0x2230dc, 0x3c5cff, 0x7a9cff, 0xd0e0ff]);
  T.cosmic = make(128, 128, (x, y, u, v) => {
    const w1 = fbm(u, v, 3, 5, 11), w2 = fbm(u + w1 * 0.7, v + w1 * 0.5, 4, 5, 12);
    const neb = fbm(u + w2 * 0.4, v - w2 * 0.3, 6, 4, 16);
    const vein = Math.pow(ridge(u + w2 * 0.6, v + w1 * 0.6, 4, 4, 13), 6);
    let t = Math.pow(w2 * 0.6 + neb * 0.5, 1.6) * 1.1 + vein * 0.55 - 0.08;
    if (hash(x, y, 14) > 0.992) return [255, 255, 255, 255];
    if (hash(x, y, 15) > 0.982) t += 0.3;
    return pal(cosmicPal, t, x, y);
  });

  // --- stones
  const wallPal = P([0x14143a, 0x22225a, 0x33337e, 0x4646a2, 0x5e5ec4, 0x8282e6]);
  T.wall = blocks(64, 4, 2, wallPal, hex(0x0a0a22), 21);
  const castlePal = P([0x100c2e, 0x1c1648, 0x2a2266, 0x3a3088, 0x4e44aa, 0x6a60cc]);
  T.castle = blocks(64, 4, 2, castlePal, hex(0x07051a), 22, { jitter: 0.12 });
  const darkPal = P([0x0a0a1e, 0x141430, 0x20204a, 0x2e2e66, 0x404088]);
  T.darkStone = blocks(64, 8, 4, darkPal, hex(0x050510), 23, { moss: P([0x0a2a24, 0x1a4a3a, 0x2a6a4a]) });
  T.cobble = make(64, 64, (x, y, u, v) => {
    // voronoi-ish cobbles
    let d1 = 9, d2 = 9, id = 0; const N = 5;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = Math.floor(u * N) + i, cy = Math.floor(v * N) + j;
      const px = (cx + hash(wrap(cx, N), wrap(cy, N), 31)) / N, py = (cy + hash(wrap(cx, N), wrap(cy, N), 32)) / N;
      const d = Math.hypot(u - px, v - py);
      if (d < d1) { d2 = d1; d1 = d; id = hash(wrap(cx, N), wrap(cy, N), 33); } else if (d < d2) d2 = d;
    }
    const edge = (d2 - d1) * N;
    if (edge < 0.12) return hex(0x0c0a1e);
    const t = 0.25 + id * 0.35 + (fbm(u, v, 8, 3, 34) - 0.5) * 0.4 + (edge < 0.25 ? -0.15 : 0) + (d1 * N < 0.25 ? 0.15 : 0);
    return pal(P([0x1a1636, 0x2a2450, 0x3c3470, 0x544a92, 0x6e64b2]), t, x, y);
  });
  T.slate = make(64, 64, (x, y, u, v) => {
    const row = Math.floor(y / 8), off = (row % 2) * 4, col = Math.floor(wrap(x + off, 64) / 8);
    const lx = wrap(x + off, 64) % 8, ly = y % 8;
    const id = hash(col, row, 41);
    let t = 0.35 + id * 0.3 + (fbm(u, v, 6, 3, 42) - 0.5) * 0.3 - ly * 0.04;
    if (ly >= 7 || lx === 0) return hex(0x04041a);
    if (ly === 0) t += 0.25;
    return pal(P([0x08082a, 0x101040, 0x1a1a5e, 0x2a2a86, 0x4040b0]), t, x, y);
  });
  T.plaster = make(64, 64, (x, y, u, v) => pal(P([0x1a1440, 0x241c56, 0x30266c, 0x3e3284]), fbm(u, v, 4, 5, 51) + (hash(x, y, 52) - 0.5) * 0.2, x, y));
  T.granite = make(64, 64, (x, y, u, v) => {
    const t = fbm(u, v, 6, 4, 61) * 0.7 + hash(x, y, 62) * 0.5 - 0.1;
    if (hash(x, y, 63) > 0.96) return hex(0x05041a);
    return pal(P([0x12104a, 0x201a80, 0x302ab0, 0x4a40d8, 0x6a60ff, 0x9890ff]), t, x, y);
  });

  // --- checkerboards (white granite / green-veined black marble / ultramarine)
  const whitePal = P([0x6a6a86, 0x9090aa, 0xb4b4ca, 0xd4d4e6, 0xf0f0fc]);
  const greenBase = P([0x010604, 0x030e08, 0x061a0e]), greenVein = P([0x0a3018, 0x18602c, 0x34a050, 0x7ae08a]);
  const bluePal = P([0x06064a, 0x0c0c80, 0x1414b4, 0x2020e0, 0x4040ff, 0x7070ff]);
  const greenSq = (x, y, u, v, s) => {
    const b = fbm(u, v, 4, 4, s);
    const r = Math.pow(ridge(u * 1.3 + b * 0.5, v * 1.3 - b * 0.3, 5, 4, s + 1), 6);
    return r > 0.3 ? pal(greenVein, (r - 0.3) / 0.7, x, y) : pal(greenBase, b, x, y);
  };
  T.checker = make(128, 128, (x, y, u, v) => {
    const dark = ((x >> 6) + (y >> 6)) & 1;
    if (dark) return greenSq(x, y, u, v, 71);
    const t = 0.55 + (fbm(u, v, 8, 3, 72) - 0.5) * 0.6 + (hash(x, y, 73) - 0.5) * 0.55;
    return pal(whitePal, t, x, y);
  });
  T.checkerBlue = make(128, 128, (x, y, u, v) => {
    const dark = ((x >> 6) + (y >> 6)) & 1;
    if (dark) return greenSq(x, y, u, v, 81);
    const t = 0.5 + (fbm(u, v, 6, 4, 82) - 0.5) * 0.9 + (hash(x, y, 83) - 0.5) * 0.25;
    return pal(bluePal, t, x, y);
  });
  T.checkerCloth = make(32, 32, (x, y, u, v) => {
    const dark = ((x >> 3) + (y >> 3)) & 1;
    const t = 0.55 + (fbm(u, v, 4, 3, 91) - 0.5) * 0.5 + (hash(x, y, 92) - 0.5) * 0.2 - ((x & 7) === 7 || (y & 7) === 7 ? 0.2 : 0);
    return dark ? pal(P([0x0e1460, 0x1a28a8, 0x2a40e0, 0x4a64ff]), t, x, y) : pal(P([0x6a78c0, 0xa0acee, 0xd0d8ff, 0xf4f6ff]), t, x, y);
  });

  // --- nature
  T.grass = make(64, 64, (x, y, u, v) => {
    const blade = hash(x, Math.floor(y / 3 + hash(x, 0, 101) * 3), 102);
    const t = fbm(u, v, 4, 4, 103) * 0.65 + blade * 0.45 - 0.05;
    return pal(P([0x040c1a, 0x081a28, 0x0e2c36, 0x164440, 0x22604c, 0x34805a]), t, x, y);
  });
  T.tuft = make(32, 32, (x, y, u, v) => {
    // a clump of grass blades for cross-quad tufts (alpha cut-out)
    const yy = 31 - y;
    for (let k = 0; k < 9; k++) {
      const bx = 3 + k * 3.2 + hash(k, 1, 107) * 2, lean = (hash(k, 2, 107) - 0.5) * 0.7, hgt = 14 + hash(k, 3, 107) * 17;
      const cx = bx + lean * yy;
      if (yy < hgt && Math.abs(x - cx) < 1.4 * (1 - yy / hgt) + 0.5) return pal(P([0x081c22, 0x10343a, 0x1a5446, 0x2c7a56, 0x4aa068]), yy / hgt * 0.9 + hash(x, y, 108) * 0.2, x, y);
    }
    return [0, 0, 0, 0];
  }, { mip: false });
  T.flower = make(16, 16, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 1.6) return hex(0xfff0a0);
    if (d < 5 && Math.abs(Math.sin(Math.atan2(y - 7.5, x - 7.5) * 2.5)) > 0.3) return pal(P([0x4a3ac0, 0x7a6aff, 0xc0b0ff]), 1 - d / 5, x, y);
    return [0, 0, 0, 0];
  }, { mip: false });
  T.dirt = make(64, 64, (x, y, u, v) => {
    if (hash(x, y, 111) > 0.975) return hex(0x8a7a9a);
    const t = fbm(u, v, 5, 4, 112) * 0.8 + (hash(x, y, 113) - 0.5) * 0.35;
    return pal(P([0x0e0812, 0x1c1020, 0x2c1a28, 0x402632, 0x56363a]), t, x, y);
  });
  T.cornField = make(64, 64, (x, y, u, v) => {
    // mottled green/brown/straw ground (cornfield floor)
    if (hash(x, y, 121) > 0.97) return hex(0xb0a080);
    const t = fbm(u, v, 6, 4, 122) * 0.9 + (hash(x, y, 123) - 0.5) * 0.4;
    return pal(P([0x0a0e10, 0x14201a, 0x1e3420, 0x34401e, 0x5a4a24, 0x7a6030]), t, x, y);
  });
  T.bark = make(32, 64, (x, y, u, v) => {
    const t = fbm(u * 4, v * 0.6, 4, 3, 131) * 0.8 + (hash(x, 0, 132) - 0.5) * 0.5;
    return pal(P([0x0a0610, 0x1a0e1a, 0x2a1824, 0x3e2630]), t, x, y);
  });
  T.pine = make(64, 64, (x, y, u, v) => {
    // tiers of needles: v runs up the cone; darker under each tier
    const tier = (v * 4) % 1;
    const n = hash(Math.floor(x / 2), y, 141);
    const t = tier * 0.75 + n * 0.35 + (fbm(u, v, 8, 2, 142) - 0.5) * 0.3 - 0.1;
    return pal(P([0x020a10, 0x06161e, 0x0c2a30, 0x144040, 0x1e5a4e, 0x30785e]), t, x, y);
  });
  T.corn = make(32, 64, (x, y, u, v) => {
    // stalk card (alpha cut-out): central stalk, arching leaves, tassel at the top
    const cx = 16 + Math.sin(v * 6) * 1.2;
    const dx = x - cx, yy = 63 - y; // yy = height from bottom
    const green = P([0x0a2410, 0x14401a, 0x22621e, 0x3a8426, 0x62a83a]);
    const t = 0.35 + fbm(u, v, 4, 3, 151) * 0.5;
    if (yy > 54) { // tassel
      if (Math.abs(dx) < (64 - yy) * 0.6 && hash(x, y, 152) > 0.3) return pal(P([0x5a2a0a, 0x9a4a12, 0xd07a24, 0xf0a840]), hash(x, y, 153), x, y);
      return [0, 0, 0, 0];
    }
    if (Math.abs(dx) < 1.3) return pal(green, t + 0.2, x, y);
    for (let k = 0; k < 5; k++) { // leaves
      const by = 6 + k * 10 + hash(k, 0, 154) * 4, side = k % 2 ? 1 : -1;
      const lx = dx * side;
      if (lx < 0) continue;
      const ly = by + lx * 0.9 - lx * lx * 0.05;
      const w = Math.max(0, 2.4 - lx * 0.12);
      if (Math.abs(yy - ly) < w && lx < 16) return pal(green, t + (yy - ly) / w * 0.25 + 0.1, x, y);
    }
    if (Math.abs(dx - 3) < 2 && yy > 26 && yy < 38) return pal(P([0x6a3a0a, 0xc07a1a, 0xf0b030, 0xffe070]), (yy - 26) / 12 + hash(x, y, 155) * 0.3, x, y); // ear
    return [0, 0, 0, 0];
  }, { mip: false });
  T.wood = make(32, 32, (x, y, u, v) => {
    const plank = Math.floor(x / 8);
    if (x % 8 === 0) return hex(0x0a0408);
    const t = fbm(u * 0.3 + plank * 0.37, v * 3, 4, 3, 161) * 0.8 + hash(plank, 0, 162) * 0.3;
    return pal(P([0x1a0c12, 0x2e1a1c, 0x442a26, 0x5e3e30]), t, x, y);
  });
  T.straw = make(32, 32, (x, y, u, v) => pal(P([0x4a2a0a, 0x7a4a14, 0xb07a24, 0xe0b040]), hash(x, Math.floor(y / 4), 171) * 0.7 + fbm(u, v, 4, 2, 172) * 0.4, x, y));
  T.burlap = make(32, 32, (x, y, u, v) => {
    const weave = ((x % 2) ^ (y % 2)) ? 0.12 : -0.08;
    const t = 0.45 + weave + (fbm(u, v, 4, 3, 181) - 0.5) * 0.6 + (hash(x, y, 182) - 0.5) * 0.15;
    return pal(P([0x3a1806, 0x6a300c, 0xa0501a, 0xd07a30, 0xf0a050]), t, x, y);
  });

  // --- cloth / creatures
  T.robe = make(64, 64, (x, y, u, v) => {
    const fold = Math.sin(u * Math.PI * 2 * 4 + fbm(u, v, 3, 3, 191) * 4) * 0.5 + 0.5;
    const t = 0.25 + fold * 0.5 + (fbm(u, v, 6, 3, 192) - 0.5) * 0.3 + (v > 0.94 ? -0.25 : 0);
    return pal(P([0x3a0008, 0x6a040c, 0x9a0a12, 0xc8141a, 0xec3424, 0xff7050]), t, x, y);
  });
  T.cape = T.robe;
  T.scales = make(64, 64, (x, y, u, v) => {
    // big overlapping scales, four rows per tile, dark seams
    const row = Math.floor(y / 16), off = (row % 2) * 8;
    const lx = wrap(x + off, 64) % 16 - 7.5, ly = y % 16;
    const d = Math.hypot(lx, (ly - 3) * 0.85);
    if (d > 9.2 || ly > 14) return pal(P([0x140002, 0x2a0004]), hash(x, y, 200), x, y);
    const t = 0.82 - d * 0.06 - ly * 0.025 + (fbm(u, v, 8, 2, 201) - 0.5) * 0.25 + (d > 7.8 ? -0.3 : 0);
    return pal(P([0x2a0004, 0x560408, 0x8a0a0c, 0xc01810, 0xf03a18, 0xff7a30]), t, x, y);
  });
  T.belly = make(32, 32, (x, y, u, v) => {
    const ly = y % 8;
    const t = 0.7 - ly * 0.07 + (hash(x, y, 211) - 0.5) * 0.2;
    if (ly === 7) return hex(0x3a1004);
    return pal(P([0x6a2a06, 0xb05a10, 0xe08a20, 0xffc040]), t, x, y);
  });
  T.membrane = make(64, 64, (x, y, u, v) => {
    const vein = Math.pow(ridge(u * 0.5, v * 2, 3, 3, 221), 10);
    const t = 0.3 + fbm(u, v, 5, 3, 222) * 0.35 + vein * 0.6;
    return pal(P([0x1a0010, 0x3a0418, 0x6a0a20, 0xa01a28, 0xe04a30]), t, x, y);
  });
  T.horn = make(32, 64, (x, y, u, v) => {
    const band = Math.sin(v * Math.PI * 2 * 9) * 0.5 + 0.5;
    const t = 0.25 + band * 0.45 + (hash(x, y, 231) - 0.5) * 0.15;
    return pal(P([0x04040e, 0x0e0e26, 0x1e1e4a, 0x34347a, 0x5a5ab0]), t, x, y);
  });
  T.bone = make(32, 32, (x, y, u, v) => pal(P([0x4a4a80, 0x7a7ab0, 0xa8a8dc, 0xd4d4f6, 0xf6f6ff]), 0.55 + (fbm(u, v, 4, 3, 241) - 0.5) * 0.7 + (hash(x, y, 242) - 0.5) * 0.2, x, y));
  T.fur = make(32, 32, (x, y, u, v) => {
    const t = fbm(u, v, 4, 3, 251) * 0.6 + (hash(x, y, 252) > 0.86 ? 0.5 : 0);
    return pal(P([0x02021a, 0x080838, 0x10106a, 0x2020b0, 0x4a4aff]), t, x, y);
  });
  T.hatCloth = make(32, 32, (x, y, u, v) => pal(P([0x040408, 0x0e0e18, 0x1a1a2e, 0x2c2c48]), fbm(u, v, 4, 4, 261) + (hash(x, y, 262) - 0.5) * 0.25, x, y));
  T.skin = make(32, 32, (x, y, u, v) => pal(P([0x6a0006, 0xa00a0c, 0xd81a14, 0xff4a24, 0xff8a50]), 0.55 + (fbm(u, v, 4, 3, 271) - 0.5) * 0.7, x, y));
  T.iron = make(32, 32, (x, y, u, v) => {
    const lx = x % 16, ly = y % 16;
    if ((lx === 3 || lx === 12) && (ly === 3 || ly === 12)) return hex(0x9a9ad0);
    const t = 0.4 + (fbm(u, v, 4, 3, 281) - 0.5) * 0.6 + (lx === 0 || ly === 0 ? -0.3 : 0) + (lx === 1 || ly === 1 ? 0.2 : 0);
    return pal(P([0x06061a, 0x10102c, 0x1c1c44, 0x2c2c62, 0x444488]), t, x, y);
  });
  T.metal = make(32, 32, (x, y, u, v) => pal(P([0x2a3070, 0x4450a8, 0x6878d8, 0x98a8ff]), 0.5 + (fbm(u, v, 3, 3, 291) - 0.5) * 0.6, x, y));
  T.gold = make(32, 32, (x, y, u, v) => pal(P([0x4a2004, 0x8a4a0a, 0xd08a1a, 0xffc840, 0xfff0a0]), 0.55 + (fbm(u, v, 4, 3, 301) - 0.5) * 0.8, x, y));
  T.coins = make(64, 64, (x, y, u, v) => {
    let best = 9, bt = 0;
    for (let k = 0; k < 3; k++) {
      const N = 6 + k * 2;
      const cx = Math.floor(u * N), cy = Math.floor(v * N);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j, h = hash(wrap(gx, N), wrap(gy, N), 311 + k);
        const px = (gx + 0.2 + h * 0.6) / N, py = (gy + 0.2 + hash(wrap(gx, N), wrap(gy, N), 320 + k) * 0.6) / N;
        const d = Math.hypot(u - px, (v - py) * 1.6) * N;
        if (d < 0.45 && k + d < best) { best = k + d; bt = 0.95 - d * 1.2 + (py - v) * N * 0.5; }
      }
    }
    if (best > 8) return pal(P([0x2a1004, 0x5a2a06, 0x8a4a0a]), fbm(u, v, 8, 2, 330), x, y);
    return pal(P([0x5a2a06, 0x9a5a0a, 0xd89a1a, 0xffd040, 0xfff4b0]), bt, x, y);
  });

  // --- glowing bits
  T.window = make(16, 32, (x, y) => {
    const yy = 31 - y; // bottom up
    const inArch = yy < 22 || Math.hypot(x - 7.5, yy - 22) < 7;
    if (x < 1 || x > 14 || yy < 1 || !inArch) return hex(0x0a0618);
    if (x === 7 || x === 8 || yy === 12) return hex(0x3a1a08);
    const g = 1 - yy / 32;
    return pal(P([0xa04008, 0xe07a10, 0xffb020, 0xffe060, 0xfff8c0]), 0.4 + g * 0.6 + (hash(x, y, 341) - 0.5) * 0.2, x, y);
  }, { repeat: false });
  T.stained = make(32, 64, (x, y) => {
    // a tall arched stained-glass window: coloured panes in dark leading
    const yy = 63 - y, inArch = yy < 46 || Math.hypot(x - 15.5, yy - 46) < 15;
    if (x < 1 || x > 30 || yy < 1 || !inArch) return hex(0x0a0618);
    if (x % 8 === 0 || yy % 10 === 0 || Math.abs(x - 15.5 - (yy - 30) * 0.3) < 0.7 && yy > 20 && yy < 40) return hex(0x140a20);
    const cell = hash(Math.floor(x / 8), Math.floor(yy / 10), 421);
    const cols = [[0x1a3aff, 0x6a8aff], [0xd01830, 0xff6a50], [0x7a2ad0, 0xc080ff], [0xe0a010, 0xffe070], [0x10a070, 0x60f0b0]];
    const [a, b] = cols[Math.floor(cell * cols.length)];
    return pal(P([a, b]), 0.3 + hash(x, y, 422) * 0.5 + (yy > 46 ? 0.2 : 0), x, y);
  }, { repeat: false });
  T.lanternGlass = make(16, 16, (x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15 || x === 7 || x === 8) return hex(0x0a0a2a);
    const d = Math.hypot(x - 7.5, y - 9) / 9;
    return pal(P([0x1830c0, 0x3060ff, 0x70a0ff, 0xc0e0ff, 0xffffff]), 1 - d, x, y);
  });
  T.glow = make(32, 32, (x, y, u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = Math.pow(Math.max(0, 1 - d), 2.2);
    return [255, 255, 255, Math.round(a * 255)];
  }, { repeat: false, mip: false, nearest: false });
  T.star4 = make(32, 32, (x, y, u, v) => {
    const dx = Math.abs(u - 0.5) * 2, dy = Math.abs(v - 0.5) * 2;
    const core = Math.max(0, 1 - Math.hypot(dx, dy) * 3.2);
    const ray = Math.max(0, 1 - dx) * Math.max(0, 1 - dy * 14) + Math.max(0, 1 - dy) * Math.max(0, 1 - dx * 14);
    const diag = Math.max(0, 1 - Math.abs(dx - dy) * 10) * Math.max(0, 1 - (dx + dy) * 1.4) * 0.5;
    const a = Math.min(1, core + Math.pow(ray, 2) + diag);
    return [255, 255, 255, Math.round(a * 255)];
  }, { repeat: false, mip: false, nearest: false });
  T.shadow = make(32, 32, (x, y, u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = d > 1 ? 0 : (d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4) * (bayer(x, y) < 0.9 ? 1 : 0.6);
    return [0, 0, 0, Math.round(a * 200)];
  }, { repeat: false, mip: false });
  T.moon = make(64, 64, (x, y, u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    if (d > 1) return [0, 0, 0, 0];
    const crater = fbm(u, v, 4, 4, 351);
    const t = 0.9 - Math.max(0, crater - 0.45) * 1.8 - d * d * 0.25;
    return withA(pal(P([0x6070b0, 0x90a0d8, 0xc0ccf0, 0xe8eeff, 0xffffff]), t, x, y), 255);
  }, { repeat: false, mip: false });
  T.fire = make(16, 16, (x, y, u, v) => {
    const d = Math.hypot(u - 0.5, (v - 0.55) * 1.3) * 2;
    const a = Math.max(0, 1 - d);
    return [255, 255, 255, Math.round(Math.min(1, a * 1.6) * 255)];
  }, { repeat: false, mip: false });

  T.shield = make(32, 32, (x, y, u, v) => {
    const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy) * 2;
    if (d > 0.84) return pal(P([0x4a2004, 0x9a5a0a, 0xe0a020, 0xfff0a0]), 0.4 + (dy < 0 ? 0.4 : 0) + hash(x, y, 361) * 0.2, x, y);
    // crescent moon
    const c1 = Math.hypot(dx + 0.02, dy) < 0.26, c2 = Math.hypot(dx - 0.09, dy - 0.04) < 0.22;
    if (c1 && !c2) return pal(P([0x9a5a0a, 0xe0a020, 0xffd860, 0xfff8c0]), 0.6 - dy, x, y);
    return pal(P([0x060a3a, 0x0e1670, 0x1a24a8, 0x2a3ad0]), 0.45 + dy * 0.6 + (fbm(u, v, 4, 3, 362) - 0.5) * 0.4, x, y);
  }, { repeat: false });
  T.pot = make(32, 32, (x, y, u, v) => {
    if (y >= 9 && y <= 11) return pal(P([0x6a3a06, 0xd09020, 0xffe070]), (y - 9) / 2 + hash(x, y, 381) * 0.3, x, y);
    if (y >= 20 && y <= 21) return hex(0x0a0420);
    const t = 0.5 + (fbm(u, v, 4, 3, 382) - 0.5) * 0.6 + (hash(x, y, 383) - 0.5) * 0.15;
    return pal(P([0x1a0a40, 0x30188a, 0x4a2ac0, 0x6a4ae8, 0x9a80ff]), t, x, y);
  });
  T.rune = make(64, 64, (x, y, u, v) => {
    // glowing rune circle for bounce pads
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2, a = Math.atan2(dy, dx);
    if (r > 1) return [0, 0, 0, 0];
    const ring = Math.abs(r - 0.86) < 0.06 || Math.abs(r - 0.6) < 0.035;
    const glyph = r > 0.64 && r < 0.82 && Math.sin(a * 12) > 0.2 && hash(Math.floor((a + 4) * 4), Math.floor(r * 12), 391) > 0.4;
    const star = Math.abs(dx) * Math.abs(dy) < 0.004 && r < 0.5;
    if (ring || glyph || star) return [190, 220, 255, 255];
    return [30, 40, 140, 255];
  }, { repeat: false });
  T.runes = make(16, 64, (x, y, u, v) => {
    // sword blade: bright steel with a glowing blue fuller of runes
    if (x >= 6 && x <= 9) return (hash(Math.floor(y / 3), x > 7 ? 1 : 0, 371) > 0.45 && y % 3) ? hex(0xa0e0ff) : hex(0x2a4aff);
    return pal(P([0x6a72b0, 0x9aa4e0, 0xd0d8ff, 0xffffff]), 1 - Math.abs(x - 7.5) / 8 + (hash(x, y, 372) - 0.5) * 0.2, x, y);
  }, { repeat: false });

  T.flame = make(32, 64, (x, y, u, v) => {
    // tileable licking flames: bright yellow core, orange body, red tips
    const n = fbm(u * 2, v * 1.5, 4, 4, 401), n2 = fbm(u * 3 + n, v * 2, 6, 3, 402);
    const t = 0.25 + n * 0.55 + n2 * 0.35 + Math.sin(u * Math.PI * 6 + v * 9) * 0.08;
    return pal(P([0x3a0004, 0x8a0a06, 0xd02a0a, 0xff6a10, 0xffa830, 0xffe070, 0xfffad0]), t, x, y);
  });

  // --- sphere maps (matcaps) for chrome / gold / glossy plastic
  const sphere = (fn) => make(64, 64, (x, y, u, v) => {
    const nx = u * 2 - 1, ny = 1 - v * 2, r2 = nx * nx + ny * ny;
    if (r2 > 1) return [0, 0, 0, 255];
    const nz = Math.sqrt(1 - r2);
    return fn(nx, ny, nz, x, y);
  }, { repeat: false, mip: false, nearest: false });
  T.chrome = sphere((nx, ny, nz, x, y) => {
    // sky above a dark horizon line, violet floor below, hard white highlight
    let c;
    if (ny > 0.08) c = pal(P([0x30287a, 0x6a60d0, 0xb0b0ff, 0xf0f0ff]), ny * 1.1, x, y);
    else if (ny > -0.06) c = hex(0x05041a);
    else c = pal(P([0x0a0828, 0x241a60, 0x4a2a90, 0x8a4ac0]), -ny * 0.9 + nx * 0.1, x, y);
    const hl = Math.hypot(nx + 0.38, ny - 0.45);
    if (hl < 0.16) c = [255, 255, 255];
    else if (hl < 0.24) c = mul(c, 1.6);
    const rim = 1 - nz;
    return mul(c, 0.7 + rim * 0.6);
  });
  T.silver = sphere((nx, ny, nz, x, y) => {
    // polished steel: bright sky, sharp dark horizon, cool floor bounce
    let c;
    if (ny > 0.12) c = pal(P([0x5a6088, 0x9aa4c8, 0xd8e0f4, 0xffffff]), ny * 1.2 + 0.1, x, y);
    else if (ny > -0.04) c = pal(P([0x0a0a1a, 0x1a1c34]), ny + 0.04, x, y);
    else c = pal(P([0x1a1c40, 0x343a70, 0x5a64a0, 0x8890c0]), -ny * 0.9 + 0.1, x, y);
    const hl = Math.hypot(nx + 0.35, ny - 0.5);
    if (hl < 0.13) c = [255, 255, 255];
    else if (hl < 0.2) c = mul(c, 1.35);
    return mul(c, 0.75 + (1 - nz) * 0.45);
  });
  T.goldEnv = sphere((nx, ny, nz, x, y) => {
    let c = pal(P([0x2a1002, 0x6a3006, 0xb06a10, 0xf0b030, 0xfff0a0]), 0.45 + ny * 0.45 + nz * 0.15, x, y);
    if (Math.hypot(nx + 0.35, ny - 0.4) < 0.15) c = [255, 255, 230];
    return c;
  });
  T.redEnv = sphere((nx, ny, nz, x, y) => {
    let c = pal(P([0x1a0004, 0x5a0008, 0xb0100e, 0xf03a20, 0xff9a70]), 0.4 + ny * 0.35 + nz * 0.3, x, y);
    if (Math.hypot(nx + 0.3, ny - 0.42) < 0.13) c = [255, 230, 220];
    return c;
  });
  T.blueEnv = sphere((nx, ny, nz, x, y) => {
    let c = pal(P([0x04041a, 0x0c1050, 0x1a28a0, 0x3a5aff, 0xa0c0ff]), 0.35 + ny * 0.4 + nz * 0.3, x, y);
    if (Math.hypot(nx + 0.3, ny - 0.42) < 0.13) c = [240, 250, 255];
    return c;
  });
  return T;
}

// re-exported for other modules that paint at runtime
export { hash, fbm, vnoise, pal, P, hex, bayer };
