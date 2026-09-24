import { Quaternion, Vector3 } from 'three';
import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import { MOVE, ROBOT } from '../core/Config';
import { clamp, dampAngle, lerpAngle } from '../core/MathUtils';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RapierModule } from '../physics/rapier';

const UP = new Vector3(0, 1, 0);
const MAX_FALL_SPEED = 26;
const GROUND_STICK = -0.6;
const DEG = Math.PI / 180;
/** Small skin around the capsule so it never wedges in a corner. */
const CONTROLLER_OFFSET = 0.02;
const STEP_HEIGHT = 0.35;
const STEP_MIN_WIDTH = 0.2;
const SNAP_TO_GROUND = 0.4;
const MAX_CLIMB = 50 * DEG;
const MIN_SLIDE = 40 * DEG;

/**
 * The robot's physical presence: a capsule moved by Rapier's kinematic
 * character controller. It can never topple or get wedged, but it still slides
 * along walls, climbs stairs, snaps to the ground, and shoves the toys around.
 */
export class RobotBody {
  readonly body: RigidBody;
  readonly collider: Collider;

  readonly position = new Vector3();
  readonly previousPosition = new Vector3();
  readonly velocity = new Vector3();
  readonly rotation = new Quaternion();

  yaw: number;
  previousYaw: number;
  grounded = false;
  justJumped = false;
  justLanded = false;
  turnSpeed = 0;

  private verticalVelocity = 0;
  private wasGrounded = true;
  private readonly controller: KinematicCharacterController;
  private readonly spin = new Quaternion();

  constructor(
    R: RapierModule,
    physics: PhysicsWorld,
    start: Vector3,
    yaw: number,
  ) {
    this.controller = physics.world.createCharacterController(CONTROLLER_OFFSET);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(MAX_CLIMB);
    this.controller.setMinSlopeSlideAngle(MIN_SLIDE);
    // includeDynamicBodies = false: the robot pushes toys around instead of
    // climbing on top of them, which is the fun part.
    this.controller.enableAutostep(STEP_HEIGHT, STEP_MIN_WIDTH, false);
    this.controller.enableSnapToGround(SNAP_TO_GROUND);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(ROBOT.mass);

    this.yaw = yaw;
    this.previousYaw = yaw;

    const desc = R.RigidBodyDesc.kinematicPositionBased().setTranslation(
      start.x,
      start.y,
      start.z,
    );
    this.body = physics.world.createRigidBody(desc);
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(ROBOT.capsule.halfHeight, ROBOT.capsule.radius).setFriction(0.2),
      this.body,
    );

    this.position.copy(start);
    this.previousPosition.copy(start);
  }

  /**
   * Works out this tick's movement and hands it to the character controller.
   * Must run before `physics.step()`; the result lands in the body's next
   * kinematic position.
   */
  step(dt: number, desiredVelocity: Vector3, targetYaw: number, jump: boolean): void {
    this.previousPosition.copy(this.position);
    this.previousYaw = this.yaw;
    this.justJumped = false;
    this.justLanded = false;

    const yawBefore = this.yaw;
    this.yaw = dampAngle(this.yaw, targetYaw, MOVE.turnRate, dt);
    this.turnSpeed = (this.yaw - yawBefore) / dt;

    if (jump && this.grounded) {
      this.verticalVelocity = MOVE.jumpSpeed;
      this.grounded = false;
      this.justJumped = true;
    }

    this.verticalVelocity = Math.max(
      this.verticalVelocity + MOVE.gravity * dt,
      -MAX_FALL_SPEED,
    );

    this.spin.setFromAxisAngle(UP, this.yaw);
    this.body.setNextKinematicRotation({
      x: this.spin.x,
      y: this.spin.y,
      z: this.spin.z,
      w: this.spin.w,
    });

    this.controller.computeColliderMovement(this.collider, {
      x: desiredVelocity.x * dt,
      y: this.verticalVelocity * dt,
      z: desiredVelocity.z * dt,
    });
    const movement = this.controller.computedMovement();

    const current = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: current.x + movement.x,
      y: current.y + movement.y,
      z: current.z + movement.z,
    });

    // `computedGrounded` describes the movement we just resolved, so it is read
    // here and consumed on the next tick.
    const groundedNow = this.controller.computedGrounded();
    if (groundedNow && !this.wasGrounded) this.justLanded = true;
    this.wasGrounded = groundedNow;
    this.grounded = groundedNow;

    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = GROUND_STICK;

    this.velocity.set(movement.x / dt, 0, movement.z / dt);
  }

  /** Reads the transform the controller just applied. Call after `physics.step()`. */
  syncTransform(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.position.set(t.x, t.y, t.z);
    this.rotation.set(r.x, r.y, r.z, r.w);
  }

  /** Interpolated pose for rendering, so motion stays smooth between ticks. */
  samplePose(alpha: number, outPosition: Vector3): number {
    const t = clamp(alpha, 0, 1);
    outPosition.lerpVectors(this.previousPosition, this.position, t);
    return lerpAngle(this.previousYaw, this.yaw, t);
  }

  teleport(position: Vector3, yaw: number): void {
    this.spin.setFromAxisAngle(UP, yaw);
    this.verticalVelocity = 0;
    this.yaw = yaw;
    this.previousYaw = yaw;
    this.position.copy(position);
    this.previousPosition.copy(position);
    this.velocity.set(0, 0, 0);
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setRotation(
      { x: this.spin.x, y: this.spin.y, z: this.spin.z, w: this.spin.w },
      true,
    );
  }
}
