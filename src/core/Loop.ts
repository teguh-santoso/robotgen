export const FIXED_DT = 1 / 60;

/** Physics/animation tick. Always receives the same dt. */
export interface FixedUpdatable {
  fixedUpdate(dt: number): void;
}

/** Visual tick. Receives alpha in [0,1) so meshes can interpolate between ticks. */
export interface RenderUpdatable {
  renderUpdate(alpha: number, dt: number): void;
}

/**
 * Fixed timestep accumulator. Physics stays deterministic while rendering runs
 * at whatever rate the display offers, interpolating the leftover fraction.
 */
export class Loop {
  private lastTime = performance.now();
  private accumulator = 0;
  private running = false;
  private rafId = 0;
  private paused = false;

  constructor(
    private readonly fixed: FixedUpdatable,
    private readonly variable: RenderUpdatable,
    private readonly onFrameStats: (dt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    // Drop the accumulated time so unpausing does not fast-forward the world.
    if (paused) this.accumulator = 0;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const frameDt = Math.min((now - this.lastTime) / 1000, 0.2);
    this.lastTime = now;

    if (this.paused) {
      this.variable.renderUpdate(0, frameDt);
      this.onFrameStats(frameDt);
      return;
    }

    this.accumulator += frameDt;
    while (this.accumulator >= FIXED_DT) {
      this.fixed.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.variable.renderUpdate(this.accumulator / FIXED_DT, frameDt);
    this.onFrameStats(frameDt);
  };
}
