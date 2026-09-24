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
  capsule: { halfHeight: 0.45, radius: 0.24 },
  rigYOffset: 0.26,
  thighLength: 0.42,
  shinLength: 0.42,
  ankleHeight: 0.1,
  hipOffsetX: 0.11,
  hipOffsetY: -0.05,
  stanceWidth: 0.13,
  shoulderOffsetX: 0.3,
  shoulderOffsetY: 0.3,
} as const;

export const MOVE = {
  walkSpeed: 1.8,
  runSpeed: 4.2,
  accel: 14,
  decel: 18,
  turnRate: 10,
  gravity: -18,
  jumpSpeed: 6.2,
} as const;

export const GAIT = {
  strideLengthWalk: 0.6,
  strideLengthRun: 0.95,
  dutyFactorWalk: 0.62,
  dutyFactorRun: 0.45,
  stepHeight: 0.14,
  footGroundOffset: 0.01,
  runInputThreshold: 0.85,
  armSwingAmount: 0.5,
} as const;

export const KID = {
  deadzone: 0.2,
  starCollectRadius: 0.9,
  starMagnetRadius: 1.8,
  starMagnetForce: 3.2,
  cameraDistance: 5.0,
  cameraHeight: 1.6,
  cameraPitchDeg: 16,
  cameraFollowLag: 0.9,
  cameraManualHold: 2.0,
  fallYThreshold: -6,
  maxStars: 10,
  toyRespawnY: -5,
  safeSpotInterval: 1.0,
} as const;

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
