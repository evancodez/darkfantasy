// The Midnight Carnival's own look: hand-pixelled textures (moon dust, rose and
// teal marble, candy stripes, gilded scrollwork, velvet, star cloth, paper
// lanterns, marquee bulbs, porcelain...), its material set, and the static set
// pieces the fair is assembled from (tents, stalls, lantern strings, balloons,
// candy-floss trees, lamps, crystals, the moon gate...).
import * as THREE from 'three';
import { make, hash, fbm, ridge, pal, P, hex, bayer, withA } from '../../core/tex.js';
import { retroMat, Lights } from '../../core/retro.js';
import { box, cyl, sphere, clean, mat4, Batch, rng, Bake } from '../../core/geo.js';
import { M } from '../kit.js';
import { T } from '../../core/tex.js';

const PI = Math.PI;
const wrapd = d => d - Math.round(d);
export const CT = {};
export const CM = {};

// ------------------------------------------------------------------ textures
// a 5-pointed star test: polar radius of a star shape
const starR = (a, R, r = 0.45) => R * (r + (1 - r) * Math.pow(Math.abs(Math.cos(a * 2.5)), 5));

export function bakeFairTextures() {
  if (CT.dust) return;
  // moon regolith: pale lavender dust, little craters, teal and white glints
  const dustPal = P([0x1e1840, 0x342a64, 0x4e4288, 0x6c5eaa, 0x8e80c8, 0xb2a6e2, 0xd8d0f6]);
  const craters = [[0.22, 0.3, 0.12], [0.7, 0.62, 0.17], [0.55, 0.14, 0.07], [0.15, 0.8, 0.09], [0.86, 0.2, 0.06], [0.4, 0.55, 0.05]];
  CT.dust = make(64, 64, (x, y, u, v) => {
    let t = 0.52 + (fbm(u, v, 4, 4, 501) - 0.5) * 0.8 + (hash(x, y, 502) - 0.5) * 0.2;
    for (const [cx, cy, r] of craters) {
      const dx = wrapd(u - cx), dy = wrapd(v - cy), d = Math.hypot(dx, dy) / r;
      if (d < 0.8) t += -0.2 + (dx + dy) / r * 0.18;
      else if (d < 1.15) t += 0.16 - (dx + dy) / r * 0.1;
    }
    const g = hash(x, y, 503);
    if (g > 0.993) return hex(0xf0fcff);
    if (g > 0.982) return hex(0x60e8d8);
    return pal(dustPal, t, x, y);
  });
  // cliff rock: lavender strata cut by glowing teal crystal veins
  const rockPal = P([0x100a24, 0x1c143c, 0x2a1f56, 0x3a2c72, 0x4e3e8e, 0x6654ac]);
  const veinPal = P([0x0a3a48, 0x148078, 0x2ac8b4, 0x9cfff0]);
  CT.rock = make(64, 64, (x, y, u, v) => {
    const b = fbm(u, v, 3, 4, 511);
    const strata = Math.sin((v + b * 0.35) * PI * 10) * 0.12;
    const vein = Math.pow(ridge(u + b * 0.4, v * 0.6 + b * 0.2, 4, 4, 512), 9);
    if (vein > 0.45) return pal(veinPal, (vein - 0.45) / 0.55, x, y);
    return pal(rockPal, 0.45 + (b - 0.5) * 0.9 + strata + (hash(x, y, 513) - 0.5) * 0.18, x, y);
  });
  // promenade tiles: rose marble and teal marble checker with gold grout
  const rose = P([0x4a0a36, 0x7a1a58, 0xaa3a80, 0xd86aa8, 0xf6a8d0, 0xffe0f0]);
  const roseVein = P([0x6a0a40, 0xff8ac0, 0xffffff]);
  const teal = P([0x021c24, 0x063440, 0x0a4c58, 0x106470]), tealVein = P([0x167a7a, 0x34c0aa, 0x8cfadc, 0xe8fff8]);
  const goldPal = P([0x4a2004, 0x9a5a0a, 0xe0a020, 0xffe080]);
  const marbleSq = (x, y, u, v, dark, s) => {
    const b = fbm(u, v, 4, 4, s), r = Math.pow(ridge(u * 1.3 + b * 0.5, v * 1.3 - b * 0.3, 5, 4, s + 1), 6);
    if (hash(x, y, s + 7) > 0.994) return hex(0xffffff);
    if (dark) return r > 0.3 ? pal(tealVein, (r - 0.3) / 0.7, x, y) : pal(teal, b, x, y);
    return r > 0.38 ? pal(roseVein, (r - 0.38) / 0.62, x, y) : pal(rose, 0.5 + (b - 0.5) * 0.9 + (hash(x, y, s + 3) - 0.5) * 0.2, x, y);
  };
  CT.tiles = make(128, 128, (x, y, u, v) => {
    const gx = x & 63, gy = y & 63;
    if (gx < 2 || gy < 2) return pal(goldPal, gx < 1 || gy < 1 ? 0.85 : 0.35, x, y);
    return marbleSq(x, y, u, v, ((x >> 6) + (y >> 6)) & 1, 521);
  });
  // canvas stripes (tents, awnings, poles)
  const stripes = (a, b, s) => make(64, 64, (x, y, u, v) => {
    const f = u * 4, k = Math.floor(f) & 1, lx = f % 1;
    let t = 0.62 + (fbm(u, v, 4, 3, s) - 0.5) * 0.3 + ((x + (y >> 1)) & 1) * 0.05 - (lx < 0.05 || lx > 0.95 ? 0.22 : 0) - (y % 16 === 0 ? 0.08 : 0);
    return pal(k ? a : b, t, x, y);
  });
  const cream = P([0x5a3a4a, 0x9a7a8a, 0xd8c0c8, 0xfff0ec]);
  CT.stripePink = stripes(P([0x4a0628, 0x8a1048, 0xd02a70, 0xff6aa4]), cream, 531);
  CT.stripeTeal = stripes(P([0x032a30, 0x075a5c, 0x109a90, 0x3ad8c0]), cream, 532);
  CT.stripeViolet = stripes(P([0x140a40, 0x2a1880, 0x4a32c0, 0x7a64f0]), P([0x5a3008, 0xa06a10, 0xe8b030, 0xffe890]), 533);
  // candy cane (poles, tree trunks): diagonal red and cream bands
  CT.cane = make(32, 32, (x, y, u, v) => {
    const k = Math.floor((u + v) * 4) & 1, t = 0.6 + (hash(x, y, 541) - 0.5) * 0.2 + Math.sin((u + v) * PI * 8) * 0.12;
    return pal(k ? P([0x5a0618, 0xa01030, 0xe02a48, 0xff7a8a]) : cream, t, x, y);
  });
  // gilded scrollwork (carousel, booths, frames)
  CT.gild = make(32, 32, (x, y, u, v) => {
    const sc = Math.sin(u * PI * 4 + Math.sin(v * PI * 4) * 1.7) * Math.cos(v * PI * 4 + Math.sin(u * PI * 2) * 1.3);
    if (Math.abs(sc) < 0.1) return pal(P([0x1a0a04, 0x3a1a06]), hash(x, y, 551), x, y);
    return pal(P([0x5a2a06, 0x9a5a0e, 0xd8961e, 0xffcc48, 0xfff2b0]), 0.5 + sc * 0.4 + (fbm(u, v, 4, 2, 552) - 0.5) * 0.3, x, y);
  });
  // velvet curtains: deep folds and a soft pile
  CT.velvet = make(64, 64, (x, y, u, v) => {
    const fold = Math.cos(u * PI * 2 * 3 + (fbm(u, v, 2, 2, 561) - 0.5) * 2.5);
    return pal(P([0x14000c, 0x30001c, 0x58062e, 0x880e44, 0xb82062, 0xe8508c]), 0.45 + fold * 0.32 + (hash(x, y, 562) - 0.5) * 0.14 - v * 0.08, x, y);
  });
  // midnight star cloth (imp hats, the queen's gown, the big top's lining)
  const nightPal = P([0x04031a, 0x0a0832, 0x120e4c, 0x1c1868, 0x2a2488]);
  const starGold = P([0x7a4006, 0xd09018, 0xffda5a, 0xfff8d0]);
  const starsAt = (u, v, n, s) => {
    const cx = Math.floor(u * n), cy = Math.floor(v * n);
    let best = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const X = cx + i, Y = cy + j, Xw = ((X % n) + n) % n, Yw = ((Y % n) + n) % n;
      const px = (X + 0.2 + hash(Xw, Yw, s) * 0.6) / n, py = (Y + 0.2 + hash(Xw, Yw, s + 1) * 0.6) / n;
      const R = (0.22 + hash(Xw, Yw, s + 2) * 0.22) / n, dx = u - px, dy = v - py, d = Math.hypot(dx, dy);
      const sr = starR(Math.atan2(dy, dx) + hash(Xw, Yw, s + 3) * 3, R);
      if (d < sr) best = Math.max(best, 1 - d / sr * 0.6);
    }
    return best;
  };
  CT.starCloth = make(64, 64, (x, y, u, v) => {
    const st = starsAt(u, v, 4, 571);
    if (st > 0) return pal(starGold, st, x, y);
    if (hash(x, y, 572) > 0.985) return hex(0xb0c0ff);
    return pal(nightPal, 0.45 + (fbm(u, v, 4, 3, 573) - 0.5) * 0.7 + (((x + y) & 3) === 0 ? 0.05 : 0), x, y);
  });
  // paper lantern: warm paper with ribs (tinted per lantern)
  CT.paper = make(16, 32, (x, y, u, v) => {
    const rib = (v * 5) % 1;
    if (rib < 0.1) return hex(0x6a4a3a);
    return pal(P([0xa07a60, 0xe0c0a0, 0xfff0dc, 0xffffff]), 0.35 + Math.sin(rib * PI) * 0.6 - Math.abs(u - 0.5) * 0.5 + (hash(x, y, 581) - 0.5) * 0.15, x, y);
  });
  // a strip of marquee bulbs (scrolled for chasing lights)
  CT.bulbs = make(32, 8, (x, y) => {
    const lx = x % 8, d = Math.hypot(lx - 3.5, y - 3.5), on = (x >> 3) % 2 === 0;
    if (d < 2.6) return pal(on ? P([0xffb040, 0xffe080, 0xffffff]) : P([0x6a3008, 0xb06010, 0xffa030]), 1 - d / 2.6, x, y);
    return pal(P([0x2a1004, 0x5a2e08, 0x9a6014]), y < 1 || y > 6 ? 0.9 : 0.3, x, y);
  });
  // porcelain: cream glaze, faint blush, hairline crazing
  CT.porcelain = make(64, 64, (x, y, u, v) => {
    const c = ridge(u, v, 6, 3, 591);
    if (c > 0.985) return hex(0x6a5a7a);
    return pal(P([0x8a7a9a, 0xbcaec8, 0xe2d8ea, 0xfaf4ff, 0xffffff]), 0.62 + (fbm(u, v, 3, 3, 592) - 0.5) * 0.4, x, y);
  });
  // the marionette queen's painted face (equirectangular, front at u = 0.25)
  CT.queenFace = make(128, 64, (x, y, u, v) => {
    const lo = wrapd(u - 0.25) * PI * 2, la = (v - 0.5) * PI;
    const base = pal(P([0x9a8aaa, 0xc8bcd6, 0xece4f4, 0xfffaff]), 0.7 - Math.abs(lo) * 0.25 + (fbm(u, v, 4, 3, 601) - 0.5) * 0.25, x, y);
    // marionette mouth slits running down from the corners
    for (const s of [-1, 1]) if (Math.abs(lo - s * 0.2) < 0.022 && la < -0.38 && la > -0.78) return hex(0x1a0a20);
    // painted lips (a little heart)
    const ly = (la + 0.36) / 0.075, lx = lo / 0.2;
    if (lx * lx + ly * ly < 1) return pal(P([0x6a0420, 0xb01040, 0xe8306a, 0xffa0c0]), 0.6 - ly * 0.3 + (Math.abs(lx) < 0.15 && ly > 0.2 ? -0.5 : 0), x, y);
    // rosy cheeks
    for (const s of [-1, 1]) { const d = Math.hypot(lo - s * 0.5, la + 0.14) / 0.15; if (d < 1 && bayer(x, y) > d * 0.8) return hex(d < 0.5 ? 0xff7aa8 : 0xf0a0c8); }
    // big glassy eyes with star pupils, lashes painted above
    for (const s of [-1, 1]) {
      const ex = (lo - s * 0.33) / 0.2, ey = (la - 0.1) / 0.15, d = Math.hypot(ex, ey);
      if (d < 1) {
        const a = Math.atan2(ey, ex);
        if (Math.hypot(ex + 0.3, ey - 0.35) < 0.22) return hex(0xffffff);
        if (d < starR(a + 0.3, 0.62)) return pal(P([0x0a6a6a, 0x30d8c0, 0xc0fff0]), 1 - d, x, y);
        return pal(P([0x02010a, 0x0e0a2a, 0x1e1650]), d, x, y);
      }
      if (ey > 1 && ey < 1.9 && Math.abs(ex) < 1.05 && Math.abs((ex * 6) % 1) < 0.35 && ey < 1.2 + Math.abs(ex) * 0.8) return hex(0x0a0414);
      if (Math.abs(ey - 2.2) < 0.18 && Math.abs(ex) < 0.9) return hex(0x3a2440);       // painted brow
    }
    // one long crack across the brow
    if (Math.abs(la - 0.52 - Math.sin(lo * 9) * 0.03 + lo * 0.4) < 0.012 && lo > -0.6 && lo < 0.35) return hex(0x4a3a5a);
    return base;
  }, { repeat: false });
  // tin (coloured per toy)
  CT.tin = make(32, 32, (x, y, u, v) => pal(P([0x3a3448, 0x625c80, 0x948eb4, 0xc6c2e0, 0xf4f2ff]), 0.55 + (fbm(u * 0.5, v * 4, 4, 3, 611) - 0.5) * 0.5 + (hash(x, y, 612) - 0.5) * 0.1, x, y));
  // candy floss
  const floss = (pals, s) => make(64, 64, (x, y, u, v) => pal(pals, 0.32 + fbm(u, v, 6, 5, s) * 0.7 + (hash(x, y, s + 1) - 0.5) * 0.18 + Math.max(0, fbm(u, v, 3, 2, s + 2) - 0.6) * 0.8, x, y));
  CT.flossPink = floss(P([0x5a1050, 0x8a2878, 0xc0509e, 0xec84c4, 0xffbce2, 0xfff0fa]), 621);
  CT.flossBlue = floss(P([0x1c1a5a, 0x34348e, 0x5a5cc4, 0x8a92ee, 0xc0ccff, 0xf0f4ff]), 625);
  // boardwalk planks, lavender-washed
  CT.planks = make(64, 64, (x, y, u, v) => {
    const row = Math.floor(v * 6), lv = (v * 6) % 1, off = hash(row, 0, 631), lu = (u + off) % 1;
    if (lv < 0.06 || (lu * 2) % 1 < 0.03) return hex(0x0a0618);
    return pal(P([0x1a1434, 0x2a2252, 0x3c3270, 0x52468e, 0x6a5eaa]), 0.5 + (fbm(u * 4, v * 0.6 + row, 6, 3, 632) - 0.5) * 0.6 + (hash(row, 1, 633) - 0.5) * 0.3, x, y);
  });
  CT.rope = make(16, 32, (x, y, u, v) => pal(P([0x3a2a20, 0x7a5a40, 0xb89470, 0xecd4a8]), 0.5 + Math.sin((u * 2 + v * 6) * PI * 2) * 0.35 + (hash(x, y, 641) - 0.5) * 0.2, x, y));
  // crystal facets
  CT.crystal = make(16, 32, (x, y, u, v) => {
    const f = hash(Math.floor(u * 4), 0, 651);
    return pal(P([0x04303a, 0x0a5c66, 0x149c98, 0x3ae0c8, 0xb0fff0, 0xffffff]), v * 0.75 + f * 0.25 + (x % 4 === 0 ? -0.15 : 0), x, y);
  }, { repeat: false });
  // the golden Moon Ticket
  CT.ticket = make(64, 32, (x, y, u, v) => {
    if ((x < 2 || x > 61) && y % 4 < 2) return [0, 0, 0, 0];
    if (x < 4 || x > 59 || y < 2 || y > 29) return hex(0x8a4a08);
    if (x < 6 || x > 57 || y < 4 || y > 27) return hex(0xfff0a0);
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    if (Math.hypot(dx * 1.9, dy) < 0.62 && Math.hypot(dx * 1.9 - 0.32, dy - 0.15) > 0.5) return hex(0x6a0a50);
    if (Math.abs(dx) > 0.55 && Math.abs(dx) < 0.82 && starR(Math.atan2(dy, dx - Math.sign(dx) * 0.68), 0.28) > Math.hypot(dx - Math.sign(dx) * 0.68, dy)) return hex(0x8a1a60);
    return pal(P([0xa06008, 0xe0a020, 0xffd050, 0xfff4b0]), 0.55 + (fbm(u, v, 3, 2, 661) - 0.5) * 0.5 - Math.abs(dy) * 0.2, x, y);
  }, { repeat: false });
  // a circus poster: the moon with a sleeping eye under falling stars
  CT.poster = make(32, 48, (x, y, u, v) => {
    if (x < 2 || x > 29 || y < 2 || y > 45) return pal(goldPal, 0.6 + hash(x, y, 671) * 0.3, x, y);
    const dx = u - 0.5, dy = v - 0.58;
    if (Math.hypot(dx, dy * 0.66) < 0.3 && Math.hypot(dx - 0.12, dy * 0.66 - 0.05) > 0.24) return pal(P([0xc08020, 0xffe070, 0xfff8d0]), 0.5 - dx, x, y);
    if (Math.abs(dx + 0.06) < 0.1 && Math.abs(dy * 0.66 + 0.01 - Math.pow(dx + 0.06, 2) * 4) < 0.012) return hex(0x3a0a3a);
    if (v < 0.24 && v > 0.12 && (x + y) % 3 === 0) return hex(0xff5aa0);
    if (hash(x, y, 672) > 0.95) return hex(0xfff0a0);
    return pal(P([0x10082a, 0x2a0c4a, 0x4a1462]), v * 0.8 + hash(x, y, 673) * 0.2, x, y);
  }, { repeat: false });
  // the circus ring: radial rose/cream sectors, gold bands and a star
  CT.ring = make(128, 128, (x, y, u, v) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (r > 0.97) return pal(goldPal, 0.6, x, y);
    if (Math.abs(r - 0.9) < 0.025 || Math.abs(r - 0.36) < 0.02) return pal(goldPal, 0.85 - Math.abs(r - 0.9) * 10, x, y);
    if (r < starR(a + PI / 2, 0.3, 0.42)) return pal(goldPal, 0.95 - r * 2, x, y);
    if (r < 0.36) return marbleSq(x, y, u, v, 1, 681);
    const k = Math.floor((a / (PI * 2) + 1) * 24) & 1;
    return r > 0.9 ? marbleSq(x, y, u, v, 1, 682) : pal(k ? rose : cream, 0.55 + (fbm(u, v, 6, 3, 683) - 0.5) * 0.35, x, y);
  }, { repeat: false });
  // the glowing heart of the moon gate (scrolls)
  CT.swirl = make(64, 64, (x, y, u, v) => {
    const n = fbm(u, v, 3, 4, 691), s = Math.sin((u + n * 0.6) * PI * 6) * 0.5 + 0.5;
    return pal(P([0x1a0640, 0x4a12a0, 0x9a3ae0, 0xff7ad0, 0x7af0e0, 0xffffff]), s * 0.7 + n * 0.5 - 0.1, x, y);
  });
  // a little prize shelf: jars, plush moons and stars on a dark board
  CT.prizes = make(64, 32, (x, y, u, v) => {
    const cell = Math.floor(u * 6), lx = (u * 6) % 1, row = v < 0.5 ? 0 : 1, ly = (v * 2) % 1;
    if (ly < 0.12) return pal(goldPal, 0.5, x, y);
    const k = hash(cell, row, 701), col = [0xff6aa8, 0x40e0c8, 0xffd050, 0x9a7aff][Math.floor(k * 4)];
    const d = Math.hypot(lx - 0.5, (ly - 0.55) * 1.3);
    if (d < 0.34) return pal(P([(col >> 1) & 0x7f7f7f, col, 0xffffff]), 0.7 - d + (lx < 0.4 && ly > 0.6 ? 0.4 : 0), x, y);
    return pal(P([0x0a0418, 0x1a0c30]), hash(x, y, 702), x, y);
  });
}

// ------------------------------------------------------------------ materials
export function makeFairMaterials() {
  if (CM.dust) return CM;
  bakeFairTextures();
  const B = (map, o = {}) => retroMat({ map, baked: true, ...o });
  const D = THREE.DoubleSide;
  Object.assign(CM, {
    dust: B(CT.dust), rock: B(CT.rock, { fog: 0.7 }), rockFar: B(CT.rock, { fog: 0.35 }), tiles: B(CT.tiles, { emit: 0.06 }),
    stripePink: B(CT.stripePink, { side: D }), stripeTeal: B(CT.stripeTeal, { side: D }), stripeViolet: B(CT.stripeViolet, { side: D }),
    cane: B(CT.cane), gild: B(CT.gild, { emit: 0.12 }), velvet: B(CT.velvet, { side: D }), starCloth: B(CT.starCloth, { side: D, emit: 0.1 }),
    planks: B(CT.planks), rope: B(CT.rope), ring: B(CT.ring, { color: 0xd8ccec }), poster: B(CT.poster, { emit: 0.25 }),
    prizes: B(CT.prizes, { emit: 0.35 }), porcelain: B(CT.porcelain),
    flossPink: B(CT.flossPink, { emit: 0.12, wind: 0.012 }), flossBlue: B(CT.flossBlue, { emit: 0.12, wind: 0.012 }),
    crystal: retroMat({ map: CT.crystal, emit: 0.55, baked: true, fog: 0.5 }),
    bulbs: retroMat({ map: CT.bulbs, emit: 1, scroll: [0.6, 0], fog: 0.35 }),
    bulbsSlow: retroMat({ map: CT.bulbs, emit: 1, scroll: [0.25, 0], fog: 0.35 }),
    swirl: retroMat({ map: CT.swirl, emit: 1, scroll: [0.08, -0.18], side: D, fog: 0.3 }),
    lanternPink: retroMat({ map: CT.paper, color: 0xff7ab8, emit: 1, fog: 0.4 }),
    lanternTeal: retroMat({ map: CT.paper, color: 0x6af0dc, emit: 1, fog: 0.4 }),
    lanternGold: retroMat({ map: CT.paper, color: 0xffc860, emit: 1, fog: 0.4 }),
    dark: retroMat({ color: 0x05020c, fog: 0.8 }),
    balloon: [0xff4a8a, 0x3ad8c8, 0xffc040, 0x9a6aff, 0xff7a5a].map(c => retroMat({ color: c, spec: 0.45, shine: 16, rim: 0.25, emit: 0.18, wind: 0.02 })),
    // lit (not baked) versions for things that move
    mGild: retroMat({ map: CT.gild, chrome: 0.35, env: T.goldEnv, spec: 0.3, emit: 0.12, edge: 0.3 }),
    mPink: retroMat({ map: CT.stripePink, side: D, rim: 0.15, edge: 0.25 }),
    mTeal: retroMat({ map: CT.stripeTeal, side: D, rim: 0.15, edge: 0.25 }),
    mPlanks: retroMat({ map: CT.planks, rim: 0.1, edge: 0.2 }),
    mTiles: retroMat({ map: CT.tiles, rim: 0.05 }),
    mVelvet: retroMat({ map: CT.velvet, side: D }),
    mRope: retroMat({ map: CT.rope }),
    mCane: retroMat({ map: CT.cane, rim: 0.1 }),
    mStar: retroMat({ map: CT.starCloth, side: D, emit: 0.1 }),
    mPorcelain: retroMat({ map: CT.porcelain, spec: 0.3, shine: 14, rim: 0.12, edge: 0.4, emit: 0.06 }),
    mirror: retroMat({ map: CT.porcelain, chrome: 0.85, env: T.blueEnv, emit: 0.2 }),
    horse: [0xfff4fa, 0xd8f4ff, 0xffe4c8].map(c => retroMat({ map: CT.porcelain, color: c, spec: 0.3, shine: 14, rim: 0.15, edge: 0.4, emit: 0.06 })),
  });
  return CM;
}

// ------------------------------------------------------------------ geometry
// a ring of scalloped flaps hanging from radius r (tent valances, awnings)
export function valance(r, n, depth, { y = 0, flare = 0.15 } = {}) {
  const pos = [], uv = [], idx = [];
  const steps = 6;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * PI * 2, a1 = (i + 1) / n * PI * 2, base = pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, a = a0 + (a1 - a0) * t, sag = depth * (0.55 + 0.45 * Math.sin(t * PI)), rr = r + flare * sag;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * rr, y - sag, Math.sin(a) * rr);
      uv.push(t, 1, t, 1 - sag / depth);
    }
    for (let k = 0; k < steps; k++) { const a = base + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return clean(g);
}
// a straight run of scallops along +x (stall awnings)
export function scallops(len, n, depth) {
  const pos = [], uv = [], idx = [], steps = 5;
  for (let i = 0; i < n; i++) {
    const x0 = -len / 2 + i * len / n, base = pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = x0 + t * len / n, sag = depth * (0.5 + 0.5 * Math.sin(t * PI));
      pos.push(x, 0, 0, x, -sag, 0.02); uv.push(t * 0.5 + (i & 1) * 0.5, 1, t * 0.5 + (i & 1) * 0.5, 0);
    }
    for (let k = 0; k < steps; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return clean(g);
}
// a sagging tent roof (lathe), stripes running down from the peak
export function tentRoof(r, h, { sides = 16, sag = 0.12, s = 1 } = {}) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(Math.max(0.02, r * t), h * (1 - t) - Math.sin(t * PI) * h * sag)); }
  const g = new THREE.LatheGeometry(pts.reverse(), sides);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i));
  return clean(g);
}
export function pennant(len = 1.2, w = 0.6) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -w, 0, len, -w / 2, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0.5], 2));
  g.setIndex([0, 1, 2]); g.computeVertexNormals();
  return clean(g);
}
const starShape = (R, r) => { const s = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = PI / 2 + i * PI / 5, rr = i % 2 ? r : R; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } return s; };
export function starSolid(R = 0.5, r = 0.22, d = 0.12) { const g = new THREE.ExtrudeGeometry(starShape(R, r), { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return clean(g); }
export function crescent(R = 1, d = 0.2, cut = 0.8, off = [0.38, 0.18]) {
  const s = new THREE.Shape(); s.absarc(0, 0, R, 0, PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(off[0] * R, off[1] * R, cut * R, 0, PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: d * 0.3, bevelSize: d * 0.25, bevelSegments: 1, curveSegments: 18 });
  g.translate(0, 0, -d / 2); return clean(g);
}
// orient a unit-tall Y geometry between two points
const _u = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
export function between(a, b, scaleXZ = 1) {
  _u.copy(b).sub(a); const len = _u.length();
  _q.setFromUnitVectors(_up, _u.normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), _q, new THREE.Vector3(scaleXZ, len, scaleXZ));
}
const UNIT_CYL = cyl(1, 1, 1, 6, { s: 1 });
const UNIT_CYL8 = cyl(1, 1, 1, 8, { s: 1 });

// ------------------------------------------------------------------ set pieces
// a striped tent: walls, scalloped valance, sagging roof, finial and pennant
export function tent(b, glows, p, r, h, { mat = CM.stripePink, roofH = r * 1.1, sides = 12, door = 0, flag = CM.stripeTeal, s = 0.14 } = {}) {
  b.add(cyl(r, r, h, sides, { s, hseg: 2 }), mat, mat4([p.x, p.y + h / 2, p.z]));
  b.add(tentRoof(r * 1.12, roofH, { sides, s: Math.max(1, Math.round(r * s * PI * 2)) }), mat, mat4([p.x, p.y + h, p.z]));
  b.add(valance(r * 1.12, sides, 0.55, { flare: 0.1 }), CM.gild, mat4([p.x, p.y + h + 0.02, p.z]));
  b.add(sphere(0.25, 6, 5), CM.gild, mat4([p.x, p.y + h + roofH + 0.15, p.z]));
  b.add(cyl(0.05, 0.05, 1.6, 4), M.iron, mat4([p.x, p.y + h + roofH + 0.8, p.z]));
  b.add(pennant(1.3, 0.6), flag, mat4([p.x + 0.05, p.y + h + roofH + 1.55, p.z], [0, door + 0.4, 0]));
  // the doorway: a dark slit with tied-back curtains
  const dx = Math.sin(door), dz = Math.cos(door);
  b.add(box(1.4, 2.2, 0.06), CM.dark, mat4([p.x + dx * (r + 0.01), p.y + 1.1, p.z + dz * (r + 0.01)], [0, door, 0]));
  for (const sd of [-1, 1]) b.add(cyl(0.12, 0.38, 2.4, 6, { s: 1 }), CM.velvet, mat4([p.x + dx * (r + 0.1) + dz * sd * 0.85, p.y + 1.2, p.z + dz * (r + 0.1) - dx * sd * 0.85]));
  glows.add(new THREE.Vector3(p.x, p.y + h + roofH + 0.15, p.z), 0xffc060, 1.4, true);
}

// a midway stall: counter, prize shelves, striped awning with scallops and bulbs
export function stall(b, glows, p, yaw, { mat = CM.stripePink, w = 4.4, light = 0xff7ab8 } = {}) {
  const base = mat4([p.x, p.y, p.z], [0, yaw, 0]);
  const add = (g, m, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => b.add(g, m, new THREE.Matrix4().multiplyMatrices(base, mat4(pos, rot, scl)));
  add(box(w, 1.1, 0.9, { s: 0.6 }), CM.gild, [0, 0.55, 0.9]);
  add(box(w + 0.2, 0.12, 1.1, { s: 1 }), CM.planks, [0, 1.16, 0.9]);
  add(box(w, 3.2, 0.2, { s: 0.4 }), CM.velvet, [0, 1.6, -0.9]);
  add(box(w - 0.4, 1.6, 0.05), CM.prizes, [0, 2.1, -0.76]);
  add(box(w - 0.4, 0.1, 0.4), CM.planks, [0, 1.6, -0.6]); add(box(w - 0.4, 0.1, 0.4), CM.planks, [0, 2.4, -0.6]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cyl(0.08, 0.08, 3.4, 6, { s: 2 }), CM.cane, [sx * (w / 2 - 0.1), 1.7, sz * 0.95 + (sz > 0 ? 0.35 : 0)]);
  // awning: a sloped striped sheet with a scalloped front edge and a run of bulbs
  const aw = box(w + 0.5, 0.06, 2.6, { s: 0.25 });
  add(aw, mat, [0, 3.65, 0.35], [-0.32, 0, 0]);
  add(scallops(w + 0.5, Math.round(w * 1.4), 0.4), mat, [0, 3.25, 1.62]);
  add(box(w + 0.5, 0.14, 0.04), CM.bulbs, [0, 3.29, 1.66]);
  add(box(w * 0.5, 0.7, 0.08), CM.poster, [0, 4.1, -0.8]);
  const lp = new THREE.Vector3(0, 2.9, 0.6).applyMatrix4(base);
  glows.add(lp, light, 2.4, true);
  return lp;
}

// paper lanterns strung on a sagging rope between two points
export function lanternString(b, glows, a, c, { sag = 1.2, n = 7, mats = [CM.lanternPink, CM.lanternTeal, CM.lanternGold], light = false } = {}) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(a.clone().lerp(c, t).add(new THREE.Vector3(0, -Math.sin(t * PI) * sag, 0))); }
  for (let i = 0; i < 12; i++) b.add(UNIT_CYL, CM.rope, between(pts[i], pts[i + 1], 0.025));
  const cols = [0xff6aa8, 0x40e0c8, 0xffc050];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), q = a.clone().lerp(c, t).add(new THREE.Vector3(0, -Math.sin(t * PI) * sag - 0.38, 0)), k = i % mats.length;
    b.add(cyl(0.22, 0.22, 0.42, 8, { s: 2 }), mats[k], mat4([q.x, q.y, q.z], [0, 0, 0], [1, 1, 1]));
    b.add(cyl(0.12, 0.12, 0.06, 6), M.iron, mat4([q.x, q.y + 0.24, q.z]));
    glows.add(q, new THREE.Color(cols[k]).multiplyScalar(0.8), 1.5, true);
    if (light && i === Math.ceil(n / 2)) Bake.lights.push(Lights.add(q, cols[k], 0.9, 7));
  }
}

// a bunch of balloons tied to a point (bob with the wind shader)
export function balloons(b, p, n = 5, r0 = Math.random, { spread = 0.7, height = 2.4, size = 0.45 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = r0() * PI * 2, d = r0() * spread, top = new THREE.Vector3(p.x + Math.cos(a) * d, p.y + height + r0() * 0.8, p.z + Math.sin(a) * d);
    b.add(sphere(size, 8, 6), CM.balloon[Math.floor(r0() * CM.balloon.length)], mat4([top.x, top.y, top.z], [0, 0, 0], [1, 1.2, 1]));
    b.add(UNIT_CYL, CM.rope, between(p, top.clone().setY(top.y - size * 1.1), 0.012));
  }
}

// candy-floss tree: a candy-cane trunk crowned with puffs of floss
export function flossTree(b, p, h = 5, r0 = Math.random) {
  const lean = (r0() - 0.5) * 0.3, rot = r0() * 6, mat = r0() < 0.55 ? CM.flossPink : CM.flossBlue;
  b.add(cyl(0.16, 0.26, h * 0.7, 6, { s: 1 }), CM.cane, mat4([p.x, p.y + h * 0.33, p.z], [lean, rot, 0]));
  const top = new THREE.Vector3(p.x + Math.sin(lean) * Math.sin(rot) * h * 0.6, p.y + h * 0.72, p.z + Math.sin(lean) * Math.cos(rot) * h * 0.6);
  for (let i = 0; i < 4; i++) {
    const a = i * 2.1 + rot, s = h * (0.26 - i * 0.03);
    b.add(sphere(1, 9, 7), mat, mat4([top.x + Math.cos(a) * h * 0.14 * (i ? 1 : 0), top.y + i * h * 0.07, top.z + Math.sin(a) * h * 0.14 * (i ? 1 : 0)], [0, a, 0], [s * 1.15, s * 0.9, s * 1.15]));
  }
}

// ornate gold lamp post with a glowing globe
export function lamp(b, glows, p, color = 0xff8ad0, { h = 3.6, light = true, intensity = 1.4, range = 9 } = {}) {
  b.add(cyl(0.32, 0.42, 0.4, 8, { s: 1 }), CM.gild, mat4([p.x, p.y + 0.2, p.z]));
  b.add(cyl(0.09, 0.13, h - 0.6, 6, { s: 1 }), CM.gild, mat4([p.x, p.y + h / 2, p.z]));
  b.add(cyl(0.28, 0.12, 0.25, 8, { s: 1 }), CM.gild, mat4([p.x, p.y + h - 0.2, p.z]));
  b.add(sphere(0.34, 8, 6), retroMat({ color, emit: 1, fog: 0.4 }), mat4([p.x, p.y + h + 0.18, p.z]));
  b.add(starSolid(0.18, 0.08, 0.05), CM.gild, mat4([p.x, p.y + h + 0.68, p.z]));
  const q = new THREE.Vector3(p.x, p.y + h + 0.18, p.z);
  glows.add(q, new THREE.Color(color).multiplyScalar(0.9), 2.6, true);
  if (light) Bake.lights.push(Lights.add(q, color, intensity, range));
  return q;
}

// a cluster of teal crystal shards
export function crystals(b, glows, p, s = 1, r0 = Math.random, { glow = true } = {}) {
  const n = 3 + Math.floor(r0() * 4);
  for (let i = 0; i < n; i++) {
    const h = s * (0.8 + r0() * 1.8), w = s * (0.18 + r0() * 0.16), a = r0() * PI * 2, tilt = 0.15 + r0() * 0.5;
    const m = mat4([p.x + Math.cos(a) * s * 0.35, p.y + h * 0.4, p.z + Math.sin(a) * s * 0.35], [Math.sin(a) * tilt, a, Math.cos(a) * tilt]);
    b.add(cyl(0, w, h * 0.35, 6, { flat: true }), CM.crystal, new THREE.Matrix4().multiplyMatrices(m, mat4([0, h * 0.5, 0])));
    b.add(cyl(w, w * 0.8, h, 6, { flat: true }), CM.crystal, m);
  }
  if (glow) glows.add(new THREE.Vector3(p.x, p.y + s, p.z), 0x30c8b0, 2.2 * s, true);
}

// the moon gate: a standing ring of moon rock studded with crystals and a swirling heart
export function moonGate(group, glows, p, yaw = 0, r = 2.6) {
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = yaw; group.add(g);
  const b = new Batch();
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const a = i / segs * PI * 2, q = [Math.cos(a) * r, r + 0.4 + Math.sin(a) * r, 0];
    b.add(box(0.9, (r * PI * 2) / segs + 0.25, 0.9, { s: 0.6 }), CM.rock, mat4(q, [0, 0, a]));
    if (i % 2 === 0) b.add(cyl(0, 0.16, 0.9, 5, { flat: true }), CM.crystal, mat4([Math.cos(a) * (r + 0.55), r + 0.4 + Math.sin(a) * (r + 0.55), 0], [0, 0, a - PI / 2]));
  }
  b.add(box(r * 2.8, 0.5, 1.6, { s: 0.6 }), CM.rock, mat4([0, 0.25, 0]));
  b.add(crescent(0.7, 0.18), CM.gild, mat4([0, r * 2 + 1.2, 0]));
  b.build(g, { name: 'moongate' });
  const heart = new THREE.Mesh(clean(new THREE.CircleGeometry(r - 0.25, 24)), CM.swirl);
  heart.position.y = r + 0.4; g.add(heart);
  const back = heart.clone(); back.rotation.y = PI; g.add(back);
  const c = new THREE.Vector3(0, r + 0.4, 0).applyMatrix4(g.matrixWorld.compose(g.position, g.quaternion, g.scale));
  glows.add(c, 0xc070ff, r * 2.6, true);
  return { group: g, heart, center: c };
}

export { UNIT_CYL, UNIT_CYL8 };
