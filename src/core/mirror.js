// A planar mirror for still water and glass floors: the scene is drawn a
// second time from a camera flipped under the plane (at half the game's
// already-low resolution, so the reflection stays chunky), then projected
// back onto the surface with ripple distortion, an oil-slick sheen and
// glitter. Same maths as three's Reflector, trimmed to what we need.
import * as THREE from 'three';
import { G } from './retro.js';

const VERT = /* glsl */`
uniform mat4 uTexMat; uniform float uFogNear, uFogFar;
varying vec4 vProj; varying vec3 vWorld; varying float vFog;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.);
  vWorld = wp.xyz;
  vProj = uTexMat * vec4(position, 1.);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vFog = clamp((length(mv.xyz) - uFogNear) / (uFogFar - uFogNear), 0., 1.);
}`;

const FRAG = /* glsl */`
uniform sampler2D tMirror; uniform float uTime, uSheen, uEtch, uFogAmt;
uniform vec3 uTint, uFogColor, uCenter, uEtchColor; uniform vec4 uRip[8];
varying vec4 vProj; varying vec3 vWorld; varying float vFog;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  // footstep ripples: rings that run outward and fade
  vec2 off = vec2(0.); float rim = 0.;
  for (int i = 0; i < 8; i++) {
    vec4 r = uRip[i];
    if (r.w < 0. || r.w > 2.5) continue;
    vec2 d = vWorld.xz - r.xz; float l = length(d) + 1e-3;
    float rad = r.w * 3.2, k = exp(-abs(l - rad) * 4.) * exp(-r.w * 1.6);
    off += d / l * k * .035; rim += k;
  }
  // a slow dream-swell so the mirror never looks quite like glass
  off += vec2(sin(vWorld.x * .13 + uTime * .7 + sin(vWorld.z * .07)), cos(vWorld.z * .11 + uTime * .6)) * .004;
  vec4 pr = vProj; pr.xy += off * pr.w;
  vec3 c = texture2DProj(tMirror, pr).rgb * uTint;
  // oil-slick sheen that grows at grazing angles
  vec3 V = normalize(cameraPosition - vWorld);
  float f = pow(1. - clamp(V.y, 0., 1.), 3.);
  vec3 irid = vec3(.62, .55, .95) + vec3(.38, .4, .25) * cos(6.2831 * (vec3(0., .12, .28) + f * 1.2 + (vWorld.x + vWorld.z) * .006 + uTime * .04));
  c += irid * (f * uSheen + rim * .25);
  // a mandala etched into the glass, pulsing outward from the centre
  vec2 q = vWorld.xz - uCenter.xz; float rr = length(q), a = atan(q.y, q.x);
  float rings = smoothstep(.12, 0., abs(fract(rr / 7. - uTime * .03) - .5) - .44);
  float spokes = smoothstep(.02, 0., abs(fract(a / 6.2831 * 24.) - .5) - .48) * step(9., rr) * step(mod(floor(rr / 7. - uTime * .03), 2.), .5);
  c += uEtchColor * (rings + spokes * .6) * uEtch * (.6 + .4 * sin(uTime * 1.3 + rr * .2));
  // glitter: sparse cells that twinkle
  vec2 cell = floor(vWorld.xz * 2.2);
  float g = h21(cell); float tw = pow(max(0., sin(uTime * (1.5 + g * 3.) + g * 40.)), 24.);
  c += vec3(.8, .9, 1.) * step(.94, g) * tw * .9;
  c = mix(c, uFogColor, vFog * uFogAmt);
  gl_FragColor = vec4(c, 1.);
}`;

export function createMirror(geometry, { res = 0.5, tint = 0x9aa8ff, sheen = 0.22, etch = 0.12, etchColor = 0x8a7aff, center = new THREE.Vector3(), fog = 0.7, clipBias = 0.02 } = {}) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const texMat = new THREE.Matrix4();
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      tMirror: { value: rt.texture }, uTexMat: { value: texMat },
      uTime: G.uTime, uFogColor: G.uFogColor, uFogNear: G.uFogNear, uFogFar: G.uFogFar, uFogAmt: { value: fog },
      uTint: { value: new THREE.Color(tint) }, uSheen: { value: sheen }, uEtch: { value: etch }, uEtchColor: { value: new THREE.Color(etchColor) },
      uCenter: { value: center.clone() }, uRip: { value: ripples },
    },
  });
  const mesh = new THREE.Mesh(geometry, mat);
  const cam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(), normal = new THREE.Vector3(), mirrorPos = new THREE.Vector3(), camPos = new THREE.Vector3();
  const rot = new THREE.Matrix4(), look = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3();
  const clip = new THREE.Vector4(), q = new THREE.Vector4(), size = new THREE.Vector2();
  let nextRip = 0;

  mesh.onBeforeRender = (renderer, scene, camera) => {
    mirrorPos.setFromMatrixPosition(mesh.matrixWorld);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(mesh.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rot);
    view.subVectors(mirrorPos, camPos);
    if (view.dot(normal) > 0) return;                  // looking at the back
    view.reflect(normal).negate().add(mirrorPos);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(mirrorPos, look).reflect(normal).negate().add(mirrorPos);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    cam.lookAt(target);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMat.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // oblique near plane: nothing under the water ends up in the reflection
    plane.setFromNormalAndCoplanarPoint(normal, mirrorPos).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = cam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + e[8]) / e[0];
    q.y = (Math.sign(clip.y) + e[9]) / e[5];
    q.z = -1; q.w = (1 + e[10]) / e[14];
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - clipBias; e[14] = clip.w;
    // size the reflection off whatever we're drawing into
    const cur = renderer.getRenderTarget();
    if (cur) size.set(cur.width, cur.height); else renderer.getDrawingBufferSize(size);
    const w = Math.max(8, Math.round(size.x * res)), h = Math.max(8, Math.round(size.y * res));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    mesh.visible = false;
    renderer.setRenderTarget(rt);
    renderer.state.buffers.depth.setMask(true);
    renderer.render(scene, cam);
    renderer.setRenderTarget(cur);
    mesh.visible = true;
  };

  return {
    mesh, material: mat,
    // a ring that runs outward from a footstep or an impact
    ripple(pos, strength = 1) { ripples[nextRip].set(pos.x, pos.y, pos.z, strength >= 1 ? 0 : 1 - strength); nextRip = (nextRip + 1) % 8; },
    update(dt) { for (const r of ripples) if (r.w >= 0) { r.w += dt; if (r.w > 2.5) r.w = -1; } },
  };
}
