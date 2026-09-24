import { Vector3 } from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { GAIT, ROBOT } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FootPlan } from './Gait';

const PROBE_UP = 0.9;
const PROBE_DOWN = 2.2;

export interface FootResolution {
  position: Vector3;
  normal: Vector3;
}

export function createFootResolution(): FootResolution {
  return { position: new Vector3(), normal: new Vector3(0, 1, 0) };
}

/**
 * Drops a vertical ray under a planned foot position so the foot rests on the
 * real surface rather than a flat assumption. This is what lets the robot keep
 * its soles flat while climbing the ramp and the stairs.
 */
export class FootPlacement {
  private readonly probe = new Vector3();

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly exclude: RigidBody,
  ) {}

  resolve(plan: FootPlan, out: FootResolution): void {
    this.probe.set(plan.target.x, plan.target.y + PROBE_UP, plan.target.z);
    const hit = this.physics.castRayDown(this.probe, PROBE_UP + PROBE_DOWN, this.exclude);

    if (hit) {
      // The target is the ankle joint, which sits one ankle-height above the
      // sole, so the sole lands exactly on the surface.
      out.position.set(
        plan.target.x,
        hit.point.y + ROBOT.ankleHeight + GAIT.footGroundOffset + plan.lift,
        plan.target.z,
      );
      out.normal.copy(hit.normal);
    } else {
      out.position.set(plan.target.x, plan.target.y + plan.lift, plan.target.z);
      out.normal.set(0, 1, 0);
    }
  }
}
