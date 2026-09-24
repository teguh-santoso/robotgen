import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { KID } from '../core/Config';
import { clamp, damp, dampAngle } from '../core/MathUtils';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

const ORBIT_RATE = 2.6;
const ORBIT_PITCH_RATE = 1.6;
const FOLLOW_LAMBDA = 1 / KID.cameraFollowLag;
const PIVOT_LAMBDA = 14;
const PULL_IN_LAMBDA = 26;
const PULL_OUT_LAMBDA = 4;
const MIN_DISTANCE = 1.4;

const MIN_PITCH = MathUtils.degToRad(KID.cameraMinPitchDeg);
const MAX_PITCH = MathUtils.degToRad(KID.cameraMaxPitchDeg);
const REST_PITCH = MathUtils.degToRad(KID.cameraPitchDeg);

/**
 * Follow camera with no mouse input at all. The yaw trails the robot so a child
 * always sees it from behind; if they do grab the orbit control the camera
 * hands back control automatically a couple of seconds later.
 */
export class FollowCamera {
  readonly camera: PerspectiveCamera;

  private yaw = 0;
  private pitch = REST_PITCH;
  private manualHold = 0;
  private currentDistance = KID.cameraDistance;

  private readonly pivotTarget = new Vector3();
  private readonly pivot = new Vector3();
  /** Unit vector from the pivot toward the camera. */
  private readonly offset = new Vector3();

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(55, aspect, 0.1, 220);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Horizontal yaw of the camera's view direction, used for camera-relative movement. */
  get movementYaw(): number {
    return this.yaw;
  }

  /** Snaps the camera behind the robot, e.g. after a respawn. */
  reset(robotPosition: Vector3, robotYaw: number): void {
    this.yaw = robotYaw;
    this.pitch = REST_PITCH;
    this.manualHold = 0;
    this.currentDistance = KID.cameraDistance;
    this.pivotTarget.set(
      robotPosition.x,
      robotPosition.y + KID.cameraPivotY,
      robotPosition.z,
    );
    this.pivot.copy(this.pivotTarget);
    this.applyOffset();
  }

  update(
    dt: number,
    orbitX: number,
    orbitY: number,
    robotPosition: Vector3,
    robotYaw: number,
    physics: PhysicsWorld,
    exclude: RigidBody,
  ): void {
    const orbiting = Math.abs(orbitX) > 0.02 || Math.abs(orbitY) > 0.02;
    this.manualHold = orbiting ? KID.cameraManualHold : Math.max(0, this.manualHold - dt);

    if (orbiting) {
      this.yaw -= orbitX * ORBIT_RATE * dt;
      this.pitch = clamp(this.pitch + orbitY * ORBIT_PITCH_RATE * dt, MIN_PITCH, MAX_PITCH);
    } else if (this.manualHold <= 0) {
      this.yaw = dampAngle(this.yaw, robotYaw, FOLLOW_LAMBDA, dt);
      this.pitch = damp(this.pitch, REST_PITCH, 1.2, dt);
    }

    this.pivotTarget.set(
      robotPosition.x,
      robotPosition.y + KID.cameraPivotY,
      robotPosition.z,
    );
    this.pivot.lerp(this.pivotTarget, 1 - Math.exp(-PIVOT_LAMBDA * dt));

    this.applyOffset();
    this.avoidGeometry(physics, exclude, dt);
  }

  private applyOffset(): void {
    const horizontal = Math.cos(this.pitch);
    this.offset.set(
      -Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * horizontal,
    );
  }

  private avoidGeometry(physics: PhysicsWorld, exclude: RigidBody, dt: number): void {
    const wantDistance = KID.cameraDistance;
    const hit = physics.castRay(
      this.pivot,
      this.offset,
      wantDistance + 0.4,
      exclude,
    );
    const allowed = hit ? Math.max(hit.distance - 0.3, MIN_DISTANCE) : wantDistance;
    // Snap inward quickly so we never clip, ease back out gently.
    const lambda = allowed < this.currentDistance ? PULL_IN_LAMBDA : PULL_OUT_LAMBDA;
    this.currentDistance = damp(this.currentDistance, allowed, lambda, dt);

    this.camera.position.copy(this.pivot).addScaledVector(this.offset, this.currentDistance);
    this.camera.lookAt(this.pivot);
  }
}
