/** Real gravity for the toys. The robot emulates its own, snappier gravity. */
export const WORLD_GRAVITY = -9.81;

export const PLAYGROUND = {
  radius: 33,
  /** [x, z, radius] areas kept free of decorative props. */
  keepClear: [
    [-13, -10, 11],
    [10, -6, 9],
    [16, 12, 9],
    [-2, 8, 3.5],
    [6, -20, 3.5],
    [-20, -2, 3.5],
  ] as Array<[number, number, number]>,
} as const;

export const ROBOT = {
  mass: 40,
  /**
   * Collider spans y = 0 to y = 1.38 when standing on flat ground, so the
   * capsule bottom is exactly the robot's feet.
   */
  capsule: { halfHeight: 0.45, radius: 0.24 },
  /** Visual pelvis sits at capsule centre + this offset, i.e. y = 0.80. */
  rigYOffset: 0.11,
  // Hip sits at 0.78, ankle joint at 0.07: a reach of 0.71 against a 0.76 max,
  // which keeps a natural ~40 degree knee bend at rest.
  thighLength: 0.38,
  shinLength: 0.38,
  ankleHeight: 0.07,
  hipOffsetX: 0.1,
  hipOffsetY: -0.02,
  stanceWidth: 0.12,
  shoulderOffsetX: 0.24,
  shoulderOffsetY: 0.35,
} as const;

export const MOVE = {
  walkSpeed: 1.6,
  runSpeed: 3.4,
  /** Exponential approach rate for the velocity, in 1/seconds. */
  velocityLambda: 9,
  /** Exponential approach rate for the facing, in 1/seconds. */
  turnRate: 10,
  /** Heavier than real gravity so the jump feels snappy and toy-like. */
  gravity: -18,
  jumpSpeed: 6.2,
};

export const GAIT = {
  strideLengthWalk: 0.6,
  /**
   * Kept short on purpose. At full sprint the foot has to reach one half stride
   * ahead of the hip, and the leg must not hit its limit entirely or the IK has
   * to clamp.
   */
  strideLengthRun: 0.88,
  dutyFactorWalk: 0.62,
  dutyFactorRun: 0.45,
  stepHeight: 0.14,
  footGroundOffset: 0.01,
  /** Stick magnitude above which the robot breaks into a run. */
  runInputThreshold: 0.85,
  armSwingAmount: 0.55,
  footRollAmount: 0.26,
};

export const KID = {
  deadzone: 0.2,
  starCollectRadius: 0.9,
  starMagnetRadius: 1.8,
  starMagnetSpeed: 4.5,
  cameraDistance: 5.0,
  /** Camera look-at height, relative to the body centre (which sits at ~0.69). */
  cameraPivotY: 0.5,
  cameraPitchDeg: 16,
  cameraMinPitchDeg: -20,
  cameraMaxPitchDeg: 55,
  /** Time constant of the auto-follow camera, in seconds. */
  cameraFollowLag: 0.9,
  /** Seconds the camera stays manual after the player last touched the orbit control. */
  cameraManualHold: 2.0,
  fallYThreshold: -6,
  maxStars: 10,
  toyRespawnY: -5,
  /** How often the last safe standing spot is remembered. */
  safeSpotInterval: 1.0,
};

export const QUALITY = {
  maxPixelRatio: 1.5,
  shadowMapSize: 1024,
  degradeFpsThreshold: 45,
  degradeSampleFrames: 180,
  upgradeFpsThreshold: 58,
  upgradeSampleFrames: 600,
} as const;

export const AUDIO = {
  masterVolume: 0.6,
  rumbleEnabledByDefault: true,
} as const;

export const DEBUG =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
