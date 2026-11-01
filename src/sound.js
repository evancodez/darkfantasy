// Thin wrapper over audio.js so the game runs (silently) even if the sound
// module fails to load; requests made before it loads are replayed.
let impl = null, pendingMusic, inited = false;
const loops = new Map();
const api = {
  init() { inited = true; impl?.init(); },
  play(name, o) { try { impl?.play(name, o); } catch (e) { /* ignore */ } },
  music(t) { pendingMusic = t; try { impl?.music(t); } catch (e) { /* ignore */ } },
  startLoop(n, o) { loops.set(n, o || {}); try { impl?.startLoop(n, o); } catch (e) { /* ignore */ } },
  stopLoop(n) { loops.delete(n); try { impl?.stopLoop(n); } catch (e) { /* ignore */ } },
  setLoopVolume(n, v) { try { impl?.setLoopVolume?.(n, v); } catch (e) { /* ignore */ } },
  duck(a, s) { try { impl?.duck?.(a, s); } catch (e) { /* ignore */ } },
  setMasterVolume(v) { try { impl?.setMasterVolume?.(v); } catch (e) { /* ignore */ } },
};
import('./audio.js').then(m => {
  impl = m.default || m;
  if (inited) impl.init();
  if (pendingMusic !== undefined) impl.music(pendingMusic);
  for (const [n, o] of loops) impl.startLoop(n, o);
}).catch(e => console.warn('audio unavailable', e));
export default api;
