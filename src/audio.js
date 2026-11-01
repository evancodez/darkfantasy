// =============================================================================
// Grimhold - audio.js
// Every sound effect, ambience loop and music track in the game, synthesized at
// runtime with the Web Audio API. No audio files, no libraries.
//
//   import audio from './audio.js';
//   audio.init();                                     // first user gesture (idempotent)
//   audio.play('parry', { volume: 1, pitch: 1, pan: 0 });
//   audio.startLoop('wind', { volume: 1 }); audio.setLoopVolume('wind', 0.5); audio.stopLoop('wind');
//   audio.music('outside');                           // ~2 s crossfade, null = silence
//   audio.setMasterVolume(v); audio.setMusicVolume(v); audio.setSfxVolume(v);
//   audio.duck(0.5, 1);                               // dip the music for a fanfare
//   audio.list();                                     // every one-shot name
//
// Character: late-90s sample-based console audio. Everything passes through an
// ~11 kHz lowpass and a subtle 11-bit stepped WaveShaper, music sits in a big
// procedural hall reverb, SFX are short, dry-ish and punchy.
//
// Signal flow:
//   one-shots / loops -> sfxBus (sfxVol) ------------------------------\
//   one-shots / loops -> send -> sfxSend (sfxVol) -> reverbIn           |
//   music tracks -> musicBus (base * musicVol) -> duckDry --------------+-> pre
//   music tracks -> musicWet (base * musicVol) -> duckWet -> reverbIn    |
//   reverbIn -> HP -> Convolver (2.5 s hall) -> LP -> reverbOut --------/
//   pre -> retro LP -> stepped "bit" shaper -> HP -> compressor -> master
//       -> limiter -> soft clip -> destination
// =============================================================================

const E = 0.0001;            // floor for exponential ramps (never ramp to 0)
const MUSIC_BASE = 0.3;      // music bus level relative to SFX
const XF = 2.0;              // music crossfade (s)
const LOOP_FADE = 0.15;      // loop fade in/out (s)
const MAX_VOICES = 40;       // simultaneous one-shots
const RATE_LIMIT = 0.025;    // identical one-shots closer than this are dropped (s)
const LOOKAHEAD = 0.2;       // music scheduling horizon (s)
const TICK_MS = 25;          // music scheduler period (ms)
const CRUSH_BITS = 11;       // stepped shaper resolution
const RETRO_LP = 11000;      // global lowpass (Hz)

const S = {
  ctx: null,
  masterVol: 1, musicVol: 1, sfxVol: 1,
  n: {},                     // bus nodes
  buf: {},                   // shared generated buffers
  waves: {},                 // shared PeriodicWaves
  curves: new Map(),
  voices: [],                // live one-shot voices (oldest first)
  last: new Map(),           // name -> last play time (rate limit)
  loops: new Map(),          // name -> live loop
  pendingLoops: new Map(),   // name -> volume (requested before init)
  pendingMusic: undefined,
  warned: new Set(),
  duckLevel: 1, duckUntil: 0,
};

// ----------------------------------------------------------------- utilities
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const nyq = () => (S.ctx ? S.ctx.sampleRate * 0.45 : 20000);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);

function warn(key, e) {
  if (S.warned.has(key)) return;
  S.warned.add(key);
  try { console.warn('[audio]', key, e !== undefined ? e : ''); } catch (_) { /* ignore */ }
}

// ------------------------------------------------------- envelope helpers
// All take an AudioParam and an absolute start time. Gains always start at 0
// and end at E (never an exponential ramp to/from 0).
const pk = (x) => Math.max(x, E * 2);
function ad(p, t, a, peak, d) {                    // linear attack, exponential decay
  a = Math.max(a, 0.001); d = Math.max(d, 0.005);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(pk(peak), t + a);
  p.exponentialRampToValueAtTime(E, t + a + d);
  return t + a + d;
}
function ahr(p, t, a, peak, h, r) {                // attack, hold, exponential release
  a = Math.max(a, 0.001); r = Math.max(r, 0.005); h = Math.max(h, 0);
  const P = pk(peak);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(P, t + a);
  p.setValueAtTime(P, t + a + h);
  p.exponentialRampToValueAtTime(E, t + a + h + r);
  return t + a + h + r;
}
function glide(p, t, from, to, dur) {              // exponential frequency glide
  p.setValueAtTime(Math.max(from, 0.001), t);
  p.exponentialRampToValueAtTime(Math.max(to, 0.001), t + Math.max(dur, 0.002));
}
function path(p, t, pts) {                         // [[dt, value], ...] exponential segments
  p.setValueAtTime(Math.max(pts[0][1], 0.001), t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.exponentialRampToValueAtTime(Math.max(pts[i][1], 0.001), t + pts[i][0]);
}
function rampTo(p, v, dur) {                       // smooth change starting now
  if (!S.ctx || !p) return;
  try {
    const t = S.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(v, t + Math.max(dur, 0.005));
  } catch (e) { warn('ramp', e); }
}

// ------------------------------------------------------------ shaper curves
function driveCurve(k) {
  const key = 'd' + k;
  let c = S.curves.get(key);
  if (c) return c;
  const n = 1024, norm = Math.tanh(k);
  c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
  S.curves.set(key, c);
  return c;
}
// Stepped quantizer. Its input is pre-scaled by 0.5 so the usable range is +-2.
// 32768 points / 4096 levels = flat 8-point treads, i.e. real steps.
function crushCurve(bits) {
  const n = 32768, step = 1 / Math.pow(2, bits - 1), c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = ((i / (n - 1)) * 2 - 1) * 2;
    c[i] = Math.round(v / step) * step;
  }
  return c;
}
// Transparent below 0.85, smooth knee up to 0.99: final safety against overs.
function clipCurve() {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    const y = ax < 0.85 ? ax : 0.85 + 0.14 * Math.tanh((ax - 0.85) / 0.14);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// ------------------------------------------------------------- buffers
// White / pink / brown noise, 2 s each, with a crossfaded loop seam.
function makeNoise(c) {
  const sr = c.sampleRate, len = sr * 2, X = Math.floor(sr * 0.04);
  const gen = (fill) => {
    const tmp = new Float32Array(len + X);
    fill(tmp);
    const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = tmp[i];
    for (let i = 0; i < X; i++) { const k = i / X; d[i] = tmp[i] * k + tmp[len + i] * (1 - k); }
    return b;
  };
  return {
    white: gen((a) => { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }),
    pink: gen((a) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < a.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }),
    brown: gen((a) => {
      let l = 0;
      for (let i = 0; i < a.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = l * 3.5; }
    }),
  };
}

// Sparse pops and snaps (fire, sizzle). 3 s, mono.
function makeCrackle(c) {
  const sr = c.sampleRate, len = sr * 3, b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
  let t = 0.01;
  while (t < 2.95) {
    const big = Math.random() < 0.12;
    const n = Math.floor(sr * (big ? rnd(0.003, 0.009) : rnd(0.0004, 0.0022)));
    const amp = big ? rnd(0.5, 1) : rnd(0.06, 0.4), s = Math.floor(t * sr);
    for (let i = 0; i < n && s + i < len; i++) d[s + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (n * 0.3));
    t += -Math.log(1 - Math.random() * 0.999) / 32;
  }
  return b;
}

// Procedural 2.5 s hall: pre-delay, early reflections, then a decaying noise
// tail that darkens over time (stone + air damping).
function makeIR(c, dur = 2.5) {
  const sr = c.sampleRate, len = Math.floor(sr * dur), pre = Math.floor(sr * 0.019);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr, x = (i - pre) / (len - pre);
      const k = 0.8 - 0.68 * Math.sqrt(x);
      lp += k * ((Math.random() * 2 - 1) - lp);
      const fadeIn = Math.min(1, t / 0.01);
      d[i] = lp * Math.sqrt((2 - k) / k) * Math.exp(-t * 2.9) * (1 - x) * fadeIn;
    }
    for (let r = 0; r < 12; r++) {
      const at = pre + Math.floor(sr * rnd(0.004, 0.075));
      if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 1.1) * (1 - r / 14);
    }
    let e = 0;
    for (let i = 0; i < len; i++) e += d[i] * d[i];
    const g = Math.sqrt(1 / Math.max(e, 1e-9));
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return ir;
}

// Night insects: a seamless 6 s stereo loop of four crickets at different
// pitches, chirp groups and positions (generated once, on first use).
function makeCrickets(c) {
  const sr = c.sampleRate, dur = 6, len = Math.floor(sr * dur);
  const b = c.createBuffer(2, len, sr), L = b.getChannelData(0), R = b.getChannelData(1);
  const bugs = [
    { f: 4300, pan: -0.6, per: 0.6, pulses: 3, pr: 32, amp: 0.5 },
    { f: 4850, pan: 0.55, per: 0.857, pulses: 4, pr: 40, amp: 0.36 },
    { f: 5200, pan: 0.1, per: 1.2, pulses: 2, pr: 26, amp: 0.26 },
    { f: 3950, pan: 0.85, per: 2.0, pulses: 6, pr: 46, amp: 0.18 },
  ];
  for (const g of bugs) {
    const groups = Math.round(dur / g.per), per = dur / groups;
    const gl = Math.cos((g.pan + 1) * Math.PI / 4), gr = Math.sin((g.pan + 1) * Math.PI / 4);
    for (let k = 0; k < groups; k++) {
      if (Math.random() < 0.15) continue;
      const t0 = k * per + rnd(0, per * 0.2);
      for (let p = 0; p < g.pulses; p++) {
        const ts = t0 + p / g.pr, n = Math.floor(sr * (0.62 / g.pr)), s = Math.floor(ts * sr);
        const f = g.f * rnd(0.985, 1.015), a = g.amp * (p === 0 ? 0.7 : 1) * rnd(0.8, 1);
        for (let i = 0; i < n; i++) {
          const w = Math.sin(Math.PI * i / n), v = Math.sin(2 * Math.PI * f * i / sr) * w * w * a;
          const j = (s + i) % len;
          L[j] += v * gl; R[j] += v * gr;
        }
      }
    }
  }
  return b;
}

// Additive waves: organ stops and a 25% pulse for retro blips.
function wave(name) {
  if (S.waves[name]) return S.waves[name];
  const n = 33, re = new Float32Array(n), im = new Float32Array(n);
  const H = {
    principal: { 1: 1, 2: 0.6, 3: 0.32, 4: 0.3, 5: 0.08, 6: 0.14, 8: 0.12, 10: 0.04, 12: 0.05, 16: 0.03 },
    flute: { 1: 1, 2: 0.22, 3: 0.08, 4: 0.05 },
    reed: { 1: 0.8, 2: 0.75, 3: 0.65, 4: 0.5, 5: 0.45, 6: 0.36, 7: 0.3, 8: 0.24, 9: 0.18, 10: 0.14, 11: 0.1, 12: 0.08 },
  };
  if (name === 'pulse') {
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * 0.25);
  } else {
    const h = H[name] || H.flute;
    for (const k in h) im[k] = h[k];
  }
  S.waves[name] = S.ctx.createPeriodicWave(re, im);
  return S.waves[name];
}

// ------------------------------------------------------------- voice helper
// A Voice owns every node it creates and disconnects them all when its
// latest-ending source fires onended (no timers needed).
class Voice {
  constructor(t) {
    this.c = S.ctx; this.t = t; this.nodes = []; this.srcs = [];
    this.end = t; this.last = null; this.p = 1; this.out = null; this.dead = false;
  }
  _n(n, to) { this.nodes.push(n); if (to) n.connect(to); return n; }
  gain(v, to) { const n = this.c.createGain(); n.gain.value = v; return this._n(n, to); }
  filter(type, f, Q = 0.707, to) {
    const n = this.c.createBiquadFilter();
    n.type = type; n.frequency.value = clamp(f, 10, nyq()); n.Q.value = Q;
    return this._n(n, to);
  }
  shaper(curve, to) { const n = this.c.createWaveShaper(); n.curve = curve; return this._n(n, to); }
  pan(p, to) {
    if (!this.c.createStereoPanner) return this.gain(1, to);
    const n = this.c.createStereoPanner(); n.pan.value = clamp(p, -1, 1);
    return this._n(n, to);
  }
  delay(time, to, max = 2) { const n = this.c.createDelay(max); n.delayTime.value = time; return this._n(n, to); }
  osc(type, f, t0, t1, to) {
    const n = this.c.createOscillator();
    if (typeof type === 'string') n.type = type; else n.setPeriodicWave(type);
    n.frequency.value = clamp(f, 0.01, nyq());
    n.start(t0);
    return this._src(n, t1, to);
  }
  noise(kind, t0, t1, to, rate = 1) {
    const b = S.buf[kind] || S.buf.white, n = this.c.createBufferSource();
    n.buffer = b; n.loop = true; n.playbackRate.value = rate;
    n.start(t0, Math.random() * b.duration * 0.9);
    return this._src(n, t1, to);
  }
  buffer(b, t0, t1, to, rate = 1) {
    const n = this.c.createBufferSource();
    n.buffer = b; n.loop = true; n.playbackRate.value = rate;
    n.start(t0, Math.random() * b.duration * 0.9);
    return this._src(n, t1, to);
  }
  // A silent source that keeps the voice alive until t1 (echo / delay tails).
  extend(t1) {
    const n = this.c.createConstantSource ? this.c.createConstantSource() : this.c.createOscillator();
    if (n.offset) n.offset.value = 0;
    n.start(this.t);
    return this._src(n, t1, null);
  }
  _src(n, t1, to) {
    if (t1 != null) n.stop(t1);
    this.srcs.push(n);
    if (to) n.connect(to);
    if (t1 != null && t1 >= this.end) { this.end = t1; this.last = n; }
    return n;
  }
  done(onEnd) {
    const clean = () => {
      if (this.dead) return;
      this.dead = true;
      for (const s of this.srcs) { try { s.disconnect(); } catch (_) { /* */ } }
      for (const n of this.nodes) { try { n.disconnect(); } catch (_) { /* */ } }
      if (onEnd) { try { onEnd(); } catch (_) { /* */ } }
    };
    if (this.last) this.last.onended = clean; else clean();
  }
  // Fast fade then stop (voice stealing / loop stop).
  kill(fade = 0.03) {
    const now = this.c.currentTime;
    if (this.out) {
      try {
        this.out.gain.cancelScheduledValues(now);
        this.out.gain.setValueAtTime(this.out.gain.value, now);
        this.out.gain.linearRampToValueAtTime(0, now + fade);
      } catch (_) { /* */ }
    }
    const stopAt = now + fade + 0.02;
    for (const s of this.srcs) { try { s.stop(stopAt); } catch (_) { /* */ } }
    if (this.last && this.end > stopAt) this.end = stopAt;
  }
}

// Smooth random modulation: white noise played at (hz / sampleRate) is
// linearly interpolated into a wandering control signal in [-1, 1].
function wander(v, hz, depth, param, t0, t1) {
  const g = v.gain(depth, param);
  v.noise('white', t0, t1, g, hz / S.ctx.sampleRate);
  return g;
}
// Sine LFO onto a parameter.
function lfo(v, hz, depth, param, t0, t1, type = 'sine') {
  const g = v.gain(depth, param);
  return { osc: v.osc(type, hz, t0, t1, g), g };
}

// =============================================================================
// Synthesis atoms (shared by SFX, loops and music)
// =============================================================================
const PENTA = [0, 2, 4, 7, 9];
function snapScale(m, scale = PENTA, root = 0) {
  const o = Math.floor((Math.round(m) - root) / 12);
  let best = Math.round(m), bd = 99;
  for (const oc of [o - 1, o, o + 1]) {
    for (const s of scale) {
      const cand = root + oc * 12 + s, d = Math.abs(cand - m);
      if (d < bd) { bd = d; best = cand; }
    }
  }
  return best;
}

// Pitched body that drops (kicks, thuds, impacts).
function thump(v, to, t, f0, f1, dur, amp, type = 'sine') {
  const g = v.gain(0, to);
  const o = v.osc(type, f0, t, t + dur + 0.05, g);
  glide(o.frequency, t, f0, f1, dur * 0.6);
  ad(g.gain, t, 0.002, amp, dur);
  return o;
}
// Filtered noise burst; returns the filter so callers can sweep it.
function burst(v, to, t, kind, type, f, Q, a, d, amp, rate = 1) {
  const g = v.gain(0, to), fl = v.filter(type, f, Q, g);
  v.noise(kind, t, t + a + d + 0.05, fl, rate);
  ad(g.gain, t, a, amp, d);
  return fl;
}
// Swept bandpass noise ("whoosh"), swelling to its peak at dur * peakAt.
function whoosh(v, to, t, f0, f1, dur, amp, Q = 1.2, kind = 'pink', peakAt = 0.5) {
  const g = v.gain(0, to), fl = v.filter('bandpass', f0, Q, g);
  v.noise(kind, t, t + dur + 0.05, fl);
  glide(fl.frequency, t, f0, f1, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk(amp), t + dur * peakAt);
  g.gain.exponentialRampToValueAtTime(E, t + dur);
  return fl;
}
// Bank of decaying partials.
function partials(v, to, t, base, ratios, amps, decs, type = 'sine') {
  for (let i = 0; i < ratios.length; i++) {
    const f = base * ratios[i];
    if (f > nyq() * 0.95 || f < 10) continue;
    const g = v.gain(0, to);
    v.osc(type, f, t, t + decs[i] + 0.05, g);
    ad(g.gain, t, 0.001, amps[i], decs[i]);
  }
}
// Struck metal: inharmonic partials + bright tick.
function metal(v, to, t, base, amp, dec, bright = 1) {
  const b = bright;
  partials(v, to, t, base, [1, 2.32, 3.86, 5.12, 6.95, 8.6],
    [amp, amp * 0.7, amp * 0.5 * b, amp * 0.35 * b, amp * 0.22 * b, amp * 0.12 * b],
    [dec, dec * 0.8, dec * 0.6, dec * 0.45, dec * 0.35, dec * 0.25]);
  burst(v, to, t, 'white', 'highpass', 3500, 0.7, 0.001, 0.03, amp * 1.2);
}
// Crystal ping: short FM attack over a sine body.
function ping(v, to, t, f, amp, dec = 0.4) {
  const g = v.gain(0, to);
  const car = v.osc('sine', f, t, t + dec + 0.05, g);
  const mg = v.gain(0, car.frequency);
  v.osc('sine', f * 4, t, t + 0.16, mg);
  mg.gain.setValueAtTime(f * 1.5, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.11);
  ad(g.gain, t, 0.001, amp, dec);
  const g2 = v.gain(0, to);
  v.osc('sine', f * 2, t, t + dec * 0.4 + 0.05, g2);
  ad(g2.gain, t, 0.001, amp * 0.3, dec * 0.35);
}
// Shower of random pentatonic pings over `span` seconds.
function sparkle(v, to, t, n, span, amp, lo = 84, hi = 100) {
  for (let i = 0; i < n; i++) {
    const tt = t + (span * i) / n + rnd(0, (span / n) * 0.6);
    const m = snapScale(rnd(lo, hi));
    ping(v, v.pan(rnd(-0.6, 0.6), to), tt, mtof(m) * v.p, amp * rnd(0.6, 1), rnd(0.2, 0.45));
  }
}
// Sustained shimmering partial pair (slow beating).
function shimmer(v, to, t, f, amp, dur) {
  const g = v.gain(0, to);
  v.osc('sine', f, t, t + dur + 0.05, g);
  v.osc('sine', f * 1.004, t, t + dur + 0.05, g);
  v.osc('sine', f * 2.003, t, t + dur + 0.05, v.gain(0.25, g));
  ahr(g.gain, t, dur * 0.12, amp, dur * 0.2, dur * 0.68);
}
// Feedback echo: returns an input node (dry passes through to `to`).
function echo(v, to, time, fb, wet, until) {
  const inp = v.gain(1, to);
  const d = v.delay(time);
  inp.connect(d);
  const lp = v.filter('lowpass', 2600, 0.7);
  d.connect(lp);
  lp.connect(v.gain(fb, d));
  lp.connect(v.gain(wet, to));
  v.extend(until);
  return inp;
}

// ----------------------------------------------------------- formant voice
const VOW = {
  a: [[730, 1, 8], [1090, 0.5, 10], [2440, 0.2, 14]],
  o: [[500, 1, 8], [860, 0.45, 10], [2600, 0.1, 14]],
  u: [[320, 1, 7], [800, 0.2, 9], [2400, 0.05, 14]],
  e: [[480, 1, 8], [1750, 0.45, 12], [2600, 0.18, 14]],
  i: [[300, 1, 7], [2250, 0.35, 14], [3000, 0.15, 16]],
  m: [[250, 1, 5], [900, 0.05, 8], [2200, 0.01, 10]],
};
function formants(v, vowel, to, shift = 1, level = 1) {
  const inp = v.gain(1);
  const fs = VOW[vowel].map(([f, a, q]) => {
    const fl = v.filter('bandpass', f * shift, q, v.gain(a * 3 * level, to));
    inp.connect(fl);
    return fl;
  });
  return { inp, fs, shift };
}
function sayVowel(bank, vowel, t, dur) {
  VOW[vowel].forEach(([f], i) => bank.fs[i].frequency.setTargetAtTime(f * bank.shift, t, Math.max(dur / 3, 0.005)));
}
// Glottal-ish source: sawtooth with vibrato.
function buzz(v, f, t0, t1, to, vib = 5.5, depth = 0.012) {
  const o = v.osc('sawtooth', f, t0, t1, to);
  lfo(v, vib, f * depth, o.frequency, t0, t1);
  return o;
}

// =============================================================================
// Instruments (MIDI note numbers). Shared by music and jingles.
// =============================================================================
// Harpsichord: 8' saw + 4' pulse, bright filter that closes fast, quill click.
function harpsi(v, to, t, m, vel = 1, len = 0.3) {
  const f = mtof(m), g = v.gain(0, to), lp = v.filter('lowpass', 6000, 0.9, g);
  const L = Math.max(len, 0.12), end = t + L + 0.35;
  v.osc('sawtooth', f, t, end, lp).detune.value = -3;
  v.osc(wave('pulse'), f * 2, t, end, v.gain(0.35, lp)).detune.value = 4;
  path(lp.frequency, t, [[0, Math.min(7500, f * 14)], [0.25, Math.max(f * 3, 900)]]);
  const P = 0.15 * vel;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk(P), t + 0.002);
  g.gain.exponentialRampToValueAtTime(pk(P * 0.35), t + 0.09);
  g.gain.exponentialRampToValueAtTime(pk(P * 0.12), t + L);
  g.gain.exponentialRampToValueAtTime(E, end - 0.03);
  burst(v, to, t, 'white', 'highpass', 5000, 0.8, 0.0005, 0.012, 0.04 * vel);
}
// Celesta / music box: FM tine attack, chorused sine body, short upper partials.
function celesta(v, to, t, m, vel = 1, len = 1.6) {
  const f = mtof(m), dec = clamp(len, 0.6, 3) * (m > 86 ? 0.7 : 1);
  const g = v.gain(0, to);
  const car = v.osc('sine', f, t, t + dec + 0.05, g);
  v.osc('sine', f * 1.0025, t, t + dec + 0.05, v.gain(0.3, g));
  const mg = v.gain(0, car.frequency);
  v.osc('sine', f * 4, t, t + 0.15, mg);
  mg.gain.setValueAtTime(f * 1.2 * vel, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.1);
  ad(g.gain, t, 0.002, 0.12 * vel, dec);
  partials(v, to, t, f, [2, 5.4], [0.03 * vel, 0.02 * vel], [dec * 0.3, 0.07]);
}
// Pizzicato strings: two detuned voices, plucked filter.
function pizz(v, to, t, m, vel = 1) {
  const f = mtof(m), dec = clamp(0.5 - (m - 40) * 0.006, 0.18, 0.55);
  const g = v.gain(0, to), lp = v.filter('lowpass', 2000, 1.6, g);
  v.osc('sawtooth', f, t, t + dec + 0.05, lp).detune.value = -6;
  v.osc('triangle', f, t, t + dec + 0.05, lp).detune.value = 6;
  path(lp.frequency, t, [[0, Math.min(f * 10, 5000)], [0.08, Math.max(f * 1.5, 220)]]);
  ad(g.gain, t, 0.003, 0.3 * vel, dec);
}
// Pipe organ chord: additive stop waves, two ranks, chiff, optional 16' pedal.
function organ(v, to, t, notes, dur, vel = 1, stop = 'principal', pedal = false) {
  const g = v.gain(0, to), lp = v.filter('lowpass', stop === 'reed' ? 3800 : 2700, 0.5, g);
  const lvl = (0.075 * vel) / Math.sqrt(notes.length);
  const end = ahr(g.gain, t, 0.035, lvl, Math.max(dur - 0.035, 0.02), 0.28) + 0.03;
  const w = wave(stop);
  for (const m of notes) {
    const f = mtof(m);
    v.osc(w, f, t, end, lp);
    v.osc(w, f, t, end, lp).detune.value = 4;
    burst(v, to, t, 'white', 'bandpass', Math.min(f * 3, 6000), 2, 0.004, 0.04, 0.02 * vel);
  }
  if (pedal) v.osc('sine', mtof(notes[0] - 12), t, end, v.gain(0.9, lp));
}
// Tubular bell.
function tbell(v, to, t, m, vel = 1, len = 4) {
  const f = mtof(m), a = 0.09 * vel;
  partials(v, to, t, f, [1, 1.003, 2.0, 2.99, 4.17, 5.43, 6.8],
    [a, a * 0.5, a * 0.7, a * 0.5, a * 0.35, a * 0.25, a * 0.15],
    [len, len * 0.9, len * 0.7, len * 0.5, len * 0.35, len * 0.22, len * 0.12]);
  burst(v, to, t, 'white', 'bandpass', Math.min(f * 6, 8000), 1.5, 0.001, 0.03, 0.05 * vel);
}
// Large cast bell: hum, prime, minor tierce, quint, nominal and upper partials.
function bigBell(v, to, t, f, amp, len) {
  const P = [[0.5, 0.6, 1], [1, 0.8, 0.7], [1.2, 0.55, 0.5], [1.5, 0.3, 0.4], [2, 0.5, 0.45],
    [2.51, 0.25, 0.3], [3.0, 0.2, 0.22], [4.07, 0.12, 0.15], [5.4, 0.06, 0.08]];
  for (const [r, a, d] of P) {
    const fr = f * r;
    if (fr > nyq()) continue;
    const g = v.gain(0, to);
    v.osc('sine', fr, t, t + len * d + 0.1, g);
    v.osc('sine', fr * 1.0018, t, t + len * d + 0.1, v.gain(0.5, g));
    ad(g.gain, t, 0.002, amp * a, len * d);
  }
  burst(v, to, t, 'pink', 'bandpass', f * 4, 1.2, 0.001, 0.08, amp * 0.6);
  thump(v, to, t, f * 1.2, f * 0.9, 0.15, amp * 0.5);
}
// Timpani: pitched membrane with an attack bend, overtones and a felt thud.
function timp(v, to, t, m, vel = 1, dec = 1.4) {
  const f = mtof(m), g = v.gain(0, to);
  const o = v.osc('sine', f, t, t + dec + 0.05, g);
  path(o.frequency, t, [[0, f * 1.12], [0.04, f], [dec, f * 0.97]]);
  ad(g.gain, t, 0.002, 0.5 * vel, dec);
  partials(v, to, t, f, [1.5, 1.99, 2.44], [0.12 * vel, 0.08 * vel, 0.04 * vel], [dec * 0.5, dec * 0.4, dec * 0.25]);
  burst(v, to, t, 'brown', 'lowpass', 400, 0.7, 0.001, 0.15, 0.4 * vel);
  burst(v, to, t, 'white', 'bandpass', 1500, 1, 0.001, 0.02, 0.1 * vel);
}
// Low brass: scooped detuned saws, driven, filter swells open.
function brass(v, to, t, notes, len = 0.4, vel = 1, swell = 0.05) {
  const g = v.gain(0, to), lp = v.filter('lowpass', 300, 1.4, g);
  const pre = v.gain(0.4, v.shaper(driveCurve(1.8), lp));
  const end = t + len + 0.25;
  for (const m of notes) {
    const f = mtof(m);
    for (const dt of [-7, 6]) {
      const o = v.osc('sawtooth', f, t, end, pre);
      o.detune.value = dt;
      glide(o.frequency, t, f * 0.96, f, 0.05);
    }
  }
  const top = Math.min(500 + 2800 * vel, 6000);
  path(lp.frequency, t, [[0, 300], [swell + 0.03, top], [len + 0.2, Math.max(top * 0.35, 400)]]);
  const P = (0.2 * vel) / Math.sqrt(notes.length), s1 = t + swell + 0.15;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk(P), t + swell);
  g.gain.exponentialRampToValueAtTime(pk(P * 0.6), s1);
  g.gain.setValueAtTime(pk(P * 0.6), Math.max(t + len, s1));
  g.gain.exponentialRampToValueAtTime(E, Math.max(end - 0.02, s1 + 0.05));
}
// Plucked/bowed bass.
function bass(v, to, t, m, len = 0.4, vel = 1) {
  const f = mtof(m), g = v.gain(0, to), lp = v.filter('lowpass', 600, 1, g);
  const end = t + len + 0.15;
  v.osc('triangle', f, t, end, lp);
  v.osc('sawtooth', f, t, end, v.gain(0.35, lp)).detune.value = 5;
  path(lp.frequency, t, [[0, 1400], [0.1, 380]]);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk(0.32 * vel), t + 0.006);
  g.gain.exponentialRampToValueAtTime(pk(0.18 * vel), t + Math.max(len * 0.5, 0.08));
  g.gain.exponentialRampToValueAtTime(E, end - 0.01);
}
// Light percussion kit.
function perc(v, to, t, kind, vel = 1) {
  switch (kind) {
    case 'kick':
      thump(v, to, t, 130, 42, 0.3, 0.7 * vel);
      burst(v, to, t, 'white', 'lowpass', 2500, 0.7, 0.001, 0.012, 0.15 * vel);
      break;
    case 'rim':
      burst(v, to, t, 'white', 'bandpass', 1900, 4, 0.0005, 0.03, 0.35 * vel);
      thump(v, to, t, 820, 760, 0.03, 0.12 * vel, 'triangle');
      break;
    case 'shaker':
      burst(v, to, t, 'white', 'highpass', 6500, 0.8, 0.012, 0.05, 0.1 * vel);
      break;
    case 'tamb':
      burst(v, to, t, 'white', 'highpass', 7000, 0.9, 0.002, 0.09, 0.12 * vel);
      partials(v, to, t, 5400, [1, 1.33, 1.71], [0.02 * vel, 0.015 * vel, 0.01 * vel], [0.12, 0.1, 0.08]);
      break;
    case 'snare':
      thump(v, to, t, 200, 160, 0.1, 0.3 * vel, 'triangle');
      burst(v, to, t, 'white', 'bandpass', 2600, 0.7, 0.001, 0.16, 0.38 * vel);
      break;
    case 'tom':
      thump(v, to, t, 140, 90, 0.35, 0.55 * vel);
      burst(v, to, t, 'pink', 'bandpass', 600, 1, 0.001, 0.1, 0.2 * vel);
      break;
    case 'taiko':
      thump(v, to, t, 75, 45, 0.6, 0.9 * vel);
      burst(v, to, t, 'brown', 'lowpass', 500, 0.8, 0.002, 0.25, 0.6 * vel);
      burst(v, to, t, 'white', 'bandpass', 1100, 0.9, 0.001, 0.03, 0.18 * vel);
      break;
    case 'crash':
      burst(v, to, t, 'white', 'highpass', 3500, 0.7, 0.002, 1.6, 0.18 * vel);
      partials(v, to, t, 410, [3.1, 4.73, 6.37, 8.91], [0.02, 0.018, 0.014, 0.01].map((a) => a * vel), [1.2, 1, 0.8, 0.6]);
      break;
    default: break;
  }
}
// Choir chord for one-shots (own formant bank). Music tracks use a shared bank.
function choir(v, to, t, notes, dur, opt = {}) {
  const att = opt.att ?? 0.5, rel = opt.rel ?? 1;
  const bank = formants(v, opt.vowel || 'a', to, opt.shift || 1, 1);
  bank.inp.connect(v.filter('lowpass', 800, 0.7, v.gain(0.15, to)));
  const g = v.gain(0, bank.inp);
  const end = ahr(g.gain, t, att, opt.level ?? 0.05, Math.max(dur - att, 0), rel) + 0.05;
  for (const m of notes) {
    const f = mtof(m);
    for (const dt of [-8, 8]) buzz(v, f, t, end, g, rnd(4.5, 5.8), 0.006).detune.value = dt + rnd(-3, 3);
  }
  return bank;
}

// =============================================================================
// One-shot sound effects. Each receives a Voice with:
//   v.t (start time), v.out (output gain node), v.p (pitch multiplier)
// =============================================================================
const semi = (v) => 12 * Math.log2(v.p);           // pitch option as semitones
// Fire crackle snippet from the shared crackle buffer.
function crackle(v, to, t, dur, amp, hp = 1500) {
  const g = v.gain(0, to);
  v.buffer(S.buf.crackle, t, t + dur + 0.05, v.filter('highpass', hp, 0.7, g), rnd(0.9, 1.2));
  ahr(g.gain, t, 0.02, amp, dur * 0.5, dur * 0.5);
}
// Blade swish: narrow white sweep plus a wider pink body.
function swish(v, t, f0, f1, dur, amp) {
  whoosh(v, v.out, t, f0, f1, dur, amp, 2.2, 'white', 0.3);
  whoosh(v, v.out, t, f0 * 0.45, f1 * 0.45, dur * 1.1, amp * 0.6, 0.9, 'pink', 0.35);
}
// Square-wave blip through a soft lowpass (retro UI).
function blip(v, to, t, f, amp, dur, f1) {
  const g = v.gain(0, to), s = v.osc(wave('pulse'), f, t, t + dur + 0.05, v.filter('lowpass', 4500, 0.7, g));
  if (f1) glide(s.frequency, t, f, f1, dur * 0.8);
  ad(g.gain, t, 0.003, amp, dur);
}

const SFX = {
  // ------------------------------------------------------------------- UI
  select(v) {
    const { t, out: o, p } = v;
    blip(v, o, t, 1320 * p, 0.09, 0.05);
    ping(v, o, t, 2640 * p, 0.03, 0.08);
  },
  confirm(v) {
    const { t, out: o } = v, k = semi(v);
    [[0, 83], [0.075, 90]].forEach(([dt, m]) => {
      blip(v, o, t + dt, mtof(m + k), 0.08, 0.15);
      celesta(v, o, t + dt, m + 12 + k, 0.8, 0.6);
    });
  },
  pause(v) {
    const { t, out: o } = v, k = semi(v);
    [[0, 88], [0.09, 81]].forEach(([dt, m]) => celesta(v, o, t + dt, m + k, 0.8, 0.7));
    blip(v, o, t, mtof(76 + k), 0.05, 0.12);
    whoosh(v, o, t, 3000, 700, 0.25, 0.06, 1, 'pink', 0.2);
  },
  unpause(v) {
    const { t, out: o } = v, k = semi(v);
    [[0, 81], [0.09, 88]].forEach(([dt, m]) => celesta(v, o, t + dt, m + k, 0.8, 0.7));
    blip(v, o, t + 0.09, mtof(88 + k), 0.05, 0.1);
    whoosh(v, o, t, 700, 3000, 0.22, 0.06, 1, 'pink', 0.6);
  },

  // --------------------------------------------------------------- player
  step(v) {
    const { t, out: o, p } = v;
    burst(v, o, t, 'pink', 'lowpass', rnd(900, 1600) * p, 0.8, 0.003, rnd(0.035, 0.06), 0.08);
    burst(v, o, t, 'white', 'bandpass', rnd(2500, 4000), 1.5, 0.001, 0.015, 0.022);
    thump(v, o, t, rnd(110, 140) * p, 60, 0.05, 0.07);
  },
  jump(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 500 * p, 1900 * p, 0.2, 0.26, 1.1, 'pink', 0.35);
    const g = v.gain(0, o), s = v.osc('triangle', 260 * p, t, t + 0.16, g);
    glide(s.frequency, t, 260 * p, 620 * p, 0.12);
    ad(g.gain, t, 0.005, 0.08, 0.12);
    burst(v, o, t, 'pink', 'lowpass', 700, 0.7, 0.002, 0.05, 0.12);
  },
  doubleJump(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 700 * p, 2600 * p, 0.14, 0.24, 1.4, 'pink', 0.6);
    whoosh(v, o, t + 0.12, 2400 * p, 900 * p, 0.16, 0.18, 1.4, 'pink', 0.3);
    [91, 95, 98].forEach((m, i) => ping(v, v.pan((i - 1) * 0.3, o), t + 0.05 + i * 0.045, mtof(m) * p, 0.055, 0.35));
  },
  land(v) {
    const { t, out: o, p } = v;
    thump(v, o, t, 150 * p, 55, 0.12, 0.35);
    burst(v, o, t, 'pink', 'lowpass', 900 * p, 0.7, 0.002, 0.08, 0.24);
    burst(v, o, t, 'white', 'bandpass', 3000, 1, 0.001, 0.02, 0.05);
  },
  slash1(v) {
    swish(v, v.t, 900 * v.p, 3800 * v.p, 0.15, 0.42);
  },
  slash2(v) {
    const { t, out: o, p } = v;
    swish(v, t, 3400 * p, 1100 * p, 0.16, 0.42);
    partials(v, o, t + 0.04, 2900 * p, [1, 1.5], [0.015, 0.01], [0.12, 0.09]);
  },
  spin(v) {
    const { t, out: o, p } = v;
    const g = v.gain(0, o), trem = v.gain(0.6, g), bp = v.filter('bandpass', 1600 * p, 1.8, trem);
    v.noise('white', t, t + 0.5, bp);
    glide(bp.frequency, t, 1000 * p, 2600 * p, 0.45);
    lfo(v, 9, 900 * p, bp.frequency, t, t + 0.5);
    lfo(v, 9, 0.4, trem.gain, t, t + 0.5);
    ahr(g.gain, t, 0.08, 0.45, 0.2, 0.18);
    whoosh(v, o, t, 380 * p, 950 * p, 0.45, 0.28, 0.9, 'pink', 0.5);
    partials(v, o, t + 0.3, 2400 * p, [1, 1.51, 2.1], [0.03, 0.02, 0.012], [0.25, 0.2, 0.15]);
  },
  plungeStart(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 300 * p, 2800 * p, 0.4, 0.34, 1.0, 'pink', 0.85);
    whoosh(v, o, t + 0.05, 1200 * p, 6000 * p, 0.35, 0.1, 2, 'white', 0.9);
    const g = v.gain(0, o), s = v.osc('triangle', 200 * p, t, t + 0.42, g);
    glide(s.frequency, t, 200 * p, 760 * p, 0.38);
    ahr(g.gain, t, 0.25, 0.06, 0.05, 0.08);
  },
  plungeLand(v) {
    const { t, out: o, p } = v;
    thump(v, o, t, 120 * p, 38, 0.45, 0.9);
    burst(v, o, t, 'pink', 'lowpass', 1800, 0.7, 0.001, 0.12, 0.55);
    burst(v, o, t, 'white', 'bandpass', 2400, 1, 0.001, 0.04, 0.2);
    const rl = burst(v, o, t + 0.02, 'brown', 'lowpass', 260, 0.8, 0.03, 0.9, 0.7);
    glide(rl.frequency, t + 0.02, 260, 80, 0.9);
    for (let i = 0; i < 5; i++) {
      burst(v, o, t + 0.08 + i * rnd(0.04, 0.09), 'pink', 'bandpass', rnd(900, 2200), 2, 0.001, 0.04, 0.07);
    }
  },
  shieldUp(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 600 * p, 1400 * p, 0.12, 0.14, 1, 'pink', 0.5);
    metal(v, o, t + 0.06, 900 * p, 0.045, 0.25, 0.6);
    thump(v, o, t + 0.06, 220 * p, 140, 0.06, 0.12);
  },
  block(v) {
    const { t, out: o, p } = v;
    metal(v, o, t, 520 * p, 0.15, 0.35, 0.9);
    thump(v, o, t, 200 * p, 110, 0.08, 0.45, 'triangle');
    burst(v, o, t, 'white', 'bandpass', 2600 * p, 1.2, 0.001, 0.06, 0.32);
    burst(v, o, t, 'pink', 'lowpass', 1200, 0.7, 0.001, 0.05, 0.25);
  },
  // The star of the show: transient, rising blade ring, scrape, sparkle tail.
  parry(v) {
    const { t, out: o, p } = v, k = semi(v);
    burst(v, o, t, 'white', 'highpass', 4000, 0.7, 0.0005, 0.04, 0.5);
    thump(v, o, t, 300 * p, 160, 0.05, 0.3, 'triangle');
    const base = 1480 * p, R = [1, 1.5, 2.13, 2.76, 3.53, 4.4];
    const A = [0.09, 0.05, 0.06, 0.04, 0.03, 0.02], D = [1.4, 1.0, 0.9, 0.7, 0.5, 0.35];
    R.forEach((r, i) => {
      const f = base * r;
      if (f > nyq()) return;
      const g = v.gain(0, o), s = v.osc('sine', f, t, t + D[i] + 0.05, g);
      glide(s.frequency, t, f * 0.96, f, 0.05);
      ad(g.gain, t, 0.002, A[i], D[i]);
    });
    whoosh(v, o, t, 2500 * p, 7000 * p, 0.18, 0.17, 3, 'white', 0.15);
    for (let i = 0; i < 7; i++) {
      const m = snapScale(88 + i * 2.3 + k, PENTA, 2);
      ping(v, v.pan((i % 2 ? 1 : -1) * 0.35, o), t + 0.06 + i * 0.055, mtof(m), 0.045 * (1 - i * 0.08), 0.5);
    }
    shimmer(v, o, t + 0.05, base * 2, 0.022, 1.4);
  },
  hurt(v) {
    const { t, out: o, p } = v;
    burst(v, o, t, 'pink', 'lowpass', 2200, 0.8, 0.001, 0.09, 0.45);
    thump(v, o, t, 180 * p, 70, 0.12, 0.45);
    const g = v.gain(0, o), lp = v.filter('lowpass', 2600, 1, g);
    const s = v.osc('square', 640 * p, t, t + 0.28, lp);
    glide(s.frequency, t, 640 * p, 210 * p, 0.2);
    lfo(v, 30, 25 * p, s.frequency, t, t + 0.28);
    ad(g.gain, t, 0.003, 0.1, 0.22);
  },
  die(v) {
    const { t, out: o, p } = v, k = semi(v);
    const g = v.gain(0, o), lp = v.filter('lowpass', 1800, 0.8, g);
    const s = v.osc('square', 520 * p, t, t + 1.3, lp);
    path(s.frequency, t, [[0, 520 * p], [0.15, 560 * p], [1.2, 90 * p]]);
    lfo(v, 7, 18, s.frequency, t, t + 1.3);
    ahr(g.gain, t, 0.01, 0.07, 0.6, 0.6);
    thump(v, o, t, 160 * p, 50, 0.25, 0.5);
    burst(v, o, t, 'pink', 'lowpass', 1500, 0.7, 0.001, 0.15, 0.35);
    thump(v, o, t + 0.9, 110, 45, 0.3, 0.45);
    burst(v, o, t + 0.9, 'pink', 'lowpass', 700, 0.7, 0.002, 0.2, 0.3);
    [76, 72, 69].forEach((m, i) => celesta(v, o, t + 0.25 + i * 0.2, m + k, 0.55, 1.2));
  },
  heal(v) {
    const { t, out: o, p } = v, k = semi(v);
    [72, 76, 79, 84, 88].forEach((m, i) => celesta(v, o, t + i * 0.06, m + k, 0.7, 1.0));
    shimmer(v, o, t, mtof(84) * p, 0.03, 0.9);
    whoosh(v, o, t, 1500, 6000, 0.6, 0.05, 1.5, 'white', 0.4);
  },
  // Pitch snaps to a G-major pentatonic so rising chains (1.0 -> 2.0) always sing.
  mote(v) {
    const { t, out: o } = v;
    const f = mtof(snapScale(91 + semi(v), PENTA, 7));
    ping(v, o, t, f, 0.1, 0.28);
    partials(v, o, t, f, [3.01], [0.018], [0.06]);
    burst(v, o, t, 'white', 'highpass', 8000, 0.7, 0.0005, 0.01, 0.025);
  },
  motesBurst(v) {
    const { t, out: o } = v, k = semi(v), n = 6 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const m = snapScale(89 + i * 1.6 + rnd(-1, 1) + k, PENTA, 7);
      ping(v, v.pan(rnd(-0.5, 0.5), o), t + (0.4 * i) / n + rnd(0, 0.02), mtof(m), 0.065, 0.25);
    }
  },
  heartUp(v) {
    const { t, out: o, p } = v, k = semi(v);
    [72, 79, 84, 88, 91, 96].forEach((m, i) => celesta(v, o, t + i * 0.055, m + k, 0.9, 1.4));
    shimmer(v, o, t + 0.1, mtof(79) * p, 0.03, 1.4);
    shimmer(v, o, t + 0.1, mtof(88) * p, 0.02, 1.4);
    sparkle(v, o, t + 0.25, 8, 0.7, 0.04, 91, 103);
    thump(v, o, t, 220 * p, 110, 0.15, 0.15);
  },
  // Item-get fanfare (~2.5 s): harpsichord run, brass + bells + choir hit.
  sigil(v) {
    const { t, out: o } = v, k = semi(v), T = t + 0.45;
    [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => harpsi(v, o, t + i * 0.06, m + k, 0.7, 0.2));
    brass(v, o, T, [50, 57, 62, 66].map((m) => m + k), 1.1, 0.8, 0.04);
    tbell(v, o, T, 74 + k, 1, 3);
    tbell(v, o, T + 0.3, 81 + k, 0.8, 2.4);
    tbell(v, o, T + 0.6, 86 + k, 0.7, 1.8);
    choir(v, o, T, [62, 66, 69, 74].map((m) => m + k), 1.3, { vowel: 'a', att: 0.25, rel: 0.7, level: 0.05 });
    timp(v, o, T, 38 + k, 0.9, 1.2);
    sparkle(v, o, T + 0.1, 10, 1.2, 0.035, 88, 103);
    celesta(v, o, T + 0.9, 90 + k, 0.8, 1.2);
    celesta(v, o, T + 1.05, 98 + k, 0.7, 1.0);
  },
  checkpoint(v) {
    const { t, out: o, p } = v, k = semi(v);
    whoosh(v, o, t, 250 * p, 1800 * p, 0.55, 0.32, 0.9, 'pink', 0.4);
    burst(v, o, t + 0.05, 'brown', 'lowpass', 500, 0.7, 0.05, 0.5, 0.3);
    crackle(v, o, t + 0.05, 0.5, 0.25);
    [[0.25, 88], [0.4, 95], [0.55, 100]].forEach(([dt, m]) => celesta(v, o, t + dt, m + k, 0.7, 2));
    shimmer(v, o, t + 0.3, mtof(100 + k), 0.015, 1.6);
  },
  bounce(v) {
    const { t, out: o, p } = v;
    const g = v.gain(0, o), s = v.osc('triangle', 160 * p, t, t + 0.55, g);
    path(s.frequency, t, [[0, 140 * p], [0.12, 520 * p], [0.5, 700 * p]]);
    const w = lfo(v, 22, 70 * p, s.frequency, t, t + 0.55);
    w.g.gain.setValueAtTime(70 * p, t);
    w.g.gain.exponentialRampToValueAtTime(5, t + 0.5);
    ad(g.gain, t, 0.005, 0.28, 0.5);
    const g2 = v.gain(0, o), s2 = v.osc('sine', 80 * p, t, t + 0.3, g2);
    glide(s2.frequency, t, 80 * p, 260 * p, 0.15);
    ad(g2.gain, t, 0.003, 0.3, 0.2);
    partials(v, o, t, 1200 * p, [1, 1.41], [0.03, 0.02], [0.3, 0.2]);
    whoosh(v, o, t + 0.03, 600 * p, 3000 * p, 0.3, 0.12, 1.2, 'white', 0.3);
  },
  fallVoid(v) {
    const { t, out: o, p } = v;
    const e = echo(v, o, 0.27, 0.45, 0.6, t + 3.2);
    const g = v.gain(0, e), s = v.osc('sine', 1800 * p, t, t + 1.4, g);
    glide(s.frequency, t, 1800 * p, 180 * p, 1.3);
    lfo(v, 6, 25, s.frequency, t, t + 1.4);
    ahr(g.gain, t, 0.05, 0.16, 0.9, 0.4);
    whoosh(v, e, t, 2400, 300, 1.3, 0.12, 0.9, 'pink', 0.2);
  },

  // ---------------------------------------------------------------- world
  potBreak(v) {
    const { t, out: o, p } = v;
    burst(v, o, t, 'white', 'bandpass', 3200 * p, 0.9, 0.001, 0.08, 0.5);
    burst(v, o, t, 'pink', 'lowpass', 900, 0.7, 0.001, 0.07, 0.25);
    thump(v, o, t, 260 * p, 130, 0.06, 0.3, 'triangle');
    for (let i = 0; i < 4; i++) {
      partials(v, o, t + i * 0.012, rnd(1800, 3200) * p, [1, 1.62, 2.41], [0.05, 0.03, 0.02], [0.12, 0.09, 0.06]);
    }
    for (let i = 0; i < 6; i++) {
      const tt = t + 0.06 + rnd(0, 0.35);
      ping(v, v.pan(rnd(-0.6, 0.6), o), tt, rnd(3000, 5500) * p, 0.022, 0.08);
      burst(v, o, tt, 'white', 'highpass', 5000, 0.7, 0.0005, 0.01, 0.04);
    }
  },
  crateBreak(v) {
    const { t, out: o, p } = v;
    thump(v, o, t, 180 * p, 80, 0.12, 0.5, 'triangle');
    const wood = v.filter('bandpass', 420 * p, 6, v.gain(1.2, o));
    burst(v, wood, t, 'white', 'lowpass', 3000, 0.7, 0.001, 0.08, 0.6);
    burst(v, o, t, 'pink', 'bandpass', 1100 * p, 1.2, 0.001, 0.12, 0.45);
    for (let i = 0; i < 7; i++) {
      burst(v, o, t + 0.02 + rnd(0, 0.28), 'white', 'bandpass', rnd(700, 2400) * p, 3, 0.0005, rnd(0.01, 0.03), rnd(0.08, 0.2));
    }
    thump(v, o, t + rnd(0.15, 0.25), 140 * p, 90, 0.08, 0.15);
  },
  'switch'(v) {
    const { t, out: o, p } = v, T = t + 0.16;
    for (let i = 0; i < 3; i++) burst(v, o, t + i * 0.045, 'white', 'bandpass', 2400 * p, 4, 0.0005, 0.015, 0.12);
    thump(v, o, T, 110 * p, 55, 0.25, 0.75);
    burst(v, o, T, 'pink', 'lowpass', 1400, 0.7, 0.001, 0.1, 0.45);
    metal(v, o, T, 310 * p, 0.06, 0.4, 0.5);
  },
  doorOpen(v) {
    const { t, out: o, p } = v, D = 1.5;
    const g = v.gain(0, o), rough = v.gain(0.6, g), bp = v.filter('bandpass', 320 * p, 1.4, rough);
    v.noise('brown', t, t + D + 0.1, bp);
    v.noise('pink', t, t + D + 0.1, v.filter('bandpass', 1100 * p, 4, v.gain(0.4, rough)));
    wander(v, 30, 0.45, rough.gain, t, t + D + 0.1);
    wander(v, 4, 120, bp.frequency, t, t + D + 0.1);
    ahr(g.gain, t, 0.15, 0.75, D - 0.45, 0.3);
    burst(v, o, t, 'brown', 'lowpass', 120, 0.7, 0.3, D, 0.5);
    thump(v, o, t + D - 0.05, 90 * p, 45, 0.3, 0.6);
    burst(v, o, t + D - 0.05, 'pink', 'lowpass', 600, 0.7, 0.002, 0.15, 0.3);
  },
  gateOpen(v) {
    const { t, out: o, p } = v, k = semi(v), D = 4;
    const g = v.gain(0, o), rough = v.gain(0.6, g), lp = v.filter('lowpass', 180 * p, 0.9, rough);
    v.noise('brown', t, t + D, lp);
    v.noise('pink', t, t + D, v.filter('bandpass', 500 * p, 2, v.gain(0.25, rough)));
    wander(v, 18, 0.4, rough.gain, t, t + D);
    ahr(g.gain, t, 0.4, 0.75, D - 1.4, 0.95);
    thump(v, o, t, 70, 35, 0.6, 0.6);
    for (let i = 0; i < 6; i++) {
      metal(v, v.pan(rnd(-0.5, 0.5), o), t + 0.3 + i * rnd(0.3, 0.45), rnd(380, 520) * p, 0.022, 0.2, 0.5);
    }
    const bank = choir(v, o, t + 0.3, [50, 57, 62, 66, 69].map((m) => m + k), 3.0, { vowel: 'o', att: 2.4, rel: 1.2, level: 0.06 });
    sayVowel(bank, 'a', t + 1.2, 1.5);
    bigBell(v, o, t + 2.8, mtof(50 + k), 0.11, 3);
    shimmer(v, o, t + 2.8, mtof(86 + k), 0.015, 1.2);
    thump(v, o, t + D - 0.4, 80, 40, 0.4, 0.6);
  },
  crumble(v) {
    const { t, out: o, p } = v, N = 14;
    burst(v, o, t, 'pink', 'lowpass', 2500, 0.8, 0.002, 0.15, 0.35);
    burst(v, o, t, 'brown', 'lowpass', 300, 0.7, 0.05, 1.0, 0.45);
    for (let i = 0; i < N; i++) {
      const tt = t + Math.pow(i / N, 1.4) * 1.1 + rnd(0, 0.05), big = i < 3 || Math.random() < 0.25;
      burst(v, v.pan(rnd(-0.5, 0.5), o), tt, 'white', 'bandpass', rnd(1200, 3200) * p, 1.5, 0.0005, rnd(0.02, 0.05), big ? 0.3 : 0.12);
      if (big) thump(v, o, tt, rnd(90, 150) * p, 50, 0.15, 0.35);
    }
  },
  bell(v) {
    bigBell(v, v.out, v.t, 98 * v.p, 0.14, 7);
  },
  secret(v) {
    const { t, out: o } = v, k = semi(v);
    [76, 80, 83, 87, 88, 92].forEach((m, i) => {
      celesta(v, o, t + i * 0.075, m + k, 0.85, i === 5 ? 1.6 : 0.8);
      harpsi(v, o, t + i * 0.075, m - 12 + k, 0.45, 0.1);
    });
    shimmer(v, o, t + 0.38, mtof(95 + k), 0.015, 1.0);
  },
  chest(v) {
    const { t, out: o, p } = v, k = semi(v);
    const g = v.gain(0, o), bp = v.filter('bandpass', 900 * p, 4, g);
    const s = v.osc('sawtooth', 55 * p, t, t + 0.6, bp);
    path(s.frequency, t, [[0, 45 * p], [0.4, 85 * p], [0.55, 60 * p]]);
    wander(v, 20, 15, s.frequency, t, t + 0.6);
    ahr(g.gain, t, 0.05, 0.25, 0.35, 0.15);
    thump(v, o, t + 0.55, 160 * p, 80, 0.12, 0.4);
    burst(v, o, t + 0.55, 'pink', 'lowpass', 1200, 0.7, 0.001, 0.08, 0.25);
    [79, 83, 86, 91, 95].forEach((m, i) => celesta(v, o, t + 0.62 + i * 0.06, m + k, 0.8, 1.4));
    sparkle(v, o, t + 0.7, 9, 0.8, 0.035, 91, 103);
    shimmer(v, o, t + 0.65, mtof(91 + k), 0.02, 1.4);
  },

  // -------------------------------------------------------------- enemies
  enemyHit(v) {
    const { t, out: o, p } = v;
    burst(v, o, t, 'white', 'bandpass', 1300 * p, 1.1, 0.0005, 0.05, 0.6);
    burst(v, o, t, 'pink', 'lowpass', 2500, 0.7, 0.001, 0.09, 0.45);
    thump(v, v.shaper(driveCurve(2.5), v.gain(0.8, o)), t, 210 * p, 75, 0.12, 0.7);
  },
  enemyPop(v) {
    const { t, out: o, p } = v, k = semi(v);
    const g = v.gain(0, o), lp = v.filter('lowpass', 400, 0.8, g);
    v.noise('pink', t, t + 0.35, lp);
    glide(lp.frequency, t, 300, 2500, 0.08);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    ad(g.gain, t, 0.03, 0.35, 0.28);
    thump(v, o, t, 180 * p, 90, 0.1, 0.2);
    [88, 95].forEach((m, i) => celesta(v, o, t + 0.06 + i * 0.07, m + k, 0.8, 0.9));
    sparkle(v, o, t + 0.1, 5, 0.3, 0.03, 93, 103);
  },
  scarecrowGroan(v) {
    const { t, out: o, p } = v, D = 1.1;
    const bank = formants(v, 'o', v.shaper(driveCurve(1.5), v.gain(0.7, o)), 0.9, 1);
    const g = v.gain(0, bank.inp);
    const s = buzz(v, 95 * p, t, t + D + 0.1, g, 4.5, 0.03);
    path(s.frequency, t, [[0, 85 * p], [0.4, 100 * p], [D, 70 * p]]);
    wander(v, 25, 6, s.frequency, t, t + D + 0.1);
    sayVowel(bank, 'u', t + 0.5, 0.5);
    ahr(g.gain, t, 0.15, 0.3, D - 0.45, 0.3);
    const nb = v.gain(0, o);
    v.noise('pink', t, t + D + 0.1, v.filter('bandpass', 900, 0.8, nb));
    ahr(nb.gain, t, 0.2, 0.06, D - 0.5, 0.3);
  },
  scarecrowLunge(v) {
    const { t, out: o, p } = v;
    for (let i = 0; i < 4; i++) burst(v, o, t + i * 0.04, 'white', 'highpass', 2500, 0.7, 0.002, 0.05, 0.12);
    whoosh(v, o, t, 400 * p, 1600 * p, 0.3, 0.3, 1, 'pink', 0.4);
    const bank = formants(v, 'a', o, 0.9);
    const g = v.gain(0, bank.inp), s = buzz(v, 120 * p, t, t + 0.4, g, 6, 0.02);
    glide(s.frequency, t, 140 * p, 90 * p, 0.35);
    wander(v, 30, 10, s.frequency, t, t + 0.4);
    ahr(g.gain, t, 0.03, 0.25, 0.15, 0.15);
  },
  cultistChant(v) {
    const { t, out: o, p } = v, D = 1.0, f = 110 * p;
    const lp = v.filter('lowpass', 4000, 0.7, o);
    lp.frequency.setValueAtTime(4000, t + 0.55);
    lp.frequency.exponentialRampToValueAtTime(350, t + 0.8);
    const bank = formants(v, 'o', lp, 1, 1);
    const g = v.gain(0, bank.inp);
    buzz(v, f, t, t + D + 0.1, g, 5, 0.008);
    buzz(v, f * 1.498, t, t + D + 0.1, v.gain(0.4, g), 4.6, 0.008);
    buzz(v, f * 0.5, t, t + D + 0.1, v.gain(0.5, g), 4.2, 0.006);
    sayVowel(bank, 'u', t + 0.35, 0.3);
    ahr(g.gain, t, 0.12, 0.22, D - 0.4, 0.3);
  },
  orbCast(v) {
    const { t, out: o, p } = v;
    const trem = v.gain(0.7, o), g = v.gain(0, trem);
    const car = v.osc('sine', 300 * p, t, t + 0.6, g);
    glide(car.frequency, t, 300 * p, 900 * p, 0.45);
    const mod = v.osc('sine', 600 * p, t, t + 0.6, v.gain(300 * p, car.frequency));
    glide(mod.frequency, t, 600 * p, 1800 * p, 0.45);
    lfo(v, 14, 0.3, trem.gain, t, t + 0.6);
    ahr(g.gain, t, 0.3, 0.15, 0.1, 0.15);
    whoosh(v, o, t, 800 * p, 4000 * p, 0.5, 0.07, 2, 'white', 0.8);
    ping(v, o, t + 0.45, 2400 * p, 0.04, 0.3);
  },
  orbReflect(v) {
    const { t, out: o, p } = v;
    metal(v, o, t, 1100 * p, 0.06, 0.4, 1);
    const g = v.gain(0, o), s = v.osc('triangle', 600 * p, t, t + 0.4, g);
    glide(s.frequency, t, 600 * p, 2400 * p, 0.25);
    ad(g.gain, t, 0.002, 0.15, 0.35);
    whoosh(v, o, t, 1000 * p, 5000 * p, 0.3, 0.12, 1.5, 'white', 0.2);
    ping(v, o, t + 0.05, mtof(96) * p, 0.06, 0.6);
  },
  orbHit(v) {
    const { t, out: o, p } = v;
    burst(v, o, t, 'white', 'bandpass', 1800 * p, 0.8, 0.001, 0.15, 0.4);
    const g = v.gain(0, o), car = v.osc('sine', 900 * p, t, t + 0.35, g);
    glide(car.frequency, t, 900 * p, 120 * p, 0.3);
    v.osc('square', 230 * p, t, t + 0.35, v.gain(500 * p, car.frequency));
    ad(g.gain, t, 0.002, 0.2, 0.3);
    thump(v, o, t, 140 * p, 50, 0.2, 0.45);
  },
  skullChatter(v) {
    const { t, out: o, p } = v, n = 10 + ((Math.random() * 5) | 0);
    let tt = t;
    for (let i = 0; i < n; i++) {
      tt += rnd(0.022, 0.04);
      burst(v, o, tt, 'white', 'bandpass', rnd(1800, 2800) * p, 6, 0.0003, 0.012, rnd(0.15, 0.3));
      partials(v, o, tt, rnd(850, 1000) * p, [1, 2.7], [0.04, 0.02], [0.025, 0.015]);
    }
  },
  skullLeap(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 700 * p, 2200 * p, 0.18, 0.2, 1.2, 'pink', 0.4);
    burst(v, o, t, 'white', 'bandpass', 2400 * p, 5, 0.0003, 0.015, 0.3);
    burst(v, o, t + 0.03, 'white', 'bandpass', 2000 * p, 5, 0.0003, 0.015, 0.25);
    const g = v.gain(0, o), s = v.osc('square', 300 * p, t, t + 0.15, v.filter('lowpass', 1800, 0.7, g));
    glide(s.frequency, t, 300 * p, 700 * p, 0.12);
    ad(g.gain, t, 0.003, 0.05, 0.12);
  },
  batScreech(v) {
    const { t, out: o, p } = v;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.09 + rnd(0, 0.02);
      const g = v.gain(0, o), s = v.osc('sawtooth', 3200 * p, tt, tt + 0.09, v.filter('bandpass', 3800 * p, 2, g));
      path(s.frequency, tt, [[0, 2600 * p], [0.03, 4200 * p], [0.08, 3000 * p]]);
      lfo(v, 70, 300 * p, s.frequency, tt, tt + 0.09);
      ad(g.gain, tt, 0.005, 0.12 * (1 - i * 0.15), 0.07);
    }
    burst(v, o, t, 'white', 'highpass', 5000, 0.7, 0.01, 0.2, 0.04);
  },
  knightClang(v) {
    const { t, out: o, p } = v;
    metal(v, o, t, 430 * p, 0.16, 0.5, 1);
    metal(v, o, t, 610 * p, 0.07, 0.3, 0.8);
    thump(v, o, t, 170 * p, 90, 0.1, 0.5, 'triangle');
    burst(v, o, t, 'white', 'bandpass', 3000 * p, 1, 0.001, 0.07, 0.35);
    crackle(v, o, t + 0.01, 0.25, 0.4, 4000);
    sparkle(v, o, t + 0.02, 4, 0.18, 0.02, 96, 106);
  },
  knightSwing(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 280 * p, 950 * p, 0.38, 0.5, 0.9, 'pink', 0.55);
    whoosh(v, o, t + 0.05, 900 * p, 2400 * p, 0.3, 0.15, 2, 'white', 0.5);
    thump(v, o, t, 90 * p, 60, 0.2, 0.15);
  },
  witchCackle(v) {
    const { t, out: o, p } = v, n = 7 + ((Math.random() * 3) | 0);
    const bank = formants(v, 'a', v.shaper(driveCurve(1.4), v.gain(0.8, o)), 1.25, 1);
    const g = v.gain(0, bank.inp);
    const end = t + n * 0.105 + 0.2;
    const s = v.osc('sawtooth', 600 * p, t, end, g);
    lfo(v, 7, 12, s.frequency, t, end);
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) {
      const ts = t + i * 0.105 + rnd(0, 0.006);
      const f0 = (620 - i * 25 + rnd(-20, 20)) * p * (i === 0 ? 1.15 : 1);
      s.frequency.setValueAtTime(f0, ts);
      s.frequency.exponentialRampToValueAtTime(f0 * 0.85, ts + 0.08);
      g.gain.setValueAtTime(0, ts);
      g.gain.linearRampToValueAtTime(0.28, ts + 0.012);
      g.gain.exponentialRampToValueAtTime(0.05, ts + 0.06);
      g.gain.exponentialRampToValueAtTime(E, ts + 0.09);
      sayVowel(bank, i % 2 ? 'e' : 'a', ts, 0.02);
      burst(v, bank.inp, Math.max(t, ts - 0.01), 'white', 'highpass', 1500, 0.7, 0.008, 0.03, 0.15);
    }
    const sg = v.gain(0, o), sq = v.osc('sine', 1100 * p, t, t + 0.25, sg);
    glide(sq.frequency, t, 1100 * p, 1800 * p, 0.2);
    ad(sg.gain, t, 0.01, 0.035, 0.2);
  },
  potionThrow(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 600 * p, 1800 * p, 0.25, 0.25, 1.2, 'pink', 0.4);
    burst(v, o, t, 'white', 'bandpass', 2500, 2, 0.002, 0.04, 0.1);
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.03 + i * 0.05, g = v.gain(0, o), s = v.osc('sine', 600 * p, tt, tt + 0.07, g);
      glide(s.frequency, tt, rnd(400, 700) * p, rnd(1000, 1600) * p, 0.04);
      ad(g.gain, tt, 0.003, 0.06, 0.05);
    }
  },
  potionSmash(v) {
    const { t, out: o, p } = v;
    burst(v, o, t, 'white', 'highpass', 3000, 0.7, 0.0005, 0.12, 0.45);
    thump(v, o, t, 300 * p, 150, 0.05, 0.2, 'triangle');
    for (let i = 0; i < 8; i++) {
      partials(v, v.pan(rnd(-0.6, 0.6), o), t + rnd(0, 0.12), rnd(2500, 5200) * p, [1, 1.47, 2.09], [0.04, 0.025, 0.015], [0.15, 0.1, 0.07]);
    }
    const g = v.gain(0, o), bp = v.filter('bandpass', 4000, 0.8, g);
    v.buffer(S.buf.crackle, t + 0.05, t + 1.0, bp, 1.6);
    v.noise('white', t + 0.05, t + 1.0, v.gain(0.05, bp));
    ahr(g.gain, t + 0.05, 0.05, 0.4, 0.3, 0.5);
    for (let i = 0; i < 6; i++) {
      const tt = t + 0.1 + rnd(0, 0.6), bg = v.gain(0, o), s = v.osc('sine', 800, tt, tt + 0.06, bg);
      glide(s.frequency, tt, rnd(500, 900) * p, rnd(1100, 1700) * p, 0.04);
      ad(bg.gain, tt, 0.003, 0.04, 0.045);
    }
  },
  witchFall(v) {
    const { t, out: o, p } = v, D = 1.3;
    const bank = formants(v, 'a', o, 1.2, 1);
    const g = v.gain(0, bank.inp), s = buzz(v, 650 * p, t, t + D, g, 6.5, 0.025);
    glide(s.frequency, t, 700 * p, 160 * p, D - 0.1);
    sayVowel(bank, 'o', t + 0.5, 0.5);
    ahr(g.gain, t, 0.04, 0.25, D - 0.5, 0.4);
    whoosh(v, o, t, 2000, 400, D, 0.18, 1, 'pink', 0.3);
    thump(v, o, t + D, 130 * p, 50, 0.25, 0.6);
    burst(v, o, t + D, 'pink', 'lowpass', 1200, 0.7, 0.001, 0.15, 0.4);
    burst(v, o, t + D + 0.08, 'white', 'bandpass', 1600, 4, 0.0005, 0.03, 0.2);
    burst(v, o, t + D + 0.17, 'white', 'bandpass', 1300, 4, 0.0005, 0.03, 0.15);
  },

  // --------------------------------------------------------------- dragon
  dragonRoar(v) {
    const { t, out: o, p } = v, D = 2.0;
    const bank = roarCore(v, o, t, D, 75 * p, [[0, 0.8], [0.15, 1.25], [0.5, 1.1], [1, 0.7]], 0.4, { vowel: 'a', shift: 0.75 });
    sayVowel(bank, 'o', t + 1.0, 0.8);
    const g2 = v.gain(0, v.filter('bandpass', 1400 * p, 1.2, o));
    const s = v.osc('sawtooth', 220 * p, t, t + D, g2);
    path(s.frequency, t, [[0, 180 * p], [0.3, 320 * p], [1.2, 260 * p], [D, 140 * p]]);
    wander(v, 30, 25 * p, s.frequency, t, t + D);
    ahr(g2.gain, t, 0.2, 0.22, 0.9, 0.7);
    const g3 = v.gain(0, o), sub = v.osc('sine', 48 * p, t, t + D, g3);
    wander(v, 12, 6, sub.frequency, t, t + D);
    ahr(g3.gain, t, 0.1, 0.5, 1.2, 0.6);
    const g4 = v.gain(0, o), bp = v.filter('bandpass', 700 * p, 0.8, g4);
    v.noise('pink', t, t + D, bp);
    glide(bp.frequency, t, 500 * p, 1300 * p, 0.4);
    bp.frequency.exponentialRampToValueAtTime(400 * p, t + D);
    ahr(g4.gain, t, 0.1, 0.35, 1.2, 0.6);
  },
  dragonHurt(v) {
    const { t, out: o, p } = v, D = 0.9;
    const bank = roarCore(v, o, t, D, 260 * p, [[0, 1], [0.12, 2.1], [0.5, 1.6], [1, 0.9]], 0.33, { vowel: 'e', shift: 1, att: 0.04, rel: 0.35 });
    sayVowel(bank, 'a', t + 0.3, 0.3);
    burst(v, o, t, 'white', 'bandpass', 2500 * p, 1, 0.01, 0.4, 0.2);
    thump(v, o, t, 100 * p, 50, 0.2, 0.3);
  },
  dragonStep(v) {
    const { t, out: o, p } = v;
    thump(v, o, t, 70 * p, 28, 0.55, 1.0);
    burst(v, o, t, 'brown', 'lowpass', 220, 0.8, 0.005, 0.7, 0.8);
    burst(v, o, t, 'pink', 'lowpass', 1200, 0.7, 0.001, 0.08, 0.35);
    for (let i = 0; i < 4; i++) burst(v, o, t + 0.05 + rnd(0, 0.3), 'pink', 'bandpass', rnd(800, 2000), 2, 0.001, 0.03, 0.06);
  },
  wingFlap(v) {
    const { t, out: o, p } = v;
    const g = v.gain(0, o), lp = v.filter('lowpass', 250 * p, 0.9, g);
    v.noise('pink', t, t + 0.5, lp);
    glide(lp.frequency, t, 200 * p, 600 * p, 0.12);
    lp.frequency.exponentialRampToValueAtTime(150 * p, t + 0.45);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.1);
    g.gain.exponentialRampToValueAtTime(E, t + 0.45);
    thump(v, o, t + 0.08, 65 * p, 40, 0.25, 0.4);
    whoosh(v, o, t, 400 * p, 1000 * p, 0.3, 0.08, 1, 'white', 0.4);
  },
  fireball(v) {
    const { t, out: o, p } = v;
    whoosh(v, o, t, 300 * p, 2200 * p, 0.5, 0.45, 0.8, 'pink', 0.25);
    burst(v, o, t, 'brown', 'lowpass', 400 * p, 0.8, 0.02, 0.5, 0.6);
    crackle(v, o, t, 0.5, 0.35);
    thump(v, o, t, 110 * p, 50, 0.25, 0.35);
  },
  fireballHit(v) {
    const { t, out: o, p } = v;
    const drive = v.shaper(driveCurve(2), v.gain(0.9, o));
    thump(v, drive, t, 95 * p, 30, 0.6, 0.9);
    const lp = burst(v, drive, t, 'pink', 'lowpass', 3000 * p, 0.7, 0.002, 1.0, 0.8);
    glide(lp.frequency, t, 3000 * p, 200, 0.9);
    burst(v, o, t, 'brown', 'lowpass', 200, 0.7, 0.01, 1.2, 0.6);
    burst(v, o, t, 'white', 'bandpass', 1800, 0.8, 0.001, 0.05, 0.3);
    crackle(v, o, t + 0.05, 0.9, 0.4, 1200);
  },
  // Long roar sinking into an explosion, then a shimmering bell cascade (~6 s).
  dragonDie(v) {
    const { t, out: o, p } = v, k = semi(v), D = 3.0, T = t + 2.5;
    const bank = roarCore(v, o, t, D, 85 * p, [[0, 1], [0.1, 1.4], [0.5, 1.0], [1, 0.45]], 0.42, { vowel: 'a', shift: 0.75, att: 0.1, rel: 1.4 });
    sayVowel(bank, 'o', t + 1.2, 1);
    sayVowel(bank, 'u', t + 2.2, 0.8);
    const g2 = v.gain(0, v.filter('bandpass', 1300, 1.2, o)), s = v.osc('sawtooth', 300 * p, t, t + D, g2);
    path(s.frequency, t, [[0, 300 * p], [0.4, 520 * p], [D, 120 * p]]);
    wander(v, 30, 30, s.frequency, t, t + D);
    ahr(g2.gain, t, 0.2, 0.2, 1.4, 1.2);
    const drive = v.shaper(driveCurve(2), v.gain(0.9, o));
    thump(v, drive, T, 90, 28, 0.9, 0.9);
    const lp = burst(v, drive, T, 'pink', 'lowpass', 3500, 0.7, 0.002, 1.4, 0.8);
    glide(lp.frequency, T, 3500, 180, 1.3);
    burst(v, o, T, 'brown', 'lowpass', 180, 0.7, 0.01, 1.8, 0.7);
    crackle(v, o, T + 0.05, 1.5, 0.4, 1200);
    [98, 93, 90, 86, 81, 78, 74].forEach((m, i) => celesta(v, o, T + 0.5 + i * 0.12, m + k, 0.7, 2));
    tbell(v, o, T + 0.5, 74 + k, 0.7, 3.5);
    shimmer(v, o, T + 0.5, mtof(86 + k), 0.02, 3);
    sparkle(v, o, T + 0.6, 14, 2.0, 0.03, 88, 103);
  },
  // Orchestral sting (~2 s): D minor hit, flat-two hit, timpani roll, tutti.
  bossIntro(v) {
    const { t, out: o } = v, k = semi(v), T2 = t + 0.42, T3 = t + 0.84;
    const K = (arr) => arr.map((m) => m + k);
    brass(v, o, t, K([38, 45, 50, 53]), 0.3, 1, 0.02);
    organ(v, o, t, K([50, 53, 57, 62]), 0.3, 0.8, 'reed', true);
    timp(v, o, t, 38 + k, 1, 1.0);
    perc(v, o, t, 'taiko', 0.8);
    brass(v, o, T2, K([39, 46, 51, 55]), 0.25, 1, 0.02);
    timp(v, o, T2, 39 + k, 0.9, 0.8);
    for (let i = 0; i < 6; i++) timp(v, o, T2 + 0.14 + i * 0.045, 33 + k, 0.25 + i * 0.08, 0.3);
    brass(v, o, T3, K([26, 38, 45, 50, 53]), 0.9, 1, 0.08);
    choir(v, o, T3, K([50, 53, 57, 62]), 0.9, { vowel: 'a', att: 0.05, rel: 0.6, level: 0.07 });
    organ(v, o, T3, K([38, 50, 53, 57, 62]), 0.9, 0.8, 'principal', true);
    perc(v, o, T3, 'crash', 1);
    perc(v, o, T3, 'taiko', 1);
    timp(v, o, T3, 38 + k, 1, 1.4);
  },

  // -------------------------------------------------------------- jingles
  // ~4 s: triplet pickup, then Bb - Gb - Ab - Bb (top line D - Db - Eb - F).
  victory(v) {
    const { t, out: o } = v, k = semi(v), K = (arr) => arr.map((m) => m + k);
    [0, 0.11, 0.22].forEach((dt) => {
      brass(v, o, t + dt, K([53, 65]), 0.07, 0.8, 0.015);
      harpsi(v, o, t + dt, 77 + k, 0.5, 0.08);
    });
    const C = [[0.33, [46, 58, 62, 65, 74], 0.45], [0.9, [42, 54, 58, 61, 73], 0.28], [1.25, [44, 56, 60, 63, 75], 0.28]];
    for (const [dt, ch, len] of C) {
      brass(v, o, t + dt, K(ch), len, 0.95, 0.03);
      timp(v, o, t + dt, ch[0] + 12 + k, 0.7, 0.6);
      ch.slice(1).forEach((m, i) => harpsi(v, o, t + dt + i * 0.03, m + 12 + k, 0.4, 0.2));
    }
    for (let i = 0; i < 5; i++) timp(v, o, t + 1.42 + i * 0.035, 46 + k, 0.3 + i * 0.1, 0.25);
    const F = t + 1.6;
    brass(v, o, F, K([34, 46, 58, 62, 65, 70, 77]), 1.4, 1, 0.05);
    choir(v, o, F, K([58, 62, 65, 70]), 1.6, { vowel: 'a', att: 0.15, rel: 0.7, level: 0.05 });
    tbell(v, o, F, 82 + k, 0.8, 2.4);
    tbell(v, o, F + 0.25, 77 + k, 0.6, 2.2);
    perc(v, o, F, 'crash', 0.9);
    timp(v, o, F, 46 + k, 1, 1.5);
    [82, 86, 89, 94, 98].forEach((m, i) => celesta(v, o, F + 0.15 + i * 0.07, m + k, 0.6, 1.4));
    sparkle(v, o, F + 0.5, 8, 1.5, 0.025, 89, 103);
  },
  // ~2.5 s: falling music-box line over soft flute-organ chords, low bell.
  death(v) {
    const { t, out: o } = v, k = semi(v), K = (arr) => arr.map((m) => m + k);
    [[0, 76], [0.3, 74], [0.6, 72], [0.9, 71], [1.3, 69]].forEach(([dt, m], i) => celesta(v, o, t + dt, m + k, 0.75, i === 4 ? 2.2 : 1.2));
    organ(v, o, t, K([57, 60, 64]), 0.55, 0.45, 'flute');
    organ(v, o, t + 0.6, K([53, 57, 60]), 0.3, 0.45, 'flute');
    organ(v, o, t + 0.9, K([52, 56, 59]), 0.4, 0.45, 'flute');
    organ(v, o, t + 1.3, K([45, 52, 57, 60]), 0.9, 0.5, 'flute');
    tbell(v, o, t + 1.3, 45 + k, 0.6, 2.2);
  },
};

// Roar engine: rough, detuned saw stack with pitch contour through a driven
// formant bank, plus breath noise. shape = [[fraction of D, pitch mult], ...]
function roarCore(v, to, t, D, f0, shape, level, opt = {}) {
  const att = opt.att || 0.12, rel = opt.rel || 0.5, end = t + D + 0.1;
  const drive = v.shaper(driveCurve(3), v.gain(0.5, to));
  const bank = formants(v, opt.vowel || 'a', drive, opt.shift || 0.8, 1);
  const rough = v.gain(0.7, bank.inp), g = v.gain(0, rough);
  wander(v, 35, 0.3, rough.gain, t, end);
  for (const [mul, det, amp] of [[1, 0, 1], [1, 18, 0.7], [0.5, -10, 0.6], [2.01, 0, 0.25]]) {
    const o = v.osc('sawtooth', f0 * mul, t, end, v.gain(amp, g));
    o.detune.value = det;
    path(o.frequency, t, shape.map(([x, m]) => [x * D, f0 * mul * m]));
    wander(v, 40, f0 * mul * 0.08, o.frequency, t, end);
  }
  v.noise('pink', t, end, v.gain(0.5, g));
  ahr(g.gain, t, att, level, Math.max(D - att - rel, 0), rel);
  return bank;
}

// Reverb send per sound (0..1).
const SEND = {
  select: 0.05, confirm: 0.15, pause: 0.2, unpause: 0.2, step: 0, jump: 0.04, doubleJump: 0.15,
  land: 0.03, slash1: 0.05, slash2: 0.05, spin: 0.1, plungeStart: 0.08, plungeLand: 0.12,
  shieldUp: 0.06, block: 0.12, parry: 0.5, hurt: 0.08, die: 0.3, heal: 0.35, mote: 0.25,
  motesBurst: 0.3, heartUp: 0.4, sigil: 0.45, checkpoint: 0.45, bounce: 0.12, fallVoid: 0.4,
  potBreak: 0.1, crateBreak: 0.08, switch: 0.15, doorOpen: 0.2, gateOpen: 0.45, crumble: 0.2,
  bell: 0.6, secret: 0.35, chest: 0.3, enemyHit: 0.06, enemyPop: 0.25, scarecrowGroan: 0.25,
  scarecrowLunge: 0.12, cultistChant: 0.45, orbCast: 0.3, orbReflect: 0.3, orbHit: 0.2,
  skullChatter: 0.12, skullLeap: 0.08, batScreech: 0.2, knightClang: 0.18, knightSwing: 0.06,
  witchCackle: 0.3, potionThrow: 0.1, potionSmash: 0.18, witchFall: 0.25, dragonRoar: 0.35,
  dragonHurt: 0.3, dragonStep: 0.15, wingFlap: 0.1, fireball: 0.15, fireballHit: 0.25,
  dragonDie: 0.5, bossIntro: 0.4, victory: 0.45, death: 0.45,
};
// Output trim per sound (calibrated by rendering every sound offline and
// matching short-term loudness: combat hits on top, music below them,
// footsteps / motes / UI ticks well underneath).
const LEVEL = {
  select: 12, confirm: 1.1, step: 9, jump: 5, doubleJump: 3, land: 2.7, slash1: 8, slash2: 5,
  spin: 2.2, plungeStart: 2.3, plungeLand: 2, shieldUp: 2.8, block: 8, parry: 5.5, hurt: 10,
  mote: 3, motesBurst: 2.5, checkpoint: 1.2, bounce: 2, potBreak: 8, crateBreak: 3.5,
  switch: 0.85, doorOpen: 0.75, gateOpen: 0.85, crumble: 1.2, enemyHit: 5, enemyPop: 1.4,
  scarecrowGroan: 1.25, scarecrowLunge: 1.9, cultistChant: 0.7, orbReflect: 4, orbHit: 3.4,
  skullChatter: 6, skullLeap: 8, batScreech: 6, knightClang: 5.5, knightSwing: 3.4,
  potionThrow: 4, potionSmash: 6, witchFall: 0.8, dragonHurt: 0.8, dragonStep: 1.4,
  fireball: 2.2, fireballHit: 1.4, dragonDie: 0.7, bossIntro: 0.65, dragonRoar: 0.85, victory: 0.85,
};
// Dropped first when the voice cap is reached.
const LOW = new Set(['step', 'mote', 'select', 'skullChatter', 'wingFlap', 'land', 'potionThrow']);
// Musical sounds: no random pitch jitter (keeps them in tune / chains in key).
const NO_JITTER = new Set(['mote', 'motesBurst', 'sigil', 'secret', 'victory', 'death', 'bossIntro',
  'confirm', 'pause', 'unpause', 'heal', 'heartUp', 'checkpoint', 'chest', 'bell', 'parry',
  'enemyPop', 'gateOpen', 'dragonDie', 'doubleJump']);

function resume() {
  try {
    if (S.ctx && S.ctx.state === 'suspended' && S.ctx.resume) {
      const r = S.ctx.resume();
      if (r && r.catch) r.catch(() => {});
    }
  } catch (_) { /* ignore */ }
}

function play(name, opts) {
  try {
    const fn = Object.prototype.hasOwnProperty.call(SFX, name) ? SFX[name] : null;
    if (!fn) { warn('unknown sound "' + name + '"'); return; }
    const c = S.ctx;
    if (!c) return;                                   // before init(): silent no-op
    resume();
    const o = opts || {}, now = c.currentTime;
    const prev = S.last.get(name);
    if (prev !== undefined && now >= prev && now - prev < RATE_LIMIT) return;
    // Voice cap: forget voices that should be long finished, then steal or drop.
    for (let i = S.voices.length - 1; i >= 0; i--) if (S.voices[i].v.end < now - 1) S.voices.splice(i, 1);
    if (S.voices.length >= MAX_VOICES) {
      if (LOW.has(name)) return;
      const vi = Math.max(0, S.voices.findIndex((x) => LOW.has(x.name)));
      const victim = S.voices.splice(vi, 1)[0];
      if (victim) victim.v.kill(0.03);
    }
    S.last.set(name, now);
    const v = new Voice(now + 0.005);
    const pitch = clamp(num(o.pitch, 1), 0.25, 4);
    v.p = NO_JITTER.has(name) ? pitch : pitch * rnd(0.97, 1.03);
    v.out = v.gain(clamp(num(o.volume, 1), 0, 2) * (LEVEL[name] || 1));
    let tail = v.out;
    const pan = clamp(num(o.pan, 0), -1, 1);
    if (pan) { tail = v.pan(pan); v.out.connect(tail); }
    tail.connect(S.n.sfxBus);
    if (SEND[name]) tail.connect(v.gain(SEND[name], S.n.sfxSend));
    try { fn(v); } catch (e) {
      warn('play:' + name, e);
      try { v.kill(0.01); v.done(); } catch (_) { /* */ }
      return;
    }
    const rec = { name, v };
    S.voices.push(rec);
    v.done(() => { const i = S.voices.indexOf(rec); if (i >= 0) S.voices.splice(i, 1); });
  } catch (e) {
    warn('play:' + name, e);
  }
}

// =============================================================================
// Loops (ambiences and continuous effects)
// =============================================================================
const LOOPS = {
  fireBreath: {
    level: 0.65, verb: 0.15,
    build(v, out) {
      const t = v.t, am = v.gain(0.7, out), lp = v.filter('lowpass', 1500, 0.6, am);
      v.noise('pink', t, null, lp);
      v.noise('brown', t, null, v.filter('lowpass', 250, 0.8, v.gain(1.3, am)));
      v.noise('white', t, null, v.filter('bandpass', 2800, 0.6, v.gain(0.1, am)));
      wander(v, 18, 0.3, am.gain, t, null);             // flame flicker
      wander(v, 3, 600, lp.frequency, t, null);         // roiling tone
      const cg = v.gain(0.4, out);
      v.buffer(S.buf.crackle, t, null, v.filter('highpass', 1800, 0.7, cg), 1.3);
      const sg = v.gain(0.22, out), s = v.osc('sawtooth', 50, t, null, v.filter('lowpass', 170, 0.7, sg));
      wander(v, 6, 10, s.frequency, t, null);           // low roar body
    },
  },
  wind: {
    level: 0.55, verb: 0,
    build(v, out) {
      const t = v.t;
      for (const side of [-0.7, 0.7]) {
        const pan = v.pan(side, out);
        const g = v.gain(0.35, pan), bp = v.filter('bandpass', 480, 0.9, g);
        v.noise('pink', t, null, bp);
        wander(v, 0.25, 260, bp.frequency, t, null);
        wander(v, 0.18, 0.22, g.gain, t, null);          // gusts
        const wg = v.gain(0.03, pan), wbp = v.filter('bandpass', 1200, 12, wg);
        v.noise('white', t, null, wbp);                   // thin whistle
        wander(v, 0.12, 350, wbp.frequency, t, null);
        wander(v, 0.2, 0.028, wg.gain, t, null);
      }
      v.noise('brown', t, null, v.filter('lowpass', 150, 0.7, v.gain(0.25, out)));
    },
  },
  crickets: {
    level: 0.18, verb: 0.2,
    build(v, out) {
      const t = v.t;
      if (!S.buf.crickets) S.buf.crickets = makeCrickets(S.ctx);
      const g = v.gain(1, out);
      v.buffer(S.buf.crickets, t, null, v.filter('highpass', 2000, 0.7, g), 1);
      wander(v, 0.1, 0.25, g.gain, t, null);
      v.buffer(S.buf.crickets, t, null, v.filter('lowpass', 4000, 0.7, v.gain(0.4, out)), 0.93);
    },
  },
  brazier: {
    level: 0.42, verb: 0.15,
    build(v, out) {
      const t = v.t, bed = v.gain(0.35, out), lp = v.filter('lowpass', 500, 0.7, bed);
      v.noise('pink', t, null, lp);
      wander(v, 4, 0.15, bed.gain, t, null);
      wander(v, 2, 150, lp.frequency, t, null);
      v.buffer(S.buf.crackle, t, null, v.filter('bandpass', 2500, 0.6, v.gain(0.6, out)), 1);
      v.buffer(S.buf.crackle, t, null, v.filter('highpass', 900, 0.7, v.gain(0.35, out)), 0.71);
      v.noise('brown', t, null, v.filter('lowpass', 120, 0.7, v.gain(0.3, out)));
    },
  },
  chant: {
    level: 0.85, verb: 0.5,
    build(v, out) {
      const t = v.t, bank = formants(v, 'o', out, 0.95, 1);
      bank.inp.connect(v.filter('lowpass', 600, 0.7, v.gain(0.2, out)));
      wander(v, 0.07, 120, bank.fs[0].frequency, t, null);   // slow vowel drift
      wander(v, 0.05, 250, bank.fs[1].frequency, t, null);
      const phrase = v.gain(0.7, bank.inp);
      lfo(v, 0.11, 0.2, phrase.gain, t, null);               // long breathing swell
      const syl = v.gain(0.8, phrase);
      lfo(v, 0.45, 0.2, syl.gain, t, null);                  // chanted syllables
      const g = v.gain(0.06, syl);
      for (const [m, det] of [[38, -10], [38, 7], [38, 15], [45, -6], [45, 9], [50, -4], [50, 12], [26, 0]]) {
        buzz(v, mtof(m), t, null, g, rnd(4, 5.5), 0.007).detune.value = det;
      }
    },
  },
};

function startLoop(name, opts) {
  try {
    const def = Object.prototype.hasOwnProperty.call(LOOPS, name) ? LOOPS[name] : null;
    if (!def) { warn('unknown loop "' + name + '"'); return; }
    const vol = clamp(num(opts && opts.volume, 1), 0, 1);
    if (!S.ctx) { if (!S.pendingLoops.has(name)) S.pendingLoops.set(name, vol); return; }
    const L = S.loops.get(name);
    if (L) {                                          // already running: no-op (revive if fading out)
      if (L.stopping) {
        clearTimeout(L.timer);
        L.stopping = false; L.timer = null; L.vol = vol;
        rampTo(L.fade.gain, def.level * vol, LOOP_FADE);
      }
      return;
    }
    resume();
    const v = new Voice(S.ctx.currentTime + 0.01);
    const fade = v.gain(0, S.n.sfxBus);
    v.out = fade;
    if (def.verb) fade.connect(v.gain(def.verb, S.n.sfxSend));
    try { def.build(v, fade); } catch (e) {
      warn('loop:' + name, e);
      try { v.kill(0.01); v.done(); } catch (_) { /* */ }
      return;
    }
    fade.gain.setValueAtTime(0, v.t);
    fade.gain.linearRampToValueAtTime(def.level * vol, v.t + LOOP_FADE);
    S.loops.set(name, { v, fade, vol, def, stopping: false, timer: null });
  } catch (e) {
    warn('loop:' + name, e);
  }
}

function stopLoop(name) {
  try {
    S.pendingLoops.delete(name);
    const L = S.loops.get(name);
    if (!L || L.stopping || !S.ctx) return;
    L.stopping = true;
    rampTo(L.fade.gain, 0, LOOP_FADE);
    L.timer = setTimeout(() => {
      if (S.loops.get(name) !== L || !L.stopping) return;
      S.loops.delete(name);
      const at = S.ctx.currentTime + 0.02;
      for (const s of L.v.srcs) { try { s.stop(at); } catch (_) { /* */ } }
      L.v.last = L.v.srcs[0] || null;
      L.v.done();
    }, (LOOP_FADE + 0.08) * 1000);
  } catch (e) {
    warn('stopLoop:' + name, e);
  }
}

function setLoopVolume(name, vol) {
  try {
    const x = clamp(num(vol, 1), 0, 1);
    if (S.pendingLoops.has(name)) { S.pendingLoops.set(name, x); return; }
    const L = S.loops.get(name);
    if (!L || L.stopping) return;
    L.vol = x;
    rampTo(L.fade.gain, L.def.level * x, 0.12);
  } catch (e) {
    warn('setLoopVolume:' + name, e);
  }
}

// =============================================================================
// Music engine
// Tracks are composed: chord charts + note strings parsed into per-step events.
//   note string: "A4 - C5 . E5!"  one token per grid step; '-' holds the
//   previous note, '.' is a rest, '!' accents, '|' is ignored (bar marker).
// Each track owns dry/wet inputs (crossfaded as a unit) and lazily-created
// instrument buses; every note is a short-lived Voice on one of those buses.
// =============================================================================
const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const accOf = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
function noteNum(tok) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(tok);
  return m ? 12 * (Number(m[3]) + 1) + PCN[m[1]] + accOf(m[2]) : null;
}
function parseSeq(str, mul = 1) {
  const toks = str.replace(/\|/g, ' ').trim().split(/\s+/);
  const out = new Array(toks.length * mul).fill(null);
  let last = null;
  toks.forEach((tk, i) => {
    if (tk === '-') { if (last) last.len += mul; return; }
    if (tk === '.') { last = null; return; }
    const acc = tk.endsWith('!');
    const m = noteNum(acc ? tk.slice(0, -1) : tk);
    if (m == null) { warn('bad note "' + tk + '"'); last = null; return; }
    last = { m, len: mul, acc };
    out[i * mul] = last;
  });
  return out;
}

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus4: [0, 5, 7],
  sus2: [0, 2, 7], m6: [0, 3, 7, 9], 6: [0, 4, 7, 9], add9: [0, 2, 4, 7],
};
const chordCache = new Map();
function chord(sym) {
  let c = chordCache.get(sym);
  if (c) return c;
  const [main, sl] = String(sym).split('/');
  const mm = /^([A-G])([#b]?)(.*)$/.exec(main);
  const root = mm ? (PCN[mm[1]] + accOf(mm[2]) + 12) % 12 : 0;
  const iv = (mm && QUAL[mm[3]]) || QUAL[''];
  let bass = root;
  const bm = sl ? /^([A-G])([#b]?)$/.exec(sl) : null;
  if (bm) bass = (PCN[bm[1]] + accOf(bm[2]) + 12) % 12;
  c = { root, iv, pcs: iv.map((x) => (root + x) % 12), bass };
  chordCache.set(sym, c);
  return c;
}
const pcOf = (m) => ((m % 12) + 12) % 12;
// n chord tones ascending from the first one >= lo.
function voicing(sym, lo, n) {
  const c = chord(sym), out = [];
  for (let m = lo; out.length < n && m < lo + 60; m++) if (c.pcs.includes(pcOf(m))) out.push(m);
  return out;
}
function bassOf(sym, lo) { const c = chord(sym); for (let m = lo; m < lo + 12; m++) if (pcOf(m) === c.bass) return m; return lo; }
function rootOf(sym, lo) { const c = chord(sym); for (let m = lo; m < lo + 12; m++) if (pcOf(m) === c.root) return m; return lo; }

// ------------------------------------------------------- track-owned nodes
function tnode(tr, n) { tr.nodes.push(n); return n; }
function tgain(tr, v, to) { const g = tnode(tr, S.ctx.createGain()); g.gain.value = v; if (to) g.connect(to); return g; }
function tfilter(tr, type, f, Q, to) {
  const n = tnode(tr, S.ctx.createBiquadFilter());
  n.type = type; n.frequency.value = f; n.Q.value = Q;
  if (to) n.connect(to);
  return n;
}
// Instrument buses: [dry level, reverb send].
const MIX = {
  harpsi: [0.75, 0.3], celesta: [0.9, 0.55], pizz: [0.9, 0.3], organ: [0.8, 0.6], tbell: [0.7, 0.9],
  bigbell: [0.6, 1.0], timp: [0.85, 0.4], brass: [0.75, 0.45], bass: [0.9, 0.1], perc: [0.7, 0.18],
  choir: [1, 0.7],
};
function tbus(tr, key) {
  let b = tr.buses[key];
  if (!b) {
    const [lvl, wet] = MIX[key] || [1, 0.3];
    b = tgain(tr, lvl, tr.dry);
    if (wet) b.connect(tgain(tr, wet, tr.wet));
    tr.buses[key] = b;
  }
  return b;
}
// Shared formant "choir" bank for a track; sing() feeds its input.
function makeChoir(tr, vowel, shift = 1) {
  const inp = tgain(tr, 1), sum = tbus(tr, 'choir');
  const fs = VOW[vowel].map(([f, a, q]) => {
    const fl = tfilter(tr, 'bandpass', f * shift, q, tgain(tr, a * 3, sum));
    inp.connect(fl);
    return fl;
  });
  inp.connect(tfilter(tr, 'lowpass', 700, 0.7, tgain(tr, 0.15, sum)));
  tr.choir = { inp, fs, shift };
  return tr.choir;
}
function morph(tr, vowel, t, dur) {
  const ch = tr.choir;
  if (!ch) return;
  VOW[vowel].forEach(([f], i) => ch.fs[i].frequency.setTargetAtTime(f * ch.shift, t, Math.max(dur / 3, 0.01)));
}

const INST = {
  harpsi, celesta, pizz, tbell, timp, bass, perc, organ, brass,
  bigbell: (v, to, t, m, vel = 1, len = 6) => bigBell(v, to, t, mtof(m), 0.12 * vel, len),
};
// One instrument event as its own short-lived Voice on the track bus.
function N(tr, inst, t, ...args) {
  const v = new Voice(t);
  try { INST[inst](v, tbus(tr, inst), t, ...args); } catch (e) { warn('note:' + inst, e); }
  v.done();
}
// Choir notes into the shared formant bank.
function sing(tr, t, notes, dur, opt = {}) {
  if (!tr.choir) makeChoir(tr, 'a');
  const v = new Voice(t), att = opt.att ?? 0.8, rel = opt.rel ?? 1.5;
  try {
    const g = v.gain(0, tr.choir.inp);
    const end = ahr(g.gain, t, att, opt.level ?? 0.03, Math.max(dur - att, 0), rel) + 0.05;
    for (const m of notes) {
      const f = mtof(m);
      for (const dt of [-9, 9]) buzz(v, f, t, end, g, rnd(4.4, 5.6), 0.005).detune.value = dt + rnd(-3, 3);
    }
  } catch (e) { warn('sing', e); }
  v.done();
}
// Event of a parsed sequence at loop step s.
function ev(tr, key, s) { const q = tr.def._seqs[key]; return q ? q[s] || null : null; }

// ------------------------------------------------------- scheduler & fades
const M = { tracks: [], cur: null, timer: null };

function prepare(def) {
  if (def._seqs) return;
  def._seqs = {};
  for (const k in def.seqs || {}) {
    const spec = def.seqs[k], [str, mul = 1, intro = false] = Array.isArray(spec) ? spec : [spec];
    const q = parseSeq(str, mul), want = (intro ? def.intro : def.bars) * def.bpb;
    if (q.length !== want) warn('seq length ' + def.name + '.' + k + ': ' + q.length + ' != ' + want);
    def._seqs[k] = q;
  }
  if (def.chords && def.chords.length !== def.bars) warn('chord chart length ' + def.name);
}

function makeTrack(name) {
  const def = TRACKS[name], t = S.ctx.currentTime;
  prepare(def);
  const tr = {
    name, def, nodes: [], srcs: [], buses: {}, st: {}, choir: null,
    i: 0, next: t + 0.12, sd: 60 / def.bpm / def.spb, stopAt: Infinity, dying: false,
  };
  tr.fade = tgain(tr, 0, S.n.musicBus);
  tr.wetFade = tgain(tr, 0, S.n.musicWet);
  tr.dry = tgain(tr, def.gain || 1, tr.fade);
  tr.wet = tgain(tr, def.gain || 1, tr.wetFade);
  if (def.setup) def.setup(tr);
  rampTo(tr.fade.gain, 1, XF);
  rampTo(tr.wetFade.gain, 1, XF);
  return tr;
}

function disposeTrack(tr) {
  for (const s of tr.srcs) { try { s.stop(); } catch (_) { /* */ } try { s.disconnect(); } catch (_) { /* */ } }
  for (const n of tr.nodes) { try { n.disconnect(); } catch (_) { /* */ } }
  M.tracks = M.tracks.filter((x) => x !== tr);
  if (!M.tracks.length) stopScheduler();
}

function killTrack(tr) {
  if (tr.dying) return;
  tr.dying = true;
  tr.stopAt = S.ctx.currentTime + XF;
  rampTo(tr.fade.gain, 0, XF);
  rampTo(tr.wetFade.gain, 0, XF);
  setTimeout(() => { try { disposeTrack(tr); } catch (e) { warn('dispose', e); } }, (XF + 0.5) * 1000);
}

// Loop position of global step i (handles a one-time intro).
function pos(tr, i) {
  const d = tr.def, bpb = d.bpb, intro = (d.intro || 0) * bpb, loop = d.bars * bpb;
  if (i < intro) return { intro: true, s: i, bar: Math.floor(i / bpb), b: i % bpb, pass: -1 };
  const j = i - intro, s = j % loop;
  return { intro: false, s, bar: Math.floor(s / bpb), b: s % bpb, pass: Math.floor(j / loop) };
}

function tick() {
  try {
    if (!S.ctx || !M.tracks.length) { stopScheduler(); return; }
    const now = S.ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const horizon = now + (hidden ? 1.2 : LOOKAHEAD);   // background tabs throttle timers
    for (const tr of M.tracks) {
      if (tr.next < now - 0.25) {                       // fell behind: skip ahead on the grid
        const skip = Math.ceil((now + 0.05 - tr.next) / tr.sd);
        tr.next += skip * tr.sd;
        tr.i += skip;
      }
      let guard = 0;
      while (tr.next < horizon && guard++ < 256) {
        if (tr.next < tr.stopAt) {
          try { tr.def.step(tr, pos(tr, tr.i), tr.next); } catch (e) { warn('music:' + tr.name, e); }
        }
        tr.i++;
        tr.next += tr.sd;
      }
    }
  } catch (e) {
    warn('tick', e);
  }
}
function startScheduler() {
  if (!M.timer) M.timer = setInterval(tick, TICK_MS);
  tick();
}
function stopScheduler() {
  if (M.timer) { clearInterval(M.timer); M.timer = null; }
}

function music(track) {
  try {
    const want = track || null;
    if (want !== null && !Object.prototype.hasOwnProperty.call(TRACKS, want)) { warn('unknown track "' + want + '"'); return; }
    if (!S.ctx) { S.pendingMusic = want; return; }
    if ((M.cur ? M.cur.name : null) === want) return;
    resume();
    if (M.cur) killTrack(M.cur);
    M.cur = null;
    if (want) {
      M.cur = makeTrack(want);
      M.tracks.push(M.cur);
      startScheduler();
    }
  } catch (e) {
    warn('music', e);
  }
}

// =============================================================================
// Tracks. step(tr, P, t) runs once per grid step at audio time t with
// P = { s: step in loop, bar, b: step in bar, pass: loop count, intro }.
// spb = grid steps per beat, bpb = grid steps per bar.
// =============================================================================
const TRACKS = {
  // D minor, 70 bpm. Music box over an "oo" choir, slow low bell, soft bass.
  // A: Dm Dm Bb Bb Gm Gm A A7 | B: Bb F/A Gm Dm Eb Bb/D Gm6 A
  // Variation: on even passes an octave-up echo canon of the melody.
  title: {
    bpm: 70, spb: 2, bpb: 8, bars: 16, gain: 1.55,
    chords: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A7', 'Bb', 'F/A', 'Gm', 'Dm', 'Eb', 'Bb/D', 'Gm6', 'A'],
    seqs: {
      mel: `A4 - D5 - F5 - E5 D5 | C#5 - D5 - A4 - - - | F5 - Bb5 - A5 - G5 F5 | D5 - - - . . . . |
            G5 - Bb5 - D6 - C6 Bb5 | A5 - G5 - F5 - E5 F5 | E5 - C#5 - A4 - B4 C#5 | E5 - - - G5 - - - |
            F5 - - D5 F5 - Bb5 - | A5 - - - C6 - A5 - | G5 - Bb5 - A5 - G5 - | F5 - - - E5 - D5 - |
            Eb5 - G5 - Bb5 - - - | D5 - F5 - Bb5 - A5 - | G5 - - - E5 - C#5 - | A4 - - - - - . .`,
    },
    setup(tr) { makeChoir(tr, 'u', 0.95); },
    step(tr, P, t) {
      const { s, bar, b, pass } = P, sd = tr.sd, ch = this.chords[bar], loop = this.bars * this.bpb;
      if (b === 0) {
        sing(tr, t, voicing(ch, 55, 4), 8 * sd - 0.1, { att: 1.8, rel: 2.5, level: 0.03 });
        if (bar % 4 === 0) morph(tr, ['u', 'o', 'u', 'a'][bar / 4], t, 3);
        N(tr, 'bass', t, bassOf(ch, 33), 8 * sd * 0.85, 0.45);
        if (bar % 4 === 0) N(tr, 'bigbell', t + sd, rootOf(ch, 45), 0.55, 7);
      }
      if (bar >= 8 && (b === 0 || b === 4)) N(tr, 'pizz', t, rootOf(ch, 50) + (b === 4 ? 7 : 0), 0.4);
      const e = ev(tr, 'mel', s);
      if (e) N(tr, 'celesta', t + rnd(0, 0.008), e.m, 0.85, Math.max(e.len * sd * 1.5, 1.4));
      if (pass % 2 === 1) {
        const d = ev(tr, 'mel', (s - 3 + loop) % loop);
        if (d) N(tr, 'celesta', t, d.m + 12, 0.35, 1.2);
      }
    },
  },

  // A minor night waltz, 3/4, 108 bpm. Pizzicato "oom", harpsichord "pah pah",
  // celesta tune, soft "oh" choir, shaker in the B section.
  // A: Am E7/G# Am C F Dm E E7 | B: F C Dm Am Bb F E E7
  outside: {
    bpm: 108, spb: 2, bpb: 6, bars: 16, gain: 1.2,
    chords: ['Am', 'E7/G#', 'Am', 'C', 'F', 'Dm', 'E', 'E7', 'F', 'C', 'Dm', 'Am', 'Bb', 'F', 'E', 'E7'],
    seqs: {
      mel: `E5 - - - A5 B5 | G#5 - E5 - D5 - | C5 - B4 - A4 - | G4 - C5 - E5 - |
            F5 - - - E5 F5 | A5 - F5 - D5 - | E5 - G#5 - B5 - | D6 - - - . . |
            C6 - - - A5 - | G5 - E5 - C5 - | D5 - F5 - A5 - | C6 - B5 - A5 - |
            Bb5 - - - F5 - | A5 - G5 - F5 - | E5 - F5 - G#5 - | B5 - - - . .`,
    },
    setup(tr) { makeChoir(tr, 'o', 1); },
    step(tr, P, t) {
      const { s, bar, b, pass } = P, sd = tr.sd, ch = this.chords[bar];
      if (b === 0) {
        N(tr, 'pizz', t, bassOf(ch, 40), 0.95);
        if (bar % 2 === 0) sing(tr, t, voicing(ch, 60, 3), 12 * sd - 0.1, { att: 1.0, rel: 1.8, level: 0.022 });
        if (bar === 0 || bar === 12) N(tr, 'tbell', t, rootOf(ch, 57), 0.45, 4);
      }
      if (b === 2 || b === 4) for (const m of voicing(ch, 55, 3)) N(tr, 'harpsi', t, m, 0.38, sd * 0.8);
      const e = ev(tr, 'mel', s);
      if (e) {
        N(tr, 'celesta', t, e.m, 0.85, Math.max(e.len * sd * 1.6, 1.2));
        if (pass % 2 === 1) N(tr, 'harpsi', t, e.m - 12, 0.5, e.len * sd);
      }
      if (pass % 2 === 1 || bar >= 8) N(tr, 'perc', t, 'shaker', b === 0 ? 0.6 : 0.35);
      if (bar === 7 && b === 5) N(tr, 'celesta', t, 92, 0.3, 1.5);
    },
  },

  // Mini-boss jig, 6/8, quarter = 140 (E harmonic minor). Harpsichord lead,
  // pizzicato jig bass, reed-organ stabs, kick/rim/tambourine, choir shouts.
  // A: Em Em Am B7 Em C Am B7 | B: C D B7 Em Am C B7 B7
  witch: {
    bpm: 140, spb: 2, bpb: 6, bars: 16, gain: 0.7,
    chords: ['Em', 'Em', 'Am', 'B7', 'Em', 'C', 'Am', 'B7', 'C', 'D', 'B7', 'Em', 'Am', 'C', 'B7', 'B7'],
    seqs: {
      mel: `E5! F#5 G5 B5! G5 E5 | D#5! E5 F#5 G5! - E5 | A5! G5 F#5 E5! C5 A4 | B4! - D#5 F#5! - A5 |
            G5! F#5 E5 B5! A5 G5 | E5! G5 C6 B5! - G5 | A5! C6 A5 F#5! - D#5 | E5! - - B4 - - |
            G5! - E5 C6! - G5 | F#5! - D5 A5! - F#5 | D#5! E5 F#5 A5! G5 F#5 | E5! - B4 E5! - G5 |
            C6! B5 A5 E5! - C5 | E5! D5 C5 G5! - E5 | F#5! D#5 B4 A5! F#5 D#5 | B4! - - F#5 - D#5`,
    },
    setup(tr) { makeChoir(tr, 'a', 1.1); },
    step(tr, P, t) {
      const { s, bar, b, pass } = P, sd = tr.sd, ch = this.chords[bar], r = rootOf(ch, 40), B = bar >= 8;
      if (b === 0) N(tr, 'pizz', t, r, 1);
      if (b === 3) N(tr, 'pizz', t, r + 7, 0.8);
      if (B && b === 5) N(tr, 'pizz', t, r + 12, 0.6);
      const prev = this.chords[(bar + 15) % 16];
      if (b === 0 && (prev !== ch || bar % 4 === 0)) N(tr, 'organ', t, voicing(ch, 52, 4), sd * 1.2, 0.8, 'reed');
      if (B && b === 3) N(tr, 'organ', t, voicing(ch, 52, 4), sd * 0.8, 0.6, 'reed');
      if (b === 0 || b === 3) N(tr, 'perc', t, 'kick', b === 0 ? 0.9 : 0.6);
      if (b === 2 || b === 5) N(tr, 'perc', t, 'rim', 0.5);
      N(tr, 'perc', t, 'tamb', b % 3 === 0 ? 0.7 : 0.35);
      if (bar % 4 === 3 && b >= 4) N(tr, 'perc', t, 'snare', 0.5 + (b - 4) * 0.2);
      const e = ev(tr, 'mel', s);
      if (e) {
        N(tr, 'harpsi', t, e.m, e.acc ? 1 : 0.75, e.len * sd);
        if (pass % 2 === 1) N(tr, 'celesta', t, e.m + 12, 0.4, 0.6);
        if (B && pass % 2 === 0 && e.len >= 2) N(tr, 'harpsi', t, e.m - 12, 0.5, e.len * sd);
      }
      if (bar % 8 === 0 && b === 0) sing(tr, t, voicing(ch, 64, 3), sd * 2, { att: 0.03, rel: 0.5, level: 0.05 });
    },
  },

  // C minor, 80 bpm. Full principal organ with 16' pedal, choir pad, tolling
  // bell every two bars; reed-organ melody (choir + celesta ghost on even passes).
  // A: Cm Cm Ab Ab Fm Fm G G7 | B: Ab Eb/G Fm Cm Db Ab/C G G7
  castle: {
    bpm: 80, spb: 2, bpb: 8, bars: 16, gain: 1.5,
    chords: ['Cm', 'Cm', 'Ab', 'Ab', 'Fm', 'Fm', 'G', 'G7', 'Ab', 'Eb/G', 'Fm', 'Cm', 'Db', 'Ab/C', 'G', 'G7'],
    seqs: {
      mel: `G4 - - - C5 - - - | Eb5 - - - D5 - C5 - | C5 - - - Ab4 - - - | Bb4 - C5 - Eb5 - - - |
            F5 - - - Ab5 - G5 - | F5 - Eb5 - D5 - C5 - | B4 - - - D5 - - - | F5 - - - - - . . |
            Eb5 - - - C5 - Ab4 - | Bb4 - - - G4 - Bb4 - | C5 - - - Ab4 - F4 - | G4 - - - - - . . |
            F5 - - - Ab5 - F5 - | Eb5 - - - C5 - Eb5 - | D5 - - - B4 - D5 - | G5 - - - F5 - D5 -`,
    },
    setup(tr) { makeChoir(tr, 'o', 0.9); },
    step(tr, P, t) {
      const { s, bar, b, pass } = P, sd = tr.sd, ch = this.chords[bar];
      if (b === 0) {
        N(tr, 'organ', t, [bassOf(ch, 36), ...voicing(ch, 55, 4)], 8 * sd - 0.04, 0.85, 'principal', true);
        sing(tr, t, voicing(ch, 60, 3), 8 * sd, { att: 1.2, rel: 2.0, level: 0.03 });
        if (bar % 4 === 0) morph(tr, bar % 8 ? 'a' : 'o', t, 2);
        if (bar % 2 === 0) N(tr, 'bigbell', t, rootOf(ch, 48), 0.7, 6);
        if (bar % 8 === 0) N(tr, 'timp', t, rootOf(ch, 36), 0.8, 1.6);
      }
      if (bar % 8 === 7 && b >= 4) N(tr, 'timp', t, 43, 0.25 + (b - 4) * 0.12, 0.5);
      const e = ev(tr, 'mel', s);
      if (e) {
        const len = e.len * sd;
        if (pass % 2 === 0) N(tr, 'organ', t, [e.m], len - 0.03, 0.75, 'reed');
        else {
          sing(tr, t, [e.m], len, { att: 0.12, rel: 0.6, level: 0.05 });
          N(tr, 'celesta', t, e.m + 12, 0.35, 1.5);
        }
      }
      if (bar >= 12 && b === 6) N(tr, 'celesta', t, voicing(ch, 84, 3)[bar % 3], 0.3, 2);
    },
  },

  // C minor, 118 bpm, 16th grid. Ostinato bass, flute-organ arpeggios,
  // timpani on 1 and 3 with rolls; choir lead (A) and brass lead (B).
  // A: Cm Ab Fm G Cm Ab Db G | B: Fm Cm Ab Eb Fm Db G G7
  spire: {
    bpm: 118, spb: 4, bpb: 16, bars: 16, gain: 0.62,
    chords: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Db', 'G', 'Fm', 'Cm', 'Ab', 'Eb', 'Fm', 'Db', 'G', 'G7'],
    seqs: {
      mel: [`C5 - - - G4 - - - | Ab4 - - - C5 - Eb5 - | F5 - - - Eb5 - D5 - | D5 - - - - - B4 - |
             C5 - - - Eb5 - G5 - | Ab5 - - - G5 - F5 - | F5 - - - Db5 - Ab4 - | B4 - - - - - - - |
             Ab5 - - - G5 - F5 - | G5 - - - Eb5 - C5 - | C6 - - - Bb5 - Ab5 - | G5 - - - - - Bb5 - |
             Ab5 - - - F5 - C5 - | Db5 - F5 - Ab5 - F5 - | G5 - - - F5 - D5 - | B4 - - - D5 - F5 -`, 2],
    },
    OST: [0, 0, 12, 0, 7, 0, 12, 7],
    ARP: [0, 1, 2, 3, 1, 2, 3, 2],
    setup(tr) { makeChoir(tr, 'a', 1); },
    step(tr, P, t) {
      const { s, bar, b, pass } = P, sd = tr.sd, ch = this.chords[bar], r = rootOf(ch, 36), B = bar >= 8;
      if (b % 2 === 0) N(tr, 'bass', t, r + this.OST[b / 2], sd * 1.6, b % 8 === 0 ? 1 : 0.7);
      if (!(pass === 0 && bar < 4) || b % 2 === 0) {
        N(tr, 'organ', t, [voicing(ch, 60, 4)[this.ARP[b % 8]]], sd * 0.9, b % 4 === 0 ? 0.55 : 0.4, 'flute');
      }
      if (b === 0) {
        N(tr, 'organ', t, voicing(ch, 48, 3), 16 * sd - 0.05, 0.45, 'principal');
        N(tr, 'timp', t, r, 0.9, 1.2);
        if (bar % 8 === 0) N(tr, 'perc', t, 'crash', 0.6);
      }
      if (b === 8) N(tr, 'timp', t, r + 7 > 45 ? r - 5 : r + 7, 0.7, 1.0);
      if (bar % 8 === 7 && b >= 12) N(tr, 'timp', t, r, 0.3 + (b - 12) * 0.15, 0.4);
      if (b === 4 || b === 12) N(tr, 'perc', t, 'rim', 0.35);
      if (B && b === 0 && bar % 2 === 0) sing(tr, t, voicing(ch, 60, 4), 32 * sd - 0.1, { att: 0.6, rel: 1.5, level: 0.025 });
      const e = ev(tr, 'mel', s);
      if (e) {
        const len = e.len * sd;
        if (!B || pass % 2 === 1) sing(tr, t, [e.m], len, { att: 0.08, rel: 0.5, level: 0.05 });
        if (B) N(tr, 'brass', t, [e.m - 12], len - 0.05, 0.75, 0.06);
      }
    },
  },

  // Dragon fight, D minor, 150 bpm, 16th grid. Taiko/snare/timpani grooves
  // (busier in B), low brass stabs, octave bass ostinato, organ pads,
  // choir hits; reed-organ lead in A, brass lead in B.
  // A: Dm Dm Bb C Dm Dm Eb A | B: Gm Dm Bb A Gm Bb Eb A7
  boss: {
    bpm: 150, spb: 4, bpb: 16, bars: 16, gain: 0.45,
    chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Eb', 'A', 'Gm', 'Dm', 'Bb', 'A', 'Gm', 'Bb', 'Eb', 'A7'],
    seqs: {
      mel: [`D5 - - - - - E5 F5 | E5 - D5 - C#5 - A4 - | Bb4 - - - D5 - F5 - | E5 - - - G5 - - - |
             F5 - - - E5 - D5 - | A5 - - - - - G5 F5 | G5 - - - Bb5 - G5 - | A5 - - - - - - - |
             Bb5 - - - A5 - G5 - | F5 - - - A5 - D6 - | D6 - - - C6 - Bb5 - | A5 - - - C#6 - E6 - |
             D6 - - - Bb5 - G5 - | F5 - - - D5 - Bb4 - | G5 - - - Eb5 - Bb4 - | C#5 - - - E5 - G5 -`, 2],
    },
    DR: {
      A: { taiko: 'x.....x...x.....', snare: '....x.......x...', timp: 'x.......x.......' },
      B: { taiko: 'x..x..x.x..x..x.', snare: '....x.......x..x', timp: 'x.....x.x.....x.', tamb: 'x.x.x.x.x.x.x.x.' },
    },
    STAB: ['x..x..x.........', 'x.....x...x.....'],
    OST: [0, 0, 12, 0, 0, 0, 12, 0],
    setup(tr) { makeChoir(tr, 'a', 1.05); },
    step(tr, P, t) {
      const { s, bar, b, pass } = P, sd = tr.sd, ch = this.chords[bar], r = rootOf(ch, 36), B = bar >= 8;
      const fill = bar % 4 === 3 && b >= 12, dr = B ? this.DR.B : this.DR.A;
      if (fill) N(tr, 'perc', t, 'tom', 0.5 + (b - 12) * 0.15);
      for (const k in dr) {
        if (dr[k][b] !== 'x' || (fill && k !== 'tamb')) continue;
        if (k === 'timp') N(tr, 'timp', t, b >= 8 ? (r + 7 > 45 ? r - 5 : r + 7) : r, 0.8, 0.9);
        else N(tr, 'perc', t, k, b === 0 ? 1 : 0.75);
      }
      if (bar % 8 === 0 && b === 0) N(tr, 'perc', t, 'crash', 0.9);
      if (b % 2 === 0) N(tr, 'bass', t, r + this.OST[b / 2], sd * 1.5, b % 8 === 0 ? 1 : 0.75);
      if (this.STAB[bar % 2][b] === 'x') N(tr, 'brass', t, voicing(ch, 45, 3), 0.12, b === 0 ? 1 : 0.8, 0.015);
      if (b === 0 && bar % 2 === 0) N(tr, 'organ', t, [r, ...voicing(ch, 50, 4)], 32 * sd - 0.05, 0.6, 'principal');
      if (B && b === 0) sing(tr, t, voicing(ch, 62, 3), 0.3, { att: 0.02, rel: 0.4, level: 0.06 });
      const e = ev(tr, 'mel', s);
      if (e) {
        const len = e.len * sd;
        if (!B) N(tr, 'organ', t, [e.m], len - 0.03, 0.8, 'reed');
        else N(tr, 'brass', t, [e.m - 12, e.m], len - 0.03, 0.9, 0.04);
        if (pass % 2 === 1) sing(tr, t, [e.m], len, { att: 0.05, rel: 0.4, level: 0.04 });
      }
    },
  },

  // D major, 96 bpm: a two-bar brass/timpani fanfare (played once), then a
  // gentle 16-bar loop: celesta tune, pizzicato bass, harpsichord broken chords.
  // Loop: D Bm G A D F#m G A | G D/F# Em A Bm G Em7 A7
  victory: {
    bpm: 96, spb: 2, bpb: 8, intro: 2, bars: 16, gain: 1.25,
    chords: ['D', 'Bm', 'G', 'A', 'D', 'F#m', 'G', 'A', 'G', 'D/F#', 'Em', 'A', 'Bm', 'G', 'Em7', 'A7'],
    seqs: {
      fan: ['D5 . D5 D5 F#5 - A5 - | D6 - - - - - - -', 1, true],
      mel: `F#5 - A5 - D6 - A5 - | B5 - - - F#5 - D5 - | G5 - B5 - D6 - B5 - | A5 - - - E5 - C#5 - |
            D5 - F#5 - A5 - F#5 - | C#6 - - - A5 - F#5 - | B5 - A5 - G5 - E5 - | A5 - - - - - . . |
            B5 - - - D6 - B5 - | A5 - - - F#5 - D5 - | E5 - G5 - B5 - G5 - | C#6 - - - A5 - E5 - |
            D6 - - - B5 - F#5 - | G5 - B5 - D6 - E6 - | D6 - - - B5 - G5 - | A5 - - - C#6 - E5 -`,
    },
    RUN: [86, 90, 93, 98, 102, 105],
    setup(tr) { makeChoir(tr, 'a', 1.1); },
    step(tr, P, t) {
      const { s, bar, b, pass, intro } = P, sd = tr.sd;
      if (intro) {
        const f = ev(tr, 'fan', s);
        if (f) {
          N(tr, 'brass', t, [38, 50, 57, f.m - 12, f.m], f.len * sd * 0.9, 1, 0.02);
          N(tr, 'timp', t, 38, 0.8, 0.8);
        }
        if (bar === 1 && b === 0) {
          N(tr, 'bigbell', t, 62, 0.8, 5);
          N(tr, 'perc', t, 'crash', 0.9);
          N(tr, 'timp', t, 38, 1, 1.6);
          sing(tr, t, [62, 66, 69, 74], 8 * sd, { att: 0.1, rel: 1.5, level: 0.035 });
        }
        if (bar === 1 && b >= 2) N(tr, 'celesta', t, this.RUN[b - 2], 0.6, 1.5);
        return;
      }
      const ch = this.chords[bar];
      if (b === 0) {
        N(tr, 'pizz', t, bassOf(ch, 38), 0.9);
        if (bar % 2 === 0) sing(tr, t, voicing(ch, 62, 3), 16 * sd - 0.1, { att: 1.2, rel: 2, level: 0.02 });
        if (bar % 4 === 0) N(tr, 'tbell', t, rootOf(ch, 74), 0.5, 3.5);
      }
      if (b === 4) N(tr, 'pizz', t, rootOf(ch, 38) + 7, 0.7);
      if (b % 2 === 1) N(tr, 'harpsi', t, voicing(ch, 62, 3)[(b >> 1) % 3], 0.32, sd);
      const e = ev(tr, 'mel', s);
      if (e) {
        N(tr, 'celesta', t, e.m, 0.85, Math.max(e.len * sd * 1.5, 1.2));
        if (pass % 2 === 1) N(tr, 'harpsi', t, e.m - 12, 0.4, e.len * sd);
      }
    },
  },
};
for (const k in TRACKS) TRACKS[k].name = k;

// =============================================================================
// Init, mix controls, exports
// =============================================================================
function buildGraph(c) {
  S.buf = makeNoise(c);
  S.buf.crackle = makeCrackle(c);
  const n = S.n;
  const gainNode = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const biquad = (type, f, Q, to) => {
    const b = c.createBiquadFilter();
    b.type = type; b.frequency.value = Math.min(f, c.sampleRate * 0.45); b.Q.value = Q;
    if (to) b.connect(to);
    return b;
  };
  // Master chain (built from the output backwards).
  n.clip = c.createWaveShaper(); n.clip.curve = clipCurve(); n.clip.connect(c.destination);
  n.lim = c.createDynamicsCompressor();
  n.lim.threshold.value = -3; n.lim.knee.value = 0; n.lim.ratio.value = 20;
  n.lim.attack.value = 0.001; n.lim.release.value = 0.08;
  n.lim.connect(n.clip);
  n.master = gainNode(S.masterVol, n.lim);
  n.comp = c.createDynamicsCompressor();
  n.comp.threshold.value = -14; n.comp.knee.value = 10; n.comp.ratio.value = 3;
  n.comp.attack.value = 0.005; n.comp.release.value = 0.2;
  n.comp.connect(n.master);
  n.hp = biquad('highpass', 28, 0.7, n.comp);
  n.crush = c.createWaveShaper(); n.crush.curve = crushCurve(CRUSH_BITS); n.crush.oversample = 'none';
  n.crush.connect(n.hp);
  n.crushIn = gainNode(0.5, n.crush);
  n.retro = biquad('lowpass', RETRO_LP, 0.6, n.crushIn);
  n.pre = gainNode(0.7, n.retro);
  // Shared hall reverb.
  n.reverbIn = gainNode(1);
  const rhp = biquad('highpass', 180, 0.6);
  const conv = c.createConvolver(); conv.normalize = false; conv.buffer = makeIR(c, 2.5);
  const rlp = biquad('lowpass', 6500, 0.5);
  n.reverbOut = gainNode(0.8, n.pre);
  n.reverbIn.connect(rhp); rhp.connect(conv); conv.connect(rlp); rlp.connect(n.reverbOut);
  // Buses.
  n.sfxBus = gainNode(S.sfxVol, n.pre);
  n.sfxSend = gainNode(S.sfxVol, n.reverbIn);
  n.duckDry = gainNode(1, n.pre);
  n.duckWet = gainNode(1, n.reverbIn);
  n.musicBus = gainNode(MUSIC_BASE * S.musicVol, n.duckDry);
  n.musicWet = gainNode(MUSIC_BASE * S.musicVol, n.duckWet);
}

function init() {
  try {
    if (S.ctx) { resume(); return true; }
    const G = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) { warn('Web Audio API unavailable'); return false; }
    let c;
    try { c = new AC({ latencyHint: 'interactive' }); } catch (_) {
      try { c = new AC(); } catch (e) { warn('init', e); return false; }
    }
    S.ctx = c;
    try { buildGraph(c); } catch (e) {
      warn('init-graph', e);
      S.ctx = null; S.n = {};
      try { c.close(); } catch (_) { /* */ }
      return false;
    }
    resume();
    const pm = S.pendingMusic;
    S.pendingMusic = undefined;
    if (pm) music(pm);
    const pl = [...S.pendingLoops];
    S.pendingLoops.clear();
    for (const [name, vol] of pl) startLoop(name, { volume: vol });
    return true;
  } catch (e) {
    warn('init', e);
    return false;
  }
}

const vol01 = (v) => clamp(num(Number(v), 1), 0, 1);
function setMasterVolume(v) {
  S.masterVol = vol01(v);
  if (S.ctx) rampTo(S.n.master.gain, S.masterVol, 0.05);
}
// 1 = default mix (music bus sits at MUSIC_BASE relative to SFX).
function setMusicVolume(v) {
  S.musicVol = vol01(v);
  if (S.ctx) {
    rampTo(S.n.musicBus.gain, MUSIC_BASE * S.musicVol, 0.1);
    rampTo(S.n.musicWet.gain, MUSIC_BASE * S.musicVol, 0.1);
  }
}
function setSfxVolume(v) {
  S.sfxVol = vol01(v);
  if (S.ctx) {
    rampTo(S.n.sfxBus.gain, S.sfxVol, 0.05);
    rampTo(S.n.sfxSend.gain, S.sfxVol, 0.05);
  }
}
// Dip the music by `amount` (0..1) for `seconds`, then recover over 0.6 s.
// Overlapping calls keep the deepest level and the latest end.
function duck(amount = 0.5, seconds = 1) {
  try {
    if (!S.ctx) return;
    const a = clamp(num(Number(amount), 0.5), 0, 1), d = clamp(num(Number(seconds), 1), 0, 30);
    const now = S.ctx.currentTime, active = now < S.duckUntil;
    const level = active ? Math.min(1 - a, S.duckLevel) : 1 - a;
    const until = Math.max(now + 0.08 + d, active ? S.duckUntil : 0);
    S.duckLevel = level;
    S.duckUntil = until;
    for (const g of [S.n.duckDry.gain, S.n.duckWet.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + 0.08);
      g.setValueAtTime(level, until);
      g.linearRampToValueAtTime(1, until + 0.6);
    }
  } catch (e) {
    warn('duck', e);
  }
}

function list() { return Object.keys(SFX); }
function listLoops() { return Object.keys(LOOPS); }
function listTracks() { return Object.keys(TRACKS); }

const audio = {
  init, play, startLoop, stopLoop, setLoopVolume, music,
  setMasterVolume, setMusicVolume, setSfxVolume, duck, list, listLoops, listTracks,
  get ready() { return !!S.ctx; },
  get context() { return S.ctx; },
  get currentTrack() { return M.cur ? M.cur.name : (S.pendingMusic || null); },
};

export {
  audio, init, play, startLoop, stopLoop, setLoopVolume, music,
  setMasterVolume, setMusicVolume, setSfxVolume, duck, list, listLoops, listTracks,
};
export default audio;
