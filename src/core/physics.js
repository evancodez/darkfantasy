// Thin wrapper around Rapier: static level colliders, kinematic moving
// platforms, kinematic character controllers and ray casts.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export let world;
const WORLD_GROUP = (0x0001 << 16) | 0xffff;     // static level geometry
const PLATFORM_GROUP = (0x0004 << 16) | 0xffff;  // moving platforms, doors
const CHAR_GROUP = (0x0002 << 16) | 0x0005;      // characters: collide with level + platforms
const STATIC_QUERY = (0x0002 << 16) | 0x0001;    // rays that ignore moving things (camera)
const platforms = [];

export async function initPhysics() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
}

export function step() { world.step(); }

export function addBox(pos, half, rotY = 0, rot = null) {
  const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(pos.x, pos.y, pos.z).setCollisionGroups(WORLD_GROUP);
  const q = rot || new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  return world.createCollider(desc);
}
export function addCylinder(pos, halfH, r) {
  return world.createCollider(RAPIER.ColliderDesc.cylinder(halfH, r).setTranslation(pos.x, pos.y, pos.z).setCollisionGroups(WORLD_GROUP));
}
export function addBall(pos, r) {
  return world.createCollider(RAPIER.ColliderDesc.ball(r).setTranslation(pos.x, pos.y, pos.z).setCollisionGroups(WORLD_GROUP));
}
// Build a static trimesh from a (world-transformed) three.js geometry.
export function addTrimesh(geometry, matrix = null) {
  const g = geometry.index ? geometry : geometry.clone();
  const pos = g.attributes.position;
  const verts = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (matrix) v.applyMatrix4(matrix); verts.set([v.x, v.y, v.z], i * 3); }
  let idx;
  if (g.index) idx = new Uint32Array(g.index.array);
  else { idx = new Uint32Array(pos.count); for (let i = 0; i < pos.count; i++) idx[i] = i; }
  return world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx).setCollisionGroups(WORLD_GROUP));
}

// A moving/rotating platform: kinematic body + cuboid collider; the caller
// sets its pose every frame via setPose().
// (round platforms: pass { radius } and half.y as the half-height)
export function addPlatform(half, mesh, { radius = 0 } = {}) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z));
  const shape = radius ? RAPIER.ColliderDesc.cylinder(half.y, radius) : RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z);
  const col = world.createCollider(shape.setCollisionGroups(PLATFORM_GROUP), body);
  const p = {
    body, col, mesh, prev: mesh.position.clone(), prevQuat: mesh.quaternion.clone(), delta: new THREE.Vector3(), yawDelta: 0,
    setPose(pos, quat) {
      this.prev.copy(this.mesh.position); this.prevQuat.copy(this.mesh.quaternion);
      this.mesh.position.copy(pos); if (quat) this.mesh.quaternion.copy(quat);
      body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
      if (quat) body.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
      this.delta.copy(pos).sub(this.prev);
    },
  };
  platforms.push(p);
  return p;
}
export function platformByCollider(handle) { return platforms.find(p => p.col.handle === handle); }

export function createCharacter(radius, halfHeight, pos) {
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius).setTranslation(pos.x, pos.y + halfHeight + radius, pos.z).setCollisionGroups(CHAR_GROUP));
  const ctrl = world.createCharacterController(0.03);
  ctrl.enableAutostep(0.45, 0.25, false);
  ctrl.enableSnapToGround(0.35);
  ctrl.setMaxSlopeClimbAngle(52 * Math.PI / 180);
  ctrl.setMinSlopeSlideAngle(60 * Math.PI / 180);
  ctrl.setApplyImpulsesToDynamicBodies(false);
  const off = halfHeight + radius;
  const out = new THREE.Vector3();
  return {
    col, ctrl, radius, halfHeight,
    // move by desired delta, returns {grounded, groundPlatform}
    move(delta, position) {
      ctrl.computeColliderMovement(col, { x: delta.x, y: delta.y, z: delta.z }, undefined, CHAR_GROUP);
      const m = ctrl.computedMovement();
      const t = col.translation();
      col.setTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
      position.set(t.x + m.x, t.y + m.y - off, t.z + m.z);
      let platform = null, hitCeiling = false, wall = false;
      for (let i = 0; i < ctrl.numComputedCollisions(); i++) {
        const c = ctrl.computedCollision(i);
        if (!c || !c.collider) continue;
        if (c.normal1.y > 0.5) { const p = platformByCollider(c.collider.handle); if (p) platform = p; }
        if (c.normal1.y < -0.5) hitCeiling = true;
        if (Math.abs(c.normal1.y) < 0.3) wall = true;
      }
      out.set(m.x, m.y, m.z);
      return { grounded: ctrl.computedGrounded(), platform, hitCeiling, wall, moved: out };
    },
    teleport(p) { col.setTranslation({ x: p.x, y: p.y + off, z: p.z }); },
    // ground probe under the feet (used to find moving platforms while standing still)
    probeGround(position, dist = 0.25) {
      const ray = new RAPIER.Ray({ x: position.x, y: position.y + 0.1, z: position.z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, dist + 0.1, true, undefined, CHAR_GROUP);
      return hit ? { collider: hit.collider, toi: hit.timeOfImpact, platform: platformByCollider(hit.collider.handle) } : null;
    },
  };
}

let _ray;
export function raycast(origin, dir, maxDist, staticOnly = false) {
  _ray ||= new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  _ray.origin = { x: origin.x, y: origin.y, z: origin.z };
  _ray.dir = { x: dir.x, y: dir.y, z: dir.z };
  const hit = world.castRay(_ray, maxDist, true, undefined, staticOnly ? STATIC_QUERY : CHAR_GROUP);
  return hit ? hit.timeOfImpact : null;
}
