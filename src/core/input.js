// Keyboard + mouse input with edge-triggered presses and pointer-lock look,
// plus gamepads (a PS5 DualSense or any pad with the "standard" mapping):
// pad buttons land in the same down/pressed sets as keys under names like
// 'PadCross', and the sticks are read through a radial deadzone.
const down = new Set();
const pressed = new Set();
const released = new Set();
let mdx = 0, mdy = 0, wheel = 0;
let canvas;

// standard-mapping button order (Cross = bottom face button on any pad)
const PAD = ['PadCross', 'PadCircle', 'PadSquare', 'PadTriangle', 'PadL1', 'PadR1', 'PadL2', 'PadR2', 'PadCreate', 'PadOptions',
  'PadL3', 'PadR3', 'PadUp', 'PadDown', 'PadLeft', 'PadRight', 'PadPS', 'PadTouch'];
const stick = { lx: 0, ly: 0, rx: 0, ry: 0 };
let device = 'kbm', padId = '', padIndex = -1, navHeld = null, navRepeat = 0;
let rumbleUntil = 0, rumbleLevel = 0;
const listeners = new Set();
const setDevice = (d) => { if (d !== device) { device = d; for (const f of listeners) f(d); } };

// radial deadzone, rescaled so the edge of the deadzone reads as zero and
// most of the throw reads as full
function deadzone(x, y, dz, sat = 0.9) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (sat - dz)) / m;
  return [x * k, y * k];
}

export const input = {
  init(el) {
    canvas = el;
    addEventListener('keydown', e => {
      if (['Space', 'Tab', 'ShiftLeft', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!down.has(e.code)) pressed.add(e.code);
      down.add(e.code);
      setDevice('kbm');
    });
    addEventListener('keyup', e => { down.delete(e.code); released.add(e.code); });
    addEventListener('mousedown', e => {
      if (e.button === 1) e.preventDefault();
      const c = 'Mouse' + e.button;
      if (!down.has(c)) pressed.add(c);
      down.add(c);
      setDevice('kbm');
    });
    addEventListener('mouseup', e => { const c = 'Mouse' + e.button; down.delete(c); released.add(c); });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) setDevice('kbm'); } });
    addEventListener('wheel', e => { wheel += e.deltaY; }, { passive: true });
    addEventListener('blur', () => { for (const c of [...down]) if (!c.startsWith('Pad')) down.delete(c); });
    addEventListener('gamepadconnected', e => { padId = e.gamepad.id; setDevice('pad'); });
    addEventListener('gamepaddisconnected', () => { padIndex = -1; padId = ''; });
  },

  // read the pad once per frame, before anything asks about input
  poll(dt = 1 / 60) {
    const pads = navigator.getGamepads?.() || [];
    let gp = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (!gp || (p.mapping === 'standard' && gp.mapping !== 'standard')) gp = p;
    }
    if (!gp) {
      padIndex = -1;
      for (const c of PAD) if (down.has(c)) { down.delete(c); released.add(c); }
      stick.lx = stick.ly = stick.rx = stick.ry = 0;
      return;
    }
    padIndex = gp.index; padId = gp.id;
    for (let i = 0; i < PAD.length; i++) {
      const b = gp.buttons[i];
      // triggers are analog: a light squeeze counts
      const on = !!b && (b.pressed || b.value > (i === 6 || i === 7 ? 0.3 : 0.5));
      const c = PAD[i];
      if (on && !down.has(c)) { pressed.add(c); setDevice('pad'); }
      if (!on && down.has(c)) released.add(c);
      if (on) down.add(c); else down.delete(c);
    }
    const ax = gp.axes;
    [stick.lx, stick.ly] = deadzone(ax[0] || 0, ax[1] || 0, 0.17);
    [stick.rx, stick.ry] = deadzone(ax[2] || 0, ax[3] || 0, 0.13, 0.95);
    if (Math.hypot(stick.lx, stick.ly) > 0.25 || Math.hypot(stick.rx, stick.ry) > 0.25) setDevice('pad');
    // menus: the left stick as a d-pad, with key-repeat
    const nx = Math.abs(stick.lx) > 0.6 ? Math.sign(stick.lx) : 0, ny = Math.abs(stick.ly) > 0.6 ? Math.sign(stick.ly) : 0;
    const nav = nx ? (nx > 0 ? 'NavRight' : 'NavLeft') : ny ? (ny > 0 ? 'NavDown' : 'NavUp') : null;
    if (nav !== navHeld) { navHeld = nav; navRepeat = 0.38; if (nav) pressed.add(nav); }
    else if (nav && (navRepeat -= dt) <= 0) { navRepeat = 0.12; pressed.add(nav); }
  },

  lock() { if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (e) { /* needs a user gesture */ } } },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  get locked() { return document.pointerLockElement === canvas; },
  get device() { return device; },
  get padName() { return padId; },
  get padConnected() { return padIndex >= 0; },
  onDevice(f) { listeners.add(f); },
  down: c => down.has(c),
  pressed: c => pressed.has(c),
  released: c => released.has(c),
  any: (...cs) => cs.some(c => down.has(c)),
  anyPressed: (...cs) => cs.some(c => pressed.has(c)),
  stick: () => stick,
  mouse() { const r = [mdx, mdy]; mdx = mdy = 0; return r; },
  wheel() { const w = wheel; wheel = 0; return w; },
  endFrame() { pressed.clear(); released.clear(); },
  forceDown(c) { if (!down.has(c)) pressed.add(c); down.add(c); },
  forceUp(c) { down.delete(c); released.add(c); },
  press(c) { pressed.add(c); },
  // a menu used this press: don't let it also act in the game this frame
  consume(...cs) { for (const c of cs) pressed.delete(c); },

  // DualSense / Xbox rumble; a new buzz only cuts in if it's clearly stronger
  // than the one still playing, so a flurry of small hits doesn't stutter
  rumble(strong, weak = strong, ms = 120) {
    if (device !== 'pad' || padIndex < 0) return;
    const now = performance.now(), lvl = Math.max(strong, weak);
    if (now < rumbleUntil && lvl <= rumbleLevel * 1.1) return;
    const a = navigator.getGamepads?.()[padIndex]?.vibrationActuator;
    if (!a?.playEffect) return;
    rumbleUntil = now + ms; rumbleLevel = lvl;
    a.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch?.(() => {});
  },
};
