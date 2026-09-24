import { KEY_BINDINGS, SCROLL_KEYS } from './ActionMap';
import type { DeviceReadings, InputDevice } from './types';

function isDown(down: Set<string>, codes: readonly string[]): boolean {
  for (const code of codes) if (down.has(code)) return true;
  return false;
}

/**
 * WASD and the arrow keys both work, and no mouse is involved at all: the
 * camera follows on its own, so a child only ever has to press a direction.
 */
export class KeyboardDevice implements InputDevice {
  readonly kind = 'keyboard' as const;
  readonly label = 'Keyboard';

  private readonly down = new Set<string>();

  constructor(private readonly target: Window = window) {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.clear);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (SCROLL_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.down.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  private clear = (): void => {
    this.down.clear();
  };

  read(out: DeviceReadings): void {
    const right = isDown(this.down, KEY_BINDINGS.right) ? 1 : 0;
    const left = isDown(this.down, KEY_BINDINGS.left) ? 1 : 0;
    const forward = isDown(this.down, KEY_BINDINGS.forward) ? 1 : 0;
    const backward = isDown(this.down, KEY_BINDINGS.backward) ? 1 : 0;
    const orbitLeft = isDown(this.down, KEY_BINDINGS.orbitLeft) ? 1 : 0;
    const orbitRight = isDown(this.down, KEY_BINDINGS.orbitRight) ? 1 : 0;

    out.moveX = right - left;
    out.moveY = forward - backward;
    out.orbitX = orbitRight - orbitLeft;
    out.orbitY = 0;
    out.jump = isDown(this.down, KEY_BINDINGS.jump);
    out.pause = isDown(this.down, KEY_BINDINGS.pause);
    out.connected = true;
    // Keyboard is digital, so any press counts as full activity.
    out.activity = this.down.size > 0 ? 1 : 0;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.clear);
    this.down.clear();
  }
}
