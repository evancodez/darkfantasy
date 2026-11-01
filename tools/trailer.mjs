// Records the gameplay trailer in a headless Chrome (no throttling, real audio).
//   node tools/trailer.mjs preview <outDir> [clip,clip...]   → review stills
//   node tools/trailer.mjs record  <outFile>                  → the video
// Needs the game served on http://localhost:5190 (npm start).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [mode = 'preview', out = 'trailer-out', onlyArg] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'grimhold-trailer-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1280,720',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// tap the game's audio output so MediaRecorder can capture it
const SHIM = `(() => {
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    constructor(o) { super(o); window.__recDest = this.createMediaStreamDestination(); const tap = this.createGain(); tap.connect(super.destination); tap.connect(window.__recDest); this.__tap = tap; }
    get destination() { return this.__tap || super.destination; }
  };
})();`;

let ws, id = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}

try {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch { /* starting */ } await sleep(200); }
  const page = targets.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
  await send('Page.navigate', { url: 'http://localhost:5190/?autostart' });
  for (let i = 0; i < 200; i++) { await sleep(250); try { if (await evaluate('!!(window.game && window.game.started)')) break; } catch { /* loading */ } }
  console.log('webgl:', await evaluate(`(() => { const gl = document.querySelector('#game canvas').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`));
  const only = onlyArg ? JSON.stringify(onlyArg.split(',')) : 'null';
  const t0 = Date.now();
  const cap = await evaluate(`import('/test/trailer.js').then(m => m.capture({ only: ${only}, every: ${mode === 'preview' ? 5 : 1} }))`);
  console.log('captured', cap.frames, 'frames,', cap.sounds, 'sounds in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  console.log(cap.log.join('\n'));
  if (mode === 'preview') {
    mkdirSync(out, { recursive: true });
    for (let i = 0; i < cap.frames; i++) {
      const b64 = await evaluate(`import('/test/trailer.js').then(m => m.frameB64(${i}))`);
      writeFileSync(join(out, `f${String(i).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
    }
    console.log('wrote stills to', out);
  } else {
    const r = await evaluate(`import('/test/trailer.js').then(m => m.record({ track: 'boss' }))`);
    console.log('recorded', r);
    const parts = [];
    for (let i = 0; ; i++) { const c = await evaluate(`import('/test/trailer.js').then(m => m.videoChunk(${i}))`); parts.push(Buffer.from(c.b64, 'base64')); if (c.done) break; }
    const ext = r.mime.includes('mp4') ? '.mp4' : '.webm';
    const file = out.replace(/\.(mp4|webm)$/, '') + ext;
    writeFileSync(file, Buffer.concat(parts));
    console.log('wrote', file);
  }
} catch (e) {
  console.error('FAILED', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* */ }
  chrome.kill();
}
