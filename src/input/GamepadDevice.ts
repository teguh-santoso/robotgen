import { applyStick, createStickValue, PAD_BINDINGS } from './ActionMap';
import type { DeviceReadings, InputDevice } from './types';

const RUMBLE_FOOTSTEP = { duration: 40, strongMagnitude: 0.12, weakMagnitude: 0.05 };
const RUMBLE_STAR = { duration: 120, strongMagnitude: 0.25, weakMagnitude: 0.15 };

/** Browser gamepad ids are ugly; kids should see a friendly name. */
function describePad(id: string): string {
  if (/0ce6|0df2/i.test(id)) return 'DualSense';
  if (/09cc|05c4|0ba0/i.test(id)) return 'DualShock 4';
  if (/054c|sony|playstation/i.test(id)) return 'Controller PlayStation';
  const stripped = id.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || 'Controller';
}

/**
 * PlayStation pad support through the Gamepad API. Values are polled every frame
 * because the API has no change events, and the analog triggers arrive as
 * `buttons[6|7].value` if a throttle is ever needed.
 */
export class GamepadDevice implements InputDevice {
  readonly kind = 'gamepad' as const;

  label = 'Controller';
  rumbleEnabled = true;

  private index = -1;
  private readonly move = createStickValue();
  private readonly orbit = createStickValue();

  constructor(private readonly target: Window = window) {
    this.target.addEventListener('gamepadconnected', this.onConnected);
    this.target.addEventListener('gamepaddisconnected', this.onDisconnected);
    this.adoptFirstPad();
  }

  private onConnected = (event: Event): void => {
    const pad = (event as GamepadEvent).gamepad;
    this.index = pad.index;
    this.label = describePad(pad.id);
  };

  private onDisconnected = (event: Event): void => {
    const pad = (event as GamepadEvent).gamepad;
    if (pad.index !== this.index) return;
    this.index = -1;
    this.label = 'Controller';
    this.adoptFirstPad();
  };

  private adoptFirstPad(): void {
    for (const pad of this.availablePads()) {
      if (!pad) continue;
      this.index = pad.index;
      this.label = describePad(pad.id);
      return;
    }
  }

  private availablePads(): (Gamepad | null)[] {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    return navigator.getGamepads();
  }

  private activePad(): Gamepad | null {
    const pads = this.availablePads();
    const current = this.index >= 0 ? pads[this.index] : null;
    if (current?.connected) return current;
    for (const pad of pads) if (pad?.connected) return pad;
    return null;
  }

  read(out: DeviceReadings): void {
    const pad = this.activePad();
    if (!pad) {
      out.moveX = 0;
      out.moveY = 0;
      out.orbitX = 0;
      out.orbitY = 0;
      out.jump = false;
      out.pause = false;
      out.activity = 0;
      out.connected = false;
      return;
    }

    const [moveXAxis, moveYAxis] = PAD_BINDINGS.moveAxes;
    const [orbitXAxis, orbitYAxis] = PAD_BINDINGS.orbitAxes;

    const moveActivity = applyStick(
      pad.axes[moveXAxis] ?? 0,
      pad.axes[moveYAxis] ?? 0,
      this.move,
    );
    const orbitActivity = applyStick(
      pad.axes[orbitXAxis] ?? 0,
      pad.axes[orbitYAxis] ?? 0,
      this.orbit,
    );

    const jump = pad.buttons[PAD_BINDINGS.jumpButton]?.pressed ?? false;
    const pause = pad.buttons[PAD_BINDINGS.pauseButton]?.pressed ?? false;

    out.moveX = this.move.x;
    // Sticks report -1 for "up", but our moveY is +1 for "forward".
    out.moveY = -this.move.y;
    out.orbitX = this.orbit.x;
    out.orbitY = this.orbit.y;
    out.jump = jump;
    out.pause = pause;
    out.connected = true;
    out.activity = Math.max(moveActivity, orbitActivity, jump || pause ? 1 : 0);
  }

  /** Gentle haptics, a no-op on browsers without a vibration actuator. */
  rumble(kind: 'footstep' | 'star'): void {
    if (!this.rumbleEnabled) return;
    const actuator = this.activePad()?.vibrationActuator;
    if (!actuator?.playEffect) return;
    const preset = kind === 'footstep' ? RUMBLE_FOOTSTEP : RUMBLE_STAR;
    try {
      void actuator.playEffect('dual-rumble', { startDelay: 0, ...preset });
    } catch {
      // Effect type unsupported on this browser; nothing to do.
    }
  }

  dispose(): void {
    this.target.removeEventListener('gamepadconnected', this.onConnected);
    this.target.removeEventListener('gamepaddisconnected', this.onDisconnected);
  }
}
