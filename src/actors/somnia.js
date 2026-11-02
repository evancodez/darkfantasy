// Somnia, Mother of Moths — the dream's keeper, a moth the size of a chapel
// with four kaleidoscope wings, each wearing a great eye.
//   She hovers over the rose-window arena and fights from the air:
//     volley — every open eye looses a slow orb at you. Parry one back into her
//       and she crashes down onto the glass, wings spread flat: now her eyes
//       are in reach of your sword (a few cuts per fall, then she rises);
//     dust — great wing-beats send rings of glittering dust rolling across the
//       floor: jump them;
//     swoop — she climbs to the rim, a line of light marks her path, then she
//       sweeps low across the arena;
//     brood — (once two eyes are shut) she calls eyemoths to her side.
//   Close all four eyes and she dissolves into light.
import * as THREE from 'three';
import { retroMat, Lights, G } from '../core/retro.js';
import { cyl, sphere, clean } from '../core/geo.js';
import { Orb, spawn } from './enemies.js';
import { DT, makeDreamMaterials, holoMat } from '../world/dream/assets.js';
import './dreamfolk.js';
import audio from '../sound.js';

const PI = Math.PI, R = Math.random;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const EYE_HP = 4, PER_FALL = 4;

function wingGeo(span, chord, hind) {
  const s = new THREE.Shape();
  s.moveTo(0, -chord * 0.15);
  if (hind) { s.bezierCurveTo(span * 0.35, -chord, span * 1.05, -chord * 0.95, span * 0.85, -chord * 0.15); s.bezierCurveTo(span * 0.65, chord * 0.25, span * 0.2, chord * 0.2, 0, chord * 0.12); }
  else { s.bezierCurveTo(span * 0.25, chord * 0.6, span * 0.8, chord * 0.95, span, chord * 0.45); s.bezierCurveTo(span * 1.05, -chord * 0.3, span * 0.55, -chord * 0.6, 0, -chord * 0.15); }
  const g = new THREE.ShapeGeometry(s, 24), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    uv.setXY(i, x / span, 0.5 + y / (chord * 1.9));
    p.setXYZ(i, x, Math.sin(x / span * PI) * chord * 0.08, -y);
  }
  g.computeVertexNormals();
  return clean(g);
}

// kaleidoscope wings: mirrored petals breathing outward from the eye
function wingMat(eye, hue) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: G.uTime, uFogColor: G.uFogColor, uFogNear: G.uFogNear, uFogFar: G.uFogFar, uEye: { value: new THREE.Vector2(...eye) }, uHue: { value: hue }, uFlash: { value: 0 }, uDim: { value: 0 } },
    vertexShader: `uniform float uFogNear, uFogFar; varying vec2 vUv; varying float vFog;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; vFog = clamp((length(mv.xyz) - uFogNear) / (uFogFar - uFogNear), 0., 1.); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uHue, uFlash, uDim; uniform vec2 uEye; uniform vec3 uFogColor; varying vec2 vUv; varying float vFog;
      vec3 dp(float t){ return vec3(.62, .55, .95) + vec3(.38, .4, .25) * cos(6.2831 * (vec3(0., .12, .28) + t)); }
      void main(){
        // dusk-blue wings, darker toward the root, a kaleidoscope blooming round the eye
        vec2 d = (vUv - uEye) * vec2(1.5, 1.); float r = length(d), a = atan(d.y, d.x);
        float N = 10., af = abs(mod(a + uTime * .08, 6.2831 / N) - 3.14159 / N);
        float rings = sin(r * 42. - uTime * 1.6) * .5 + .5;
        float petals = smoothstep(.25, .95, sin(af * 7. + r * 26. - uTime * .7) * .5 + .5);
        float bloom = smoothstep(.42, .1, r);
        vec3 dusk = mix(vec3(.05, .04, .2), vec3(.22, .16, .55), vUv.x) + vec3(.1, .02, .12) * sin(vUv.y * 9. + vUv.x * 4.);
        vec3 c = mix(dusk, dp(r * 1.3 - uTime * .04 + uHue) * (.35 + .65 * (rings * .45 + petals * .55)), bloom);
        float veins = smoothstep(.05, 0., abs(fract(atan(vUv.y - .5, vUv.x + .08) * 3.2) - .5) - .45);
        c *= 1. - veins * .55;
        // a pale scalloped margin with dark spots
        float edge = smoothstep(.82, .9, vUv.x + sin(vUv.y * 40.) * .015);
        c = mix(c, mix(vec3(.85, .85, 1.), vec3(.1, .05, .25), step(.6, fract(vUv.y * 14.))), edge * .85);
        c = mix(c, c * .25, uDim);
        c = mix(c, vec3(1.), uFlash);
        gl_FragColor = vec4(mix(c, uFogColor, vFog * .5), 1.);
      }`,
  });
}
// an eye: iris rings round a slit pupil that turns to follow you
function eyeMat() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: G.uTime, uOpen: { value: 1 }, uLook: { value: new THREE.Vector2() }, uHurt: { value: 0 }, uHue: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uOpen, uHurt, uHue; uniform vec2 uLook; varying vec2 vUv;
      vec3 pal(float t){ return vec3(.62, .55, .95) + vec3(.38, .4, .25) * cos(6.2831 * (vec3(0., .12, .28) + t)); }
      void main(){
        vec2 p = (vUv - .5) * 2.; float r = length(p);
        if (abs(p.y) > uOpen * sqrt(max(0., 1. - p.x * p.x)) + .001) { gl_FragColor = vec4(vec3(.05, .03, .12) + vec3(.15, .1, .3) * (1. - r), 1.); return; }
        vec2 q = p - uLook * .35;
        float ir = length(q);
        vec3 c = pal(ir * 1.8 - uTime * .2 + uHue) * (.6 + .4 * sin(ir * 40. + atan(q.y, q.x) * 6.));
        c *= smoothstep(1., .55, r) * .7 + .3;
        float slit = smoothstep(.09, .05, abs(q.x) / (1.2 - ir * .4)) * step(ir, .55);
        c = mix(c, vec3(.02, 0., .05), slit);
        c += vec3(1.) * smoothstep(.12, .0, length(p - vec2(-.35, .35)));
        c = mix(c, vec3(1., .2, .3), uHurt);
        gl_FragColor = vec4(c, 1.);
      }`,
  });
}

function buildSomnia() {
  makeDreamMaterials();
  const m = {
    fur: retroMat({ map: DT.fur, rim: 0.4, edge: 0.3, emit: 0.15, color: 0xe8e0ff }),
    ruff: retroMat({ map: DT.fur, color: 0xffffff, rim: 0.5, emit: 0.3 }),
    eye: holoMat({ color: 0x70f0ff, opacity: 0.95, glow: 0.8, side: THREE.FrontSide, depthWrite: true }),
    chrome: retroMat({ chrome: 0.85, env: DT.holoEnv, color: 0xe8ecff, spec: 0.5 }),
    crystal: retroMat({ color: 0xc0f0ff, emit: 0.8, fog: 0.4 }),
  };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const P = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) => { const o = new THREE.Mesh(geo, mat); o.position.set(...pos); o.rotation.set(...rot); typeof scl === 'number' ? o.scale.setScalar(scl) : o.scale.set(...scl); parent.add(o); return o; };
  // thorax, a fur ruff, the head with two great compound eyes and a crystal crown
  P(body, sphere(1.6, 16, 12), m.fur, [0, 0, 0], [0, 0, 0], [1, 0.95, 1.15]);
  for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2; P(body, cyl(0, 0.35, 1.2, 5), m.ruff, [Math.cos(a) * 1.25, 0.2 + Math.sin(a) * 0.9, 1.0], [PI / 2 + Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]); }
  const head = new THREE.Group(); head.position.set(0, 0.35, 1.9); body.add(head);
  P(head, sphere(1.0, 14, 10), m.fur);
  for (const s of [-1, 1]) P(head, sphere(0.62, 14, 10), m.eye, [s * 0.62, 0.15, 0.45]);
  for (let i = 0; i < 5; i++) P(head, cyl(0, 0.16, 0.9 + (i % 2) * 0.5, 5, { flat: true }), m.crystal, [(i - 2) * 0.28, 1.0 + (i % 2) * 0.2, -0.1], [-0.2, 0, (i - 2) * -0.25]);
  const ants = [];
  for (const s of [-1, 1]) {
    const ant = new THREE.Group(); ant.position.set(s * 0.35, 0.8, 0.5); ant.rotation.set(-0.9, 0, s * 0.5); head.add(ant); ants.push(ant);
    P(ant, cyl(0.04, 0.06, 4.6, 5), m.chrome, [0, 2.3, 0]);
    for (let i = 0; i < 14; i++) for (const k of [-1, 1]) P(ant, cyl(0.02, 0.02, 0.9 - i * 0.05, 3), m.chrome, [k * 0.3, 0.6 + i * 0.28, 0], [0.4, 0, k * 1.2]);
  }
  // abdomen: segments trailing behind
  const abd = new THREE.Group(); abd.position.set(0, -0.2, -1.5); body.add(abd);
  for (let i = 0; i < 5; i++) P(abd, sphere(1.25 - i * 0.18, 12, 9), m.fur, [0, -i * 0.2, -i * 1.15], [0, 0, 0], [1, 0.9, 1.15]);
  // six dangling chrome legs
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1, z = 0.8 - Math.floor(i / 2) * 0.8;
    const lg = new THREE.Group(); lg.position.set(s * 0.9, -1.0, z); lg.rotation.z = s * 0.5; body.add(lg); legs.push(lg);
    P(lg, cyl(0.07, 0.09, 1.8, 5), m.chrome, [0, -0.9, 0]); P(lg, cyl(0.04, 0.07, 1.6, 5), m.chrome, [0, -2.4, 0.4], [0.5, 0, 0]);
  }
  // four wings, each with an eye
  const wings = [], eyes = [];
  const specs = [
    { side: 1, hind: false, span: 9.5, chord: 6.6, at: [1.1, 0.5, 0.5], eye: [0.6, 0.62], hue: 0.55 },
    { side: -1, hind: false, span: 9.5, chord: 6.6, at: [-1.1, 0.5, 0.5], eye: [0.6, 0.62], hue: 0.55 },
    { side: 1, hind: true, span: 6.8, chord: 5.2, at: [0.9, 0.2, -0.9], eye: [0.55, 0.32], hue: 0.85 },
    { side: -1, hind: true, span: 6.8, chord: 5.2, at: [-0.9, 0.2, -0.9], eye: [0.55, 0.32], hue: 0.85 },
  ];
  for (const sp of specs) {
    const j = new THREE.Group(); j.position.set(...sp.at); body.add(j);
    let g = wingGeo(sp.span, sp.chord, sp.hind);
    if (sp.side < 0) { g = g.clone(); g.scale(-1, 1, 1); g.computeVertexNormals(); }
    const mat = wingMat(sp.eye, sp.hue);
    P(j, g, mat);
    // the eye sits on the wing where the shader's mandala is centred
    const ex = sp.eye[0] * sp.span * sp.side, ez = -(sp.eye[1] - 0.5) * sp.chord * 1.9;
    const eg = new THREE.Group(); eg.position.set(ex, Math.sin(sp.eye[0] * PI) * sp.chord * 0.08 + 0.12, ez); j.add(eg);
    const em = eyeMat(); em.uniforms.uHue.value = sp.hue;
    // a bulging lens through the wing; the iris is painted from straight above (and below)
    const lens = new THREE.SphereGeometry(1.45, 24, 14), lp = lens.attributes.position, luv = lens.attributes.uv;
    for (let k = 0; k < lp.count; k++) luv.setXY(k, lp.getX(k) / 2.9 + 0.5, -lp.getZ(k) / 2.9 + 0.5);
    const disc = P(eg, clean(lens), em, [0, -0.1, 0], [0, 0, 0], [1, 0.5, 1]);
    P(eg, clean(new THREE.TorusGeometry(1.5, 0.16, 5, 24)), m.chrome, [0, -0.1, 0], [PI / 2, 0, 0]);
    wings.push({ j, mat, side: sp.side, hind: sp.hind });
    eyes.push({ g: eg, mat: em, disc, wing: wings.length - 1, glow: null });
  }
  return { root, body, head, ants, legs, wings, eyes, m };
}

export function setupSomnia(game, { group, center, radius, onDefeat }) {
  const g = game, AR = center.clone();
  const S = { active: false, done: false, state: 'idle', t: 0, phase: 1, pos: new THREE.Vector3(), yaw: 0, flap: 0, fallDmg: 0, cool: 2, next: 0 };
  const M = buildSomnia();
  M.root.visible = false; group.add(M.root);
  const light = Lights.add(AR.clone().setY(AR.y + 8), 0xd0a0ff, 0, 22);
  for (const e of M.eyes) e.glow = g.glows.add(AR.clone(), 0x000000, 0, false);
  S.focus = new THREE.Vector3();

  // targets: the four eyes, and the body (only reflected orbs hurt it)
  const eyes = M.eyes.map((e, i) => {
    const t = { pos: new THREE.Vector3(), radius: 1.0, height: 0.9, aimHeight: 0.3, alive: false, hp: EYE_HP, i, stompable: false, big: true, shadow: false,
      onHit(hit) {
        // a parried orb that clips an eye still knocks the whole moth down
        if (hit.kind === 'reflect') return bodyT.onHit(hit);
        if (!S.active || this.hp <= 0) return 'ignored';
        if (S.state !== 'grounded') {
          // a lucky leap into a low-flying eye: one cut, and she shies away
          if (S.flinch > 0) return 'ignored';
          S.flinch = 1.2;
        } else if (S.state === 'grounded') {
          if (S.fallDmg >= PER_FALL) return 'ignored';
          S.fallDmg += hit.dmg;
          if (S.fallDmg >= PER_FALL) S.t = Math.max(S.t, S.groundTime - 0.6);
        }
        this.hp -= hit.dmg; e.mat.uniforms.uHurt.value = 1;
        audio.play('eyeHurt', { pitch: 0.9 + R() * 0.2 }); g.flash(0.15, 0xffc0e0);
        g.fx.sparks(this.pos.clone().setY(this.pos.y + 0.3), 14, 0xff80e0, 6);
        if (this.hp <= 0) shutEye(i);
        updateBar();
        return 'hit';
      } };
    return t;
  });
  const bodyT = { pos: new THREE.Vector3(), radius: 2.4, height: 3, aimHeight: 1.5, alive: false, noAim: true, stompable: false, big: true, shadow: false,
    onHit(hit) {
      if (!S.active || hit.kind !== 'reflect') return 'ignored';
      audio.play('somniaCry', { pitch: 1.2 }); g.flash(0.3, 0xfff0c0);
      if (S.state !== 'grounded' && S.state !== 'fall' && S.state !== 'dying') go('fall');
      return 'hit';
    } };
  S.bodyT = bodyT; S.eyes = eyes;
  const openEyes = () => eyes.filter(e => e.hp > 0);
  const totalHp = () => eyes.reduce((s, e) => s + Math.max(0, e.hp), 0);
  const updateBar = () => g.hud.boss('Somnia, Mother of Moths', totalHp() / (EYE_HP * 4));

  function shutEye(i) {
    const e = M.eyes[i];
    eyes[i].alive = false; g.removeTarget(eyes[i]);
    audio.play('eyeBurst'); g.shake(0.5); g.hitstop(0.12); g.flash(0.4, 0xffd0f0);
    const p = eyes[i].pos;
    for (let k = 0; k < 30; k++) g.fx.dust.emit({ pos: p.clone().setY(p.y + 0.4), vel: new THREE.Vector3((R() - 0.5) * 10, 3 + R() * 7, (R() - 0.5) * 10), life: 1.5, size: 0.25, size1: 0, color: [0xff70e0, 0x70f0ff, 0xffe080, 0xffffff][k % 4], gravity: 9, drag: 0.8 });
    M.wings[e.wing].mat.uniforms.uDim.value = 0.7;
    g.hud.callout(openEyes().length ? 'An eye closes!' : 'The last eye closes!');
    if (!openEyes().length) go('dying');
    else if (openEyes().length <= 2 && S.phase === 1) { S.phase = 2; g.hud.hint('Somnia stirs her brood…', 3); }
  }

  // ---------------------------------------------------------------- hazards
  const rings = [];
  const ringMat = holoMat({ color: 0xffb0f0, opacity: 0.9, glow: 0.9, additive: true });
  function dustRing(delay = 0) {
    const mesh = new THREE.Mesh(clean(new THREE.TorusGeometry(1, 0.22, 6, 48)), ringMat);
    mesh.rotation.x = PI / 2; mesh.position.copy(AR).setY(AR.y + 0.3); mesh.visible = false; group.add(mesh);
    rings.push({ mesh, r: 2.5, t: -delay, hit: false });
  }
  const pathLine = new THREE.Mesh(clean(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2)), retroMat({ color: 0xff70e0, emit: 1, additive: true, opacity: 0.7, fog: 0.2 }));
  pathLine.visible = false; group.add(pathLine);
  const orbs = [];
  S.rings = rings; S.pathLine = pathLine;
  function fireOrb(ei) {
    const e = eyes[ei]; if (e.hp <= 0) return;
    const from = e.pos.clone().setY(e.pos.y + 0.4), to = _a.copy(g.player.pos).setY(g.player.pos.y + 0.9);
    const o = new Orb(g, from, to.sub(from).normalize().multiplyScalar(S.phase === 2 ? 10 : 8.5), { owner: bodyT, color: [0xff70e0, 0x70f0ff, 0xffd060, 0xa070ff][ei], homing: 0.7, life: 5, reflectDmg: 0, size: 1.5 });
    orbs.push(o);
    audio.play('eyeOrb', { pitch: 0.9 + ei * 0.08 });
    M.eyes[ei].mat.uniforms.uHurt.value = 0.4;
  }

  // ---------------------------------------------------------------- states
  function go(s) {
    S.state = s; S.t = 0;
    if (s === 'fall') { audio.play('somniaFall', { volume: 0.4 }); }
    if (s === 'grounded') { S.fallDmg = 0; S.groundTime = 6.5; g.shake(0.8); audio.play('somniaFall'); g.dreamRipple?.(AR, 1); for (let i = 0; i < 3; i++) g.fx.rings.add(AR.clone().setY(AR.y + 0.1), { color: 0xd0a0ff, r0: 1 + i, r1: 10 + i * 3, life: 0.6 + i * 0.15 }); g.hud.hint(S.hinted ? null : 'She’s down — strike the eyes on her wings!', 4); S.hinted = true; }
    if (s === 'dust') { S.beats = S.phase === 2 ? 2 : 1; }
    if (s === 'swoop') { S.swoopFrom = null; }
    if (s === 'dying') { audio.play('somniaDeath'); audio.music(null); g.player.cam.focus = null; for (const o of orbs) if (!o.removed) o.explode(); }
  }
  function pickAttack() {
    const opts = ['volley', 'dust', 'volley', 'swoop'];
    if (S.phase === 2) opts.push('volley', 'brood');
    let a = opts[Math.floor(R() * opts.length)];
    if (a === S.last && R() < 0.7) a = opts[(opts.indexOf(a) + 1) % opts.length];
    if (a === 'brood' && g.enemies.filter(e => e.kind === 'moth' && e.alive).length >= 2) a = 'volley';
    // never too long without a volley (that's how you knock her down)
    if (S.sinceVolley >= 2) a = 'volley';
    S.sinceVolley = a === 'volley' ? 0 : (S.sinceVolley || 0) + 1;
    S.last = a; go(a);
  }

  const hoverAt = (h, dt, k = 1.5, orbitR = 5.5) => {
    S.orbit = (S.orbit || 0) + dt * 0.25;
    _a.set(AR.x + Math.cos(S.orbit) * orbitR, AR.y + h + Math.sin(g.time * 1.3) * 0.4, AR.z + Math.sin(S.orbit) * orbitR);
    S.pos.lerp(_a, 1 - Math.exp(-dt * k));
  };
  const faceP = (dt, k = 2) => { const p = g.player.pos; const want = Math.atan2(p.x - S.pos.x, p.z - S.pos.z); let d = want - S.yaw; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2; S.yaw += d * (1 - Math.exp(-dt * k)); };

  S.begin = () => {
    if (S.active || S.done) return;
    S.active = true; S.state = 'descend'; S.t = 0; S.phase = openEyes().length <= 2 ? 2 : 1; S.cool = 2; S.sinceVolley = 0;
    if (openEyes().length === 0) for (const e of eyes) e.hp = EYE_HP;
    S.pos.copy(AR).setY(AR.y + 34); M.root.visible = true; light.intensity = 1.6;
    for (const e of eyes) if (e.hp > 0) { e.alive = true; g.addTarget(e); }
    bodyT.alive = true; g.addTarget(bodyT);
    audio.play('somniaCry'); audio.music('somnia');
    g.player.cam.focus = S.focus;
    updateBar();
  };
  S.reset = () => {
    S.active = false; S.state = 'idle'; M.root.visible = false; light.intensity = 0;
    for (const e of M.eyes) g.glows.set(e.glow, AR, 0x000000, 0); g.glows.dirty();
    for (const e of eyes) { e.alive = false; g.removeTarget(e); }
    bodyT.alive = false; g.removeTarget(bodyT);
    for (const r of rings) r.mesh.removeFromParent(); rings.length = 0;
    for (const o of orbs) if (!o.removed) o.remove(); orbs.length = 0;
    pathLine.visible = false;
    g.hud.boss(null); if (g.player.cam.focus === S.focus) g.player.cam.focus = null;
  };

  S.update = (dt) => {
    if (!S.active) return;
    const p = g.player, P = p.pos;
    S.t += dt; S.flinch = Math.max(0, (S.flinch || 0) - dt);
    let flapRate = 2.2, flapAmp = 0.35, spread = 0, bank = 0, pitch = 0;
    switch (S.state) {
      case 'descend':
        S.pos.lerp(_a.copy(AR).setY(AR.y + 8), 1 - Math.exp(-dt * 1.1)); faceP(dt, 1.5);
        if (S.t > 1.2 && !S.cried) { S.cried = true; g.hud.area('Somnia', 'Mother of Moths'); }
        if (S.t > 3.2) { S.cried = false; go('hover'); S.cool = 1.2; }
        break;
      case 'hover':
        hoverAt(7.5, dt); faceP(dt);
        S.cool -= dt;
        if (S.cool <= 0) pickAttack();
        break;
      case 'volley': {
        hoverAt(6.5, dt, 1); faceP(dt, 3); flapRate = 1.4;
        const open = openEyes();
        const gap = S.phase === 2 ? 0.28 : 0.42, n = S.phase === 2 ? open.length * 2 : open.length;
        S.shot ??= 0;
        if (S.t > 0.9 + S.shot * gap && S.shot < n) { fireOrb(open[S.shot % open.length].i); S.shot++; }
        if (S.shot >= n && S.t > 1.2 + n * gap + 1.2) { S.shot = 0; go('hover'); S.cool = S.phase === 2 ? 1.0 : 1.6; }
        break;
      }
      case 'dust':
        // drop low over the middle and beat the wings: rings roll outward
        S.pos.lerp(_a.copy(AR).setY(AR.y + 4.2), 1 - Math.exp(-dt * 2)); faceP(dt);
        flapRate = 1.0; flapAmp = 0.8;
        if (S.t > 0.9 && S.beats > 0 && S.t > 0.9 + (2 - S.beats) * 0.9) {
          S.beats--; audio.play('wingBeat'); audio.play('dustRing'); g.shake(0.35); dustRing();
          if (S.phase === 2) dustRing(0.45);
        }
        if (S.t > 3.2) { go('hover'); S.cool = 1.3; }
        break;
      case 'swoop': {
        if (!S.swoopFrom) {
          // across the arena through where you stand
          const d = _a.copy(P).sub(AR).setY(0); if (d.lengthSq() < 1) d.set(1, 0, 0);
          d.normalize();
          S.swoopFrom = AR.clone().addScaledVector(d, -radius - 3).setY(AR.y + 7);
          S.swoopTo = AR.clone().addScaledVector(d, radius + 3).setY(AR.y + 7);
          S.swoopAim = P.clone();
          audio.play('somniaCry', { pitch: 0.9 });
        }
        if (S.t < 1.4) {
          S.pos.lerp(S.swoopFrom, 1 - Math.exp(-dt * 3)); S.yaw = Math.atan2(S.swoopTo.x - S.swoopFrom.x, S.swoopTo.z - S.swoopFrom.z);
          pathLine.visible = true; pathLine.position.copy(S.swoopFrom).lerp(S.swoopTo, 0.5).setY(AR.y + 0.08);
          pathLine.rotation.y = S.yaw; pathLine.scale.set(3.4, 1, S.swoopFrom.distanceTo(S.swoopTo)); pathLine.material.uniforms.uOpacity.value = 0.35 + 0.35 * Math.sin(S.t * 20);
        } else {
          const k = Math.min(1, (S.t - 1.4) / 1.3);
          S.pos.lerpVectors(S.swoopFrom, S.swoopTo, k); S.pos.y = AR.y + 1.8 + Math.pow(Math.abs(k - 0.5) * 2, 2) * 5.5;
          pathLine.visible = false; flapAmp = 0.1; pitch = 0.3;
          if (!S.swoopHit && P.distanceTo(_b.copy(S.pos).setY(S.pos.y - 0.5)) < 3.4) { S.swoopHit = true; p.receive({ dmg: 1, from: S.pos.clone(), kind: 'melee', source: null, kb: 9 }); }
          if (k >= 1) { S.swoopHit = false; go('hover'); S.cool = 1.4; }
        }
        break;
      }
      case 'brood':
        hoverAt(8.5, dt); faceP(dt); flapRate = 3.5;
        if (S.t > 0.8 && !S.brooded) {
          S.brooded = true; audio.play('somniaCry', { pitch: 1.3 });
          for (const s of [-1, 1]) { const at = _a.copy(S.pos).add(new THREE.Vector3(s * 4, -1, 0)); spawn(g, 'moth', at, { parent: group, aggro: 40, span: 3 }); }
        }
        if (S.t > 2) { S.brooded = false; go('hover'); S.cool = 1.5; }
        break;
      case 'fall':
        S.pos.y -= dt * (6 + S.t * 18); S.pos.x += (AR.x - S.pos.x) * dt * 0.8; S.pos.z += (AR.z - S.pos.z) * dt * 0.8;
        flapRate = 9; flapAmp = 0.5; pitch = -0.3;
        if (S.pos.y <= AR.y + 1.9) { S.pos.y = AR.y + 1.9; go('grounded'); }
        break;
      case 'grounded':
        // wings flat on the glass, eyes in reach
        spread = 1; flapAmp = 0; faceP(dt, 0.3);
        if (S.t > S.groundTime) { audio.play('wingBeat'); audio.play('somniaCry', { pitch: 0.8 }); dustRing(); go('rise'); }
        break;
      case 'rise':
        S.pos.lerp(_a.copy(AR).setY(AR.y + 7.5), 1 - Math.exp(-dt * 1.5)); flapRate = 3.2; flapAmp = 0.7;
        if (S.t > 1.6) { go('hover'); S.cool = 1.2; }
        break;
      case 'dying': {
        S.pos.y += dt * 1.2; flapRate = 0.6; flapAmp = 0.5;
        M.root.scale.setScalar(Math.max(0.01, 1 - Math.max(0, S.t - 2.5) / 2.5));
        for (let k = 0; k < 6; k++) g.fx.glow.emit({ pos: _a.copy(S.pos).add(new THREE.Vector3((R() - 0.5) * 16, (R() - 0.5) * 6, (R() - 0.5) * 10)), vel: new THREE.Vector3((R() - 0.5) * 2, 3 + R() * 3, (R() - 0.5) * 2), life: 1.6, size: 0.6, size1: 0, color: [0xff70e0, 0x70f0ff, 0xffe080, 0xffffff][k % 4], alpha: 1 });
        if (S.t > 5.2) {
          S.active = false; S.done = true; M.root.visible = false; light.intensity = 0;
          bodyT.alive = false; g.removeTarget(bodyT); g.hud.boss(null);
          onDefeat?.();
        }
        break;
      }
    }

    // hazards: dust rings rolling across the floor
    for (const r of rings) {
      r.t += dt; if (r.t < 0) continue;
      r.mesh.visible = true; r.r += dt * 7.5;
      r.mesh.scale.set(r.r, r.r, 1 + Math.sin(r.t * 20) * 0.3);
      if (Math.random() < 0.7) { const a = R() * PI * 2; g.fx.glow.emit({ pos: _a.set(AR.x + Math.cos(a) * r.r, AR.y + 0.4, AR.z + Math.sin(a) * r.r), vel: new THREE.Vector3(0, 1.2, 0), life: 0.6, size: 0.4, size1: 0, color: R() < 0.5 ? 0xff90f0 : 0xa0e0ff, alpha: 0.9 }); }
      const pd = Math.hypot(P.x - AR.x, P.z - AR.z);
      if (!r.hit && Math.abs(pd - r.r) < 0.7 && P.y < AR.y + 0.75 && !p.dead) { r.hit = true; p.receive({ dmg: 1, from: AR.clone(), kind: 'hazard', unblockable: true, kb: 4 }); }
      if (r.r > radius + 1.5) { r.mesh.removeFromParent(); r.done = true; }
    }
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].done) rings.splice(i, 1);
    for (let i = orbs.length - 1; i >= 0; i--) if (orbs[i].removed) orbs.splice(i, 1);

    // ---------------------------------------------------------------- pose
    S.flap += dt * flapRate * PI * 2 * 0.5;
    M.root.position.copy(S.pos); M.root.rotation.y = S.yaw;
    M.body.rotation.x = pitch + (S.state === 'grounded' ? 0.08 : Math.sin(S.flap) * 0.05);
    M.body.rotation.z = bank;
    const beat = Math.sin(S.flap) * flapAmp;
    for (const w of M.wings) {
      const up = w.hind ? beat * 0.8 + 0.3 : beat + 0.45;
      const target = spread ? (w.hind ? -0.22 : -0.28) : up;
      w.j.rotation.z = THREE.MathUtils.lerp(w.j.rotation.z, w.side * target, 1 - Math.exp(-dt * (spread ? 6 : 14)));
      w.j.rotation.y = w.side * (w.hind ? -0.25 : 0.12) * (1 - spread * 0.5);
    }
    for (const [i, a] of M.ants.entries()) a.rotation.x = -0.9 + Math.sin(g.time * 2 + i) * 0.1;
    for (const [i, l] of M.legs.entries()) l.rotation.x = Math.sin(g.time * 3 + i) * 0.15 + (S.state === 'grounded' ? -0.6 : 0);
    M.root.updateMatrixWorld(true);
    for (const [i, e] of M.eyes.entries()) {
      e.g.getWorldPosition(eyes[i].pos);
      eyes[i].pos.y -= 0.3;
      const lk = _b.copy(P).sub(eyes[i].pos).normalize();
      e.mat.uniforms.uLook.value.set(lk.x * Math.cos(S.yaw) - lk.z * Math.sin(S.yaw), lk.y).clampLength(0, 1);
      e.mat.uniforms.uHurt.value = Math.max(0, e.mat.uniforms.uHurt.value - dt * 3);
      e.mat.uniforms.uOpen.value += ((eyes[i].hp > 0 ? 1 : 0) - e.mat.uniforms.uOpen.value) * (1 - Math.exp(-dt * 6));
      const lit = S.state === 'grounded' && eyes[i].hp > 0;
      g.glows.set(e.glow, eyes[i].pos.clone().setY(eyes[i].pos.y + 0.4), lit ? 0xff90f0 : 0x000000, lit ? 3.2 + Math.sin(g.time * 8) * 0.8 : 0);
    }
    g.glows.dirty();
    bodyT.pos.copy(S.pos).setY(S.pos.y - 1.5);
    S.focus.copy(S.pos).setY(Math.min(S.pos.y, AR.y + 5));
    light.pos.copy(S.pos);
    if (S.state !== 'dying') { M.root.scale.setScalar(1); }
  };
  return S;
}
