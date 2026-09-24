export type DeviceKind = 'keyboard' | 'gamepad' | 'touch' | 'none';

/** Raw, per-device snapshot. Merged into a single InputState by InputManager. */
export interface DeviceReadings {
  /** -1..1, +x is screen right, +y is away from the camera. */
  moveX: number;
  moveY: number;
  /** -1..1 camera orbit delta. */
  orbitX: number;
  orbitY: number;
  jump: boolean;
  pause: boolean;
  /** 0..1, how much this device was used this tick. */
  activity: number;
  connected: boolean;
}

export interface InputDevice {
  readonly kind: DeviceKind;
  readonly label: string;
  read(out: DeviceReadings): void;
  dispose(): void;
}

export interface InputState {
  moveX: number;
  moveY: number;
  orbitX: number;
  orbitY: number;
  jump: boolean;
  /** Edge triggered: true only on the tick the pause button was first pressed. */
  pause: boolean;
  activeDevice: DeviceKind;
  activeLabel: string;
}

export function createReadings(): DeviceReadings {
  return {
    moveX: 0,
    moveY: 0,
    orbitX: 0,
    orbitY: 0,
    jump: false,
    pause: false,
    activity: 0,
    connected: true,
  };
}

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    orbitX: 0,
    orbitY: 0,
    jump: false,
    pause: false,
    activeDevice: 'none',
    activeLabel: 'Keyboard',
  };
}
