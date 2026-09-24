import { Matrix4, Quaternion, Vector3 } from 'three';
import { GAIT, KID, MOVE, ROBOT } from '../core/Config';
import { clamp, damp } from '../core/MathUtils';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RapierModule } from '../physics/rapier';
import { createFootResolution, FootPlacement } from './FootPlacement';
import type { FootResolution } from './FootPlacement';
import { Gait } from './Gait';
import { createLegSolution, solveLeg } from './LegIK';
import type { LegSolution } from './LegIK';
import { RobotBody } from './RobotBody';
import { RobotRig } from './RobotRig';
import type { LegJoints } from './RobotRig';

const TAU = Math.PI * 2;
const X_AXIS = new Vector3(1, 0, 0);
const FORWARD_LOCAL = new Vector3(0, 0, 1);
/** How far below the body centre the feet tuck while airborne or dancing. */
const TUCK_DROP = 0.58;

export type LegSide = 'left' | 'right';

/**
 * Ties the rig, the character controller, the gait and the IK together.
 *
 * Order matters and is split across the physics step:
 *   prePhysics  -> turn input into velocity, hand it to the character controller
 *   (physics.step runs here)
 *   postPhysics -> read the resulting transform, advance the gait, drop the feet
 *   renderUpdate-> interpolate the root, then solve the IK at the render pose
 *
 * The IK deliberately runs in the render phase: solving it per tick and
 * interpolating the joints afterwards makes the feet jitter between ticks.
 */
export class RobotController {
  readonly rig = new RobotRig();
  readonly body: RobotBody;
  readonly gait = new Gait();

  onFootstep?: (side: LegSide) => void;
  onJump?: () => void;
  onLand?: () => void;

  private readonly placement: FootPlacement;
  private readonly spawn: Vector3;
  private readonly spawnYaw: number;
  private readonly safeSpot = new Vector3();
  private safeSpotReady = false;
  private safeTimer = 0;

  private readonly leftSolution = createLegSolution();
  private readonly rightSolution = createLegSolution();
  private readonly leftFoot = createFootResolution();
  private readonly rightFoot = createFootResolution();
  private readonly leftFootPrev = createFootResolution();
  private readonly rightFootPrev = createFootResolution();

  private readonly desiredVelocity = new Vector3();
  private readonly smoothedVelocity = new Vector3();
  private readonly base = new Vector3();
  private readonly renderPosition = new Vector3();
  private readonly resolvedPosition = new Vector3();
  private readonly resolvedNormal = new Vector3();

  private readonly pelvisQuat = new Quaternion();
  private readonly shinLocalQuat = new Quaternion();
  private readonly shinWorldQuat = new Quaternion();
  private readonly footWorldQuat = new Quaternion();
  private readonly ankleQuat = new Quaternion();
  private readonly rollQuat = new Quaternion();
  private readonly basis = new Matrix4();
  private readonly footLocal = new Vector3();
  private readonly forwardWorld = new Vector3();
  private readonly lateralWorld = new Vector3();

  private targetYaw: number;
  private elapsed = 0;
  private landingSquash = 0;
  private dancing = false;
  private danceTime = 0;

  constructor(R: RapierModule, physics: PhysicsWorld, start: Vector3, yaw: number) {
    this.spawn = start.clone();
    this.spawnYaw = yaw;
    this.targetYaw = yaw;
    this.safeSpot.copy(start);

    this.body = new RobotBody(R, physics, start, yaw);
    this.placement = new FootPlacement(physics, this.body.body);

    this.rig.root.position.set(start.x, start.y + ROBOT.rigYOffset, start.z);
    this.rig.root.rotation.y = yaw;
    this.gait.reset(start, yaw);
  }

  // --- simulation --------------------------------------------------------

  prePhysics(
    dt: number,
    moveX: number,
    moveY: number,
    jump: boolean,
    cameraYaw: number,
    locked: boolean,
  ): void {
    // Movement is relative to the camera, which is what makes a keyboard or a
    // single stick enough to steer.
    const forwardX = Math.sin(cameraYaw);
    const forwardZ = Math.cos(cameraYaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;

    let dirX = forwardX * moveY + rightX * moveX;
    let dirZ = forwardZ * moveY + rightZ * moveX;
    const magnitude = Math.hypot(dirX, dirZ);

    let desiredSpeed = 0;
    if (magnitude > 0.001 && !locked) {
      dirX /= magnitude;
      dirZ /= magnitude;
      const stick = Math.min(magnitude, 1);
      const runAt = GAIT.runInputThreshold;
      desiredSpeed =
        stick <= runAt
          ? (stick / runAt) * MOVE.walkSpeed
          : MOVE.walkSpeed + ((stick - runAt) / (1 - runAt)) * (MOVE.runSpeed - MOVE.walkSpeed);
    }

    this.desiredVelocity.set(dirX * desiredSpeed, 0, dirZ * desiredSpeed);
    const blend = 1 - Math.exp(-MOVE.velocityLambda * dt);
    this.smoothedVelocity.x += (this.desiredVelocity.x - this.smoothedVelocity.x) * blend;
    this.smoothedVelocity.z += (this.desiredVelocity.z - this.smoothedVelocity.z) * blend;

    if (desiredSpeed > 0.05) this.targetYaw = Math.atan2(dirX, dirZ);

    this.body.step(dt, this.smoothedVelocity, this.targetYaw, jump && !locked);
    if (this.body.justJumped) this.onJump?.();
  }

  postPhysics(dt: number): void {
    this.body.syncTransform();
    this.base.copy(this.body.position);

    copyResolution(this.leftFoot, this.leftFootPrev);
    copyResolution(this.rightFoot, this.rightFootPrev);

    const grounded = this.body.grounded && !this.dancing;
    this.gait.update(dt, {
      base: this.base,
      yaw: this.body.yaw,
      turnSpeed: this.body.turnSpeed,
      planarVelocity: this.body.velocity,
      grounded,
    });

    if (grounded) {
      this.placement.resolve(this.gait.left, this.leftFoot);
      this.placement.resolve(this.gait.right, this.rightFoot);
    } else {
      this.resolveTuck(this.rig.left.sign, this.leftFoot);
      this.resolveTuck(this.rig.right.sign, this.rightFoot);
    }

    if (grounded) {
      if (this.gait.left.justLanded) this.onFootstep?.('left');
      if (this.gait.right.justLanded) this.onFootstep?.('right');
      if (this.body.justLanded) {
        this.onLand?.();
        this.landingSquash = 1;
      }
    }

    if (this.body.grounded) {
      this.safeTimer += dt;
      if (this.safeTimer >= KID.safeSpotInterval) {
        this.safeTimer = 0;
        this.safeSpot.copy(this.body.position);
        this.safeSpotReady = true;
      }
    }
  }

  private resolveTuck(sign: number, out: FootResolution): void {
    const yaw = this.body.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    out.position.set(
      this.body.position.x + sin * 0.04 + cos * (sign * ROBOT.stanceWidth),
      this.body.position.y - TUCK_DROP,
      this.body.position.z + cos * 0.04 - sin * (sign * ROBOT.stanceWidth),
    );
    out.normal.set(0, 1, 0);
  }

  // --- presentation ------------------------------------------------------

  renderUpdate(alpha: number, dt: number): void {
    this.elapsed += dt;
    this.landingSquash = Math.max(0, this.landingSquash - dt * 3.4);
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.z);

    const yaw = this.body.samplePose(alpha, this.renderPosition);
    const root = this.rig.root;
    root.position.set(
      this.renderPosition.x,
      this.renderPosition.y + ROBOT.rigYOffset,
      this.renderPosition.z,
    );
    root.rotation.y = yaw;

    this.applyBodyMotion(speed, dt);
    root.updateMatrixWorld(true);

    interpolateResolution(this.leftFootPrev, this.leftFoot, alpha, this.resolvedPosition, this.resolvedNormal);
    const leftRoll = this.body.grounded ? this.gait.left.rollBias : -0.6;
    this.solveAndApply(this.rig.left, this.leftSolution, this.resolvedPosition, this.resolvedNormal, leftRoll, yaw);

    interpolateResolution(this.rightFootPrev, this.rightFoot, alpha, this.resolvedPosition, this.resolvedNormal);
    const rightRoll = this.body.grounded ? this.gait.right.rollBias : -0.6;
    this.solveAndApply(this.rig.right, this.rightSolution, this.resolvedPosition, this.resolvedNormal, rightRoll, yaw);

    if (this.dancing) {
      this.danceTime += dt;
      this.applyDance();
    } else {
      this.applyArms(speed, dt);
    }
  }

  private applyBodyMotion(speed: number, dt: number): void {
    const pelvis = this.rig.pelvis;
    const stepBob = this.body.grounded ? Math.sin(this.gait.cyclePhase * TAU * 2) * 0.012 : 0;
    const idleSway = Math.sin(this.elapsed * 1.8) * 0.006;
    pelvis.position.y = stepBob + idleSway - this.landingSquash * 0.07;

    const leanTarget = clamp(speed / MOVE.runSpeed, 0, 1) * 0.14;
    this.rig.torso.rotation.x = damp(this.rig.torso.rotation.x, leanTarget, 8, dt);
    this.rig.torso.rotation.z = damp(
      this.rig.torso.rotation.z,
      -clamp(this.body.turnSpeed * 0.05, -0.16, 0.16),
      6,
      dt,
    );
    this.rig.head.rotation.x = damp(this.rig.head.rotation.x, -leanTarget * 0.6, 8, dt);
  }

  private solveAndApply(
    leg: LegJoints,
    solution: LegSolution,
    footWorld: Vector3,
    groundNormal: Vector3,
    rollBias: number,
    yaw: number,
  ): void {
    this.footLocal.copy(footWorld);
    this.rig.pelvis.worldToLocal(this.footLocal);

    solveLeg(
      leg.hipLocal,
      this.footLocal,
      ROBOT.thighLength,
      ROBOT.shinLength,
      FORWARD_LOCAL,
      solution,
    );

    leg.thigh.quaternion.copy(solution.thighQuat);
    leg.shin.rotation.set(solution.kneeAngle, 0, 0);

    // Roll the sole flat onto the surface, then add the toe/heel roll. The
    // shin's world orientation is composed by hand so we avoid a second
    // matrix-tree walk just to read it back.
    this.rig.pelvis.getWorldQuaternion(this.pelvisQuat);
    this.shinLocalQuat.setFromAxisAngle(X_AXIS, solution.kneeAngle);
    this.shinWorldQuat
      .copy(this.pelvisQuat)
      .multiply(solution.thighQuat)
      .multiply(this.shinLocalQuat);

    this.forwardWorld.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.forwardWorld.addScaledVector(groundNormal, -this.forwardWorld.dot(groundNormal));
    if (this.forwardWorld.lengthSq() < 1e-6) {
      this.forwardWorld.set(Math.sin(yaw), 0, Math.cos(yaw));
    }
    this.forwardWorld.normalize();
    this.lateralWorld.crossVectors(groundNormal, this.forwardWorld);

    this.basis.makeBasis(this.lateralWorld, groundNormal, this.forwardWorld);
    this.footWorldQuat.setFromRotationMatrix(this.basis);
    this.rollQuat.setFromAxisAngle(X_AXIS, -rollBias * GAIT.footRollAmount);
    this.footWorldQuat.multiply(this.rollQuat);

    this.ankleQuat.copy(this.shinWorldQuat).invert().multiply(this.footWorldQuat);
    leg.foot.quaternion.copy(this.ankleQuat);
  }

  private applyArms(speed: number, dt: number): void {
    const scale = clamp(speed / MOVE.walkSpeed, 0, 1.3);
    const swing = Math.cos(this.gait.cyclePhase * TAU) * GAIT.armSwingAmount * scale;
    const relax = 1 - Math.exp(-10 * dt);

    this.rig.shoulderLeft.rotation.x += (swing - this.rig.shoulderLeft.rotation.x) * relax;
    this.rig.shoulderRight.rotation.x += (-swing - this.rig.shoulderRight.rotation.x) * relax;
    this.rig.shoulderLeft.rotation.z += (0 - this.rig.shoulderLeft.rotation.z) * relax;
    this.rig.shoulderRight.rotation.z += (0 - this.rig.shoulderRight.rotation.z) * relax;
  }

  private applyDance(): void {
    const t = this.danceTime;
    this.rig.pelvis.position.y += Math.abs(Math.sin(t * 5)) * 0.16;
    this.rig.root.rotation.y += Math.sin(t * 2.2) * 1.1;
    this.rig.shoulderLeft.rotation.set(0, 0, Math.PI * 0.8 + Math.sin(t * 9) * 0.3);
    this.rig.shoulderRight.rotation.set(0, 0, -Math.PI * 0.8 + Math.sin(t * 9 + 1.4) * 0.3);
    this.rig.head.rotation.set(0, 0, Math.sin(t * 4) * 0.16);
    this.rig.torso.rotation.set(0, 0, 0);
  }

  // --- lifecycle ---------------------------------------------------------

  startDance(): void {
    this.dancing = true;
    this.danceTime = 0;
    this.rig.root.rotation.y = this.body.yaw;
  }

  stopDance(): void {
    this.dancing = false;
    this.danceTime = 0;
    this.rig.torso.rotation.set(0, 0, 0);
    this.rig.head.rotation.set(0, 0, 0);
    this.rig.shoulderLeft.rotation.set(0, 0, 0);
    this.rig.shoulderRight.rotation.set(0, 0, 0);
  }

  /** True once the robot has somehow ended up off the map. */
  get hasFallen(): boolean {
    return this.body.position.y < KID.fallYThreshold;
  }

  respawn(): void {
    const target = this.safeSpotReady ? this.safeSpot : this.spawn;
    this.teleport(target, this.body.yaw);
  }

  /** Full reset: back to the spawn point, forgetting the remembered safe spot. */
  resetToSpawn(): void {
    this.stopDance();
    this.safeSpotReady = false;
    this.safeTimer = 0;
    this.safeSpot.copy(this.spawn);
    this.teleport(this.spawn, this.spawnYaw);
  }

  private teleport(target: Vector3, yaw: number): void {
    this.smoothedVelocity.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.body.teleport(target, yaw);
    this.gait.reset(target, yaw);
    this.leftFoot.position.copy(target);
    this.rightFoot.position.copy(target);
    copyResolution(this.leftFoot, this.leftFootPrev);
    copyResolution(this.rightFoot, this.rightFootPrev);
    this.placeRigAt(target);
  }

  placeRigAt(position: Vector3): void {
    this.rig.root.position.set(
      position.x,
      position.y + ROBOT.rigYOffset,
      position.z,
    );
  }

  /** Drops the rig onto the ground at the current position, for the start screen. */
  settle(): void {
    this.placeRigAt(this.body.position);
  }

  get isDancing(): boolean {
    return this.dancing;
  }

  get currentSpeed(): number {
    return Math.hypot(this.body.velocity.x, this.body.velocity.z);
  }

  dispose(): void {
    this.rig.dispose();
  }
}

function copyResolution(from: FootResolution, to: FootResolution): void {
  to.position.copy(from.position);
  to.normal.copy(from.normal);
}

function interpolateResolution(
  from: FootResolution,
  to: FootResolution,
  alpha: number,
  outPosition: Vector3,
  outNormal: Vector3,
): void {
  const t = clamp(alpha, 0, 1);
  outPosition.lerpVectors(from.position, to.position, t);
  outNormal.lerpVectors(from.normal, to.normal, t).normalize();
}
