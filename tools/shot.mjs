// Full-resolution screenshots from a headless Chrome, for look-dev and reviews.
//   node tools/shot.mjs <url> <outDir> <steps.json> [width height]
// steps.json: [{ "eval": "js (awaited, may return a value)", "shot": "name.png" }, ...]
// Needs the game served on http://localhost:5190 (npm start).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out = 'shots', stepsFile, w = '1280', h = '720'] = process.argv.slice(2);
const steps = stepsFile ? JSON.parse(readFileSync(stepsFile, 'utf8')) : [{ shot: 'shot.png' }];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9335 + Math.floor(Math.random() * 40);
const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'grimhold-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ws, id = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}

try {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch { /* starting */ } await sleep(200); }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 200; i++) { await sleep(250); try { if (await evaluate('return document.readyState === "complete" && !!document.querySelector("canvas") && (!window.game || window.game.started || !location.search.includes("autostart"))')) break; } catch { /* loading */ } }
  await sleep(600);
  mkdirSync(out, { recursive: true });
  for (const s of steps) {
    if (s.eval) { const v = await evaluate(s.eval); if (v !== undefined) console.log(JSON.stringify(v)); }
    if (s.wait) await sleep(s.wait);
    if (s.shot) {
      await sleep(80);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(out, s.shot), Buffer.from(r.data, 'base64'));
      console.log('shot', join(out, s.shot));
    }
  }
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
} catch (e) {
  console.error('FAILED', e.message);
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* */ }
  chrome.kill();
}
