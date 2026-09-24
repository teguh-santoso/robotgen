import { createStickValue } from './ActionMap';
import type { DeviceReadings, InputDevice } from './types';

const MAX_STICK_RADIUS = 70;
const STICK_DEADZONE = 0.12;
/** Pixel speed that maps to a full-strength camera orbit. */
const ORBIT_PIXELS_PER_SECOND = 700;

function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches === true ||
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0
  );
}

function clampUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/**
 * On-screen controls for tablets: a joystick that appears wherever the child
 * touches on the left half (far more forgiving than a fixed pad), a big jump
 * button, and drag-to-look on the right half.
 */
export class TouchDevice implements InputDevice {
  readonly kind = 'touch' as const;
  readonly label = 'Sentuh';
  readonly enabled: boolean;

  private readonly layer: HTMLDivElement;
  private readonly joystick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly jumpButton: HTMLDivElement;

  private movePointerId = -1;
  private orbitPointerId = -1;
  private readonly jumpPointers = new Set<number>();

  private originX = 0;
  private originY = 0;
  private orbitLastX = 0;
  private orbitLastY = 0;
  private orbitAccumX = 0;
  private orbitAccumY = 0;
  private stickX = 0;
  private stickY = 0;
  private lastReadTime = 0;

  constructor(container: HTMLElement) {
    this.enabled = isTouchCapable();

    this.knob = document.createElement('div');
    this.knob.className = 'touch-knob';

    this.joystick = document.createElement('div');
    this.joystick.className = 'touch-joystick';
    this.joystick.append(this.knob);

    this.jumpButton = document.createElement('div');
    this.jumpButton.className = 'touch-jump';
    this.jumpButton.append(document.createElement('span'));

    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.layer.append(this.joystick, this.jumpButton);
    container.append(this.layer);

    if (!this.enabled) this.layer.classList.add('is-hidden');

    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('touchstart', this.onTouchStart, { passive: false });
  }

  /** Some laptops report a fine pointer but still have a touchscreen. */
  private onTouchStart = (event: TouchEvent): void => {
    if (!this.enabled) {
      this.layer.classList.remove('is-hidden');
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-ui]')) event.preventDefault();
  };

  private accepts(event: PointerEvent): boolean {
    if (event.pointerType === 'mouse') return false;
    if (this.layer.classList.contains('is-hidden')) return false;
    const target = event.target as HTMLElement | null;
    return !target?.closest('[data-ui]');
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.accepts(event)) return;

    if ((event.target as HTMLElement | null)?.closest('.touch-jump')) {
      this.jumpPointers.add(event.pointerId);
      this.jumpButton.classList.add('is-pressed');
      return;
    }

    if (event.clientX < window.innerWidth / 2) {
      if (this.movePointerId !== -1) return;
      this.movePointerId = event.pointerId;
      this.originX = event.clientX;
      this.originY = event.clientY;
      this.joystick.classList.add('is-visible');
      this.joystick.style.left = `${this.originX}px`;
      this.joystick.style.top = `${this.originY}px`;
      this.setKnob(0, 0);
      return;
    }

    if (this.orbitPointerId === -1) {
      this.orbitPointerId = event.pointerId;
      this.orbitLastX = event.clientX;
      this.orbitLastY = event.clientY;
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.movePointerId) {
      const dx = event.clientX - this.originX;
      const dy = event.clientY - this.originY;
      const distance = Math.hypot(dx, dy);
      const clamped = Math.min(distance, MAX_STICK_RADIUS);
      const scale = distance > 0.001 ? clamped / distance : 0;
      const knobX = dx * scale;
      const knobY = dy * scale;
      this.setKnob(knobX, knobY);
      this.stickX = knobX / MAX_STICK_RADIUS;
      // Screen down is +y, but moveY is +1 for forward.
      this.stickY = -knobY / MAX_STICK_RADIUS;
      return;
    }

    if (event.pointerId === this.orbitPointerId) {
      // movementX/Y is unreliable for touch, so track positions ourselves.
      this.orbitAccumX += event.clientX - this.orbitLastX;
      this.orbitAccumY += event.clientY - this.orbitLastY;
      this.orbitLastX = event.clientX;
      this.orbitLastY = event.clientY;
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.movePointerId) {
      this.movePointerId = -1;
      this.stickX = 0;
      this.stickY = 0;
      this.joystick.classList.remove('is-visible');
      return;
    }
    if (event.pointerId === this.orbitPointerId) {
      this.orbitPointerId = -1;
      return;
    }
    if (this.jumpPointers.delete(event.pointerId) && this.jumpPointers.size === 0) {
      this.jumpButton.classList.remove('is-pressed');
    }
  };

  private setKnob(x: number, y: number): void {
    this.knob.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  read(out: DeviceReadings): void {
    const now = performance.now();
    const dt =
      this.lastReadTime === 0 ? 1 / 60 : Math.max((now - this.lastReadTime) / 1000, 1 / 240);
    this.lastReadTime = now;

    const magnitude = Math.hypot(this.stickX, this.stickY);
    const stick = createStickValue();
    if (magnitude > STICK_DEADZONE) {
      const scaled = Math.min((magnitude - STICK_DEADZONE) / (1 - STICK_DEADZONE), 1);
      const curved = 0.4 * scaled + 0.6 * scaled * scaled * scaled;
      stick.x = (this.stickX / magnitude) * curved;
      stick.y = (this.stickY / magnitude) * curved;
    }

    const orbitSpeed = ORBIT_PIXELS_PER_SECOND * dt;
    out.orbitX = clampUnit(this.orbitAccumX / orbitSpeed);
    out.orbitY = clampUnit(this.orbitAccumY / orbitSpeed);
    this.orbitAccumX = 0;
    this.orbitAccumY = 0;

    out.moveX = stick.x;
    out.moveY = stick.y;
    out.jump = this.jumpPointers.size > 0;
    out.pause = false;
    out.connected = true;
    out.activity = Math.max(
      magnitude > STICK_DEADZONE ? 0.6 : 0,
      out.jump ? 1 : 0,
      out.orbitX !== 0 || out.orbitY !== 0 ? 0.4 : 0,
    );
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('touchstart', this.onTouchStart);
    this.layer.remove();
  }
}
