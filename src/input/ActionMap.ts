import { KID } from '../core/Config';

/**
 * Single source of truth for every binding. Kept as data so the layout is easy
 * to read and adjust without hunting through device code.
 */
export const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  orbitLeft: ['KeyQ'],
  orbitRight: ['KeyE'],
  pause: ['Escape', 'KeyP'],
} as const;

/**
 * PlayStation controllers report `mapping: 'standard'` in every modern browser,
 * so the same indices cover both DualShock 4 and DualSense.
 */
export const PAD_BINDINGS = {
  moveAxes: [0, 1],
  orbitAxes: [2, 3],
  jumpButton: 0,
  pauseButton: 9,
} as const;

/** Keys we must swallow so the page never scrolls mid-game. */
export const SCROLL_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export interface StickValue {
  x: number;
  y: number;
}

/**
 * Radial deadzone with a response curve. A per-axis deadzone would make
 * diagonals feel square, and kids rest their thumb on the stick hard enough
 * that drift is common, so the deadzone is deliberately generous.
 */
export function applyStick(
  rawX: number,
  rawY: number,
  out: StickValue,
  deadzone = KID.deadzone,
): number {
  const magnitude = Math.hypot(rawX, rawY);
  if (magnitude < deadzone) {
    out.x = 0;
    out.y = 0;
    return 0;
  }
  const scaled = Math.min((magnitude - deadzone) / (1 - deadzone), 1);
  const curved = 0.4 * scaled + 0.6 * scaled * scaled * scaled;
  const inverse = curved / magnitude;
  out.x = rawX * inverse;
  out.y = rawY * inverse;
  return curved;
}

export function createStickValue(): StickValue {
  return { x: 0, y: 0 };
}
