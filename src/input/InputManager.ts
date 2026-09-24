import { createInputState, createReadings } from './types';
import type { DeviceKind, InputDevice, InputState } from './types';

/**
 * Merges every attached device into one InputState. Components are taken from
 * whichever device pushed them furthest, so the pad, keyboard and touch controls
 * can be mixed mid-session without any configuration.
 */
export class InputManager {
  readonly state: InputState = createInputState();

  private readonly devices: InputDevice[] = [];
  private readonly readings = createReadings();
  private previousPause = false;
  private gamepadPresent = false;

  add(device: InputDevice): void {
    this.devices.push(device);
  }

  byKind<T extends InputDevice>(kind: DeviceKind): T | undefined {
    return this.devices.find((device) => device.kind === kind) as T | undefined;
  }

  get gamepadConnected(): boolean {
    return this.gamepadPresent;
  }

  sample(): void {
    let moveX = 0;
    let moveY = 0;
    let orbitX = 0;
    let orbitY = 0;
    let jump = false;
    let pause = false;
    let bestActivity = 0;
    let bestKind: DeviceKind = 'none';
    let bestLabel = '';
    this.gamepadPresent = false;

    for (const device of this.devices) {
      device.read(this.readings);
      const r = this.readings;
      if (!r.connected) continue;
      if (device.kind === 'gamepad') this.gamepadPresent = true;

      if (r.activity > bestActivity) {
        bestActivity = r.activity;
        bestKind = device.kind;
        bestLabel = device.label;
      }
      if (Math.abs(r.moveX) > Math.abs(moveX)) moveX = r.moveX;
      if (Math.abs(r.moveY) > Math.abs(moveY)) moveY = r.moveY;
      if (Math.abs(r.orbitX) > Math.abs(orbitX)) orbitX = r.orbitX;
      if (Math.abs(r.orbitY) > Math.abs(orbitY)) orbitY = r.orbitY;
      jump = jump || r.jump;
      pause = pause || r.pause;
    }

    const state = this.state;
    state.moveX = moveX;
    state.moveY = moveY;
    state.orbitX = orbitX;
    state.orbitY = orbitY;
    state.jump = jump;
    state.pause = pause && !this.previousPause;
    this.previousPause = pause;

    if (bestActivity > 0.05) {
      state.activeDevice = bestKind;
      state.activeLabel = bestLabel;
    }
  }

  dispose(): void {
    for (const device of this.devices) device.dispose();
    this.devices.length = 0;
  }
}
