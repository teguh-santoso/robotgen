import { Vector3 } from 'three';
import type { Object3D } from 'three';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import { FIXED_DT } from '../core/Loop';
import { WORLD_GRAVITY } from '../core/Config';
import type { RapierModule } from './rapier';

export interface RayHit {
  distance: number;
  point: Vector3;
  normal: Vector3;
}

interface MeshSyncEntry {
  mesh: Object3D;
  body: RigidBody;
}

const DOWN = new Vector3(0, -1, 0);

/**
 * Thin wrapper around the Rapier world: fixed timestep, a mesh<->body sync list,
 * and the ray queries the robot and camera rely on.
 */
export class PhysicsWorld {
  readonly world: World;
  private readonly R: RapierModule;
  private readonly syncList: MeshSyncEntry[] = [];

  constructor(R: RapierModule) {
    this.R = R;
    this.world = new R.World({ x: 0, y: WORLD_GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;
  }

  step(): void {
    this.world.step();
  }

  addMeshSync(mesh: Object3D, body: RigidBody): void {
    this.syncList.push({ mesh, body });
  }

  removeMeshSync(mesh: Object3D): void {
    const index = this.syncList.findIndex((entry) => entry.mesh === mesh);
    if (index >= 0) this.syncList.splice(index, 1);
  }

  syncMeshes(): void {
    for (const { mesh, body } of this.syncList) {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  castRay(
    origin: Vector3,
    dir: Vector3,
    maxDist: number,
    excludeBody?: RigidBody,
  ): RayHit | null {
    const ray = new this.R.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      undefined,
      undefined,
      undefined,
      excludeBody,
    );
    if (!hit) return null;
    const toi = hit.timeOfImpact;
    return {
      distance: toi,
      point: origin.clone().addScaledVector(dir, toi),
      normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  castRayDown(origin: Vector3, maxDist: number, excludeBody?: RigidBody): RayHit | null {
    return this.castRay(origin, DOWN, maxDist, excludeBody);
  }

  dispose(): void {
    this.syncList.length = 0;
    this.world.free();
  }
}
