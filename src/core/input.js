// Keyboard + mouse input with edge-triggered presses and pointer-lock look.
const down = new Set();
const pressed = new Set();
const released = new Set();
let mdx = 0, mdy = 0, wheel = 0;
let canvas;

export const input = {
  init(el) {
    canvas = el;
    addEventListener('keydown', e => {
      if (['Space', 'Tab', 'ShiftLeft', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!down.has(e.code)) pressed.add(e.code);
      down.add(e.code);
    });
    addEventListener('keyup', e => { down.delete(e.code); released.add(e.code); });
    addEventListener('mousedown', e => {
      if (e.button === 1) e.preventDefault();
      const c = 'Mouse' + e.button;
      if (!down.has(c)) pressed.add(c);
      down.add(c);
    });
    addEventListener('mouseup', e => { const c = 'Mouse' + e.button; down.delete(c); released.add(c); });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
    addEventListener('wheel', e => { wheel += e.deltaY; }, { passive: true });
    addEventListener('blur', () => down.clear());
  },
  lock() { if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (e) { /* needs a user gesture */ } } },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  get locked() { return document.pointerLockElement === canvas; },
  down: c => down.has(c),
  pressed: c => pressed.has(c),
  released: c => released.has(c),
  any: (...cs) => cs.some(c => down.has(c)),
  anyPressed: (...cs) => cs.some(c => pressed.has(c)),
  mouse() { const r = [mdx, mdy]; mdx = mdy = 0; return r; },
  wheel() { const w = wheel; wheel = 0; return w; },
  endFrame() { pressed.clear(); released.clear(); },
  forceDown(c) { if (!down.has(c)) pressed.add(c); down.add(c); },
  forceUp(c) { down.delete(c); released.add(c); },
  press(c) { pressed.add(c); },
};
