import { Vector3 } from 'three';
import { GAIT, MOVE, ROBOT } from '../core/Config';
import { clamp, damp, easeInOutCubic } from '../core/MathUtils';

/** Where the robot currently is and where it is heading. All vectors are world space. */
export interface GaitInput {
  base: Vector3;
  yaw: number;
  turnSpeed: number;
  planarVelocity: Vector3;
  grounded: boolean;
}

export interface FootPlan {
  /** Foot target in world space. `y` is a placeholder until FootPlacement resolves it. */
  target: Vector3;
  /** How far above the ground under the target the foot should be. */
  lift: number;
  stance: boolean;
  /** 0..1 through the swing, 0 while planted. */
  swingProgress: number;
  /** -1 at toe-off, +1 at heel strike. Drives the ankle roll. */
  rollBias: number;
  /** True on the single tick this foot touched down; used for sound and haptics. */
  justLanded: boolean;
}

interface GaitParams {
  strideLength: number;
  duty: number;
  stepHeight: number;
}

interface LegRuntime {
  plan: FootPlan;
  phaseOffset: number;
  sign: number;
  planted: Vector3;
  swingFrom: Vector3;
  swingTo: Vector3;
  wasStance: boolean;
}

const REST_PHASE = 0.06;
const SETTLE_CADENCE = 0.7;
const MAX_CADENCE = 6;
const MAX_LOOKAHEAD = 1.0;

/**
 * Reach budget of one leg, used to keep foot targets inside the leg's range.
 * Derived from the rest geometry: hip height above the ground minus the ankle
 * height gives the vertical span the leg has to cover.
 */
const SAFE_REACH = (ROBOT.thighLength + ROBOT.shinLength) * 0.995;
const HIP_ABOVE_GROUND =
  ROBOT.capsule.halfHeight +
  ROBOT.capsule.radius +
  ROBOT.rigYOffset +
  ROBOT.hipOffsetY;
const PLANT_VERTICAL = HIP_ABOVE_GROUND - ROBOT.ankleHeight;

function createFootPlan(): FootPlan {
  return {
    target: new Vector3(),
    lift: 0,
    stance: true,
    swingProgress: 0,
    rollBias: 1,
    justLanded: false,
  };
}

function paramsFor(speed: number): GaitParams {
  const t = clamp((speed - MOVE.walkSpeed * 0.75) / (MOVE.runSpeed - MOVE.walkSpeed * 0.75), 0, 1);
  return {
    strideLength: GAIT.strideLengthWalk + (GAIT.strideLengthRun - GAIT.strideLengthWalk) * t,
    duty: GAIT.dutyFactorWalk + (GAIT.dutyFactorRun - GAIT.dutyFactorWalk) * t,
    stepHeight: GAIT.stepHeight * (1 + 0.5 * t),
  };
}

/**
 * Phase driven walk/run cycle. Stance feet are pinned in world space, so the
 * robot never slides: the body moves over the planted foot instead of dragging
 * the foot along with it.
 */
export class Gait {
  readonly left = createFootPlan();
  readonly right = createFootPlan();

  private readonly legs: LegRuntime[];
  private phase = REST_PHASE;
  private cadence = 0;
  private smoothedSpeed = 0;

  constructor() {
    this.legs = [
      {
        plan: this.left,
        phaseOffset: 0,
        sign: 1,
        planted: new Vector3(),
        swingFrom: new Vector3(),
        swingTo: new Vector3(),
        wasStance: true,
      },
      {
        plan: this.right,
        phaseOffset: 0.5,
        sign: -1,
        planted: new Vector3(),
        swingFrom: new Vector3(),
        swingTo: new Vector3(),
        wasStance: true,
      },
    ];
  }

  /** Snaps both feet to the neutral stance around a start position. */
  reset(base: Vector3, yaw: number): void {
    this.phase = REST_PHASE;
    this.cadence = 0;
    this.smoothedSpeed = 0;
    for (const leg of this.legs) {
      this.neutralSpot(leg, base, yaw, leg.planted);
      leg.swingFrom.copy(leg.planted);
      leg.swingTo.copy(leg.planted);
      leg.wasStance = true;
      leg.plan.stance = true;
      leg.plan.lift = 0;
      leg.plan.swingProgress = 0;
      leg.plan.rollBias = 1;
      leg.plan.target.copy(leg.planted);
    }
  }

  update(dt: number, input: GaitInput): void {
    const rawSpeed = Math.hypot(input.planarVelocity.x, input.planarVelocity.z);
    this.smoothedSpeed += (rawSpeed - this.smoothedSpeed) * clamp(dt * 8, 0, 1);

    // Turning in place should still produce steps, so count the foot travel the
    // body's rotation drags along.
    const turnFootSpeed = Math.abs(input.turnSpeed) * ROBOT.stanceWidth;
    const effectiveSpeed = Math.max(this.smoothedSpeed, turnFootSpeed);
    const params = paramsFor(effectiveSpeed);

    const moving = effectiveSpeed > 0.08;
    if (!input.grounded) {
      this.cadence *= Math.exp(-dt * 6);
    } else if (moving) {
      const nominal = clamp(effectiveSpeed / params.strideLength, 0.3, MAX_CADENCE);
      // Speed up instantly, ease down gently. The legs must never lag the body,
      // or a planted foot is left behind and the IK has to clamp.
      this.cadence = this.cadence < nominal ? nominal : damp(this.cadence, nominal, 5, dt);
    } else {
      this.cadence *= Math.exp(-dt * 4);
    }

    this.phase = (this.phase + this.cadence * dt) % 1;

    // Once stopped, keep taking small steps until both feet reach the rest
    // phase, which is inside the double-support window.
    if (input.grounded && !moving && this.cadence < 0.1) {
      const delta = (REST_PHASE - this.phase + 1) % 1;
      if (delta > 0.003 && delta < 0.997) {
        this.phase = (this.phase + Math.min(delta, SETTLE_CADENCE * dt)) % 1;
      } else {
        this.phase = REST_PHASE;
      }
    }

    for (const leg of this.legs) this.updateLeg(leg, input, params);
  }

  private updateLeg(leg: LegRuntime, input: GaitInput, params: GaitParams): void {
    const legPhase = (this.phase + leg.phaseOffset) % 1;
    const inStance = legPhase < params.duty;

    if (inStance && !leg.wasStance) {
      leg.planted.copy(leg.swingTo);
    } else if (!inStance && leg.wasStance) {
      leg.swingFrom.copy(input.grounded ? leg.planted : input.base);
      if (input.grounded) {
        this.landingSpot(leg, input, params, leg.swingTo);
      } else {
        leg.swingTo.copy(leg.swingFrom);
      }
    }

    const plan = leg.plan;
    plan.stance = inStance;
    plan.justLanded = inStance && !leg.wasStance;

    if (inStance) {
      this.dragIntoReach(leg.planted, input.base, 0);
      plan.target.copy(leg.planted);
      plan.lift = 0;
      plan.swingProgress = 0;
      plan.rollBias = Math.cos((legPhase / params.duty) * Math.PI);
    } else {
      const t = clamp((legPhase - params.duty) / (1 - params.duty), 0, 1);
      plan.swingProgress = t;
      plan.target.copy(leg.swingFrom).lerp(leg.swingTo, easeInOutCubic(t));
      plan.lift = input.grounded ? Math.sin(Math.PI * t) * params.stepHeight : 0;
      plan.rollBias = -Math.cos(Math.PI * t);
      // The landing spot is planned once, from the speed at take-off. Braking
      // hard mid-swing leaves that plan out of reach, so the target is pulled
      // back in rather than letting the leg go straight.
      this.dragIntoReach(plan.target, input.base, plan.lift);
    }

    leg.wasStance = inStance;
  }

  /** Keeps a foot target inside the leg's horizontal reach at the given lift. */
  private dragIntoReach(target: Vector3, base: Vector3, lift: number): void {
    const vertical = PLANT_VERTICAL - lift;
    const square = SAFE_REACH * SAFE_REACH - vertical * vertical;
    const radius = square > 0 ? Math.sqrt(square) : 0.05;

    const dx = target.x - base.x;
    const dz = target.z - base.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= radius) return;
    const scale = radius / distance;
    target.x = base.x + dx * scale;
    target.z = base.z + dz * scale;
  }

  private landingSpot(
    leg: LegRuntime,
    input: GaitInput,
    params: GaitParams,
    out: Vector3,
  ): void {
    // Distance the body covers from now until the middle of the next stance.
    // The raw time expands without bound while the cadence is still ramping up,
    // which would fling the landing spot far outside the leg's reach, so the
    // travelled distance is capped at its steady-state value.
    const travel = Math.hypot(input.planarVelocity.x, input.planarVelocity.z);
    const cadence = Math.max(this.cadence, 0.3);
    const swingTime = (1 - params.duty) / cadence;
    const halfStance = (params.duty / cadence) * 0.5;
    const steadyLead = params.strideLength * (1 - params.duty * 0.5);
    const lead = Math.min(travel * Math.min(swingTime + halfStance, MAX_LOOKAHEAD), steadyLead);
    const seconds = travel > 1e-4 ? lead / travel : 0;

    const baseX = input.base.x + input.planarVelocity.x * seconds;
    const baseZ = input.base.z + input.planarVelocity.z * seconds;
    const predictedYaw = input.yaw + input.turnSpeed * seconds;

    const sin = Math.sin(predictedYaw);
    const cos = Math.cos(predictedYaw);

    out.set(
      baseX + cos * (leg.sign * ROBOT.stanceWidth),
      input.base.y,
      baseZ - sin * (leg.sign * ROBOT.stanceWidth),
    );
  }

  private neutralSpot(leg: LegRuntime, base: Vector3, yaw: number, out: Vector3): void {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    out.set(
      base.x + cos * (leg.sign * ROBOT.stanceWidth),
      base.y,
      base.z - sin * (leg.sign * ROBOT.stanceWidth),
    );
  }

  get cyclePhase(): number {
    return this.phase;
  }

  get isRunning(): boolean {
    return this.smoothedSpeed > (MOVE.walkSpeed + MOVE.runSpeed) * 0.5;
  }
}
